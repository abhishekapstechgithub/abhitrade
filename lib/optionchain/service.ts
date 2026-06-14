/**
 * Option Chain Service — main orchestrator.
 *
 * Assembles a full option chain in < 20ms:
 *   1. Security master lookup (in-memory)
 *   2. Spot price (Redis → mock)
 *   3. ATM strike calculation
 *   4. Quote batch fetch (Redis pipeline → mock fallback per token)
 *   5. Row assembly + analytics
 *   6. Short-TTL chain cache (Redis, 5s)
 */

import { redis }                       from '@/lib/redis-client';
import { getStrikes, getExpiries }     from './security-master';
import { getQuotesBatch, getSpot, generateMockQuote } from './market-data';
import { calcAtm, getStrikeInterval, buildStrikeRange, getStrikeClass } from './atm';
import { calcAnalytics }               from './analytics';
import {
  OptionChainResponse,
  OptionChainRow,
  OptionQuote,
  StrikePair,
} from './types';

const CHAIN_CACHE_TTL = 5; // seconds
const chainKey = (sym: string, exp: string) => `oc:chain:${sym}:${exp}`;

// ── Build Chain ────────────────────────────────────────────────────────────────

export async function buildOptionChain(params: {
  symbol:       string;
  expiry:       string;
  strikeCount?: number;
  fromStrike?:  number;
  toStrike?:    number;
}): Promise<OptionChainResponse> {
  const { strikeCount = 15, fromStrike, toStrike } = params;
  const symbol = params.symbol.toUpperCase();
  const expiry = params.expiry;

  // 1. Try chain cache (5s TTL — avoids re-assembly on rapid API hits)
  const cacheHit = await tryChainCache(symbol, expiry);
  if (cacheHit) {
    // Apply strike filter to cached response
    return filterRows(cacheHit, strikeCount, fromStrike, toStrike);
  }

  // 2. Security master lookup
  const strikePairs = await getStrikes(symbol, expiry);
  if (!strikePairs || strikePairs.size === 0) {
    throw new Error(`No instruments found for ${symbol} expiry ${expiry}`);
  }

  // 3. Spot + ATM
  const spotData = await getSpot(symbol);
  if (spotData.ltp === 0) {
    throw new Error(`Spot price unavailable for ${symbol}`);
  }
  const interval = getStrikeInterval(symbol);
  const atm      = calcAtm(spotData.ltp, interval);

  // 4. Determine which strikes to fetch (all available — cache the full chain)
  const allStrikes = Array.from(strikePairs.keys()).sort((a, b) => a - b);

  // 5. Collect all tokens
  const ceTokens: number[] = [];
  const peTokens: number[] = [];
  for (const s of allStrikes) {
    const p = strikePairs.get(s)!;
    if (p.ceToken) ceTokens.push(p.ceToken);
    if (p.peToken) peTokens.push(p.peToken);
  }

  // 6. Batch quote fetch from Redis
  const allTokens   = [...ceTokens, ...peTokens];
  const quoteCache  = await getQuotesBatch(allTokens);

  // 7. Assemble rows
  const rows: OptionChainRow[] = allStrikes.map(strike => {
    const pair = strikePairs.get(strike)!;
    const { isAtm, ceItm, peItm } = getStrikeClass(strike, spotData.ltp, atm, interval);

    const ce = resolveQuote(pair.ceToken, pair.ceSymbol, strike, 'CE', spotData.ltp, quoteCache, pair);
    const pe = resolveQuote(pair.peToken, pair.peSymbol, strike, 'PE', spotData.ltp, quoteCache, pair);

    return { strike, isAtm, isItm: ceItm, ce, pe };
  });

  // 8. Analytics on full chain
  const analytics = calcAnalytics(rows);

  const fullChain: OptionChainResponse = {
    symbol,
    expiry,
    spot:          spotData.ltp,
    spotChange:    spotData.change,
    spotChangePct: spotData.changePct,
    atm,
    strikeInterval: interval,
    rows,
    analytics,
    timestamp: new Date().toISOString(),
    source: quoteCache.size > 0 ? 'live' : 'mock',
  };

  // 9. Cache full chain
  await cacheChain(symbol, expiry, fullChain);

  // 10. Apply strike count filter
  return filterRows(fullChain, strikeCount, fromStrike, toStrike);
}

