// Server-side only — AngelOne market data sync engine
import { createHmac } from 'crypto';
import { redis } from './redis-client';
import { getPool } from './db/client';
import { INDEX_TOKENS, EQUITY_TOKENS } from './angelone/tokens';
import { getMarketQuote } from './angelone/client';

const ANGEL_LOGIN_URL =
  'https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword';

export const SYNC_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
const SESSION_TTL_S = 23 * 60 * 60;   // cache AngelOne JWT 23 h
const QUOTE_TTL_S   =  5 * 60 * 60;   // cached quotes expire after 5 h

// ── Pure-Node TOTP (RFC 6238) — same logic as connect/route.ts ────────────────
function base32Decode(s: string): Buffer {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const input = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of input) {
    const idx = ALPHA.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateTOTP(secret: string, windowOffset = 0): string {
  const key  = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / 30) + windowOffset;
  const buf  = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const off  = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[off] & 0x7f) << 24) |
    (hmac[off + 1] << 16) |
    (hmac[off + 2] <<  8) |
     hmac[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

// ── AngelOne login with session caching in Redis ───────────────────────────────
async function getAccessToken(
  apiKey: string,
  clientId: string,
  password: string,
  totpSecret: string,
): Promise<string> {
  const cached = await redis.get('at:market:session').catch(() => null);
  if (cached) {
    const sess = JSON.parse(cached) as { accessToken: string; expiresAt: number };
    if (Date.now() < sess.expiresAt) return sess.accessToken;
  }

  let lastError = 'Authentication failed';
  for (const offset of [0, 1, -1]) {
    const totp = generateTOTP(totpSecret, offset);
    const res  = await fetch(ANGEL_LOGIN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '106.51.128.1',
        'X-MACAddress': '00:00:00:00:00:00',
        'X-PrivateKey': apiKey,
      },
      body: JSON.stringify({ clientcode: clientId, password, totp }),
    });
    const data = await res.json() as {
      status: boolean; message: string; errorcode: string;
      data: { jwtToken: string } | null;
    };

    if (data.status && data.data?.jwtToken) {
      const accessToken = data.data.jwtToken;
      const sess = { accessToken, expiresAt: Date.now() + SESSION_TTL_S * 1000 };
      await redis.setex('at:market:session', SESSION_TTL_S, JSON.stringify(sess)).catch(() => {});
      return accessToken;
    }

    lastError = data.message || lastError;
    const isTotpError =
      data.errorcode === 'AG8004' || (data.message ?? '').toLowerCase().includes('totp');
    if (!isTotpError) break;
  }
  throw new Error(lastError);
}

// ── DB: auto-create market_quotes table if missing ────────────────────────────
const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS market_quotes (
  id              BIGSERIAL     PRIMARY KEY,
  exchange        VARCHAR(10)   NOT NULL,
  symbol          VARCHAR(100)  NOT NULL,
  trading_symbol  VARCHAR(150),
  token           VARCHAR(50),
  ltp             DECIMAL(12,2),
  open            DECIMAL(12,2),
  high            DECIMAL(12,2),
  low             DECIMAL(12,2),
  close           DECIMAL(12,2),
  net_change      DECIMAL(12,2),
  percent_change  DECIMAL(8,4),
  volume          BIGINT,
  avg_price       DECIMAL(12,2),
  open_interest   BIGINT,
  week52_high     DECIMAL(12,2),
  week52_low      DECIMAL(12,2),
  upper_circuit   VARCHAR(20),
  lower_circuit   VARCHAR(20),
  last_trade_qty  INTEGER,
  exch_feed_time  VARCHAR(50),
  synced_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (exchange, symbol)
);
CREATE INDEX IF NOT EXISTS idx_mq_symbol ON market_quotes(symbol);
CREATE INDEX IF NOT EXISTS idx_mq_synced ON market_quotes(synced_at DESC);
`;

async function ensureTables(): Promise<void> {
  await Promise.allSettled([
    getPool('live').query(CREATE_TABLE_SQL),
    getPool('paper').query(CREATE_TABLE_SQL),
  ]);
}

// ── Postgres upsert ───────────────────────────────────────────────────────────
const UPSERT_SQL = `
INSERT INTO market_quotes (
  exchange, symbol, trading_symbol, token, ltp, open, high, low, close,
  net_change, percent_change, volume, avg_price, open_interest,
  week52_high, week52_low, upper_circuit, lower_circuit, last_trade_qty, exch_feed_time, synced_at
) VALUES (
  $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20, NOW()
)
ON CONFLICT (exchange, symbol) DO UPDATE SET
  trading_symbol  = EXCLUDED.trading_symbol,
  token           = EXCLUDED.token,
  ltp             = EXCLUDED.ltp,
  open            = EXCLUDED.open,
  high            = EXCLUDED.high,
  low             = EXCLUDED.low,
  close           = EXCLUDED.close,
  net_change      = EXCLUDED.net_change,
  percent_change  = EXCLUDED.percent_change,
  volume          = EXCLUDED.volume,
  avg_price       = EXCLUDED.avg_price,
  open_interest   = EXCLUDED.open_interest,
  week52_high     = EXCLUDED.week52_high,
  week52_low      = EXCLUDED.week52_low,
  upper_circuit   = EXCLUDED.upper_circuit,
  lower_circuit   = EXCLUDED.lower_circuit,
  last_trade_qty  = EXCLUDED.last_trade_qty,
  exch_feed_time  = EXCLUDED.exch_feed_time,
  synced_at       = NOW()
