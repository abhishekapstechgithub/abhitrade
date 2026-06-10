export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { removeWatchlistItem, getWatchlists } from '@/lib/db/repositories';

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; itemId: string } },
) {
  try {
    const { sub: userId } = await requireAuth(req);
    const lists = await getWatchlists(userId);
    if (!lists.find(l => l.id === params.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await removeWatchlistItem(params.itemId, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
