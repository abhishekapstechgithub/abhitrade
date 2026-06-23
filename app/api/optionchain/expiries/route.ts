/**
 * GET /api/optionchain/expiries?symbol=NIFTY
 * GET /api/optionchain/expiries?symbol=HDFCBANK&exchange=NSE
 * GET /api/optionchain/expiries?symbol=HDFCBANK&exchange=BSE
 *
 * Returns sorted list of available expiry dates for the given underlying,
 * sourced directly from angle_scrip (AngelOne scrip master).
 *
 * exchange param:
 *   NSE (default) → exch_seg IN ('NSE','NFO')
 *   BSE           → exch_seg IN ('BSE','BFO')
 *   omitted       → both exchanges combined
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOptionExpiries }         from '@/lib/optionchain/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const symbol   = (req.nextUrl.searchParams.get('symbol')   ?? '').trim().toUpperCase();
  const exchange = (req.nextUrl.searchParams.get('exchange') ?? '').trim().toUpperCase() || undefined;

  if (!symbol) {
    return NextResponse.json(
      { error: 'symbol is required', example: '/api/optionchain/expiries?symbol=NIFTY&exchange=NSE' },
      { status: 400 },
    );
  }

  try {
    const result = await getOptionExpiries(symbol, exchange);

    if (result.expiries.length === 0) {
      return NextResponse.json(
        { error: `No expiries found for symbol: ${symbol}${exchange ? ` on ${exchange}` : ''}` },
        { status: 404 },
      );
    }

    return NextResponse.json(result, {
      headers: {
        // Expiries change infrequently — 60s server cache, 30s stale-while-revalidate
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=30',
      },
    });
  } catch (err) {
    console.error('[/api/optionchain/expiries]', err);
    return NextResponse.json(
      { error: 'Internal server error', detail: (err as Error).message },
      { status: 500 },
    );
  }
}
