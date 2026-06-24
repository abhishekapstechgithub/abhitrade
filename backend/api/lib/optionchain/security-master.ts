/**
 * Security Master in-memory cache.
 *
 * Hierarchy: underlying → expiry(YYYY-MM-DD) → strike → StrikePair
 *
 * Loaded from Postgres on first access; refreshed every REFRESH_MS.
 * Falls back to synthetic mock data in dev mode when Postgres has no option records.
 */

import { getPool } from '@/lib/db/client';
import {
  SMHierarchy,
  StrikePair,
  STRIKE_INTERVALS,
  MOCK_SPOT,
} from './types';

const REFRESH_MS = 60 * 60 * 1000; // 1 hour

// Module-level singleton (persists across Next.js hot-reloads via globalThis)
declare global {
  // eslint-disable-next-line no-var
  var __ocSmCache: {
    hierarchy: SMHierarchy;
    loadedAt: number;
    loading: Promise<void> | null;
  } | undefined;
}

function getCache() {
  if (!global.__ocSmCache) {
    global.__ocSmCache = {
      hierarchy: new Map(),
      loadedAt:  0,
      loading:   null,
    };
  }
  return global.__ocSmCache;
}

// ── ATM helper (needed for mock generation) ──────────────────────────────────

function roundToInterval(price: number, interval: number): number {
  return Math.round(price / interval) * interval;
}

// ── Mock Data Generator ───────────────────────────────────────────────────────

