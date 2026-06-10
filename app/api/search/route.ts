export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { isRedisAvailable } from '@/lib/redis-client';
import { searchInstruments } from '@/lib/security-master-loader';
import { searchInstrumentsPg } from '@/lib/db/repositories';
import { isDbAvailable } from '@/lib/db/client';

// Fallback mock data when neither Redis nor PostgreSQL is loaded yet
const MOCK_INSTRUMENTS = [
  { token: '1',  symbol: 'RELIANCE',  tradingSymbol: 'RELIANCE',  name: 'Reliance Industries Ltd',     exchange: 'NSE', instrumentType: 'EQ' },
  { token: '2',  symbol: 'TCS',       tradingSymbol: 'TCS',       name: 'Tata Consultancy Services',   exchange: 'NSE', instrumentType: 'EQ' },
  { token: '3',  symbol: 'INFY',      tradingSymbol: 'INFY',      name: 'Infosys Ltd',                 exchange: 'NSE', instrumentType: 'EQ' },
  { token: '4',  symbol: 'HDFCBANK',  tradingSymbol: 'HDFCBANK',  name: 'HDFC Bank Ltd',               exchange: 'NSE', instrumentType: 'EQ' },
  { token: '5',  symbol: 'ICICIBANK', tradingSymbol: 'ICICIBANK', name: 'ICICI Bank Ltd',              exchange: 'NSE', instrumentType: 'EQ' },
  { token: '6',  symbol: 'NIFTY50',   tradingSymbol: 'NIFTY50',   name: 'NIFTY 50 Index',             exchange: 'NSE', instrumentType: 'INDEX' },
  { token: '7',  symbol: 'BANKNIFTY', tradingSymbol: 'BANKNIFTY', name: 'Bank Nifty Index',            exchange: 'NSE', instrumentType: 'INDEX' },
  { token: '8',  symbol: 'NIFTY24DECFUT', tradingSymbol: 'NIFTY24DECFUT', name: 'NIFTY Dec Futures',  exchange: 'NSE', instrumentType: 'FUT', expiry: '2024-12-26' },
  { token: '9',  symbol: 'NIFTY24DEC25000CE', tradingSymbol: 'NIFTY24DEC25000CE', name: 'NIFTY Dec 25000 CE', exchange: 'NSE', instrumentType: 'CE', expiry: '2024-12-26', strike: 25000 },
  { token: '10', symbol: 'NIFTY24DEC25000PE', tradingSymbol: 'NIFTY24DEC25000PE', name: 'NIFTY Dec 25000 PE', exchange: 'NSE', instrumentType: 'PE', expiry: '2024-12-26', strike: 25000 },
  { token: '11', symbol: 'SBIN',  tradingSymbol: 'SBIN',  name: 'State Bank of India', exchange: 'NSE', instrumentType: 'EQ' },
  { token: '12', symbol: 'WIPRO', tradingSymbol: 'WIPRO', name: 'Wipro Ltd',            exchange: 'NSE', instrumentType: 'EQ' },
];

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';
  const exchange = request.nextUrl.searchParams.get('exchange') ?? undefined;
  const type     = request.nextUrl.searchParams.get('type') ?? undefined;
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = Math.min(Number(limitParam ?? 20), 50);

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [], total: 0, source: 'empty' });
  }

  const exFilter   = exchange && exchange !== 'all' ? exchange : undefined;
  const typeFilter = type     && type     !== 'all' ? type     : undefined;

  // ── 1. Redis autocomplete (fastest) ──────────────────────────────────────────
  try {
    const redisOk = await isRedisAvailable();
    if (redisOk) {
      const hits = await searchInstruments(q, limit, { exchange: exFilter, type: typeFilter });
      if (hits.length > 0) {
        return NextResponse.json({ results: hits, total: hits.length, source: 'redis' });
      }
    }
  } catch (e) {
    console.warn('[search] Redis error, falling back:', e);
  }

  // ── 2. PostgreSQL full-text fallback ──────────────────────────────────────────
  try {
    if (await isDbAvailable()) {
      const rows = await searchInstrumentsPg(q, {
        exchange: exFilter,
        type:     typeFilter,
        limit,
      });
      if (rows.length > 0) {
        const hits = rows.map(r => ({
          token:          r.token,
          exchange:       r.exchange,
          symbol:         r.symbol,
          tradingSymbol:  r.trading_symbol ?? r.symbol,
          name:           r.name ?? r.symbol,
          instrumentType: r.instrument_type,
          expiry:         r.expiry ?? undefined,
          strike:         r.strike != null ? Number(r.strike) : undefined,
          optionType:     r.option_type ?? undefined,
          underlying:     r.underlying ?? undefined,
          lotSize:        r.lot_size,
        }));
        return NextResponse.json({ results: hits, total: hits.length, source: 'postgres' });
      }
    }
  } catch (e) {
    console.warn('[search] PostgreSQL error, falling back to mock:', e);
  }

  // ── 3. In-memory mock (no backend available) ──────────────────────────────────
  const queryLower = q.toLowerCase();
  let results = MOCK_INSTRUMENTS.filter(
    inst =>
      inst.symbol.toLowerCase().startsWith(queryLower) ||
      inst.name.toLowerCase().includes(queryLower) ||
      inst.tradingSymbol.toLowerCase().startsWith(queryLower),
  );
  if (exFilter)   results = results.filter(r => r.exchange.toLowerCase() === exFilter.toLowerCase());
  if (typeFilter) results = results.filter(r => r.instrumentType.toLowerCase() === typeFilter.toLowerCase());

  return NextResponse.json({ results: results.slice(0, limit), total: results.length, source: 'mock' });
}
