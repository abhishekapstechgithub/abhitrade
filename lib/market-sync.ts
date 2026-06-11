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

// ── Index price (lightweight 60-second sync) ──────────────────────────────────
// Only the 5 tracked indices — one REST call per minute, very low overhead.
const IDX_TOKENS: Record<string, string[]> = {
  NSE: ['99926000', '99926009', '99926006', '99926003'],
  BSE: ['99919000'],
};
const IDX_TOKEN_SYMBOL: Record<string, string> = {
  '99926000': 'NIFTY',
  '99926009': 'BANKNIFTY',
  '99919000': 'SENSEX',
  '99926006': 'NIFTY IT',
  '99926003': 'NIFTY MIDCAP 100',
};
const IDX_TTL = 90; // 90 s — slightly longer than the 60-s poll interval

export interface IndexPrice {
  symbol:        string;
  ltp:           number;
  change:        number;
  changePercent: number;
  open:          number;
  high:          number;
  low:           number;
  close:         number;
  updatedAt:     number; // epoch ms
}

export async function syncIndexPrices(): Promise<void> {
  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;
  if (!apiKey || !clientId || !password || !totpSecret) return;

  try {
    const accessToken = await getAccessToken(apiKey, clientId, password, totpSecret);
    const result = await getMarketQuote(apiKey, accessToken, 'FULL', IDX_TOKENS);
    const quotes = result?.fetched ?? [];
    if (!quotes.length) return;

    const pipeline = redis.pipeline();
    for (const q of quotes) {
      const symbol = IDX_TOKEN_SYMBOL[q.symbolToken];
      if (!symbol) continue;
      const payload: IndexPrice = {
        symbol,
        ltp:           q.ltp,
        change:        q.netChange,
        changePercent: q.percentChange,
        open:          q.open,
        high:          q.high,
        low:           q.low,
        close:         q.close,
        updatedAt:     Date.now(),
      };
      pipeline.setex(`at:idx:${symbol}`, IDX_TTL, JSON.stringify(payload));
    }
    await pipeline.exec().catch(() => {});
    console.log(`[market-sync] Index prices updated (${quotes.length} indices)`);
  } catch (e) {
    // Best-effort — don't let this crash the scheduler
    console.warn('[market-sync] syncIndexPrices failed:', (e as Error).message);
  }
}

// AngelOne symbol key → index_prices.symbol (bhavcopy table)
const IDX_SYMBOL_TO_BHAVCOPY: Record<string, string> = {
  'NIFTY':            'Nifty 50',
  'BANKNIFTY':        'Nifty Bank',
  'SENSEX':           'BSE SENSEX',
  'NIFTY IT':         'Nifty IT',
  'NIFTY MIDCAP 100': 'NIFTY Midcap 100',  // maps to store symbol MIDCPNIFTY
};

export async function getIndexPrices(): Promise<Record<string, IndexPrice>> {
  const symbols = Object.values(IDX_TOKEN_SYMBOL);
  const out: Record<string, IndexPrice> = {};

  // 1. Try Redis (live AngelOne data)
  try {
    const pipeline = redis.pipeline();
    for (const s of symbols) pipeline.get(`at:idx:${s}`);
    const results = await pipeline.exec();
    for (let i = 0; i < symbols.length; i++) {
      const val = results?.[i]?.[1];
      if (!val) continue;
      try { out[symbols[i]] = JSON.parse(String(val)) as IndexPrice; } catch {}
    }
  } catch { /* fall through */ }

  // 2. For any missing symbols, fall back to index_prices table (bhavcopy EOD data)
  const missing = symbols.filter(s => !out[s]);
  if (missing.length > 0) {
    try {
      const { getPool } = await import('@/lib/db/client');
      const pool = getPool('live');
      const bhavSymbols = missing.map(s => IDX_SYMBOL_TO_BHAVCOPY[s]).filter(Boolean);
      if (bhavSymbols.length > 0) {
        const rows = await pool.query<{
          bsymbol: string; close_price: number | null; open_price: number | null;
          high_price: number | null; low_price: number | null;
          net_change: number | null; change_pct: number | null; price_date: Date | null;
        }>(
          `SELECT DISTINCT ON (symbol) symbol AS bsymbol,
             close_price, open_price, high_price, low_price,
             net_change, change_pct, price_date
           FROM index_prices
           WHERE symbol = ANY($1)
           ORDER BY symbol, price_date DESC`,
          [bhavSymbols]
        );
        // Build reverse map: bhavcopy symbol → AngelOne key
        const reverseMap: Record<string, string> = {};
        for (const [key, val] of Object.entries(IDX_SYMBOL_TO_BHAVCOPY)) {
          reverseMap[val] = key;
        }
        for (const row of rows.rows) {
          const angelKey = reverseMap[row.bsymbol];
          if (!angelKey || out[angelKey]) continue; // skip if already from Redis
          const n = (v: number | null) => v == null ? 0 : parseFloat(String(v));
          const close = n(row.close_price);
          const chg   = n(row.net_change);
          const prev  = close - chg;
          out[angelKey] = {
            symbol:        angelKey,
            ltp:           close,
            change:        chg,
            changePercent: n(row.change_pct),
            open:          n(row.open_price)  || close,
            high:          n(row.high_price)  || close,
            low:           n(row.low_price)   || close,
            close:         prev > 0 ? parseFloat(prev.toFixed(2)) : close,
            updatedAt:     row.price_date ? new Date(row.price_date).getTime() : Date.now(),
          };
        }
      }
    } catch { /* bhavcopy fallback failed — return what we have */ }
  }

  return out;
}

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

  // Full sync (all tokens → Postgres + Redis) on startup after 5 s, then every 4 h
  setTimeout(() => {
    runMarketSync().catch(e => console.error('[market-sync] Initial full sync error:', e));
  }, 5_000);
  setInterval(() => {
    runMarketSync().catch(e => console.error('[market-sync] Scheduled full sync error:', e));
  }, SYNC_INTERVAL_MS);

  // Lightweight index-only sync every 60 s (NIFTY, SENSEX, BANKNIFTY, IT, MIDCAP)
  setTimeout(() => {
    syncIndexPrices().catch(() => {});
    setInterval(() => {
      syncIndexPrices().catch(() => {});
    }, 60_000);
  }, 8_000); // start 8 s after startup (after full sync completes first)

  console.log('[market-sync] Scheduler started — full sync every 4 h, index prices every 60 s');
}
