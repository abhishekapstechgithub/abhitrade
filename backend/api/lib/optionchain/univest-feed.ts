/**
 * Univest OptChainGeeks feed — fetches live option LTPs/OI/Greeks for all
 * major Indian indices and injects them into Redis so buildOptionChain()
 * serves real market data instead of mock values.
 *
 * Supported symbols and their Univest UnderlyingSId:
 *   NIFTY:     13   (NSE)
 *   BANKNIFTY: 25   (NSE)
 *   FINNIFTY:  27   (NSE)
 *   SENSEX:    51   (BSE)
 *   BANKEX:    69   (BSE)
 */

import { getStrikes } from './security-master.js';
import { pushTicks, setSpot, type RawTick } from './market-data.js';

// ── Symbol → Univest identifier ───────────────────────────────────────────────

const UNDERLYING_SID: Record<string, number> = {
  NIFTY:     13,
  BANKNIFTY: 25,
  FINNIFTY:  27,
  SENSEX:    51,
  BANKEX:    69,
};

/** Returns the UnderlyingSId for the given symbol, or null if unsupported. */
export function getUnivestSid(symbol: string): number | null {
  return UNDERLYING_SID[symbol.toUpperCase()] ?? null;
}

// ── Date conversion ───────────────────────────────────────────────────────────

/**
 * Convert YYYY-MM-DD → Univest Exp timestamp.
 * Verified: 2026-06-30 → 1467225000, 2026-06-24 → 1466793000 (BSE).
 * Formula: midnight IST of the same date 10 years earlier.
 */
export function toUnivestExp(yyyymmdd: string): number {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return Math.floor(Date.UTC(y - 10, m - 1, d) / 1000) - 19800; // -19800 = -5.5h IST offset
}

// ── Fetch headers ─────────────────────────────────────────────────────────────

const HEADERS = {
  'Content-Type':    'application/json',
  'Accept':          'application/json, text/plain, */*',
  'Origin':          'https://www.univest.in',
  'Referer':         'https://www.univest.in/',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Response parsing ──────────────────────────────────────────────────────────

interface ParsedOptSide {
  ltp:       number;
  oi?:       number;
  changeOi?: number;
  volume?:   number;
  iv?:       number;
  delta?:    number;
  gamma?:    number;
  theta?:    number;
  vega?:     number;
}

interface ParsedRow {
  strike: number;
  ce?:    ParsedOptSide;
  pe?:    ParsedOptSide;
}

function n(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') { const x = parseFloat(v); return isFinite(x) ? x : 0; }
  return 0;
}

function parseSide(o: unknown): ParsedOptSide | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const s = o as Record<string, unknown>;

  const ltp = n(s['LTP'] ?? s['ltp'] ?? s['Ltp']);
  if (ltp <= 0) return undefined; // no live data for this side

  // Volume: prefer explicit "Vol" over "V" (which may be Vega in some formats)
  const hasVol = ('Vol' in s || 'Volume' in s);
  return {
    ltp,
    oi:       n(s['OI']  ?? s['Oi']  ?? s['oi']),
    changeOi: n(s['DOI'] ?? s['COI'] ?? s['ChangeOI'] ?? s['OIChg']),
    volume:   n(hasVol ? (s['Vol'] ?? s['Volume']) : 0),
    iv:       n(s['IV']  ?? s['Iv']  ?? s['iv']),
    delta:    n(s['D']   ?? s['Delta']),
    gamma:    n(s['G']   ?? s['Gamma']),
    theta:    n(s['T']   ?? s['Theta']),
    // Vega: prefer VG or Vega; use V only if no dedicated Vol key
    vega:     n(s['VG']  ?? s['Vega'] ?? (hasVol ? undefined : s['V'])),
  };
}

function parseResponse(data: unknown): { rows: ParsedRow[]; spot?: number } {
  let spot: number | undefined;
  let arr: unknown[] = [];

  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    // Possible spot price fields in Univest response
    const rawSpot = n(d['ULP'] ?? d['Spot'] ?? d['UnderlyingPrice'] ?? d['spot'] ?? d['UPrice']);
    if (rawSpot > 0) spot = rawSpot;
    // Possible array wrapper field names
    const child = d['OC'] ?? d['ocData'] ?? d['data'] ?? d['Data'] ?? d['rows'];
    if (Array.isArray(child)) arr = child;
  }

  const rows: ParsedRow[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const strike = n(r['SP'] ?? r['Strike'] ?? r['StrikePrice'] ?? r['strike']);
    if (strike <= 0) continue;

    const ce = parseSide(r['CE'] ?? r['ce'] ?? r['call']);
    const pe = parseSide(r['PE'] ?? r['pe'] ?? r['put']);
    if (!ce && !pe) continue;

    rows.push({ strike, ce, pe });
  }
  return { rows, spot };
}

