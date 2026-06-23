/**
 * Server-side AngelOne Live Market Data sync engine.
 *
 * Uses POST /rest/secure/angelbroking/market/v1/quote/ (FULL mode)
 * to fetch real-time LTP, OHLC, volume, OI, depth for all tracked
 * equity tokens and indices.
 *
 * Sync cadence:
 *   • Equity prices   — every 60 s  (rate: 1 req/s, 50 tokens/req)
 *   • Index prices    — every 60 s  (separate call, graceful fail)
 *   • Full DB persist — every 4 h   (Postgres upsert)
 */

import { redis } from './redis-client';
import { getPool } from './db/client';
import { INDEX_TOKENS, EQUITY_TOKENS } from './angelone/tokens';
import { getMarketQuote, MarketQuoteFull } from './angelone/client';
import { getAngelSession } from './angelone/auth';

// ── Constants ─────────────────────────────────────────────────────────────────
export const EQUITY_SYNC_INTERVAL_MS = 60_000;      // 60 s live price sync
export const FULL_SYNC_INTERVAL_MS   = 4 * 3600_000; // 4 h full DB persist
const QUOTE_TTL_S = 300;   // 5 minutes — enough for one missed sync
const BATCH_SIZE  = 50;    // Angel One max tokens per request

// ── Redis key helpers ─────────────────────────────────────────────────────────
const quoteBySymbol = (ex: string, sym: string) => `at:market:quote:${ex}:${sym}`;
const quoteByToken  = (token: string)           => `at:market:quote:token:${token}`;
const ltpBySymbol   = (ex: string, sym: string) => `at:market:ltp:${ex}:${sym}`;
const idxKey        = (sym: string)             => `at:idx:${sym}`;

// ── Token map for index symbols ───────────────────────────────────────────────
const IDX_TOKENS_MAP: Record<string, string[]> = {
  NSE: ['99926000', '99926009', '99926006', '99926003'],
  BSE: ['99919000'],
};
const IDX_TOKEN_TO_SYMBOL: Record<string, string> = {
  '99926000': 'NIFTY',
  '99926009': 'BANKNIFTY',
  '99919000': 'SENSEX',
  '99926006': 'NIFTY IT',
  '99926003': 'NIFTY MIDCAP 100',
};

// ── Chunk array into groups of N ──────────────────────────────────────────────
function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ── Build exchangeTokens map from TOKEN_MAP ───────────────────────────────────
function buildExchangeTokens(
  tokenMap: Record<string, string[]>
): Record<string, string[]> {
  return tokenMap; // already in correct format
}

// ── Shared credentials check ──────────────────────────────────────────────────
function getCredentials() {
  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;
  return (apiKey && clientId && password && totpSecret)
    ? { apiKey, clientId, password, totpSecret }
    : null;
}

// ── Postgres table DDL ────────────────────────────────────────────────────────
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
  tot_buy_qty     BIGINT,
  tot_sell_qty    BIGINT,
  synced_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (exchange, symbol)
);
CREATE INDEX IF NOT EXISTS idx_mq_symbol ON market_quotes(symbol);
CREATE INDEX IF NOT EXISTS idx_mq_token  ON market_quotes(token);
CREATE INDEX IF NOT EXISTS idx_mq_synced ON market_quotes(synced_at DESC);
`;

async function ensureTables(): Promise<void> {
  await Promise.allSettled([
    getPool('live').query(CREATE_TABLE_SQL),
    getPool('paper').query(CREATE_TABLE_SQL),
  ]);
}

const UPSERT_SQL = `
INSERT INTO market_quotes (
  exchange, symbol, trading_symbol, token, ltp, open, high, low, close,
  net_change, percent_change, volume, avg_price, open_interest,
  week52_high, week52_low, upper_circuit, lower_circuit,
  last_trade_qty, exch_feed_time, tot_buy_qty, tot_sell_qty, synced_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22, NOW())
