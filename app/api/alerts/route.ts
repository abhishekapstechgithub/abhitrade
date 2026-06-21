export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { getAlerts, createAlert } from '@/lib/db/repositories';

export async function GET(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const status = req.nextUrl.searchParams.get('status') ?? undefined;
    const alerts = await getAlerts(userId, status);
    return NextResponse.json({ alerts });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const body = await req.json();
    const required = ['exchange', 'symbol', 'condition', 'target_value'];
    for (const field of required) {
      if (body[field] == null) return NextResponse.json({ error: `${field} is required` }, { status: 400 });
    }
    const alert = await createAlert(userId, body);
    return NextResponse.json({ alert }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
