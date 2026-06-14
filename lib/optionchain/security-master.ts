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

// ── Postgres Loader ───────────────────────────────────────────────────────────

async function loadFromPostgres(hierarchy: SMHierarchy): Promise<boolean> {
  try {
    const pool = getPool('live');
    const res  = await pool.query<{
      token: string; exchange: string; underlying: string;
      expiry: string; strike: number; option_type: string;
      trading_symbol: string; lot_size: number;
    }>(
      `SELECT token, exchange, underlying, expiry::text, strike,
              option_type, trading_symbol, lot_size
       FROM   security_master
       WHERE  instrument_type IN ('OPTIDX','OPTSTK')
         AND  is_active = TRUE
         AND  underlying IS NOT NULL
         AND  expiry IS NOT NULL
         AND  strike IS NOT NULL
         AND  option_type IN ('CE','PE')
       ORDER  BY underlying, expiry, strike`,
    );

    if (res.rows.length === 0) return false;

    for (const row of res.rows) {
      const sym    = row.underlying.toUpperCase();
      const expiry = row.expiry.split('T')[0]; // normalize to YYYY-MM-DD
      const strike = Number(row.strike);
      const token  = Number(row.token);

      if (!hierarchy.has(sym))         hierarchy.set(sym, new Map());
      const exMap = hierarchy.get(sym)!;
      if (!exMap.has(expiry))           exMap.set(expiry, new Map());
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

    return true;
  } catch (err) {
    console.error('[OptionChain][SM] Postgres load failed:', (err as Error).message);
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

export async function getExpiries(symbol: string): Promise<string[]> {
  const h   = await getHierarchy();
  const sym = symbol.toUpperCase();
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
