export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, getTradingMode } from '@/lib/auth';
import { getWatchlists, createWatchlist } from '@/lib/db/repositories';

export async function GET(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const lists = await getWatchlists(userId, mode);
    return NextResponse.json({ watchlists: lists, mode });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error('[watchlists GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const list = await createWatchlist(userId, name.trim(), mode);
    return NextResponse.json({ watchlist: list, mode }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error('[watchlists POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
