/**
 * POST /api/optionchain/quote
 *
 * Feed adapter endpoint — receives raw ticks from your market data source
 * (Kafka consumer, Angel One WebSocket, NSE feed, etc.) and writes them
 * into the Redis quote cache for the option chain service to read.
 *
 * Also handles spot price updates.
 *
 * Body:
 * {
 *   type: 'quotes' | 'spot',
 *   // For type='quotes':
 *   ticks: [{ token, ltp, oi?, changeOi?, volume?, bid?, ask?, iv?, delta?, gamma?, theta?, vega? }],
 *   // For type='spot':
 *   spot:  { symbol, ltp, change, changePct }
 * }
 *
 * GET /api/optionchain/quote?token=1001
 *   Returns the current cached quote for a single token.
 *
 * Security: in production, protect this endpoint with an internal API key
 * or place it behind the Docker internal network only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { pushTicks, setSpot, getQuote } from '@/lib/optionchain/market-data';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { type } = body as { type?: string };

  if (type === 'spot') {
    const { spot } = body as {
      spot: { symbol: string; ltp: number; change: number; changePct: number };
    };
    if (!spot?.symbol || spot.ltp === undefined) {
      return NextResponse.json({ error: 'spot.symbol and spot.ltp are required' }, { status: 400 });
    }
    await setSpot(spot.symbol, { ltp: spot.ltp, change: spot.change ?? 0, changePct: spot.changePct ?? 0 });
    return NextResponse.json({ ok: true, symbol: spot.symbol.toUpperCase(), ltp: spot.ltp });
  }

  if (type === 'quotes') {
    const { ticks } = body as { ticks: unknown[] };
    if (!Array.isArray(ticks) || ticks.length === 0) {
      return NextResponse.json({ error: 'ticks[] array is required' }, { status: 400 });
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const valid = ticks.filter((t: any) => t?.token && t?.ltp !== undefined) as any[];
    await pushTicks(valid);
    return NextResponse.json({ ok: true, pushed: valid.length });
  }

  return NextResponse.json(
    { error: 'type must be "quotes" or "spot"' },
    { status: 400 },
  );
}

export async function GET(req: NextRequest) {
  const tokenStr = req.nextUrl.searchParams.get('token');
  if (!tokenStr) {
    return NextResponse.json({ error: 'token query param required' }, { status: 400 });
  }
  const token = Number(tokenStr);
  if (isNaN(token)) {
    return NextResponse.json({ error: 'token must be a number' }, { status: 400 });
  }
  const quote = await getQuote(token);
  if (!quote) {
    return NextResponse.json({ error: `No quote cached for token ${token}` }, { status: 404 });
  }
  return NextResponse.json(quote);
}
