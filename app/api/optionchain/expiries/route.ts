/**
 * GET /api/optionchain/expiries?symbol=NIFTY
 *
 * Returns sorted list of available expiry dates for the given underlying.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOptionExpiries }         from '@/lib/optionchain/service';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const symbol = (req.nextUrl.searchParams.get('symbol') ?? '').trim().toUpperCase();

  if (!symbol) {
    return NextResponse.json(
      { error: 'symbol is required', example: '/api/optionchain/expiries?symbol=NIFTY' },
      { status: 400 },
    );
  }

  try {
    const result = await getOptionExpiries(symbol);

    if (result.expiries.length === 0) {
      return NextResponse.json(
        { error: `No expiries found for symbol: ${symbol}` },
        { status: 404 },
      );
    }

    return NextResponse.json(result, {
      headers: {
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
