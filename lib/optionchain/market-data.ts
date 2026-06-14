/**
 * Market Data Cache.
 *
 * Redis-first quote store: key = oc:q:{token}
 * Falls back to deterministic mock data when Redis is unavailable or token unknown.
 *
 * In production: your market feed (WebSocket / Kafka) calls `setQuote()` to push
 * live ticks. The option chain service reads via `getQuote()` / `getQuotesBatch()`.
 */

import { redis } from '@/lib/redis-client';
import { OptionQuote, MOCK_SPOT, STRIKE_INTERVALS } from './types';

const KEY_PREFIX  = 'oc:q:';
const SPOT_PREFIX = 'oc:spot:';
const QUOTE_TTL   = 60; // seconds

// ── Helpers ───────────────────────────────────────────────────────────────────

function quoteKey(token: number): string { return `${KEY_PREFIX}${token}`; }
function spotKey(symbol: string): string  { return `${SPOT_PREFIX}${symbol.toUpperCase()}`; }

// ── Mock Quote Generator ──────────────────────────────────────────────────────

/**
 * Generate a deterministic but realistic-looking option quote for dev/test.
 * Uses Black-Scholes approximation to produce plausible premiums.
 */
export function generateMockQuote(
  token: number,
  tradingSymbol: string,
  strike: number,
  optType: 'CE' | 'PE',
  spot: number,
): OptionQuote {
  const interval  = getIntervalFromSymbol(tradingSymbol);
  const moneyness = (spot - strike) / (interval * 5);    // normalized distance from ATM
  const isITM     = optType === 'CE' ? spot > strike : spot < strike;

  // Rough intrinsic + time value
  const intrinsic = Math.max(0, optType === 'CE' ? spot - strike : strike - spot);
  const timeValue = Math.max(
    interval * 0.3,
    interval * 2 * Math.exp(-Math.abs(moneyness) * 0.8),
  );
  const baseLtp   = Math.round((intrinsic + timeValue) * 100) / 100;

  // Seed randomness from token so it's stable across renders
  const seed   = (token * 1234567) % 10000;
  const jitter = (seed / 10000 - 0.5) * baseLtp * 0.05;
  const ltp    = Math.max(0.05, Math.round((baseLtp + jitter) * 20) / 20);

  const spread  = Math.max(0.05, ltp * 0.002);
  const oi      = Math.floor((isITM ? 150000 : 80000) + seed * 10);
  const vol     = Math.floor(oi * 0.08);
  const iv      = Math.max(8, 20 - Math.abs(moneyness) * 3 + (seed % 5));

  // Greeks via simplified BSM approximation
  const delta   = optType === 'CE'
    ? Math.min(0.99, Math.max(0.01, 0.5 + moneyness * 0.15))
    : Math.max(-0.99, Math.min(-0.01, -0.5 + moneyness * 0.15));

  return {
    token,
    tradingSymbol,
    ltp,
    open:      Math.round((ltp * 0.97) * 20) / 20,
    high:      Math.round((ltp * 1.08) * 20) / 20,
    low:       Math.round((ltp * 0.85) * 20) / 20,
    close:     Math.round((ltp * 0.98) * 20) / 20,
    oi,
    changeOi:  Math.floor(oi * (0.02 + (seed % 100) / 2000)),
    volume:    vol,
    bid:       Math.round((ltp - spread) * 20) / 20,
    ask:       Math.round((ltp + spread) * 20) / 20,
    bidQty:    Math.floor(75 + seed % 300),
    askQty:    Math.floor(75 + (seed * 2) % 300),
    iv:        Math.round(iv * 10) / 10,
    delta:     Math.round(delta * 1000) / 1000,
    gamma:     Math.round(Math.abs(0.01 / (ltp + 1)) * 10000) / 10000,
    theta:     Math.round((-ltp * 0.015 - Math.random() * 0.1) * 100) / 100,
    vega:      Math.round((ltp * 0.03) * 100) / 100,
    rho:       Math.round((delta * 0.1) * 1000) / 1000,
    updatedAt: Date.now(),
  };
}

function getIntervalFromSymbol(sym: string): number {
  for (const [k, v] of Object.entries(STRIKE_INTERVALS)) {
    if (sym.startsWith(k)) return v;
  }
  return 50;
}

