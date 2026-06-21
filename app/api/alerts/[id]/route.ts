export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { updateAlert, deleteAlert } from '@/lib/db/repositories';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    const body = await req.json();
    const alert = await updateAlert(params.id, userId, body);
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
    await deleteAlert(params.id, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
