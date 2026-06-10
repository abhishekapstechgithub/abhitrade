export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, getTradingMode } from '@/lib/auth';
import { updateWatchlist, deleteWatchlist } from '@/lib/db/repositories';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const data = await req.json();
    const list = await updateWatchlist(params.id, userId, data, mode);
    if (!list) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ watchlist: list });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    await deleteWatchlist(params.id, userId, mode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
