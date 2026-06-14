/**
 * GET /api/quote?symbol=RELIANCE&exchange=NSE
 *
 * Priority: Redis live → Redis EOD → Postgres market_quotes → Postgres security_master
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis-client';
import { getPool } from '@/lib/db/client';

const ZERO_QUOTE = {
  ltp: 0, open: 0, high: 0, low: 0, close: 0,
  netChange: 0, percentChange: 0, volume: 0,
  week52High: 0, week52Low: 0, updatedAt: null, source: 'unavailable',
};

export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')?.toUpperCase() ?? '';
  const exchange = req.nextUrl.searchParams.get('exchange')?.toUpperCase() ?? 'NSE';

  if (!symbol) return NextResponse.json({ error: 'symbol required' }, { status: 400 });

  // ── 1. Redis live (AngelOne WS, TTL=3600s) ────────────────────────────────
  try {
    const live = await redis.get(`at:market:quote:${exchange}:${symbol}`);
    if (live) {
      const q = JSON.parse(live) as Record<string, unknown>;
      return NextResponse.json({
        symbol, exchange,
        ltp:           Number(q.ltp          ?? 0),
        open:          Number(q.open         ?? 0),
        high:          Number(q.high         ?? 0),
        low:           Number(q.low          ?? 0),
        close:         Number(q.close        ?? 0),
        netChange:     Number(q.netChange    ?? 0),
        percentChange: Number(q.percentChange ?? q.changePct ?? 0),
        volume:        Number(q.volume       ?? 0),
        week52High:    Number(q.week52High   ?? 0),
        week52Low:     Number(q.week52Low    ?? 0),
        updatedAt:     q.updatedAt ?? null,
        source:        'live',
      });
    }
  } catch { /* fall through */ }

  // ── 2. Redis EOD (bhavcopy sync, no TTL) ─────────────────────────────────
  try {
    const eod = await redis.get(`at:market:eod:${exchange}:${symbol}`);
    if (eod) {
      const q = JSON.parse(eod) as Record<string, unknown>;
      return NextResponse.json({
        symbol, exchange,
        ltp:           Number(q.ltp          ?? 0),
        open:          Number(q.open         ?? 0),
        high:          Number(q.high         ?? 0),
        low:           Number(q.low          ?? 0),
        close:         Number(q.close        ?? 0),
        netChange:     Number(q.netChange    ?? 0),
        percentChange: Number(q.changePct    ?? 0),
        volume:        Number(q.volume       ?? 0),
        week52High:    Number(q.high52w      ?? 0),
        week52Low:     Number(q.low52w       ?? 0),
        updatedAt:     q.updatedAt ?? null,
        source:        'eod',
      });
    }
  } catch { /* fall through */ }

  // ── 3. Postgres market_quotes (live sync table) ───────────────────────────
  try {
    const { rows } = await getPool('live').query<Record<string, unknown>>(
      `SELECT ltp, open, high, low, close, net_change, percent_change,
              volume, week52_high, week52_low, synced_at
       FROM market_quotes WHERE symbol = $1 AND exchange = $2 LIMIT 1`,
      [symbol, exchange],
    );
    if (rows.length) {
      const r = rows[0];
      return NextResponse.json({
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
      });
    }
  } catch { /* fall through */ }

  // ── 4. Postgres security_master (bhavcopy prices) ────────────────────────
  try {
    const { rows } = await getPool('live').query<Record<string, unknown>>(
      `SELECT ltp, open_price, high_price, low_price, close_price,
              net_change, change_pct, volume, price_updated_at
       FROM security_master WHERE symbol = $1 AND exchange = $2 AND ltp IS NOT NULL LIMIT 1`,
      [symbol, exchange],
    );
    if (rows.length) {
      const r = rows[0];
      return NextResponse.json({
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
      });
    }
  } catch { /* fall through */ }

  return NextResponse.json({ symbol, exchange, ...ZERO_QUOTE });
}
