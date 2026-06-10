import { NextRequest, NextResponse } from 'next/server';
import { searchScrip, getMarketQuote } from '@/lib/angelone/client';

export async function POST(req: NextRequest) {
  try {
    const { apiKey, accessToken, symbol, exchange = 'NSE' } = await req.json();
    if (!apiKey || !accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    if (!symbol) {
      return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    }

    // Step 1 — find the instrument token via search
    const results = await searchScrip(apiKey, accessToken, exchange, symbol);
    if (!results || results.length === 0) {
      return NextResponse.json({ error: `Symbol "${symbol}" not found on ${exchange}` }, { status: 404 });
    }

    // Prefer equity (EQ/INDEX) match; fall back to first result
    const scrip =
      results.find(r => r.instrumenttype === 'EQ') ??
      results.find(r => r.instrumenttype === 'INDEX') ??
      results[0];

    // Step 2 — fetch live quote
    const quote = await getMarketQuote(apiKey, accessToken, 'FULL', {
      [scrip.exchange]: [scrip.symboltoken],
    });

    const fetched = quote.fetched?.[0];
    if (!fetched) {
      return NextResponse.json({ error: 'Quote not available for this symbol' }, { status: 404 });
    }

    return NextResponse.json({
      ltp: fetched.ltp,
      open: fetched.open,
      high: fetched.high,
      low: fetched.low,
      close: fetched.close,
      netChange: fetched.netChange,
      percentChange: fetched.percentChange,
      volume: fetched.tradeVolume,
      token: scrip.symboltoken,
      tradingsymbol: scrip.tradingsymbol,
      exchange: scrip.exchange,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