// ── Resolve Quote ─────────────────────────────────────────────────────────────

function resolveQuote(
  token:      number,
  symbol:     string,
  strike:     number,
  optType:    'CE' | 'PE',
  spot:       number,
  cache:      Map<number, OptionQuote>,
  pair:       StrikePair,
): OptionQuote | null {
  if (!token) return null;
  // Redis hit
  if (cache.has(token)) {
    return { ...cache.get(token)!, tradingSymbol: symbol };
  }
  // Mock fallback
  return generateMockQuote(token, symbol, strike, optType, spot);
}

// ── Strike Filtering ──────────────────────────────────────────────────────────

function filterRows(
  chain:       OptionChainResponse,
  strikeCount: number,
  fromStrike?: number,
  toStrike?:   number,
): OptionChainResponse {
  let rows = chain.rows;

  if (fromStrike !== undefined && toStrike !== undefined) {
    rows = rows.filter(r => r.strike >= fromStrike && r.strike <= toStrike);
  } else {
    const atmIdx = rows.findIndex(r => r.isAtm);
    const center = atmIdx >= 0 ? atmIdx : Math.floor(rows.length / 2);
    const lo     = Math.max(0, center - strikeCount);
    const hi     = Math.min(rows.length - 1, center + strikeCount);
    rows = rows.slice(lo, hi + 1);
  }

  return { ...chain, rows, analytics: calcAnalytics(rows) };
}

// ── Chain Cache ────────────────────────────────────────────────────────────────

async function cacheChain(sym: string, exp: string, chain: OptionChainResponse): Promise<void> {
  try {
    await redis.set(chainKey(sym, exp), JSON.stringify(chain), 'EX', CHAIN_CACHE_TTL);
  } catch { /* non-fatal */ }
}

async function tryChainCache(sym: string, exp: string): Promise<OptionChainResponse | null> {
  try {
    const raw = await redis.get(chainKey(sym, exp));
    if (raw) return JSON.parse(raw) as OptionChainResponse;
  } catch { /* non-fatal */ }
  return null;
}

// ── Expiries ──────────────────────────────────────────────────────────────────

export async function getOptionExpiries(symbol: string): Promise<{
  symbol: string; expiries: string[]; nearest: string;
}> {
  const expiries = await getExpiries(symbol.toUpperCase());
  return {
    symbol: symbol.toUpperCase(),
    expiries,
    nearest: expiries[0] ?? '',
  };
}

// ── Delta Snapshot (for WebSocket / SSE diff) ─────────────────────────────────

/**
 * Returns only the rows/fields that changed since `prevSnapshot`.
 * Used by the streaming endpoint to send minimal diffs.
 */
export function diffChain(
  prev: OptionChainResponse,
  curr: OptionChainResponse,
): Partial<OptionChainResponse> & { changedRows: number[] } {
  const changedRows: number[] = [];

  for (const currRow of curr.rows) {
    const prevRow = prev.rows.find(r => r.strike === currRow.strike);
    if (!prevRow) { changedRows.push(currRow.strike); continue; }

    const ceLtpChanged = currRow.ce?.ltp !== prevRow.ce?.ltp;
    const peLtpChanged = currRow.pe?.ltp !== prevRow.pe?.ltp;
    const ceOIChanged  = currRow.ce?.oi  !== prevRow.ce?.oi;
    const peOIChanged  = currRow.pe?.oi  !== prevRow.pe?.oi;

    if (ceLtpChanged || peLtpChanged || ceOIChanged || peOIChanged) {
      changedRows.push(currRow.strike);
    }
  }

  return {
    symbol:    curr.symbol,
    expiry:    curr.expiry,
    spot:      curr.spot,
    atm:       curr.atm,
    analytics: curr.analytics,
    timestamp: curr.timestamp,
    rows:      curr.rows.filter(r => changedRows.includes(r.strike)),
    changedRows,
  };
}
