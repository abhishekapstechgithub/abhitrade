export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, AuthError } from '@/lib/auth';
import { getOrders, createOrder } from '@/lib/db/repositories';

export async function GET(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const status = req.nextUrl.searchParams.get('status') ?? undefined;
    const limit  = Math.min(Number(req.nextUrl.searchParams.get('limit') ?? 50), 200);
    const offset = Number(req.nextUrl.searchParams.get('offset') ?? 0);
    const orders = await getOrders(userId, { status, limit, offset });
    return NextResponse.json({ orders });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error('[orders GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sub: userId } = await requireAuth(req);
    const body = await req.json();
    const required = ['exchange', 'symbol', 'transaction_type', 'order_type', 'product_type', 'quantity'];
    for (const field of required) {
      if (!body[field]) return NextResponse.json({ error: `${field} is required` }, { status: 400 });
    }
    const order = await createOrder(userId, body);
    return NextResponse.json({ order }, { status: 201 });
  } catch (err) {
    if (err instanceof AuthError) return NextResponse.json({ error: err.message }, { status: 401 });
    console.error('[orders POST]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
