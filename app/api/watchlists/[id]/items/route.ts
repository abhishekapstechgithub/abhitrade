export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { getWatchlistItems, addWatchlistItem, getWatchlists } from '@/lib/db/repositories';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    // Verify ownership
    const lists = await getWatchlists(userId);
    if (!lists.find(l => l.id === params.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const items = await getWatchlistItems(params.id);
    return NextResponse.json({ items });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    const lists = await getWatchlists(userId);
    if (!lists.find(l => l.id === params.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const body = await req.json();
    if (!body.symbol || !body.exchange) {
      return NextResponse.json({ error: 'symbol and exchange are required' }, { status: 400 });
    }
    const item = await addWatchlistItem(params.id, body);
    if (!item) return NextResponse.json({ error: 'Already in watchlist' }, { status: 409 });
    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
