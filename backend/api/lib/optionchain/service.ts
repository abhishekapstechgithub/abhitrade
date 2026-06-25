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
import { getQuotesBatch, getSpot, generateMockQuote, writeGreeks, GreeksTick } from './market-data';
import { calcAtm, getStrikeInterval, buildStrikeRange, getStrikeClass } from './atm';
import { calcAnalytics }               from './analytics';
import { syncUnivestToRedis }          from './univest-feed';
import {
  OptionChainResponse,
  OptionChainRow,
  OptionQuote,
  StrikePair,
} from './types';

const CHAIN_CACHE_TTL  = 5;   // seconds
const GREEKS_FETCH_TTL = 180; // don't re-fetch Angel One more than once per 3 min
const chainKey   = (sym: string, exp: string) => `oc:chain:${sym}:${exp}`;
const greeksFetched = (sym: string, exp: string) => `oc:greeks:${sym}:${exp}`;

// Expiry format: "2025-06-26" → "26JUN2025" for Angel One API
function toAngelExpiry(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  const M = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${d}${M[Number(m) - 1]}${y}`;
}

/**
 * Fetch Option Greeks from Angel One and push into Redis.
 * Called opportunistically — failures are silent so the chain still builds.
 */
async function fetchAndCacheGreeks(
  symbol: string,
  expiry: string,
  strikePairs: Map<number, StrikePair>,
  spotLtp: number,
): Promise<void> {
  // Skip if recently fetched (within GREEKS_FETCH_TTL)
  try {
    const already = await redis.exists(greeksFetched(symbol, expiry));
    if (already) return;
  } catch { return; }

  const apiKey     = process.env.ANGELONE_API_KEY     ?? '';
  const clientId   = process.env.ANGELONE_CLIENT_ID   ?? '';
  const password   = process.env.ANGELONE_PASSWORD     ?? '';
  const totpSecret = process.env.ANGELONE_TOTP_SECRET ?? '';
  if (!apiKey || !clientId || !password || !totpSecret) return;

  try {
    // Lazy import to avoid loading auth module in every edge-like context
    const { getAngelSession } = await import('@/lib/angelone/auth');
    const { getOptionGreeks } = await import('@/lib/angelone/client');

    const session = await getAngelSession(apiKey, clientId, password, totpSecret);
    const raw     = await getOptionGreeks(apiKey, session.accessToken, symbol, toAngelExpiry(expiry));

    if (!raw || raw.length === 0) return;

    const ticks: GreeksTick[] = [];
    for (const g of raw) {
      const strike  = parseFloat(g.strikePrice);
      const optType = g.optionType as 'CE' | 'PE';
      const pair    = strikePairs.get(strike);
      if (!pair) continue;

      const token         = optType === 'CE' ? pair.ceToken  : pair.peToken;
      const tradingSymbol = optType === 'CE' ? pair.ceSymbol : pair.peSymbol;
      if (!token) continue;

      ticks.push({
        token, tradingSymbol, strike, optType, spot: spotLtp,
        iv:    parseFloat(g.impliedVolatility),
        delta: parseFloat(g.delta),
        gamma: parseFloat(g.gamma),
        theta: parseFloat(g.theta),
        vega:  parseFloat(g.vega),
        volume: parseFloat(g.tradeVolume),
      });
    }

    if (ticks.length > 0) {
      await writeGreeks(ticks);
      // Mark as fetched so we don't re-call within TTL
      await redis.set(greeksFetched(symbol, expiry), '1', 'EX', GREEKS_FETCH_TTL);
      console.info(`[OptionChain][Greeks] Wrote ${ticks.length} real Greeks for ${symbol} ${expiry}`);
    }
  } catch (err) {
    // Non-fatal — chain continues with cached/mock Greeks
    console.warn(`[OptionChain][Greeks] Fetch failed for ${symbol} ${expiry}:`, (err as Error).message);
  }
}

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

  // 4. Opportunistically refresh Greeks from Angel One (non-blocking, non-fatal)
  //    Runs in parallel with the quote fetch below; result lands in Redis before
  //    we do the batch read if Angel One responds fast enough, otherwise it
  //    populates the cache for the NEXT request (< 3s penalty is acceptable).
  const greeksPromise = fetchAndCacheGreeks(symbol, expiry, strikePairs, spotData.ltp);

  // 5. Determine which strikes to fetch (all available — cache the full chain)
  const allStrikes = Array.from(strikePairs.keys()).sort((a, b) => a - b);

  // 6. Collect all tokens
  const ceTokens: number[] = [];
  const peTokens: number[] = [];
  for (const s of allStrikes) {
    const p = strikePairs.get(s)!;
    if (p.ceToken) ceTokens.push(p.ceToken);
    if (p.peToken) peTokens.push(p.peToken);
  }

  // 7. Wait for Greeks (if they arrived quickly) then batch-read quotes from Redis.
  //    We give Greeks 300ms to land; any slower and they'll appear in the next request.
  await Promise.race([greeksPromise, new Promise(r => setTimeout(r, 300))]);

  // 8. Batch quote fetch from Redis (now includes Greeks if Angel One responded in time)
  const allTokens  = [...ceTokens, ...peTokens];
  let quoteCache   = await getQuotesBatch(allTokens);

  // 8a. If Redis has no option quotes, try Univest feed immediately.
  //     This gives the first load real market LTPs instead of mock values.
  if (quoteCache.size === 0) {
    const sync = await syncUnivestToRedis(symbol, expiry);
    if (sync.written > 0) {
      quoteCache = await getQuotesBatch(allTokens);
      // If Univest returned a spot price, update spotData
      if (sync.spot && sync.spot > 0) {
        spotData.ltp = sync.spot;
      }
    }
  }

  // 9. Assemble rows
  const rows: OptionChainRow[] = allStrikes.map(strike => {
    const pair = strikePairs.get(strike)!;
    const { isAtm, ceItm, peItm } = getStrikeClass(strike, spotData.ltp, atm, interval);

    const ce = resolveQuote(pair.ceToken, pair.ceSymbol, strike, 'CE', spotData.ltp, quoteCache, pair);
    const pe = resolveQuote(pair.peToken, pair.peSymbol, strike, 'PE', spotData.ltp, quoteCache, pair);

    return { strike, isAtm, isItm: ceItm, ce, pe };
  });

  // 10. Analytics on full chain
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

export async function getOptionExpiries(symbol: string, exchange?: string): Promise<{
  symbol: string; exchange?: string; expiries: string[]; nearest: string;
}> {
  const expiries = await getExpiries(symbol.toUpperCase(), exchange);
  return {
    symbol:   symbol.toUpperCase(),
    exchange: exchange?.toUpperCase(),
    expiries,
    nearest:  expiries[0] ?? '',
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