function generateExpiryDates(count: number): string[] {
  const dates: string[] = [];
  const now   = new Date();
  // Find next Thursday (Indian weekly expiry)
  const day   = now.getDay(); // 0=Sun ... 6=Sat
  let daysToThursday = (4 - day + 7) % 7;
  if (daysToThursday === 0) daysToThursday = 7;

  for (let i = 0; i < count; i++) {
    const d = new Date(now);
    if (i === 0) {
      d.setDate(now.getDate() + daysToThursday);
    } else if (i === 1) {
      d.setDate(now.getDate() + daysToThursday + 7);
    } else {
      // Monthly: last Thursday of next calendar months
      const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
      target.setMonth(target.getMonth() + 1, 0); // last day of month
      while (target.getDay() !== 4) target.setDate(target.getDate() - 1);
      dates.push(target.toISOString().split('T')[0]);
      continue;
    }
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates.sort();
}

let _mockTokenCounter = 100000;
function nextToken() { return ++_mockTokenCounter; }

function buildMockSymbol(
  underlying: string,
  expiry: string,       // YYYY-MM-DD
  strike: number,
  optType: 'CE' | 'PE',
): string {
  // e.g. NIFTY25JUN22500CE
  const d   = new Date(expiry);
  const day = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en', { month: 'short' }).toUpperCase();
  const yr  = String(d.getFullYear()).slice(2);
  return `${underlying}${yr}${mon}${day}${strike}${optType}`;
}

function populateMockHierarchy(hierarchy: SMHierarchy): void {
  const symbols = Object.keys(MOCK_SPOT);
  for (const sym of symbols) {
    const spot     = MOCK_SPOT[sym].ltp;
    const interval = STRIKE_INTERVALS[sym] ?? 50;
    const atm      = roundToInterval(spot, interval);
    const expiries = generateExpiryDates(4);
    const strikeMap = new Map<string, Map<number, StrikePair>>();

    for (const exp of expiries) {
      const strikePairs = new Map<number, StrikePair>();
      for (let i = -15; i <= 15; i++) {
        const strike  = atm + i * interval;
        if (strike <= 0) continue;
        const ceToken = nextToken();
        const peToken = nextToken();
        strikePairs.set(strike, {
          strike,
          ceToken,
          peToken,
          ceSymbol: buildMockSymbol(sym, exp, strike, 'CE'),
          peSymbol: buildMockSymbol(sym, exp, strike, 'PE'),
          lotSize:  getLotSize(sym),
          exchange: ['NIFTY','BANKNIFTY','FINNIFTY','MIDCPNIFTY','SENSEX','BANKEX'].includes(sym)
            ? 'NSE' : 'NSE',
        });
      }
      strikeMap.set(exp, strikePairs);
    }
    hierarchy.set(sym, strikeMap);
  }
}

function getLotSize(sym: string): number {
  const sizes: Record<string, number> = {
    NIFTY: 75, BANKNIFTY: 30, FINNIFTY: 65, MIDCPNIFTY: 120,
    SENSEX: 10, BANKEX: 15,
    RELIANCE: 250, TCS: 175, INFY: 300, HDFCBANK: 550, SBIN: 1500,
  };
  return sizes[sym] ?? 500;
}

// ── Postgres Loader — reads from angle_scrip (authoritative AngelOne scrip master) ──

async function loadFromPostgres(hierarchy: SMHierarchy): Promise<boolean> {
  try {
    const pool = getPool('live');
    const res  = await pool.query<{
      token: string; exchange: string; underlying: string;
      expiry: string; strike: string; option_type: string;
      trading_symbol: string; lot_size: number;
    }>(
      // angle_scrip is the AngelOne OpenAPI scrip master — 162k rows, refreshed on upload.
      // name = underlying clean symbol (e.g. "NIFTY", "HDFCBANK")
      // symbol = full trading symbol (e.g. "NIFTY26JUN2024500CE")
      // RIGHT(symbol,2) reliably gives "CE" or "PE" for all option contracts.
      // exch_seg IN ('NFO','BFO') covers NSE F&O and BSE F&O respectively.
      `SELECT
         token,
         CASE exch_seg WHEN 'NFO' THEN 'NSE' WHEN 'BFO' THEN 'BSE' ELSE exch_seg END AS exchange,
         name                              AS underlying,
         TO_CHAR(expiry, 'YYYY-MM-DD')    AS expiry,
         strike::text                     AS strike,
         RIGHT(symbol, 2)                 AS option_type,
         symbol                           AS trading_symbol,
         lotsize                          AS lot_size
       FROM   angle_scrip
       WHERE  instrumenttype IN ('OPTSTK','OPTIDX','OPTCUR','OPTFUT')
         AND  expiry   IS NOT NULL
         AND  expiry   >= CURRENT_DATE
         AND  strike   > 0
         AND  RIGHT(symbol, 2) IN ('CE','PE')
       ORDER  BY underlying, expiry, strike`,
    );

    if (res.rows.length === 0) return false;

    for (const row of res.rows) {
      const sym    = row.underlying.toUpperCase();
      const expiry = row.expiry.split('T')[0]; // ensure YYYY-MM-DD
      const strike = Number(row.strike);
      const token  = Number(row.token);

      if (!hierarchy.has(sym))  hierarchy.set(sym, new Map());
      const exMap = hierarchy.get(sym)!;
      if (!exMap.has(expiry))   exMap.set(expiry, new Map());
      const stMap = exMap.get(expiry)!;
      if (!stMap.has(strike)) {
        stMap.set(strike, {
          strike,
          ceToken:  0,
          peToken:  0,
          ceSymbol: '',
          peSymbol: '',
          lotSize:  row.lot_size ?? 1,
          exchange: row.exchange,
        });
      }

      const pair = stMap.get(strike)!;
      if (row.option_type === 'CE') {
        pair.ceToken  = token;
        pair.ceSymbol = row.trading_symbol;
      } else {
        pair.peToken  = token;
        pair.peSymbol = row.trading_symbol;
      }
    }

    console.info(`[OptionChain][SM] Loaded ${res.rows.length} option contracts from angle_scrip`);
    return true;
  } catch (err) {
    console.error('[OptionChain][SM] angle_scrip load failed:', (err as Error).message);
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

async function ensureLoaded(): Promise<void> {
  const cache = getCache();
  const now   = Date.now();

  if (cache.hierarchy.size > 0 && now - cache.loadedAt < REFRESH_MS) return;
  if (cache.loading) return cache.loading;

  cache.loading = (async () => {
    const fresh: SMHierarchy = new Map();
    const fromPg = await loadFromPostgres(fresh);
    if (!fromPg) {
      console.info('[OptionChain][SM] No PG data — using mock security master');
      populateMockHierarchy(fresh);
    }
    cache.hierarchy = fresh;
    cache.loadedAt  = Date.now();
    cache.loading   = null;
    console.info(
      `[OptionChain][SM] Loaded ${cache.hierarchy.size} underlyings` +
      (fromPg ? ' from Postgres' : ' (mock)'),
    );
  })();

  return cache.loading;
}

export async function getHierarchy(): Promise<SMHierarchy> {
  await ensureLoaded();
  return getCache().hierarchy;
}

export async function getExpiries(symbol: string, exchange?: string): Promise<string[]> {
  const sym = symbol.toUpperCase();

  // Always query the DB directly so expiry dates are never computed/generated.
  // angle_scrip is the source of truth — refreshed on every scrip master upload.
  try {
    const pool = getPool('live');

    // Determine which segments to include based on exchange hint
    // NSE = NSE cash + NFO (F&O);  BSE = BSE cash + BFO (F&O)
    const exchFilter = exchange
      ? (exchange.toUpperCase() === 'BSE' ? ['BSE', 'BFO'] : ['NSE', 'NFO'])
      : ['NSE', 'NFO', 'BSE', 'BFO'];   // all if not specified

    const res = await pool.query<{ expiry: string }>(
      `SELECT DISTINCT TO_CHAR(expiry, 'YYYY-MM-DD') AS expiry
       FROM   angle_scrip
       WHERE  name = $1
         AND  exch_seg = ANY($2::text[])
         AND  instrumenttype IN ('OPTSTK','OPTIDX','OPTCUR','OPTFUT')
         AND  expiry IS NOT NULL
         AND  expiry >= CURRENT_DATE
       ORDER  BY expiry`,
      [sym, exchFilter],
    );

    if (res.rows.length > 0) {
      return res.rows.map(r => r.expiry);
    }
  } catch (err) {
    console.warn('[OptionChain][SM] getExpiries DB failed, falling back to cache:', (err as Error).message);
  }

  // Fallback: in-memory hierarchy (loaded from angle_scrip, refreshed hourly)
  const h = await getHierarchy();
  if (!h.has(sym)) return [];
  return Array.from(h.get(sym)!.keys()).sort();
}

export async function getStrikes(
  symbol: string,
  expiry: string,
): Promise<Map<number, StrikePair> | null> {
  const h   = await getHierarchy();
  const sym = symbol.toUpperCase();
  return h.get(sym)?.get(expiry) ?? null;
}

export async function listUnderlyings(): Promise<string[]> {
  const h = await getHierarchy();
  return Array.from(h.keys()).sort();
}

/** Force refresh — call after a security master import */
export function invalidateCache(): void {
  const cache = getCache();
  cache.loadedAt = 0;
}