// ── Sync throttle (avoid hammering Univest) ───────────────────────────────────

// Minimum ms between successive syncs for the same symbol+expiry key
const SYNC_COOLDOWN_MS = 20_000;
const lastSync = new Map<string, number>();

function isCoolingDown(key: string): boolean {
  const last = lastSync.get(key) ?? 0;
  return Date.now() - last < SYNC_COOLDOWN_MS;
}

function markSynced(key: string) {
  lastSync.set(key, Date.now());
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface SyncResult {
  written: number;
  spot?:   number;
  source:  'univest' | 'unsupported' | 'no-sm' | 'error' | 'empty' | 'cooldown';
}

/**
 * Fetch live option data from Univest and push LTPs/OI/Greeks into Redis.
 *
 * Thread-safe: concurrent calls for the same symbol+expiry are throttled
 * (20s cooldown) so Univest is not hammered on every SSE tick.
 *
 * @returns written — number of option ticks pushed into Redis
 */
export async function syncUnivestToRedis(
  symbol: string,
  expiry: string,
): Promise<SyncResult> {
  const sym = symbol.toUpperCase();
  const sid = getUnivestSid(sym);
  if (!sid) return { written: 0, source: 'unsupported' };

  const key = `${sym}:${expiry}`;
  if (isCoolingDown(key)) return { written: 0, source: 'cooldown' };
  markSynced(key); // mark early to prevent concurrent fetches

  const exp = toUnivestExp(expiry);

  // ── Fetch from Univest ─────────────────────────────────────────────────────
  let raw: { code: number; remarks: string; data: unknown };
  try {
    const res = await fetch('https://livepub.univest.in/DataPub/api/SData/OptChainGeeks', {
      method:  'POST',
      headers: HEADERS,
      body:    JSON.stringify({ Data: { UnderlyingSId: sid, Exch: 1, Exp: exp, Count: 1, Seg: '0' } }),
      signal:  AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn(`[UnivestFeed] HTTP ${res.status} for ${sym} exp=${expiry}`);
      return { written: 0, source: 'error' };
    }
    raw = await res.json() as typeof raw;
  } catch (err) {
    console.warn(`[UnivestFeed] fetch failed for ${sym}:`, (err as Error).message);
    return { written: 0, source: 'error' };
  }

  if (!raw || raw.code !== 1) {
    console.warn(`[UnivestFeed] unexpected response for ${sym}: code=${raw?.code} remarks=${raw?.remarks}`);
    return { written: 0, source: 'error' };
  }

  // ── Parse response ─────────────────────────────────────────────────────────
  const { rows, spot } = parseResponse(raw.data);
  if (!rows.length) {
    console.warn(`[UnivestFeed] empty rows for ${sym} ${expiry}`);
    return { written: 0, spot, source: 'empty' };
  }

  // Update spot price in Redis if returned
  if (spot && spot > 0) {
    await setSpot(sym, { ltp: spot, change: 0, changePct: 0 });
  }

  // ── Match strikes to AngelOne tokens ───────────────────────────────────────
  const strikePairs = await getStrikes(sym, expiry);
  if (!strikePairs || strikePairs.size === 0) {
    console.warn(`[UnivestFeed] no security master entries for ${sym} ${expiry}`);
    return { written: 0, spot, source: 'no-sm' };
  }

  const ticks: RawTick[] = [];
  for (const row of rows) {
    const pair = strikePairs.get(row.strike);
    if (!pair) continue;

    if (row.ce && pair.ceToken) {
      ticks.push({
        token:    pair.ceToken,
        ltp:      row.ce.ltp,
        oi:       row.ce.oi,
        changeOi: row.ce.changeOi,
        volume:   row.ce.volume,
        iv:       row.ce.iv,
        delta:    row.ce.delta,
        gamma:    row.ce.gamma,
        theta:    row.ce.theta,
        vega:     row.ce.vega,
      });
    }

    if (row.pe && pair.peToken) {
      ticks.push({
        token:    pair.peToken,
        ltp:      row.pe.ltp,
        oi:       row.pe.oi,
        changeOi: row.pe.changeOi,
        volume:   row.pe.volume,
        iv:       row.pe.iv,
        delta:    row.pe.delta,
        gamma:    row.pe.gamma,
        theta:    row.pe.theta,
        vega:     row.pe.vega,
      });
    }
  }

  if (!ticks.length) return { written: 0, spot, source: 'no-sm' };

  await pushTicks(ticks);
  console.info(`[UnivestFeed] ${sym} ${expiry}: wrote ${ticks.length} ticks, spot=${spot}`);
  return { written: ticks.length, spot, source: 'univest' };
}
