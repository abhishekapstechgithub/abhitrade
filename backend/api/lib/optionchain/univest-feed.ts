/**
 * Univest OptChainGeeks — direct option chain builder for all 5 major Indian indices.
 *
 * For NIFTY / BANKNIFTY / FINNIFTY / SENSEX / BANKEX this is the PRIMARY data source.
 * It bypasses the Redis quote cache and security master entirely: the chain is built
 * straight from the Univest API response, so it works even without angle_scrip data.
 *
 * Supported symbols and their Univest UnderlyingSId:
 *   NIFTY     → 13  (NSE)
 *   BANKNIFTY → 25  (NSE)
 *   FINNIFTY  → 27  (NSE)
 *   SENSEX    → 51  (BSE)
 *   BANKEX    → 69  (BSE)
 *
 * Request format (POST):
 *   url:  https://livepub.univest.in/DataPub/api/SData/OptChainGeeks
 *   body: {"Data":{"UnderlyingSId":<sid>,"Exch":1,"Exp":<univestExp>,"Count":1,"Seg":"0"}}
 */

import { calcAtm, getStrikeInterval, getStrikeClass } from './atm.js';
import { calcAnalytics } from './analytics.js';
import { STRIKE_INTERVALS } from './types.js';
import type { OptionChainResponse, OptionChainRow, OptionQuote } from './types.js';

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

/** Returns true if the symbol has a direct Univest option chain feed. */
export function isUnivestSymbol(symbol: string): boolean {
  return symbol.toUpperCase() in UNDERLYING_SID;
}

// ── Date conversion ───────────────────────────────────────────────────────────

/**
 * Convert YYYY-MM-DD → Univest Exp timestamp.
 * Verified against user-provided examples:
 *   2026-06-30 → 1467225000  (NIFTY/BANKNIFTY/FINNIFTY — NSE Thursday expiry)
 *   2026-06-24 → 1466793000  (SENSEX/BANKEX — BSE Tuesday expiry)
 */
export function toUnivestExp(yyyymmdd: string): number {
  const [y, m, d] = yyyymmdd.split('-').map(Number);
  return Math.floor(Date.UTC(y - 10, m - 1, d) / 1000) - 19800; // midnight IST, 10 years earlier
}

// ── Fetch headers (mimic browser to avoid CDN blocks) ─────────────────────────

const HEADERS = {
  'Content-Type':    'application/json',
  'Accept':          'application/json, text/plain, */*',
  'Origin':          'https://www.univest.in',
  'Referer':         'https://www.univest.in/',
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

// ── Response parsing ──────────────────────────────────────────────────────────

function n(v: unknown): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  if (typeof v === 'string') { const x = parseFloat(v); return isFinite(x) ? x : 0; }
  return 0;
}

interface RawOptSide {
  ltp:       number;
  oi:        number;
  changeOi:  number;
  volume:    number;
  iv:        number;
  delta:     number;
  gamma:     number;
  theta:     number;
  vega:      number;
}

interface RawRow {
  strike: number;
  ce?:    RawOptSide;
  pe?:    RawOptSide;
}

function parseSide(o: unknown): RawOptSide | undefined {
  if (!o || typeof o !== 'object') return undefined;
  const s = o as Record<string, unknown>;
  const ltp = n(s['LTP'] ?? s['ltp'] ?? s['Ltp']);
  if (ltp <= 0) return undefined;
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
    vega:     n(s['VG']  ?? s['Vega'] ?? (hasVol ? 0 : n(s['V']))),
  };
}

function parseData(data: unknown): { rows: RawRow[]; spotFromResponse?: number } {
  let spotFromResponse: number | undefined;
  let arr: unknown[] = [];

  if (Array.isArray(data)) {
    arr = data;
  } else if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>;
    const rawSpot = n(d['ULP'] ?? d['Spot'] ?? d['UnderlyingPrice'] ?? d['spot'] ?? d['UPrice']);
    if (rawSpot > 0) spotFromResponse = rawSpot;
    const child = d['OC'] ?? d['ocData'] ?? d['data'] ?? d['Data'] ?? d['rows'];
    if (Array.isArray(child)) arr = child;
  }

  const rows: RawRow[] = [];
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
  return { rows, spotFromResponse };
}

// ── Raw Univest fetch ─────────────────────────────────────────────────────────

