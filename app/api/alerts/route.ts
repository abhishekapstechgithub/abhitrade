export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, getTradingMode } from '@/lib/auth';
import { getAlerts, createAlert } from '@/lib/db/repositories';

export async function GET(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const status = req.nextUrl.searchParams.get('status') ?? undefined;
    const alerts = await getAlerts(userId, status, mode);
    return NextResponse.json({ alerts, mode });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const body = await req.json();
    const required = ['exchange', 'symbol', 'condition', 'target_value'];
    for (const field of required) {
      if (body[field] == null) return NextResponse.json({ error: `${field} is required` }, { status: 400 });
    }
    const alert = await createAlert(userId, body, mode);
    return NextResponse.json({ alert, mode }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
