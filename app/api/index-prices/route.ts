export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getIndexPrices } from '@/lib/market-sync';

// GET /api/index-prices
// Returns latest NIFTY/SENSEX/BANKNIFTY/etc. from Redis (written by 60-s server sync)
export async function GET() {
  try {
    const prices = await getIndexPrices();
    return NextResponse.json({ prices });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ prices: {}, error: msg }, { status: 500 });
  }
}
