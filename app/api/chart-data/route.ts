export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';
import { redis } from '@/lib/redis-client';
import { getCandleData, CandleInterval } from '@/lib/angelone/client';
import { candleDateRange, TF_TO_INTERVAL } from '@/lib/angelone/tokens';

const ANGEL_LOGIN_URL =
  'https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword';

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

async function getToken(apiKey: string, clientId: string, password: string, totpSecret: string): Promise<string> {
  const cached = await redis.get('at:market:session').catch(() => null);
  if (cached) {
    const s = JSON.parse(cached) as { accessToken: string; expiresAt: number };
    if (Date.now() < s.expiresAt) return s.accessToken;
  }
  for (const offset of [0, 1, -1]) {
    const res  = await fetch(ANGEL_LOGIN_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', Accept:'application/json',
        'X-UserType':'USER','X-SourceID':'WEB','X-ClientLocalIP':'127.0.0.1',
        'X-ClientPublicIP':'106.51.128.1','X-MACAddress':'00:00:00:00:00:00','X-PrivateKey': apiKey },
      body: JSON.stringify({ clientcode: clientId, password, totp: totp(totpSecret, offset) }),
    });
    const data = await res.json() as { status: boolean; message: string; errorcode: string; data: { jwtToken: string } | null };
    if (data.status && data.data?.jwtToken) {
      const { jwtToken } = data.data;
      await redis.setex('at:market:session', 23*3600, JSON.stringify({ accessToken: jwtToken, expiresAt: Date.now() + 23*3600*1000 })).catch(() => {});
      return jwtToken;
    }
    const isTotpErr = data.errorcode === 'AG8004' || (data.message ?? '').toLowerCase().includes('totp');
    if (!isTotpErr) throw new Error(data.message || 'Login failed');
  }
  throw new Error('AngelOne login failed');
}

// GET /api/chart-data?exchange=NSE&token=3045&interval=ONE_DAY
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const exchange  = searchParams.get('exchange') ?? 'NSE';
  const token     = searchParams.get('token')    ?? '';
  const interval  = (searchParams.get('interval') ?? 'ONE_DAY') as CandleInterval;

  if (!token) return NextResponse.json({ error: 'token is required' }, { status: 400 });

  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;

  if (!apiKey || !clientId || !password || !totpSecret) {
    return NextResponse.json({ error: 'AngelOne credentials not configured on server' }, { status: 503 });
  }

  try {
    const accessToken = await getToken(apiKey, clientId, password, totpSecret);
    const { from, to } = candleDateRange(interval);
    const candles = await getCandleData(apiKey, accessToken, exchange, token, interval, from, to);
    return NextResponse.json({ candles: candles ?? [], interval, from, to });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
