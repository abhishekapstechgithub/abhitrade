export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis, KEYS, isRedisAvailable } from '@/lib/redis-client';

export interface ScripRecord {
  token: string;
  exchange: string;
  symbol: string;
  tradingSymbol: string;
  name: string;
  instrumentType: string;
  series: string;
  isin: string;
  lotSize: number;
  tickSize: number;
  expiry: string;
  strike: number | null;
  optionType: string;
  underlying: string;
  underlyingToken: string;
}

function parseHash(h: Record<string, string>): ScripRecord {
  return {
    token: h.token ?? '',
    exchange: h.exchange ?? '',
    symbol: h.symbol ?? '',
    tradingSymbol: h.tradingSymbol ?? h.symbol ?? '',
    name: h.name ?? '',
    instrumentType: h.instrumentType ?? '',
    series: h.series ?? '',
    isin: h.isin ?? '',
    lotSize: parseInt(h.lotSize ?? '1', 10) || 1,
    tickSize: parseFloat(h.tickSize ?? '0.05') || 0.05,
    expiry: h.expiry ?? '',
    strike: h.strike ? parseFloat(h.strike) : null,
    optionType: h.optionType ?? '',
    underlying: h.underlying ?? '',
    underlyingToken: h.underlyingToken ?? '',
  };
}

/** Resolve the canonical EQ token for a symbol on an exchange */
async function resolveEqToken(exchange: string, symbol: string): Promise<string | null> {
  const symKey = KEYS.bySymbol(exchange, symbol);
  const tokens = await redis.smembers(symKey);
  for (const tok of tokens) {
    const instrKey = KEYS.instr(exchange, tok);
    const it = await redis.hget(instrKey, 'instrumentType');
    if (it === 'EQ') return tok;
  }
  return null;
}

/** GET /api/scrips
 *
 *  Query params:
 *    symbols   — comma-separated list e.g. RELIANCE,TCS,INFY
 *    exchange  — NSE (default) | BSE
 *    type      — EQ (default) | FUT | CE | PE | all
 *    underlying — for options: e.g. NIFTY
 *    expiry    — YYYY-MM-DD filter for options
 *    limit     — max results (default 50)
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const symbolsParam = sp.get('symbols') ?? '';
  const exchange = (sp.get('exchange') ?? 'NSE').toUpperCase();
  const type = (sp.get('type') ?? 'EQ').toUpperCase();
  const underlying = (sp.get('underlying') ?? '').toUpperCase();
  const expiry = sp.get('expiry') ?? '';
  const limit = Math.min(parseInt(sp.get('limit') ?? '50', 10) || 50, 200);

  const redisOk = await isRedisAvailable();
  if (!redisOk) {
    return NextResponse.json({ results: [], source: 'redis_unavailable' }, { status: 503 });
  }

  // ── Named symbols lookup ─────────────────────────────────────────────────
  if (symbolsParam) {
    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const results: ScripRecord[] = [];

    for (const sym of symbols) {
      const symKey = KEYS.bySymbol(exchange, sym);
      const tokens = await redis.smembers(symKey);

      for (const tok of tokens) {
        const instrKey = KEYS.instr(exchange, tok);
        const h = await redis.hgetall(instrKey);
        if (!h) continue;
        const it = (h.instrumentType ?? '').toUpperCase();
        if (type === 'ALL' || it === type) {
          results.push(parseHash(h));
          break; // one per symbol
        }
      }
    }

    return NextResponse.json({ results, total: results.length, source: 'redis' });
  }

  // ── Options chain lookup ─────────────────────────────────────────────────
  if (underlying && (type === 'CE' || type === 'PE' || type === 'OPTIONS' || type === 'ALL')) {
    const symKey = KEYS.bySymbol(exchange, underlying);
    const tokens = await redis.smembers(symKey);

    const results: ScripRecord[] = [];
    for (const tok of tokens) {
      const instrKey = KEYS.instr(exchange, tok);
      const h = await redis.hgetall(instrKey);
      if (!h) continue;
      const it = (h.instrumentType ?? '').toUpperCase();
      if (it !== 'CE' && it !== 'PE') continue;
      if (expiry && h.expiry !== expiry) continue;
      results.push(parseHash(h));
      if (results.length >= limit) break;
    }

    results.sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0));
    return NextResponse.json({ results, total: results.length, source: 'redis' });
  }

  // ── Top EQ instruments via autocomplete ZSET ────────────────────────────
  // Scan autocomplete entries for EQ type
  const NIFTY50 = [
    'RELIANCE','TCS','HDFCBANK','ICICIBANK','INFY','HDFC','KOTAKBANK','BHARTIARTL','SBIN',
    'WIPRO','HCLTECH','BAJFINANCE','MARUTI','TITAN','ASIANPAINT','TATAMOTORS','AXISBANK',
    'SUNPHARMA','DRREDDY','CIPLA','ONGC','NTPC','POWERGRID','COALINDIA','ULTRACEMCO',
    'HINDUNILVR','ITC','LT','JSWSTEEL','TATASTEEL','BAJAJFINSV','TECHM','ADANIPORTS',
    'NESTLEIND','BRITANNIA','GRASIM','ADANIENT','DIVISLAB','APOLLOHOSP','HEROMOTOCO',
  ].slice(0, limit);

  const results: ScripRecord[] = [];
  for (const sym of NIFTY50) {
    const symKey = KEYS.bySymbol(exchange, sym);
    const tokens = await redis.smembers(symKey);
    for (const tok of tokens) {
      const instrKey = KEYS.instr(exchange, tok);
      const h = await redis.hgetall(instrKey);
      if (!h) continue;
      if ((h.instrumentType ?? '').toUpperCase() === 'EQ') {
        results.push(parseHash(h));
        break;
      }
    }
  }

  return NextResponse.json({ results, total: results.length, source: 'redis' });
}
