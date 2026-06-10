export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, getTradingMode } from '@/lib/auth';
import { updateAlert, deleteAlert } from '@/lib/db/repositories';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const body = await req.json();
    const alert = await updateAlert(params.id, userId, body, mode);
    if (!alert) return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
    return NextResponse.json({ alert });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    await deleteAlert(params.id, userId, mode);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
