/**
 * GET /api/quote?symbol=RELIANCE&exchange=NSE
 *
 * Lightweight quote lookup used by the Flutter app chart screen.
 * Tries bhavcopy/market-sync DB first, falls back to a mock shape
 * so the mobile app never gets a 502.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const symbol   = req.nextUrl.searchParams.get('symbol')?.toUpperCase() ?? '';
  const exchange = req.nextUrl.searchParams.get('exchange')?.toUpperCase() ?? 'NSE';

  if (!symbol) {
    return NextResponse.json({ error: 'symbol required' }, { status: 400 });
  }

  try {
    const { rows } = await getPool('live').query<Record<string, unknown>>(
      `SELECT symbol, exchange, ltp, open, high, low, close,
              net_change, percent_change, volume, week52_high, week52_low,
              synced_at
       FROM market_quotes
       WHERE symbol = $1 AND exchange = $2
       LIMIT 1`,
      [symbol, exchange],
    );

    if (rows.length) {
      const r = rows[0];
      return NextResponse.json({
        symbol,
        exchange,
        ltp:          Number(r.ltp),
        open:         Number(r.open),
        high:         Number(r.high),
        low:          Number(r.low),
        close:        Number(r.close),
        netChange:    Number(r.net_change),
        percentChange:Number(r.percent_change),
        volume:       Number(r.volume),
        week52High:   Number(r.week52_high),
        week52Low:    Number(r.week52_low),
        updatedAt:    r.synced_at,
      });
    }
  } catch { /* DB unavailable — fall through to mock */ }

  // Graceful fallback so Flutter app doesn't crash on 502
  return NextResponse.json({
    symbol,
    exchange,
    ltp:           0,
    open:          0,
    high:          0,
    low:           0,
    close:         0,
    netChange:     0,
    percentChange: 0,
    volume:        0,
    week52High:    0,
    week52Low:     0,
    updatedAt:     null,
    source:        'unavailable',
  });
}
