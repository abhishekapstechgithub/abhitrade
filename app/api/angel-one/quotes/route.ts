import { NextRequest, NextResponse } from 'next/server';
import { getMarketQuote } from '@/lib/angelone/client';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken, mode = 'FULL', exchangeTokens } = await req.json();
    if (!apiKey || !accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!exchangeTokens) return NextResponse.json({ error: 'exchangeTokens required' }, { status: 400 });

    const data = await getMarketQuote(apiKey, accessToken, mode, exchangeTokens);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
