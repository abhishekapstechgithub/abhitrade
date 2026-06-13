/**
 * GET  /api/market-movers?type=gainers|losers&limit=50
 *   → Returns rows from market_movers table.
 *   Auto-syncs from Groww if data is older than 5 minutes.
 *
 * POST /api/market-movers
 *   → Force-syncs both gainers and losers from Groww immediately.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMarketMovers, syncMarketMovers, isMoversStale } from '@/lib/groww-movers';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const type  = req.nextUrl.searchParams.get('type') ?? 'gainers';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 50);
  const isGainer = type !== 'losers';

  try {
    // Trigger background sync if data is stale — Redis TTL check is primary
    const stale = await isMoversStale();
    if (stale) {
      // Non-blocking: serve whatever is in DB while sync runs
      syncMarketMovers().catch(e => console.error('[market-movers] background sync error:', e));
    }

    const items = await getMarketMovers(isGainer, limit);
    const fetchedAt = items[0]?.fetched_at ?? null;

    return NextResponse.json(
      { items, fetchedAt, stale, total: items.length },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[market-movers] GET error:', msg);
    return NextResponse.json({ error: msg, items: [] }, { status: 500 });
  }
}

export async function POST() {
  try {
    const result = await syncMarketMovers();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[market-movers] sync error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
