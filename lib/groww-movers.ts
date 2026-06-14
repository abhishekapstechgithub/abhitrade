/**
 * Groww Top Movers — fetch, cache, and persist all mover types.
 *
 * mover_type (stored as `is_gainer` INTEGER in DB):
 *   0 = losers
 *   1 = gainers
 *   2 = volume_shockers
 *   3 = top_by_volume
 *   4 = 52w_high
 *   5 = 52w_low
 *
 * Storage:
 *   Redis  → fast read (<1ms). JSON arrays at tk:movers:{type}. TTL 90s.
 *   Postgres → durable backup. market_movers table, keyed by is_gainer value.
 *
 * scheduleMoversSync():
 *   Called once from instrumentation.ts on server startup.
 *   Syncs every 60 s during market hours: 9:00–15:30 IST, Mon–Fri.
 */

import type { PoolClient } from 'pg';
import { getPool } from './db/client';
import { redis } from './redis-client';

// ── Mover type enum ───────────────────────────────────────────────────────────

export const MOVER_TYPE = {
  LOSERS:          0,
  GAINERS:         1,
  VOLUME_SHOCKERS: 2,
  TOP_BY_VOLUME:   3,
  HIGH_52W:        4,
  LOW_52W:         5,
} as const;

export type MoverTypeCode = typeof MOVER_TYPE[keyof typeof MOVER_TYPE];
export type MoverTypeKey  =
  | 'gainers' | 'losers'
  | 'volume_shockers' | 'top_by_volume'
  | '52w_high' | '52w_low';

/** Map API query string → DB integer */
export const MOVER_KEY_TO_CODE: Record<MoverTypeKey, MoverTypeCode> = {
  gainers:         MOVER_TYPE.GAINERS,
  losers:          MOVER_TYPE.LOSERS,
  volume_shockers: MOVER_TYPE.VOLUME_SHOCKERS,
  top_by_volume:   MOVER_TYPE.TOP_BY_VOLUME,
  '52w_high':      MOVER_TYPE.HIGH_52W,
  '52w_low':       MOVER_TYPE.LOW_52W,
};

/** Map DB integer → Groww moverType param */
const CODE_TO_GROWW: Record<MoverTypeCode, string> = {
  [MOVER_TYPE.GAINERS]:         'TOP_GAINERS',
  [MOVER_TYPE.LOSERS]:          'TOP_LOSERS',
  [MOVER_TYPE.VOLUME_SHOCKERS]: 'VOLUME_SHOCKERS',
  [MOVER_TYPE.TOP_BY_VOLUME]:   'TRADED_BY_VOLUME',
  [MOVER_TYPE.HIGH_52W]:        'YEARLY_HIGH',
  [MOVER_TYPE.LOW_52W]:         'YEARLY_LOW',
};

/** Map DB integer → Redis key suffix */
const CODE_TO_RK: Record<MoverTypeCode, string> = {
  [MOVER_TYPE.GAINERS]:         'tk:movers:gainers',
  [MOVER_TYPE.LOSERS]:          'tk:movers:losers',
  [MOVER_TYPE.VOLUME_SHOCKERS]: 'tk:movers:volume_shockers',
  [MOVER_TYPE.TOP_BY_VOLUME]:   'tk:movers:top_by_volume',
  [MOVER_TYPE.HIGH_52W]:        'tk:movers:52w_high',
  [MOVER_TYPE.LOW_52W]:         'tk:movers:52w_low',
};

const ALL_CODES = Object.values(MOVER_TYPE) as MoverTypeCode[];
const REDIS_TTL = 90; // seconds

// ── Groww API ─────────────────────────────────────────────────────────────────

const GROWW_URL = 'https://groww.in/bff/web/stocks/explore/web-pages/top_movers';
const REQ_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept':     'application/json',
  'Referer':    'https://groww.in/',
};

interface GrowwStock {
  isin: string; gsin: string;
  companyName: string; companyShortName: string; searchId: string;
  ltp: number; logoUrl: string;
  nseScriptCode: string; bseScriptCode: string;
  marketCap: number; close: number;   // close = previous close
  yearHigh: number; yearLow: number;
  volume?: number;
  tag: string;
}

async function fetchGroww(moverType: string): Promise<GrowwStock[]> {
  const url = `${GROWW_URL}?indice=GIDXNIFTYTOTALMCAP&moverType=${moverType}&pageSize=50`;
  const res = await fetch(url, { headers: REQ_HEADERS, cache: 'no-store' });
  if (!res.ok) throw new Error(`Groww ${moverType} HTTP ${res.status}`);
  const json = await res.json() as { data?: { stocks?: GrowwStock[] } };
  return json?.data?.stocks ?? [];
}

