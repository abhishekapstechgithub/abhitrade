/**
 * Groww Top Movers — fetch, cache, and persist top 50 gainers/losers.
 *
 * Storage strategy (two layers):
 *   Redis  → fast read (<1ms). JSON arrays at tk:movers:gainers / tk:movers:losers.
 *            TTL 90s. All numbers stored as JavaScript numbers (no PG string quirk).
 *   Postgres → durable. market_movers table. Loaded from Redis on miss.
 *
 * is_gainer: 1 = gainer, 0 = loser
 *
 * scheduleMoversSync():
 *   Called once from instrumentation.ts on server startup.
 *   Syncs every 60 s during market hours: 9:00–15:30 IST, Mon–Fri.
 */

import type { PoolClient } from 'pg';
import { getPool } from './db/client';
import { redis } from './redis-client';

// ── Redis keys ────────────────────────────────────────────────────────────────
const RK_GAINERS = 'tk:movers:gainers';
const RK_LOSERS  = 'tk:movers:losers';
const REDIS_TTL  = 90; // seconds — expires after 90 s if sync stops

// ── Groww API ─────────────────────────────────────────────────────────────────
const GROWW_URL = 'https://groww.in/bff/web/stocks/explore/web-pages/top_movers';
const REQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept': 'application/json',
  'Referer': 'https://groww.in/',
};

interface GrowwStock {
  isin: string; gsin: string;
  companyName: string; companyShortName: string; searchId: string;
  ltp: number; logoUrl: string;
  nseScriptCode: string; bseScriptCode: string;
  marketCap: number; close: number;   // close = previous close
  yearHigh: number; yearLow: number;
  tag: string;
}