ON CONFLICT (exchange, symbol) DO UPDATE SET
  trading_symbol = EXCLUDED.trading_symbol,  token        = EXCLUDED.token,
  ltp            = EXCLUDED.ltp,             open         = EXCLUDED.open,
  high           = EXCLUDED.high,            low          = EXCLUDED.low,
  close          = EXCLUDED.close,           net_change   = EXCLUDED.net_change,
  percent_change = EXCLUDED.percent_change,  volume       = EXCLUDED.volume,
  avg_price      = EXCLUDED.avg_price,       open_interest= EXCLUDED.open_interest,
  week52_high    = EXCLUDED.week52_high,     week52_low   = EXCLUDED.week52_low,
  upper_circuit  = EXCLUDED.upper_circuit,   lower_circuit= EXCLUDED.lower_circuit,
  last_trade_qty = EXCLUDED.last_trade_qty,  exch_feed_time = EXCLUDED.exch_feed_time,
  tot_buy_qty    = EXCLUDED.tot_buy_qty,     tot_sell_qty = EXCLUDED.tot_sell_qty,
  synced_at      = NOW()
`;

// ── Bulk-update angle_scrip with live prices (matched by token PK) ───────────
// Uses a single UPDATE ... FROM (SELECT UNNEST(...)) to minimise round-trips.
async function updateAngleScripPrices(quotes: MarketQuoteFull[]): Promise<void> {
  if (!quotes.length) return;
  const pool = getPool('live');

  // Build typed arrays for unnest — Postgres will cast them via the column types
  const tokens:    string[]  = [];
  const ltps:      (number|null)[] = [];
  const opens:     (number|null)[] = [];
  const highs:     (number|null)[] = [];
  const lows:      (number|null)[] = [];
  const closes:    (number|null)[] = [];
  const netChgs:   (number|null)[] = [];
  const chgPcts:   (number|null)[] = [];
  const vols:      (number|null)[] = [];
  const ois:       (number|null)[] = [];
  const avgPrices: (number|null)[] = [];
  const w52Highs:  (number|null)[] = [];
  const w52Lows:   (number|null)[] = [];
  const upCirks:   (string|null)[] = [];
  const loCirks:   (string|null)[] = [];
  const totBuys:   (number|null)[] = [];
  const totSells:  (number|null)[] = [];

  for (const q of quotes) {
    tokens.push(q.symbolToken);
    ltps.push(q.ltp         ?? null);
    opens.push(q.open       ?? null);
    highs.push(q.high       ?? null);
    lows.push(q.low         ?? null);
    closes.push(q.close     ?? null);
    netChgs.push(q.netChange    ?? null);
    chgPcts.push(q.percentChange ?? null);
    vols.push(q.tradeVolume  ?? null);
    ois.push(q.opnInterest   ?? null);
    avgPrices.push(q.avgPrice    ?? null);
    w52Highs.push(q['52WeekHigh'] ?? null);
    w52Lows.push(q['52WeekLow']   ?? null);
    upCirks.push(q.upperCircuit   ?? null);
    loCirks.push(q.lowerCircuit   ?? null);
    totBuys.push(q.totBuyQuan     ?? null);
    totSells.push(q.totSellQuan   ?? null);
  }

  const sql = `
    UPDATE angle_scrip AS a
    SET
      ltp           = d.ltp::numeric,
      open          = d.open::numeric,
      high          = d.high::numeric,
      low           = d.low::numeric,
      close         = d.close::numeric,
      net_change    = d.net_change::numeric,
      change_pct    = d.change_pct::numeric,
      volume        = d.volume::bigint,
      open_interest = d.open_interest::bigint,
      avg_price     = d.avg_price::numeric,
      week52_high   = d.week52_high::numeric,
      week52_low    = d.week52_low::numeric,
      upper_circuit = d.upper_circuit,
      lower_circuit = d.lower_circuit,
      tot_buy_qty   = d.tot_buy_qty::bigint,
      tot_sell_qty  = d.tot_sell_qty::bigint,
      ltp_updated_at = NOW()
    FROM (
      SELECT
        UNNEST($1::text[])    AS token,
        UNNEST($2::text[])    AS ltp,
        UNNEST($3::text[])    AS open,
        UNNEST($4::text[])    AS high,
        UNNEST($5::text[])    AS low,
        UNNEST($6::text[])    AS close,
        UNNEST($7::text[])    AS net_change,
        UNNEST($8::text[])    AS change_pct,
        UNNEST($9::text[])    AS volume,
        UNNEST($10::text[])   AS open_interest,
        UNNEST($11::text[])   AS avg_price,
        UNNEST($12::text[])   AS week52_high,
        UNNEST($13::text[])   AS week52_low,
        UNNEST($14::text[])   AS upper_circuit,
        UNNEST($15::text[])   AS lower_circuit,
        UNNEST($16::text[])   AS tot_buy_qty,
        UNNEST($17::text[])   AS tot_sell_qty
    ) AS d
    WHERE a.token = d.token
  `;

  // Serialize nulls as empty strings then cast — Postgres handles '' as NULL for numeric when cast
  const toTextArr = (arr: (number | string | null)[]) =>
    arr.map(v => (v == null ? null : String(v)));

  try {
    const result = await pool.query(sql, [
      tokens,
      toTextArr(ltps),    toTextArr(opens),   toTextArr(highs),
      toTextArr(lows),    toTextArr(closes),  toTextArr(netChgs),
      toTextArr(chgPcts), toTextArr(vols),    toTextArr(ois),
      toTextArr(avgPrices), toTextArr(w52Highs), toTextArr(w52Lows),
      upCirks.map(v => v ?? null),             // keep as strings
      loCirks.map(v => v ?? null),
      toTextArr(totBuys), toTextArr(totSells),
    ]);
    if ((result.rowCount ?? 0) > 0) {
      console.log(`[market-sync] angle_scrip updated: ${result.rowCount} rows`);
    }
  } catch (e) {
    console.warn('[market-sync] angle_scrip update failed:', (e as Error).message);
  }
}

// ── Cache a batch of quotes into Redis ────────────────────────────────────────
async function cacheQuotes(
  quotes: MarketQuoteFull[],
  tokenToSymbol: Record<string, string>,
  persistToDB: boolean,
): Promise<number> {
  if (!quotes.length) return 0;

  const pipeline = redis.pipeline();
  const livePool = persistToDB ? getPool('live')  : null;
  const papPool  = persistToDB ? getPool('paper') : null;

  for (const q of quotes) {
    const mk          = `${q.exchange}:${q.symbolToken}`;
    const cleanSymbol = tokenToSymbol[mk]
      ?? q.tradingSymbol.toUpperCase().replace(/-EQ$/, '').replace(/-BE$/, '');

    const payload: CachedQuote = {
      symbol:        cleanSymbol,
      exchange:      q.exchange,
      tradingSymbol: q.tradingSymbol,
      token:         q.symbolToken,
      ltp:           q.ltp          ?? 0,
      open:          q.open         ?? 0,
      high:          q.high         ?? 0,
      low:           q.low          ?? 0,
      close:         q.close        ?? 0,
      netChange:     q.netChange    ?? 0,
      percentChange: q.percentChange ?? 0,
      volume:        q.tradeVolume  ?? 0,
      avgPrice:      q.avgPrice     ?? 0,
      openInterest:  q.opnInterest  ?? 0,
      week52High:    q['52WeekHigh'] ?? 0,
      week52Low:     q['52WeekLow']  ?? 0,
      totBuyQty:     q.totBuyQuan   ?? 0,
      totSellQty:    q.totSellQuan  ?? 0,
      bid:           q.depth?.buy?.[0]?.price  ?? 0,
      ask:           q.depth?.sell?.[0]?.price ?? 0,
      upperCircuit:  parseFloat(q.upperCircuit ?? '0') || 0,
      lowerCircuit:  parseFloat(q.lowerCircuit ?? '0') || 0,
      updatedAt:     Date.now(),
    };
    const json = JSON.stringify(payload);

    // By clean symbol (primary lookup)
    pipeline.setex(quoteBySymbol(q.exchange, cleanSymbol), QUOTE_TTL_S, json);
    pipeline.setex(ltpBySymbol(q.exchange, cleanSymbol),   QUOTE_TTL_S, String(q.ltp));

    // By token number (used by /api/tokens/ltp)
    pipeline.setex(quoteByToken(q.symbolToken), QUOTE_TTL_S, json);

    // By trading symbol alias (e.g. SBIN-EQ)
    const ts = q.tradingSymbol.toUpperCase();
    if (ts !== cleanSymbol) {
      pipeline.setex(quoteBySymbol(q.exchange, ts), QUOTE_TTL_S, json);
    }

    // Postgres (fire-and-forget, non-blocking)
    if (livePool && papPool) {
      const params = [
        q.exchange, cleanSymbol, q.tradingSymbol, q.symbolToken,
        q.ltp, q.open, q.high, q.low, q.close,
        q.netChange, q.percentChange, q.tradeVolume, q.avgPrice, q.opnInterest,
        q['52WeekHigh'], q['52WeekLow'], q.upperCircuit, q.lowerCircuit,
        q.lastTradeQty, q.exchFeedTime, q.totBuyQuan ?? 0, q.totSellQuan ?? 0,
      ];
      livePool.query(UPSERT_SQL, params).catch(() => {});
      papPool.query(UPSERT_SQL, params).catch(() => {});
    }
  }

  await pipeline.exec().catch(() => {});
  return quotes.length;
}

// ── Fetch quotes from Angel One in batches of 50 ──────────────────────────────
async function fetchQuotesInBatches(
  apiKey: string,
  accessToken: string,
  exchangeTokensMap: Record<string, string[]>,
): Promise<{ fetched: MarketQuoteFull[]; unfetchedCount: number }> {
  // Flatten to a list of { exchange, tokens[] } slices of ≤50 each
  const allFetched: MarketQuoteFull[] = [];
  let unfetchedCount = 0;

  // Group by exchange and chunk
  for (const [exchange, tokens] of Object.entries(exchangeTokensMap)) {
    const batches = chunk(tokens, BATCH_SIZE);
    for (const batch of batches) {
      try {
        const result = await getMarketQuote(apiKey, accessToken, 'FULL', { [exchange]: batch });
        allFetched.push(...(result?.fetched ?? []));
        unfetchedCount += (result?.unfetched ?? []).length;
        if ((result?.unfetched ?? []).length > 0) {
          console.warn(`[market-sync] ${result.unfetched.length} unfetched from ${exchange}:`,
            result.unfetched.map(u => `${u.symbolToken}(${u.errorCode})`).join(', '));
        }
      } catch (e) {
        console.warn(`[market-sync] Batch fetch failed for ${exchange} [${batch.slice(0,3).join(',')}...]:`,
          (e as Error).message);
      }
      // Rate limit: 1 req/s — small pause between batches
      if (batches.length > 1) await new Promise(r => setTimeout(r, 1100));
    }
  }

  return { fetched: allFetched, unfetchedCount };
}

// ── Build reverse lookup: "NSE:token" → clean symbol ─────────────────────────
function buildTokenToSymbol(): Record<string, string> {
  const out: Record<string, string> = {};
  const addEntry = (sym: string, ex: string, token: string) => {
    const mk = `${ex}:${token}`;
    if (!out[mk] || sym.length < out[mk].length) out[mk] = sym.toUpperCase();
  };
  for (const [sym, info] of Object.entries(INDEX_TOKENS))  addEntry(sym, info.exchange, info.token);
  for (const [sym, info] of Object.entries(EQUITY_TOKENS)) addEntry(sym, info.exchange, info.token);
  // Index token overrides (canonical short name)
  for (const [token, sym] of Object.entries(IDX_TOKEN_TO_SYMBOL)) addEntry(sym, 'NSE', token);
  addEntry('SENSEX', 'BSE', '99919000');
  return out;
}

// ── Build exchangeTokens from EQUITY_TOKENS only (no index tokens) ────────────
function buildEquityExchangeTokens(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const info of Object.values(EQUITY_TOKENS)) {
    if (!out[info.exchange]) out[info.exchange] = [];
    if (!out[info.exchange].includes(info.token)) out[info.exchange].push(info.token);
  }
  return out;
}

// ── Index price sync (separate, graceful) ────────────────────────────────────
export interface IndexPrice {
  symbol:        string;
  ltp:           number;
  change:        number;
  changePercent: number;
  open:          number;
  high:          number;
  low:           number;
  close:         number;
  updatedAt:     number;
}

export async function syncIndexPrices(): Promise<void> {
  const creds = getCredentials();
  if (!creds) return;
  try {
    const { accessToken } = await getAngelSession(
      creds.apiKey, creds.clientId, creds.password, creds.totpSecret
    );
    const result = await getMarketQuote(creds.apiKey, accessToken, 'FULL', IDX_TOKENS_MAP);
    const quotes = result?.fetched ?? [];
    if (!quotes.length) return;

    const pipeline = redis.pipeline();
    for (const q of quotes) {
      const symbol = IDX_TOKEN_TO_SYMBOL[q.symbolToken];
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
      pipeline.setex(idxKey(symbol), 90, JSON.stringify(payload));
      // Also store by token for /api/tokens/ltp
      const tokenPayload: CachedQuote = {
        symbol, exchange: q.exchange, tradingSymbol: q.tradingSymbol,
        token: q.symbolToken, ltp: q.ltp, open: q.open, high: q.high,
        low: q.low, close: q.close, netChange: q.netChange,
        percentChange: q.percentChange, volume: q.tradeVolume ?? 0,
        avgPrice: q.avgPrice ?? 0, openInterest: 0, week52High: 0, week52Low: 0,
        totBuyQty: q.totBuyQuan ?? 0, totSellQty: q.totSellQuan ?? 0,
        bid: 0, ask: 0, upperCircuit: 0, lowerCircuit: 0, updatedAt: Date.now(),
      };
      pipeline.setex(quoteByToken(q.symbolToken), 90, JSON.stringify(tokenPayload));
    }
    await pipeline.exec().catch(() => {});

    // Also persist index prices to angle_scrip (fire-and-forget)
    updateAngleScripPrices(quotes).catch(() => {});

    console.log(`[market-sync] Index prices updated (${quotes.length} indices)`);
  } catch (e) {
    console.warn('[market-sync] syncIndexPrices failed:', (e as Error).message);
  }
}

// ── Index prices DB fallback ──────────────────────────────────────────────────
const IDX_SYMBOL_TO_BHAVCOPY: Record<string, string> = {
  'NIFTY':            'Nifty 50',
  'BANKNIFTY':        'Nifty Bank',
  'SENSEX':           'BSE SENSEX',
  'NIFTY IT':         'Nifty IT',
  'NIFTY MIDCAP 100': 'NIFTY Midcap 100',
};

export async function getIndexPrices(): Promise<Record<string, IndexPrice>> {
  const symbols = Object.values(IDX_TOKEN_TO_SYMBOL);
  const out: Record<string, IndexPrice> = {};

  try {
    const pipeline = redis.pipeline();
    for (const s of symbols) pipeline.get(idxKey(s));
    const results = await pipeline.exec();
    for (let i = 0; i < symbols.length; i++) {
      const val = results?.[i]?.[1];
      if (!val) continue;
      try { out[symbols[i]] = JSON.parse(String(val)) as IndexPrice; } catch {}
    }
  } catch {}

  // DB fallback for any missing
  const missing = symbols.filter(s => !out[s]);
  if (missing.length > 0) {
    try {
      const pool = getPool('live');
      const bhavSymbols = missing.map(s => IDX_SYMBOL_TO_BHAVCOPY[s]).filter(Boolean);
      if (bhavSymbols.length) {
        const { rows } = await pool.query<Record<string, unknown>>(
          `SELECT DISTINCT ON (symbol) symbol AS bsymbol,
             close_price, open_price, high_price, low_price,
             net_change, change_pct, price_date
           FROM index_prices WHERE symbol = ANY($1)
           ORDER BY symbol, price_date DESC`,
          [bhavSymbols]
        );
        const rev: Record<string, string> = {};
        for (const [k, v] of Object.entries(IDX_SYMBOL_TO_BHAVCOPY)) rev[v] = k;
        for (const row of rows) {
          const angelKey = rev[row.bsymbol as string];
          if (!angelKey || out[angelKey]) continue;
          const n = (v: unknown) => v == null ? 0 : parseFloat(String(v));
          const close = n(row.close_price), chg = n(row.net_change);
          out[angelKey] = {
            symbol: angelKey, ltp: close, change: chg,
            changePercent: n(row.change_pct),
            open: n(row.open_price) || close, high: n(row.high_price) || close,
            low:  n(row.low_price)  || close, close: close - chg,
            updatedAt: row.price_date ? new Date(String(row.price_date)).getTime() : Date.now(),
          };
        }
      }
    } catch {}
  }
  return out;
}

// ── Public types ──────────────────────────────────────────────────────────────
export interface CachedQuote {
  symbol:        string;
  exchange:      string;
  tradingSymbol: string;
  token:         string;
  ltp:           number;
  open:          number;
  high:          number;
  low:           number;
  close:         number;
  netChange:     number;
  percentChange: number;
  volume:        number;
  avgPrice:      number;
  openInterest:  number;
  week52High:    number;
  week52Low:     number;
  totBuyQty:     number;
  totSellQty:    number;
  bid:           number;
  ask:           number;
  upperCircuit:  number;
  lowerCircuit:  number;
  updatedAt:     number;
}

export interface SyncStatus {
  status: 'ok' | 'error' | 'never';
  lastSync: string | null;
  tokenCount: number;
  error?: string;
}

// ── Equity live sync (every 60 s) ─────────────────────────────────────────────
export async function runEquitySync(): Promise<{ count: number; error?: string }> {
  const creds = getCredentials();
  if (!creds) return { count: 0, error: 'Credentials not configured' };

  try {
    const { accessToken } = await getAngelSession(
      creds.apiKey, creds.clientId, creds.password, creds.totpSecret
    );
    const exchangeTokens = buildEquityExchangeTokens();
    const tokenToSymbol  = buildTokenToSymbol();

    const { fetched, unfetchedCount } = await fetchQuotesInBatches(
      creds.apiKey, accessToken, exchangeTokens
    );

    if (fetched.length === 0 && unfetchedCount > 0) {
      console.warn('[market-sync] All equity tokens unfetched — check token validity');
      return { count: 0, error: 'All tokens unfetched' };
    }

    const written = await cacheQuotes(fetched, tokenToSymbol, false); // Redis only, no market_quotes for 60s sync

    // Also update angle_scrip so search results show live prices (fire-and-forget)
    if (fetched.length > 0) updateAngleScripPrices(fetched).catch(() => {});

    if (written > 0) {
      const now = new Date().toISOString();
      await redis.pipeline()
        .set('at:market:sync:status', 'ok')
        .set('at:market:sync:last', now)
        .set('at:market:sync:count', String(written))
        .del('at:market:sync:error')
        .exec()
        .catch(() => {});
    }
    return { count: written };
  } catch (e) {
    const msg = (e as Error).message;
    console.warn('[market-sync] runEquitySync error:', msg);
    return { count: 0, error: msg };
  }
}

// ── Full sync (every 4 h) — equity + DB persist ───────────────────────────────
export async function runMarketSync(): Promise<SyncStatus> {
  const creds = getCredentials();
  if (!creds) {
    console.warn('[market-sync] AngelOne credentials not configured — skipping sync');
    return { status: 'error', lastSync: null, tokenCount: 0, error: 'Credentials not configured' };
  }

  try {
    await ensureTables();
    const { accessToken } = await getAngelSession(
      creds.apiKey, creds.clientId, creds.password, creds.totpSecret
    );

    // Equity tokens (Postgres persist)
    const equityTokens   = buildEquityExchangeTokens();
    const tokenToSymbol  = buildTokenToSymbol();
    const { fetched: equityFetched } = await fetchQuotesInBatches(
      creds.apiKey, accessToken, equityTokens
    );
    const written = await cacheQuotes(equityFetched, tokenToSymbol, true); // with market_quotes DB

    // Also update angle_scrip (fire-and-forget — non-blocking on the sync result)
    if (equityFetched.length > 0) updateAngleScripPrices(equityFetched).catch(() => {});

    const now = new Date().toISOString();
    await redis.pipeline()
      .set('at:market:sync:status', 'ok')
      .set('at:market:sync:last',  now)
      .set('at:market:sync:count', String(written))
      .del('at:market:sync:error')
      .exec().catch(() => {});

    console.log(`[market-sync] Full sync done — ${written} quotes at ${now}`);
    return { status: 'ok', lastSync: now, tokenCount: written };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[market-sync] Full sync failed:', msg);
    await redis.pipeline()
      .set('at:market:sync:status', 'error')
      .set('at:market:sync:error', msg)
      .exec().catch(() => {});
    return { status: 'error', lastSync: null, tokenCount: 0, error: msg };
  }
}

// ── Sync status ───────────────────────────────────────────────────────────────
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

// ── Get all cached quotes (for /api/market-sync/data) ─────────────────────────
export async function getCachedQuotes(): Promise<Record<string, CachedQuote>> {
  try {
    const keys = await redis.keys('at:market:quote:NSE:*');
    const bseKeys = await redis.keys('at:market:quote:BSE:*');
    const allKeys = [...keys, ...bseKeys];
    if (!allKeys.length) return {};

    const pipeline = redis.pipeline();
    for (const key of allKeys) pipeline.get(key);
    const results = await pipeline.exec();

    const out: Record<string, CachedQuote> = {};
    for (const [, val] of (results ?? [])) {
      if (!val) continue;
      try {
        const q = JSON.parse(String(val)) as CachedQuote;
        out[q.symbol] = q;
        const ts = q.tradingSymbol?.toUpperCase();
        if (ts && ts !== q.symbol) out[ts] = q;
      } catch {}
    }
    return out;
  } catch { return {}; }
}

// ── Get quotes by token IDs (for /api/tokens/ltp) ─────────────────────────────
export async function getQuotesByTokens(
  tokens: string[]
): Promise<Record<string, CachedQuote>> {
  if (!tokens.length) return {};
  try {
    const pipeline = redis.pipeline();
    for (const t of tokens) pipeline.get(quoteByToken(t));
    const results = await pipeline.exec();
    const out: Record<string, CachedQuote> = {};
    for (let i = 0; i < tokens.length; i++) {
      const val = results?.[i]?.[1];
      if (!val) continue;
      try { out[tokens[i]] = JSON.parse(String(val)) as CachedQuote; } catch {}
    }
    return out;
  } catch { return {}; }
}

// ── Background scheduler ──────────────────────────────────────────────────────
declare global {
  // eslint-disable-next-line no-var
  var _marketSyncScheduled: boolean | undefined;
}

export function scheduleMarketSync(): void {
  if (global._marketSyncScheduled) return;
  global._marketSyncScheduled = true;

  // Run equity + index sync immediately after 5s startup delay
  setTimeout(async () => {
    await Promise.allSettled([runEquitySync(), syncIndexPrices()]);
  }, 5_000);

  // Equity live prices every 60 s
  setInterval(() => {
    runEquitySync().catch(e => console.error('[market-sync] Equity sync error:', e));
  }, EQUITY_SYNC_INTERVAL_MS);

  // Index prices every 60 s (separate call, graceful fail)
  setInterval(() => {
    syncIndexPrices().catch(() => {});
  }, 60_000);

  // Full Postgres persist every 4 h
  setInterval(() => {
    runMarketSync().catch(e => console.error('[market-sync] Full sync error:', e));
  }, FULL_SYNC_INTERVAL_MS);

  console.log('[market-sync] Scheduler started — equity + index every 60 s, DB persist every 4 h');
}
