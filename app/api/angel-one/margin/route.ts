import { NextRequest, NextResponse } from 'next/server';
import { getOrderMargin } from '@/lib/angelone/client';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken, positions } = await req.json();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!Array.isArray(positions) || positions.length === 0) {
      return NextResponse.json({ error: 'positions array required' }, { status: 400 });
    }

    const data = await getOrderMargin(apiKey, accessToken, positions);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
