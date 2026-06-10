export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError, getTradingMode } from '@/lib/auth';
import { updateOrder, cancelOrder } from '@/lib/db/repositories';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const body = await req.json();
    const order = await updateOrder(params.id, userId, body, mode);
    if (!order) return NextResponse.json({ error: 'Order not found or not modifiable' }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { sub: userId } = await requireAuth(req);
    const mode = getTradingMode(req);
    const order = await cancelOrder(params.id, userId, mode);
    if (!order) return NextResponse.json({ error: 'Order not found or already terminal' }, { status: 404 });
    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
