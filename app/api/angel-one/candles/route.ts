import { NextRequest, NextResponse } from 'next/server';
import { getCandleData, CandleInterval } from '@/lib/angelone/client';
import { candleDateRange, TF_TO_INTERVAL } from '@/lib/angelone/tokens';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken, exchange, symboltoken, timeframe } = await req.json();
    if (!apiKey || !accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    if (!exchange || !symboltoken) return NextResponse.json({ error: 'exchange and symboltoken required' }, { status: 400 });

    const interval = (TF_TO_INTERVAL[timeframe] ?? 'ONE_DAY') as CandleInterval;
    const { from, to } = candleDateRange(interval);

    const candles = await getCandleData(apiKey, accessToken, exchange, symboltoken, interval, from, to);

    // candles is array of [timestamp, open, high, low, close, volume]
    return NextResponse.json({ candles: candles ?? [], interval, from, to });
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 500 });
  }
}
