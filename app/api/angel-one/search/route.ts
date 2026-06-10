import { NextRequest, NextResponse } from 'next/server';
import { searchScrip } from '@/lib/angelone/client';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken, exchange = 'NSE', query } = await req.json();
    if (!apiKey || !accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!query) return NextResponse.json({ results: [] });

    // Search across NSE and BSE simultaneously
    const [nse, bse] = await Promise.allSettled([
      exchange === 'NSE' || exchange === 'ALL' ? searchScrip(apiKey, accessToken, 'NSE', query) : Promise.resolve([]),
      exchange === 'BSE' || exchange === 'ALL' ? searchScrip(apiKey, accessToken, 'BSE', query) : Promise.resolve([]),
    ]);

    const results = [
      ...(nse.status === 'fulfilled' ? nse.value ?? [] : []),
      ...(bse.status === 'fulfilled' ? bse.value ?? [] : []),
    ];

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