// ── Public data shape ─────────────────────────────────────────────────────────

export interface MarketMoverRow {
  id?: number;
  isin:          string | null;
  gsin:          string | null;
  company_name:  string;
  company_short: string | null;
  search_id:     string | null;
  nse_code:      string | null;
  bse_code:      string | null;
  ltp:           number;
  prev_close:    number;
  change:        number;
  change_pct:    number;
  market_cap:    number | null;
  year_high:     number | null;
  year_low:      number | null;
  volume:        number | null;
  logo_url:      string | null;
  tag:           string | null;
  /** 0=losers 1=gainers 2=volume_shockers 3=top_by_volume 4=52w_high 5=52w_low */
  is_gainer:     number;
  rank:          number;
  fetched_at:    string;
}

function toRow(
  s: GrowwStock,
  rank: number,
  typeCode: MoverTypeCode,
  now: string,
): MarketMoverRow {
  const change     = +(s.ltp - s.close).toFixed(4);
  const change_pct = s.close > 0 ? +((s.ltp - s.close) / s.close * 100).toFixed(4) : 0;

  // VOLUME_SHOCKERS sometimes lacks nseScriptCode/bseScriptCode; extract from gsin (GSTK{bseCode})
  const bseFallback = (!s.bseScriptCode && s.gsin?.startsWith('GSTK'))
    ? s.gsin.slice(4)
    : null;

  return {
    isin:          s.isin                          || null,
    gsin:          s.gsin                          || null,
    company_name:  s.companyName                   || s.gsin || '',
    company_short: s.companyShortName              || null,
    search_id:     s.searchId                      || null,
    nse_code:      s.nseScriptCode                 || null,
    bse_code:      s.bseScriptCode || bseFallback  || null,
    ltp:           s.ltp,
    prev_close:    s.close,
    change,
    change_pct,
    market_cap:    s.marketCap  ?? null,
    year_high:     s.yearHigh   ?? null,
    year_low:      s.yearLow    ?? null,
    volume:        s.volume     ?? null,
    logo_url:      s.logoUrl    || null,
    tag:           s.tag        || null,
    is_gainer:     typeCode,
    rank,
    fetched_at:    now,
  };
}

// ── Batch insert via UNNEST ───────────────────────────────────────────────────

async function batchInsert(
  client: PoolClient,
  rows: MarketMoverRow[],
  typeCode: MoverTypeCode,
): Promise<void> {
  if (!rows.length) return;
  await client.query(
    `INSERT INTO market_movers
       (isin, gsin, company_name, company_short, search_id, nse_code, bse_code,
        ltp, prev_close, change, change_pct, market_cap, year_high, year_low,
        volume, logo_url, tag, is_gainer, rank, fetched_at)
     SELECT * FROM UNNEST(
       $1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[], $5::varchar[],
       $6::varchar[], $7::varchar[], $8::numeric[], $9::numeric[], $10::numeric[],
       $11::numeric[], $12::numeric[], $13::numeric[], $14::numeric[],
       $15::numeric[], $16::text[], $17::varchar[], $18::int[], $19::int[], $20::timestamptz[]
     )`,
    [
      rows.map(r => r.isin),         rows.map(r => r.gsin),
      rows.map(r => r.company_name), rows.map(r => r.company_short),
      rows.map(r => r.search_id),    rows.map(r => r.nse_code),
      rows.map(r => r.bse_code),     rows.map(r => r.ltp),
      rows.map(r => r.prev_close),   rows.map(r => r.change),
      rows.map(r => r.change_pct),   rows.map(r => r.market_cap),
      rows.map(r => r.year_high),    rows.map(r => r.year_low),
      rows.map(r => r.volume),       rows.map(r => r.logo_url),
      rows.map(r => r.tag),          rows.map(() => typeCode),
      rows.map(r => r.rank),         rows.map(r => r.fetched_at),
    ],
  );
}

// ── Main sync ─────────────────────────────────────────────────────────────────