async function fetchGroww(moverType: 'TOP_GAINERS' | 'TOP_LOSERS'): Promise<GrowwStock[]> {
  const url = `${GROWW_URL}?indice=GIDXNIFTYTOTALMCAP&moverType=${moverType}&pageSize=50`;
  const res = await fetch(url, { headers: REQ_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`Groww ${moverType} HTTP ${res.status}`);
  const json = await res.json() as { data?: { stocks?: GrowwStock[] } };
  return json?.data?.stocks ?? [];
}

// ── Public data shape ─────────────────────────────────────────────────────────
// All numeric fields are stored as JS numbers (never PG numeric strings).
export interface MarketMoverRow {
  id?: number;
  isin: string | null;
  gsin: string | null;
  company_name: string;
  company_short: string | null;
  search_id: string | null;
  nse_code: string | null;
  bse_code: string | null;
  ltp: number;
  prev_close: number;
  change: number;
  change_pct: number;
  market_cap: number | null;
  year_high: number | null;
  year_low: number | null;
  logo_url: string | null;
  tag: string | null;
  is_gainer: number;
  rank: number;
  fetched_at: string;
}

function toRow(s: GrowwStock, rank: number, isGainer: number, now: string): MarketMoverRow {
  const change     = +(s.ltp - s.close).toFixed(4);
  const change_pct = s.close > 0 ? +((s.ltp - s.close) / s.close * 100).toFixed(4) : 0;
  return {
    isin:          s.isin          || null,
    gsin:          s.gsin          || null,
    company_name:  s.companyName,
    company_short: s.companyShortName || null,
    search_id:     s.searchId      || null,
    nse_code:      s.nseScriptCode || null,
    bse_code:      s.bseScriptCode || null,
    ltp:           s.ltp,
    prev_close:    s.close,
    change,
    change_pct,
    market_cap:    s.marketCap     ?? null,
    year_high:     s.yearHigh      ?? null,
    year_low:      s.yearLow       ?? null,
    logo_url:      s.logoUrl       || null,
    tag:           s.tag           || null,
    is_gainer: isGainer,
    rank,
    fetched_at: now,
  };
}

// ── Batch insert via UNNEST ───────────────────────────────────────────────────
async function batchInsert(client: PoolClient, rows: MarketMoverRow[], isGainer: number): Promise<void> {
  if (!rows.length) return;
  await client.query(
    `INSERT INTO market_movers
       (isin, gsin, company_name, company_short, search_id, nse_code, bse_code,
        ltp, prev_close, change, change_pct, market_cap, year_high, year_low,
        logo_url, tag, is_gainer, rank, fetched_at)
     SELECT * FROM UNNEST(
       $1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
       $6::varchar[], $7::varchar[], $8::numeric[], $9::numeric[], $10::numeric[],
       $11::numeric[], $12::numeric[], $13::numeric[], $14::numeric[],
       $15::text[], $16::varchar[], $17::int[], $18::int[], $19::timestamptz[]
     )`,
    [
      rows.map(r => r.isin),       rows.map(r => r.gsin),
      rows.map(r => r.company_name), rows.map(r => r.company_short),
      rows.map(r => r.search_id),  rows.map(r => r.nse_code),
      rows.map(r => r.bse_code),   rows.map(r => r.ltp),
      rows.map(r => r.prev_close), rows.map(r => r.change),
      rows.map(r => r.change_pct), rows.map(r => r.market_cap),
      rows.map(r => r.year_high),  rows.map(r => r.year_low),
      rows.map(r => r.logo_url),   rows.map(r => r.tag),
      rows.map(() => isGainer),    rows.map(r => r.rank),
      rows.map(r => r.fetched_at),
    ],
  );
}

// ── Main sync ─────────────────────────────────────────────────────────────────
export async function syncMarketMovers(): Promise<{ gainers: number; losers: number }> {
  const [gainersRaw, losersRaw] = await Promise.all([
    fetchGroww('TOP_GAINERS'),
    fetchGroww('TOP_LOSERS'),
  ]);

  const now       = new Date().toISOString();
  const gainerRows = gainersRaw.map((s, i) => toRow(s, i + 1, 1, now));
  const loserRows  = losersRaw.map((s, i)  => toRow(s, i + 1, 0, now));

  // ── 1. Write to Redis (fast, ~1ms reads) ───────────────────────────────────
  await Promise.all([
    redis.setex(RK_GAINERS, REDIS_TTL, JSON.stringify(gainerRows)),
    redis.setex(RK_LOSERS,  REDIS_TTL, JSON.stringify(loserRows)),
  ]).catch(e => console.error('[movers-sync] Redis write error:', e.message));

  // ── 2. Write to Postgres (durable backup) ──────────────────────────────────
  const pool   = getPool('live');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM market_movers WHERE is_gainer = 1');
    await batchInsert(client, gainerRows, 1);
    await client.query('DELETE FROM market_movers WHERE is_gainer = 0');
    await batchInsert(client, loserRows, 0);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  console.log(`[movers-sync] ${now.slice(11, 19)} — gainers:${gainersRaw.length} losers:${losersRaw.length}`);
  return { gainers: gainersRaw.length, losers: losersRaw.length };
}

// ── Read (Redis → Postgres fallback) ──────────────────────────────────────────
export async function getMarketMovers(isGainer: boolean, limit = 50): Promise<MarketMoverRow[]> {
  const key = isGainer ? RK_GAINERS : RK_LOSERS;

  // Fast path: Redis hit
  try {
    const cached = await redis.get(key);
    if (cached) {
      const rows = JSON.parse(cached) as MarketMoverRow[];
      return rows.slice(0, limit);
    }
  } catch { /* Redis down — fall through */ }

  // Slow path: PostgreSQL
  const { rows } = await getPool('live').query<Record<string, unknown>>(
    `SELECT * FROM market_movers WHERE is_gainer = $1 ORDER BY rank ASC LIMIT $2`,
    [isGainer ? 1 : 0, limit],
  );

  // Coerce PG numeric strings → JS numbers
  return rows.map(r => ({
    ...(r as unknown as MarketMoverRow),
    ltp:        Number(r.ltp),
    prev_close: Number(r.prev_close),
    change:     Number(r.change),
    change_pct: Number(r.change_pct),
    market_cap: r.market_cap != null ? Number(r.market_cap) : null,
    year_high:  r.year_high  != null ? Number(r.year_high)  : null,
    year_low:   r.year_low   != null ? Number(r.year_low)   : null,
    rank:       Number(r.rank),
  }));
}

// ── Market hours check (IST) ──────────────────────────────────────────────────
function isMarketOpen(): boolean {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();                          // 0 = Sun, 6 = Sat
  if (day === 0 || day === 6) return false;
  const h = ist.getHours(), m = ist.getMinutes();
  // 9:00 AM – 3:30 PM IST
  return (h > 9 || (h === 9 && m >= 0)) && (h < 15 || (h === 15 && m < 30));
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
// Guard against duplicate scheduling across Next.js hot-reloads in dev
declare global { var _moversSyncScheduled: boolean | undefined; }

export function scheduleMoversSync(): void {
  if (global._moversSyncScheduled) return;
  global._moversSyncScheduled = true;

  async function tick() {
    if (!isMarketOpen()) return;
    try {
      await syncMarketMovers();
    } catch (e) {
      console.error('[movers-sync] tick error:', e instanceof Error ? e.message : e);
    }
  }

  // Immediate first run, then every 60 seconds
  tick();
  setInterval(tick, 60_000);

  console.log('[movers-sync] Scheduler started — every 60s, 9:00–15:30 IST Mon–Fri');
}

// ── Staleness check (used by API) ─────────────────────────────────────────────
export async function isMoversStale(maxAgeMs = 90_000): Promise<boolean> {
  // If Redis has the key, data is fresh (TTL proves it)
  try {
    const ttl = await redis.ttl(RK_GAINERS);
    if (ttl > 0) return false;   // key exists → fresh
  } catch { /* Redis down */ }

  // Fall back to checking Postgres timestamp
  try {
    const { rows } = await getPool('live').query<{ fetched_at: Date }>(
      `SELECT fetched_at FROM market_movers ORDER BY fetched_at DESC LIMIT 1`,
    );
    if (!rows.length) return true;
    return Date.now() - new Date(rows[0].fetched_at).getTime() > maxAgeMs;
  } catch {
    return true;
  }
}
