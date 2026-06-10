import { NextRequest, NextResponse } from 'next/server';
import { getOrderBook, getTradeBook } from '@/lib/angelone/client';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken } = await req.json();
    if (!apiKey || !accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [orders, trades] = await Promise.all([
      getOrderBook(apiKey, accessToken).catch(() => []),
      getTradeBook(apiKey, accessToken).catch(() => []),
    ]);

    return NextResponse.json({ orders: orders ?? [], trades: trades ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