export async function syncMarketMovers(): Promise<Record<MoverTypeKey, number>> {
  const now = new Date().toISOString();

  // Fetch all 6 types in parallel
  const results = await Promise.allSettled(
    ALL_CODES.map(code => fetchGroww(CODE_TO_GROWW[code])),
  );

  const rowsByCode: Partial<Record<MoverTypeCode, MarketMoverRow[]>> = {};
  ALL_CODES.forEach((code, idx) => {
    const r = results[idx];
    if (r.status === 'fulfilled') {
      rowsByCode[code] = r.value.map((s, i) => toRow(s, i + 1, code, now));
    } else {
      console.error(`[movers-sync] ${CODE_TO_GROWW[code]} failed:`, r.reason?.message);
      rowsByCode[code] = [];
    }
  });

  // ── 1. Write to Redis ───────────────────────────────────────────────────────
  await Promise.allSettled(
    ALL_CODES.map(code => {
      const rows = rowsByCode[code] ?? [];
      return rows.length
        ? redis.setex(CODE_TO_RK[code], REDIS_TTL, JSON.stringify(rows))
        : Promise.resolve();
    }),
  );

  // ── 2. Write to Postgres ────────────────────────────────────────────────────
  const pool   = getPool('live');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const code of ALL_CODES) {
      await client.query('DELETE FROM market_movers WHERE is_gainer = $1', [code]);
      await batchInsert(client, rowsByCode[code] ?? [], code);
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  const counts = Object.fromEntries(
    ALL_CODES.map(code => {
      const key = Object.entries(MOVER_KEY_TO_CODE).find(([, v]) => v === code)?.[0] ?? String(code);
      return [key, rowsByCode[code]?.length ?? 0];
    }),
  ) as Record<MoverTypeKey, number>;

  console.log(
    `[movers-sync] ${now.slice(11, 19)} —`,
    Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' '),
  );
  return counts;
}

// ── Partial sync — refresh only specific types ────────────────────────────────

export async function syncMoverType(typeKey: MoverTypeKey): Promise<number> {
  const code    = MOVER_KEY_TO_CODE[typeKey];
  const growwId = CODE_TO_GROWW[code];
  const now     = new Date().toISOString();

  const stocks = await fetchGroww(growwId);
  const rows   = stocks.map((s, i) => toRow(s, i + 1, code, now));

  await redis.setex(CODE_TO_RK[code], REDIS_TTL, JSON.stringify(rows)).catch(() => {});

  const pool   = getPool('live');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM market_movers WHERE is_gainer = $1', [code]);
    await batchInsert(client, rows, code);
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  return rows.length;
}

// ── Read (Redis → Postgres fallback) ──────────────────────────────────────────

export async function getMarketMovers(
  typeCode: MoverTypeCode,
  limit = 50,
): Promise<MarketMoverRow[]> {
  const rk = CODE_TO_RK[typeCode];

  // Fast path: Redis
  try {
    const cached = await redis.get(rk);
    if (cached) {
      const rows = JSON.parse(cached) as MarketMoverRow[];
      return rows.slice(0, limit);
    }
  } catch { /* Redis down — fall through */ }

  // Slow path: Postgres
  const { rows } = await getPool('live').query<Record<string, unknown>>(
    `SELECT * FROM market_movers WHERE is_gainer = $1 ORDER BY rank ASC LIMIT $2`,
    [typeCode, limit],
  );

  return rows.map(r => ({
    ...(r as unknown as MarketMoverRow),
    ltp:        Number(r.ltp),
    prev_close: Number(r.prev_close),
    change:     Number(r.change),
    change_pct: Number(r.change_pct),
    market_cap: r.market_cap != null ? Number(r.market_cap) : null,
    year_high:  r.year_high  != null ? Number(r.year_high)  : null,
    year_low:   r.year_low   != null ? Number(r.year_low)   : null,
    volume:     r.volume     != null ? Number(r.volume)     : null,
    rank:       Number(r.rank),
  }));
}

// ── Market hours check (IST) ──────────────────────────────────────────────────

function isMarketOpen(): boolean {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false;
  const h = ist.getHours(), m = ist.getMinutes();
  return (h > 9 || (h === 9 && m >= 0)) && (h < 15 || (h === 15 && m < 30));
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

declare global { var _moversSyncScheduled: boolean | undefined; }

export function scheduleMoversSync(): void {
  if (global._moversSyncScheduled) return;
  global._moversSyncScheduled = true;

  async function tick() {
    if (!isMarketOpen()) return;
    try { await syncMarketMovers(); }
    catch (e) { console.error('[movers-sync] tick error:', e instanceof Error ? e.message : e); }
  }

  tick();
  setInterval(tick, 60_000);
  console.log('[movers-sync] Scheduler started — every 60s, 9:00–15:30 IST Mon–Fri');
}

// ── Staleness check ───────────────────────────────────────────────────────────

export async function isMoversStale(maxAgeMs = 90_000): Promise<boolean> {
  try {
    const ttl = await redis.ttl(CODE_TO_RK[MOVER_TYPE.GAINERS]);
    if (ttl > 0) return false;
  } catch { /* Redis down */ }

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