`;

// ── Public types ──────────────────────────────────────────────────────────────
export interface SyncStatus {
  status: 'ok' | 'error' | 'never';
  lastSync: string | null;
  tokenCount: number;
  error?: string;
}

export interface CachedQuote {
  symbol: string;
  exchange: string;
  tradingSymbol: string;
  token: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  netChange: number;
  percentChange: number;
  volume: number;
  avgPrice: number;
  openInterest: number;
  week52High: number;
  week52Low: number;
}

// ── Main sync ─────────────────────────────────────────────────────────────────
export async function runMarketSync(): Promise<SyncStatus> {
  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;

  if (!apiKey || !clientId || !password || !totpSecret) {
    console.warn('[market-sync] AngelOne credentials not configured — skipping sync');
    return { status: 'error', lastSync: null, tokenCount: 0, error: 'Credentials not configured' };
  }

  try {
    await ensureTables();
    const accessToken = await getAccessToken(apiKey, clientId, password, totpSecret);

    // Build exchangeTokens map + reverse lookup by exchange:token → clean symbol
    const exchangeTokens: Record<string, string[]> = {};
    const tokenToSymbol: Record<string, string> = {};

    for (const [symbol, info] of [
      ...Object.entries(INDEX_TOKENS),
      ...Object.entries(EQUITY_TOKENS),
    ]) {
      if (!exchangeTokens[info.exchange]) exchangeTokens[info.exchange] = [];
      if (!exchangeTokens[info.exchange].includes(info.token)) {
        exchangeTokens[info.exchange].push(info.token);
      }
      // Prefer shorter alias (NIFTY over NIFTY 50 for the same token)
      const mk = `${info.exchange}:${info.token}`;
      if (!tokenToSymbol[mk] || symbol.length < tokenToSymbol[mk].length) {
        tokenToSymbol[mk] = symbol.toUpperCase();
      }
    }

    const result = await getMarketQuote(apiKey, accessToken, 'FULL', exchangeTokens);
    const quotes = result?.fetched ?? [];

    if (quotes.length === 0) throw new Error('No quotes returned from AngelOne API');

    const pipeline  = redis.pipeline();
    const livePool  = getPool('live');
    const paperPool = getPool('paper');

    for (const q of quotes) {
      const mk          = `${q.exchange}:${q.symbolToken}`;
      const cleanSymbol = tokenToSymbol[mk] ?? q.tradingSymbol.toUpperCase().replace(/-EQ$/, '');

      const quoteData: CachedQuote = {
        symbol:        cleanSymbol,
        exchange:      q.exchange,
        tradingSymbol: q.tradingSymbol,
        token:         q.symbolToken,
        ltp:           q.ltp,
        open:          q.open,
        high:          q.high,
        low:           q.low,
        close:         q.close,
        netChange:     q.netChange,
        percentChange: q.percentChange,
        volume:        q.tradeVolume,
        avgPrice:      q.avgPrice,
        openInterest:  q.opnInterest,
        week52High:    q['52WeekHigh'],
        week52Low:     q['52WeekLow'],
      };
      const quoteJson = JSON.stringify(quoteData);

      // Redis — store by clean symbol (NIFTY 50, SBIN, RELIANCE, …)
      pipeline.setex(`at:market:ltp:${q.exchange}:${cleanSymbol}`,   QUOTE_TTL_S, String(q.ltp));
      pipeline.setex(`at:market:quote:${q.exchange}:${cleanSymbol}`, QUOTE_TTL_S, quoteJson);

      // Redis — secondary key by trading symbol (SBIN-EQ, Nifty 50, …)
      const ts = q.tradingSymbol.toUpperCase();
      if (ts !== cleanSymbol) {
        pipeline.setex(`at:market:ltp:${q.exchange}:${ts}`,   QUOTE_TTL_S, String(q.ltp));
        pipeline.setex(`at:market:quote:${q.exchange}:${ts}`, QUOTE_TTL_S, quoteJson);
      }

      // Postgres upsert — fire-and-forget per row (non-blocking)
      const params = [
        q.exchange, cleanSymbol, q.tradingSymbol, q.symbolToken,
        q.ltp, q.open, q.high, q.low, q.close,
        q.netChange, q.percentChange, q.tradeVolume, q.avgPrice, q.opnInterest,
        q['52WeekHigh'], q['52WeekLow'],
        q.upperCircuit, q.lowerCircuit, q.lastTradeQty, q.exchFeedTime,
      ];
      livePool.query(UPSERT_SQL, params).catch(e =>
        console.error('[market-sync] live upsert error:', e.message));
      paperPool.query(UPSERT_SQL, params).catch(e =>
        console.error('[market-sync] paper upsert error:', e.message));
    }

    const now = new Date().toISOString();
    pipeline.set('at:market:sync:status', 'ok');
    pipeline.set('at:market:sync:last',   now);
    pipeline.set('at:market:sync:count',  String(quotes.length));
    pipeline.del('at:market:sync:error');
    await pipeline.exec().catch(() => {});

    console.log(`[market-sync] Synced ${quotes.length} quotes at ${now}`);
    return { status: 'ok', lastSync: now, tokenCount: quotes.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[market-sync] Sync failed:', msg);
    await Promise.allSettled([
      redis.set('at:market:sync:status', 'error'),
      redis.set('at:market:sync:error',  msg),
    ]);
    return { status: 'error', lastSync: null, tokenCount: 0, error: msg };
  }
}

// ── Status ────────────────────────────────────────────────────────────────────
export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const [status, last, count, errMsg] = await Promise.all([
      redis.get('at:market:sync:status'),
      redis.get('at:market:sync:last'),
      redis.get('at:market:sync:count'),
      redis.get('at:market:sync:error'),
    ]);
    return {
      status:     (status as SyncStatus['status']) ?? 'never',
      lastSync:   last,
      tokenCount: Number(count) || 0,
      ...(errMsg ? { error: errMsg } : {}),
    };
  } catch {
    return { status: 'never', lastSync: null, tokenCount: 0 };
  }
}

// ── Cached quotes for frontend ─────────────────────────────────────────────────
export async function getCachedQuotes(): Promise<Record<string, CachedQuote>> {
  try {
    const keys = await redis.keys('at:market:quote:*');
    if (keys.length === 0) return {};

    const pipeline = redis.pipeline();
    for (const key of keys) pipeline.get(key);
    const results = await pipeline.exec();

    const out: Record<string, CachedQuote> = {};
    for (const [, val] of (results ?? [])) {
      if (!val) continue;
      try {
        const q = JSON.parse(String(val)) as CachedQuote;
        out[q.symbol] = q;
        // Also index by tradingSymbol for broad compatibility
        const ts = q.tradingSymbol?.toUpperCase();
        if (ts && ts !== q.symbol) out[ts] = q;
      } catch { /* skip malformed */ }
    }
    return out;
  } catch {
    return {};
  }
}

// ── Background scheduler ──────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var _marketSyncScheduled: boolean | undefined;
}

export function scheduleMarketSync(): void {
  if (global._marketSyncScheduled) return;
  global._marketSyncScheduled = true;

  // Initial sync after 5 s to let DB + Redis finish connecting
  setTimeout(() => {
    runMarketSync().catch(e => console.error('[market-sync] Initial sync error:', e));
  }, 5_000);

  // Repeat every 4 hours
  setInterval(() => {
    runMarketSync().catch(e => console.error('[market-sync] Scheduled sync error:', e));
  }, SYNC_INTERVAL_MS);

  console.log('[market-sync] Scheduler started — syncing on startup + every 4 h');
}
