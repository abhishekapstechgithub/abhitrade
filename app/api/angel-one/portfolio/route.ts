import { NextRequest, NextResponse } from 'next/server';
import { getAllHolding, getRMS } from '@/lib/angelone/client';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken } = await req.json();
    if (!apiKey || !accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [holdingData, rms] = await Promise.all([
      getAllHolding(apiKey, accessToken),
      getRMS(apiKey, accessToken),
    ]);

    return NextResponse.json({ holdingData, rms });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