// ── Redis Operations ──────────────────────────────────────────────────────────

export async function setQuote(token: number, quote: OptionQuote): Promise<void> {
  try {
    await redis.set(quoteKey(token), JSON.stringify(quote), 'EX', QUOTE_TTL);
  } catch { /* non-fatal */ }
}

export async function getQuote(token: number): Promise<OptionQuote | null> {
  try {
    const raw = await redis.get(quoteKey(token));
    if (raw) return JSON.parse(raw) as OptionQuote;
  } catch { /* non-fatal */ }
  return null;
}

/** Batch-get quotes for all tokens in a chain — one Redis pipeline call */
export async function getQuotesBatch(
  tokens: number[],
): Promise<Map<number, OptionQuote>> {
  const result = new Map<number, OptionQuote>();
  if (tokens.length === 0) return result;

  try {
    const pipeline = redis.pipeline();
    for (const t of tokens) pipeline.get(quoteKey(t));
    const replies = await pipeline.exec();
    if (replies) {
      replies.forEach(([err, val], i) => {
        if (!err && val) {
          try { result.set(tokens[i], JSON.parse(val as string) as OptionQuote); }
          catch { /* malformed */ }
        }
      });
    }
  } catch { /* Redis unavailable — return empty, caller uses mock */ }

  return result;
}

// ── Spot Price ─────────────────────────────────────────────────────────────────

export async function getSpot(symbol: string): Promise<{
  ltp: number; change: number; changePct: number;
}> {
  const sym = symbol.toUpperCase();
  try {
    const raw = await redis.get(spotKey(sym));
    if (raw) return JSON.parse(raw);
  } catch { /* Redis unavailable */ }
  // Fallback to mock
  return MOCK_SPOT[sym] ?? { ltp: 0, change: 0, changePct: 0 };
}

export async function setSpot(
  symbol: string,
  data: { ltp: number; change: number; changePct: number },
): Promise<void> {
  try {
    await redis.set(spotKey(symbol.toUpperCase()), JSON.stringify(data), 'EX', 30);
  } catch { /* non-fatal */ }
}

// ── Batch Quote Push (for feed connectors) ────────────────────────────────────

export interface RawTick {
  token:    number;
  ltp:      number;
  oi?:      number;
  changeOi?: number;
  volume?:  number;
  bid?:     number;
  ask?:     number;
  bidQty?:  number;
  askQty?:  number;
  iv?:      number;
  delta?:   number;
  gamma?:   number;
  theta?:   number;
  vega?:    number;
}

export async function pushTicks(ticks: RawTick[]): Promise<void> {
  if (!ticks.length) return;
  try {
    const pipeline = redis.pipeline();
    const ts = Date.now();
    for (const t of ticks) {
      const existing = await getQuote(t.token);
      const merged: OptionQuote = {
        token:       t.token,
        tradingSymbol: existing?.tradingSymbol ?? '',
        ltp:         t.ltp,
        open:        existing?.open  ?? t.ltp,
        high:        Math.max(existing?.high ?? t.ltp, t.ltp),
        low:         Math.min(existing?.low  ?? t.ltp, t.ltp),
        close:       existing?.close ?? t.ltp,
        oi:          t.oi       ?? existing?.oi       ?? 0,
        changeOi:    t.changeOi ?? existing?.changeOi ?? 0,
        volume:      t.volume   ?? existing?.volume   ?? 0,
        bid:         t.bid      ?? t.ltp * 0.999,
        ask:         t.ask      ?? t.ltp * 1.001,
        bidQty:      t.bidQty   ?? existing?.bidQty   ?? 0,
        askQty:      t.askQty   ?? existing?.askQty   ?? 0,
        iv:          t.iv       ?? existing?.iv,
        delta:       t.delta    ?? existing?.delta,
        gamma:       t.gamma    ?? existing?.gamma,
        theta:       t.theta    ?? existing?.theta,
        vega:        t.vega     ?? existing?.vega,
        updatedAt:   ts,
      };
      pipeline.set(quoteKey(t.token), JSON.stringify(merged), 'EX', QUOTE_TTL);
    }
    await pipeline.exec();
  } catch { /* non-fatal */ }
}
