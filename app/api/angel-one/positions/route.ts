import { NextRequest, NextResponse } from 'next/server';
import { getPosition } from '@/lib/angelone/client';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken } = await req.json();
    if (!apiKey || !accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const positions = await getPosition(apiKey, accessToken);
    return NextResponse.json({ positions: positions ?? [] });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
