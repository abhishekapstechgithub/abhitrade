export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis, isRedisAvailable } from '@/lib/redis-client';
import { searchInstrumentsPg } from '@/lib/db/repositories';
import { isDbAvailable } from '@/lib/db/client';

// Cache only metadata (no prices) — 5 min TTL
const META_CACHE_TTL = 300;
function metaCacheKey(q: string, exchange = 'all', type = 'all') {
  return `tk:meta:${exchange.toUpperCase()}:${type.toUpperCase()}:${q.toUpperCase().trim()}`;
}

// Overlay live or EOD Redis prices on top of Postgres results
async function enrichWithLivePrices(results: ReturnType<typeof buildResults>) {
  try {
    const pipe = redis.pipeline();
    for (const r of results) {
      pipe.get(`at:market:quote:${r.exchange}:${r.symbol}`);  // live WS (with TTL)
      pipe.get(`at:market:eod:${r.exchange}:${r.symbol}`);    // EOD bhavcopy (no TTL)
    }
    const raw = await pipe.exec();
    if (!raw) return;
    for (let i = 0; i < results.length; i++) {
      const live = raw[i * 2]?.[1]  as string | null;
      const eod  = raw[i * 2 + 1]?.[1] as string | null;
      const src  = live || eod;
      if (!src) continue;
      try {
        const q = JSON.parse(src) as Record<string, unknown>;
        if (q.ltp        != null) results[i].ltp        = Number(q.ltp);
        if (q.open       != null) results[i].open        = Number(q.open);
        if (q.high       != null) results[i].high        = Number(q.high);
        if (q.low        != null) results[i].low         = Number(q.low);
        if (q.prevClose  != null) results[i].prevClose   = Number(q.prevClose);
        if (q.netChange  != null) results[i].netChange   = Number(q.netChange);
        if (q.changePct  != null) results[i].changePct   = Number(q.changePct);
        if (q.percentChange != null) results[i].changePct = Number(q.percentChange);
        if (q.volume     != null) results[i].volume      = Number(q.volume);
        results[i].priceSource = live ? 'live' : 'eod';
      } catch { /* malformed JSON — skip */ }
    }
  } catch { /* Redis unavailable — prices stay from Postgres */ }
}

function buildResults(rows: Awaited<ReturnType<typeof searchInstrumentsPg>>) {
  return rows.map(r => ({
    token:          r.token,
    exchange:       r.exchange,
    symbol:         r.symbol,
    tradingSymbol:  r.trading_symbol ?? r.symbol,
    name:           r.name ?? r.symbol,
    instrumentType: r.instrument_type,
    segment:        r.segment    ?? undefined,
    expiry:         r.expiry     ?? undefined,
    strike:         r.strike     != null ? Number(r.strike)     : undefined,
    optionType:     r.option_type ?? undefined,
    underlying:     r.underlying  ?? undefined,
    lotSize:        r.lot_size,
    ltp:            r.ltp        != null ? Number(r.ltp)        : undefined,
    open:           r.open_price != null ? Number(r.open_price) : undefined,
    high:           r.high_price != null ? Number(r.high_price) : undefined,
    low:            r.low_price  != null ? Number(r.low_price)  : undefined,
    prevClose:      r.prev_close != null ? Number(r.prev_close) : undefined,
    netChange:      r.net_change != null ? Number(r.net_change) : undefined,
    changePct:      r.change_pct != null ? Number(r.change_pct): undefined,
    volume:         r.volume     != null ? Number(r.volume)     : undefined,
    priceDate:      r.price_date ?? undefined,
    priceSource:    undefined as string | undefined,
  }));
}

export async function GET(request: NextRequest) {
  const q        = (request.nextUrl.searchParams.get('q') ?? '').trim();
  const exchange  = request.nextUrl.searchParams.get('exchange') ?? 'all';
  const type      = request.nextUrl.searchParams.get('type')     ?? 'all';
  const limit     = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 20), 50);

  if (!q || q.length < 1) {
    return NextResponse.json({ results: [], total: 0, source: 'empty' });
  }

  const exFilter   = exchange !== 'all' ? exchange : undefined;
  const typeFilter = type     !== 'all' ? type     : undefined;
  const redisOk    = await isRedisAvailable().catch(() => false);

  // ── 1. Redis metadata cache (no prices — enriched live below) ─────────────
  if (redisOk) {
    try {
      const cached = await redis.get(metaCacheKey(q, exchange, type));
      if (cached) {
        const results: ReturnType<typeof buildResults> = JSON.parse(cached);
        await enrichWithLivePrices(results);
        return NextResponse.json({ results, total: results.length, source: 'redis-cache' });
      }
    } catch { /* fall through */ }
  }

  // ── 2. PostgreSQL query ───────────────────────────────────────────────────
  try {
    if (await isDbAvailable()) {
      const rows = await searchInstrumentsPg(q, { exchange: exFilter, type: typeFilter, limit });
      if (rows.length > 0) {
        const results = buildResults(rows);
        // Cache metadata without prices (prices come from Redis per-request)
        if (redisOk) {
          redis.setex(metaCacheKey(q, exchange, type), META_CACHE_TTL, JSON.stringify(results)).catch(() => {});
        }
        await enrichWithLivePrices(results);
        return NextResponse.json({ results, total: results.length, source: 'postgres' });
      }
    }
  } catch (e) {
    console.warn('[search] PostgreSQL error:', e);
  }

  return NextResponse.json({ results: [], total: 0, source: 'empty' });
}
