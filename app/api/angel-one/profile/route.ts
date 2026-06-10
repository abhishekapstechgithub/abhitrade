import { NextRequest, NextResponse } from 'next/server';
import { getProfile, getRMS } from '@/lib/angelone/client';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken } = await req.json();
    if (!apiKey || !accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const [profile, rms] = await Promise.all([
      getProfile(apiKey, accessToken),
      getRMS(apiKey, accessToken),
    ]);

    return NextResponse.json({ profile, rms });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
