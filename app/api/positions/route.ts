export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { getPositions } from '@/lib/db/repositories';

export async function GET(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const date = req.nextUrl.searchParams.get('date') ?? undefined;
    const positions = await getPositions(userId, { date });
    return NextResponse.json({ positions });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error('[positions GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
