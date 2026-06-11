export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis, isRedisAvailable } from '@/lib/redis-client';
import { searchInstrumentsPg } from '@/lib/db/repositories';
import { isDbAvailable } from '@/lib/db/client';

const CACHE_TTL = 3600; // 1 hour

// Redis cache key for a search query
function cacheKey(q: string, exchange = 'all', type = 'all') {
  return `tk:q:${exchange.toUpperCase()}:${type.toUpperCase()}:${q.toUpperCase().trim()}`;
}

// Fallback mock when no backend is available
const MOCK_INSTRUMENTS = [
  { token: '1',  symbol: 'RELIANCE',  tradingSymbol: 'RELIANCE',  name: 'Reliance Industries Ltd',   exchange: 'NSE', instrumentType: 'EQ'    },
  { token: '2',  symbol: 'TCS',       tradingSymbol: 'TCS',       name: 'Tata Consultancy Services', exchange: 'NSE', instrumentType: 'EQ'    },
  { token: '3',  symbol: 'INFY',      tradingSymbol: 'INFY',      name: 'Infosys Ltd',               exchange: 'NSE', instrumentType: 'EQ'    },
  { token: '4',  symbol: 'HDFCBANK',  tradingSymbol: 'HDFCBANK',  name: 'HDFC Bank Ltd',             exchange: 'NSE', instrumentType: 'EQ'    },
  { token: '5',  symbol: 'ICICIBANK', tradingSymbol: 'ICICIBANK', name: 'ICICI Bank Ltd',            exchange: 'NSE', instrumentType: 'EQ'    },
  { token: '6',  symbol: 'NIFTY50',   tradingSymbol: 'NIFTY50',   name: 'NIFTY 50 Index',           exchange: 'NSE', instrumentType: 'INDEX' },
  { token: '7',  symbol: 'BANKNIFTY', tradingSymbol: 'BANKNIFTY', name: 'Bank Nifty Index',          exchange: 'NSE', instrumentType: 'INDEX' },
  { token: '11', symbol: 'SBIN',      tradingSymbol: 'SBIN',      name: 'State Bank of India',       exchange: 'NSE', instrumentType: 'EQ'    },
  { token: '12', symbol: 'WIPRO',     tradingSymbol: 'WIPRO',     name: 'Wipro Ltd',                 exchange: 'NSE', instrumentType: 'EQ'    },
];

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

  // ── 3. In-memory mock (no backend available) ──────────────────────────────
  const ql = q.toLowerCase();
  let results = MOCK_INSTRUMENTS.filter(
    i => i.symbol.toLowerCase().startsWith(ql) ||
         i.name.toLowerCase().includes(ql) ||
         i.tradingSymbol.toLowerCase().startsWith(ql),
  );
  if (exFilter)   results = results.filter(r => r.exchange.toLowerCase() === exFilter.toLowerCase());
  if (typeFilter) results = results.filter(r => r.instrumentType.toLowerCase() === typeFilter.toLowerCase());

  return NextResponse.json({ results: results.slice(0, limit), total: results.length, source: 'mock' });
}
