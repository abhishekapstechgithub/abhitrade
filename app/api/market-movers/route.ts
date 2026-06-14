/**
 * GET  /api/market-movers?type=gainers|losers|volume_shockers|top_by_volume|52w_high|52w_low&limit=50
 *   → Returns rows from market_movers table (Redis → Postgres fallback).
 *   Auto-triggers background sync if data is stale.
 *
 * POST /api/market-movers
 *   → Force-syncs all 6 mover types from Groww immediately.
 *
 * POST /api/market-movers?type=<key>
 *   → Force-syncs a single mover type only.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  getMarketMovers,
  syncMarketMovers,
  syncMoverType,
  isMoversStale,
  MOVER_KEY_TO_CODE,
  type MoverTypeKey,
} from '@/lib/groww-movers';

export const dynamic = 'force-dynamic';

const VALID_TYPES = new Set<MoverTypeKey>([
  'gainers', 'losers', 'volume_shockers', 'top_by_volume', '52w_high', '52w_low',
]);

function resolveType(raw: string | null): MoverTypeKey {
  if (raw && VALID_TYPES.has(raw as MoverTypeKey)) return raw as MoverTypeKey;
  return 'gainers';
}

export async function GET(req: NextRequest) {
  const typeKey = resolveType(req.nextUrl.searchParams.get('type'));
  const limit   = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '50', 10) || 50, 50);
  const typeCode = MOVER_KEY_TO_CODE[typeKey];

  try {
    // Non-blocking background sync if stale
    const stale = await isMoversStale();
    if (stale) {
      syncMarketMovers().catch(e =>
        console.error('[market-movers] background sync error:', e),
      );
    }

    const items = await getMarketMovers(typeCode, limit);
    const fetchedAt = items[0]?.fetched_at ?? null;

    return NextResponse.json(
      { items, fetchedAt, stale, total: items.length, type: typeKey },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[market-movers] GET error:', msg);
    return NextResponse.json({ error: msg, items: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const typeRaw = req.nextUrl.searchParams.get('type');
  try {
    if (typeRaw && VALID_TYPES.has(typeRaw as MoverTypeKey)) {
      const count = await syncMoverType(typeRaw as MoverTypeKey);
      return NextResponse.json({ ok: true, type: typeRaw, count });
    }
    const result = await syncMarketMovers();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[market-movers] sync error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