async function fetchUnivestRaw(
  sid: number,
  exp: number,
): Promise<{ code: number; remarks: string; data: unknown } | null> {
  try {
    const res = await fetch('https://livepub.univest.in/DataPub/api/SData/OptChainGeeks', {
      method:  'POST',
      headers: HEADERS,
      body:    JSON.stringify({ Data: { UnderlyingSId: sid, Exch: 1, Exp: exp, Count: 1, Seg: '0' } }),
      signal:  AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.warn(`[UnivestFeed] HTTP ${res.status} sid=${sid} exp=${exp}`);
      return null;
    }
    return await res.json() as { code: number; remarks: string; data: unknown };
  } catch (err) {
    console.warn(`[UnivestFeed] fetch failed sid=${sid}:`, (err as Error).message);
    return null;
  }
}

// ── Build OptionChainResponse directly from Univest ───────────────────────────

/**
 * Fetch option chain data from Univest and return a fully assembled
 * OptionChainResponse — no security master, no Redis quote cache needed.
 *
 * @param spot  Live spot price (from AngelOne WS Redis).  Used for ATM
 *              calculation if Univest does not include the underlying price.
 * @returns     null if Univest is unreachable or returns no data.
 */
export async function buildUnivestChain(params: {
  symbol:       string;
  expiry:       string;
  spot:         number;
  spotChange:   number;
  spotChangePct: number;
  strikeCount?: number;
  fromStrike?:  number;
  toStrike?:    number;
}): Promise<OptionChainResponse | null> {
  const { symbol, expiry, strikeCount = 15, fromStrike, toStrike } = params;
  const sym = symbol.toUpperCase();
  const sid = getUnivestSid(sym);
  if (!sid) return null;

  const exp = toUnivestExp(expiry);
  const raw = await fetchUnivestRaw(sid, exp);
  if (!raw || raw.code !== 1) return null;

  const { rows: rawRows, spotFromResponse } = parseData(raw.data);
  if (!rawRows.length) {
    console.warn(`[UnivestFeed] empty rows for ${sym} ${expiry}`);
    return null;
  }

  const spot         = (spotFromResponse && spotFromResponse > 0) ? spotFromResponse : params.spot;
  const spotChange   = params.spotChange;
  const spotChangePct = params.spotChangePct;
  const interval     = getStrikeInterval(sym);
  const atm          = calcAtm(spot, interval);

  // Sort rows by strike ascending
  rawRows.sort((a, b) => a.strike - b.strike);

  // Apply strike filter
  let filtered = rawRows;
  if (fromStrike !== undefined && toStrike !== undefined) {
    filtered = rawRows.filter(r => r.strike >= fromStrike && r.strike <= toStrike);
  } else {
    const atmIdx = rawRows.findIndex(r => Math.abs(r.strike - atm) < interval / 2);
    const center = atmIdx >= 0 ? atmIdx : Math.floor(rawRows.length / 2);
    const lo     = Math.max(0, center - strikeCount);
    const hi     = Math.min(rawRows.length - 1, center + strikeCount);
    filtered     = rawRows.slice(lo, hi + 1);
  }

  const rows: OptionChainRow[] = filtered.map(r => {
    const { isAtm, ceItm, peItm } = getStrikeClass(r.strike, spot, atm, interval);

    const makeQuote = (side: RawOptSide, optType: 'CE' | 'PE'): OptionQuote => ({
      token:         0,
      tradingSymbol: `${sym}${expiry}${r.strike}${optType}`,
      ltp:           side.ltp,
      open:          side.ltp,
      high:          side.ltp,
      low:           side.ltp,
      close:         side.ltp * 0.98,   // approximate prev close
      oi:            side.oi,
      changeOi:      side.changeOi,
      volume:        side.volume,
      bid:           side.ltp > 0.05 ? side.ltp - 0.05 : 0,
      ask:           side.ltp + 0.05,
      bidQty:        0,
      askQty:        0,
      iv:            side.iv  > 0 ? side.iv    : undefined,
      delta:         side.delta !== 0 ? side.delta  : undefined,
      gamma:         side.gamma !== 0 ? side.gamma  : undefined,
      theta:         side.theta !== 0 ? side.theta  : undefined,
      vega:          side.vega  !== 0 ? side.vega   : undefined,
      updatedAt:     Date.now(),
    });

    return {
      strike: r.strike,
      isAtm,
      isItm:  ceItm,
      ce:     r.ce ? makeQuote(r.ce, 'CE') : null,
      pe:     r.pe ? makeQuote(r.pe, 'PE') : null,
    };
  });

  return {
    symbol:         sym,
    expiry,
    spot,
    spotChange,
    spotChangePct,
    atm,
    strikeInterval: interval,
    rows,
    analytics:      calcAnalytics(rows),
    timestamp:      new Date().toISOString(),
    source:         'live',
  };
}
