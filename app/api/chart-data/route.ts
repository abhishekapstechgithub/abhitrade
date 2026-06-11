export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { redis } from '@/lib/redis-client';
import { getCandleData, CandleInterval } from '@/lib/angelone/client';
import { candleDateRange, getChartCollection, toApiInterval, toApiExchange } from '@/lib/angelone/tokens';
import { getMongoDb } from '@/lib/mongodb';

const ANGEL_LOGIN_URL =
  'https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword';

// ── TOTP helpers ──────────────────────────────────────────────────────────────
function base32Decode(s: string): Buffer {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const input = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of input) {
    const idx = A.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function totp(secret: string, offset = 0): string {
  const key  = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / 30) + offset;
  const buf  = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const off  = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off+1] << 16) | (hmac[off+2] << 8) | hmac[off+3];
  return String(code % 1_000_000).padStart(6, '0');
}

async function getAccessToken(apiKey: string, clientId: string, password: string, totpSecret: string): Promise<string> {
  const cached = await redis.get('at:market:session').catch(() => null);
  if (cached) {
    const s = JSON.parse(cached) as { accessToken: string; expiresAt: number };
    if (Date.now() < s.expiresAt) return s.accessToken;
  }
  for (const offset of [0, 1, -1]) {
    const res  = await fetch(ANGEL_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'X-UserType': 'USER', 'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '106.51.128.1',
        'X-MACAddress': '00:00:00:00:00:00', 'X-PrivateKey': apiKey,
      },
      body: JSON.stringify({ clientcode: clientId, password, totp: totp(totpSecret, offset) }),
    });
    const data = await res.json() as {
      status: boolean; message: string; errorcode: string;
      data: { jwtToken: string } | null;
    };
    if (data.status && data.data?.jwtToken) {
      const { jwtToken } = data.data;
      await redis.setex('at:market:session', 23 * 3600, JSON.stringify({
        accessToken: jwtToken, expiresAt: Date.now() + 23 * 3600 * 1000,
      })).catch(() => {});
      return jwtToken;
    }
    const isTotpErr = data.errorcode === 'AG8004' || (data.message ?? '').toLowerCase().includes('totp');
    if (!isTotpErr) throw new Error(data.message || 'Login failed');
  }
  throw new Error('AngelOne login failed after 3 TOTP offsets');
}

// ── ISO timestamp → Unix seconds ─────────────────────────────────────────────
function isoToUnix(ts: string | number): number {
  if (typeof ts === 'number') return ts > 1e10 ? Math.floor(ts / 1000) : ts;
  return Math.floor(new Date(ts).getTime() / 1000);
}

// ── Save candles to MongoDB ───────────────────────────────────────────────────
async function saveToMongo(
  symbol: string,
  exchange: string,
  token: string,
  interval: string,
  instrumentType: string,
  underlying: string,
  candles: [string, number, number, number, number, number][],
): Promise<void> {
  if (!candles.length) return;
  try {
    const db         = await getMongoDb();
    const collection = getChartCollection(exchange, instrumentType, underlying);
    const coll       = db.collection(collection);

    // Ensure unique index on (Symbol, Exch, interval, Start_Time)
    await coll.createIndex(
      { Symbol: 1, Exch: 1, interval: 1, Start_Time: 1 },
      { unique: true, background: true },
    ).catch(() => {});

    const ops = candles.map(([ts, o, h, l, c, v]) => ({
      updateOne: {
        filter: {
          Symbol:     symbol.toUpperCase(),
          Exch:       exchange.toUpperCase(),
          token,
          interval,
          Start_Time: isoToUnix(ts),
        },
        update: {
          $set: {
            Symbol:     symbol.toUpperCase(),
            Exch:       exchange.toUpperCase(),
            token,
            interval,
            instrumentType,
            underlying:  underlying || '',
            Start_Time:  isoToUnix(ts),
            Open:  o,
            High:  h,
            Low:   l,
            Close: c,
            Volume: v,
            updatedAt: new Date(),
          },
        },
        upsert: true,
      },
    }));

    await coll.bulkWrite(ops, { ordered: false });
    console.log(`[chart-data] saved ${candles.length} candles to MongoDB:${collection} for ${symbol}`);
  } catch (e) {
    // Non-fatal — chart still works without MongoDB cache
    console.warn('[chart-data] MongoDB save failed:', e instanceof Error ? e.message : e);
  }
}

// ── GET /api/chart-data ───────────────────────────────────────────────────────
// Params: exchange, token, symbol, interval, instrumentType, underlying
export async function GET(req: NextRequest) {
  const p              = req.nextUrl.searchParams;
  const exchange       = (p.get('exchange')       ?? 'NSE').toUpperCase();
  const token          = p.get('token')           ?? '';
  const symbol         = (p.get('symbol')         ?? '').toUpperCase();
  const interval       = p.get('interval')        ?? 'ONE_DAY';
  const instrumentType = (p.get('instrumentType') ?? 'EQ').toUpperCase();
  const underlying     = (p.get('underlying')     ?? '').toUpperCase();

  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

  // Map to the actual AngelOne exchange segment (NSE→NFO for derivatives, etc.)
  const apiExchange = toApiExchange(exchange, instrumentType);
  // Map to a valid AngelOne API interval (4h/1W/1M → 1h/1D; then aggregated by mongo-chart)
  const apiInterval = toApiInterval(interval) as CandleInterval;

  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;

  if (!apiKey || !clientId || !password || !totpSecret) {
    return NextResponse.json(
      { error: 'AngelOne credentials not configured — set ANGELONE_API_KEY, ANGELONE_CLIENT_ID, ANGELONE_PASSWORD, ANGELONE_TOTP_SECRET in .env.local' },
      { status: 503 },
    );
  }

  try {
    const accessToken   = await getAccessToken(apiKey, clientId, password, totpSecret);
    const { from, to }  = candleDateRange(apiInterval);
    const candles       = await getCandleData(apiKey, accessToken, apiExchange, token, apiInterval, from, to);
    const safeCandles   = candles ?? [];
    const collection    = getChartCollection(exchange, instrumentType, underlying);

    // Store in MongoDB using the API interval (so 4h UI → ONE_HOUR candles stored,
    // aggregated to 4h by the mongo-chart bucketing layer on read)
    if (safeCandles.length && symbol) {
      saveToMongo(symbol, exchange, token, apiInterval, instrumentType, underlying, safeCandles).catch(() => {});
    }

    return NextResponse.json({
      candles:    safeCandles,
      interval:   apiInterval,
      from,
      to,
      collection,
      symbol,
      exchange:   apiExchange,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
