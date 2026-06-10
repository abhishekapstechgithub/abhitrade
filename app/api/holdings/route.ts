export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, getTradingMode } from '@/lib/auth';
import { getHoldings } from '@/lib/db/repositories';

export async function GET(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const holdings = await getHoldings(userId, mode);
    return NextResponse.json({ holdings, mode });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error('[holdings GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
