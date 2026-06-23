/**
 * GET /api/quotes?symbols=NSE:HDFCBANK,NSE:HDFCLIFE
 *
 * Batch quote lookup — accepts one or more "EXCHANGE:SYMBOL" tokens,
 * applies the same 4-tier priority as /api/quote for each one in parallel:
 *   1. Redis live  (at:market:quote:{exchange}:{symbol})
 *   2. Redis EOD   (at:market:eod:{exchange}:{symbol})
 *   3. Postgres market_quotes
 *   4. Postgres security_master
 *
 * Response: { quotes: [ { symbol, exchange, ltp, ... }, ... ] }
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis-client';
import { getPool } from '@/lib/db/client';

const ZERO = (symbol: string, exchange: string) => ({
  symbol, exchange,
  ltp: 0, open: 0, high: 0, low: 0, close: 0,
  netChange: 0, percentChange: 0, volume: 0,
  week52High: 0, week52Low: 0, updatedAt: null, source: 'unavailable',
});

async function lookupOne(symbol: string, exchange: string) {
  // 1. Redis live
  try {
    const raw = await redis.get(`at:market:quote:${exchange}:${symbol}`);
    if (raw) {
      const q = JSON.parse(raw) as Record<string, unknown>;
      return {
        symbol, exchange,
        ltp:           Number(q.ltp           ?? 0),
        open:          Number(q.open          ?? 0),
        high:          Number(q.high          ?? 0),
        low:           Number(q.low           ?? 0),
        close:         Number(q.close         ?? 0),
        netChange:     Number(q.netChange      ?? 0),
        percentChange: Number(q.percentChange  ?? q.changePct ?? 0),
        volume:        Number(q.volume         ?? 0),
        week52High:    Number(q.week52High     ?? 0),
        week52Low:     Number(q.week52Low      ?? 0),
        updatedAt:     q.updatedAt ?? null,
        source:        'live',
      };
    }
  } catch { /* fall through */ }

  // 2. Redis EOD
  try {
    const raw = await redis.get(`at:market:eod:${exchange}:${symbol}`);
    if (raw) {
      const q = JSON.parse(raw) as Record<string, unknown>;
      return {
        symbol, exchange,
        ltp:           Number(q.ltp       ?? 0),
        open:          Number(q.open      ?? 0),
        high:          Number(q.high      ?? 0),
        low:           Number(q.low       ?? 0),
        close:         Number(q.close     ?? 0),
        netChange:     Number(q.netChange  ?? 0),
        percentChange: Number(q.changePct  ?? 0),
        volume:        Number(q.volume     ?? 0),
        week52High:    Number(q.high52w    ?? 0),
        week52Low:     Number(q.low52w     ?? 0),
        updatedAt:     q.updatedAt ?? null,
        source:        'eod',
      };
    }
  } catch { /* fall through */ }

  // 3. Postgres market_quotes
  try {
    const db = getPool('live');
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT ltp, open, high, low, close, net_change, percent_change,
              volume, week52_high, week52_low, synced_at
       FROM market_quotes WHERE symbol = $1 AND exchange = $2 LIMIT 1`,
      [symbol, exchange],
    );
    if (rows.length) {
      const r = rows[0];
      return {
        symbol, exchange,
        ltp:           Number(r.ltp),
        open:          Number(r.open),
        high:          Number(r.high),
        low:           Number(r.low),
        close:         Number(r.close),
        netChange:     Number(r.net_change),
        percentChange: Number(r.percent_change),
        volume:        Number(r.volume),
        week52High:    Number(r.week52_high),
        week52Low:     Number(r.week52_low),
        updatedAt:     r.synced_at,
        source:        'db-live',
      };
    }
  } catch { /* fall through */ }

  // 4. Postgres security_master
  try {
    const db = getPool('live');
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT ltp, open_price, high_price, low_price, close_price,
              net_change, change_pct, volume, price_updated_at
       FROM security_master
       WHERE symbol = $1 AND exchange = $2 AND ltp IS NOT NULL LIMIT 1`,
      [symbol, exchange],
    );
    if (rows.length) {
      const r = rows[0];
      return {
        symbol, exchange,
        ltp:           Number(r.ltp),
        open:          Number(r.open_price),
        high:          Number(r.high_price),
        low:           Number(r.low_price),
        close:         Number(r.close_price),
        netChange:     Number(r.net_change),
        percentChange: Number(r.change_pct),
        volume:        Number(r.volume),
        week52High:    0,
        week52Low:     0,
        updatedAt:     r.price_updated_at,
        source:        'db-eod',
      };
    }
  } catch { /* fall through */ }

  return ZERO(symbol, exchange);
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('symbols') ?? '';
  if (!raw) {
    return NextResponse.json({ error: 'symbols query param required (e.g. NSE:HDFCBANK,BSE:SENSEX)' }, { status: 400 });
  }

  // Parse "NSE:HDFCBANK,NSE:HDFCLIFE" → [{ exchange, symbol }, ...]
  const pairs = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).map(s => {
    const colon = s.indexOf(':');
    if (colon > 0) return { exchange: s.slice(0, colon), symbol: s.slice(colon + 1) };
    return { exchange: 'NSE', symbol: s };
  });

  if (pairs.length === 0) {
    return NextResponse.json({ error: 'No valid symbols provided' }, { status: 400 });
  }

  const quotes = await Promise.all(pairs.map(p => lookupOne(p.symbol, p.exchange)));

  return NextResponse.json({ quotes });
}
