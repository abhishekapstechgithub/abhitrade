export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis, isRedisAvailable } from '@/lib/redis-client';
import { searchInstrumentsPg } from '@/lib/db/repositories';
import { isDbAvailable } from '@/lib/db/client';

const CACHE_TTL = 300; // 5 min — keeps search fast without staling priority order

// Redis cache key for a search query
function cacheKey(q: string, exchange = 'all', type = 'all') {
  return `tk:q:${exchange.toUpperCase()}:${type.toUpperCase()}:${q.toUpperCase().trim()}`;
}


export async function GET(request: NextRequest) {
  const q       = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const exchange = request.nextUrl.searchParams.get('exchange') ?? 'all';
  const type     = request.nextUrl.searchParams.get('type')     ?? 'all';
  const limit    = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 20), 50);

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [], total: 0, source: 'empty' });
  }

  const exFilter   = exchange !== 'all' ? exchange : undefined;
  const typeFilter = type     !== 'all' ? type     : undefined;

  // ── 1. Redis cache hit ────────────────────────────────────────────────────
  try {
    const redisOk = await isRedisAvailable();
    if (redisOk) {
      const cached = await redis.get(cacheKey(q, exchange, type));
      if (cached) {
        const results = JSON.parse(cached);
        return NextResponse.json({ results, total: results.length, source: 'redis-cache' });
      }
    }
  } catch { /* fall through */ }

  // ── 2. PostgreSQL query ───────────────────────────────────────────────────
  try {
    if (await isDbAvailable()) {
      const rows = await searchInstrumentsPg(q, { exchange: exFilter, type: typeFilter, limit });
      if (rows.length > 0) {
        const results = rows.map(r => ({
          token:          r.token,
          exchange:       r.exchange,
          symbol:         r.symbol,
          tradingSymbol:  r.trading_symbol ?? r.symbol,
          name:           r.name ?? r.symbol,
          instrumentType: r.instrument_type,
          segment:        r.segment ?? undefined,
          expiry:         r.expiry   ?? undefined,
          strike:         r.strike   != null ? Number(r.strike) : undefined,
          optionType:     r.option_type ?? undefined,
          underlying:     r.underlying  ?? undefined,
          lotSize:        r.lot_size,
        }));

        // Cache in Redis for future lookups
        try {
          const redisOk = await isRedisAvailable();
          if (redisOk) {
            await redis.setex(cacheKey(q, exchange, type), CACHE_TTL, JSON.stringify(results));
          }
        } catch { /* non-fatal */ }

        return NextResponse.json({ results, total: results.length, source: 'postgres' });
      }
    }
  } catch (e) {
    console.warn('[search] PostgreSQL error, falling back to mock:', e);
  }

  // No results — security master not yet uploaded or DB unavailable.
  return NextResponse.json({ results: [], total: 0, source: 'empty' });
}
