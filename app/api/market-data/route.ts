export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getMarketQuote } from '@/lib/angelone/client';
import { toApiExchange } from '@/lib/angelone/tokens';
import { getAngelSession } from '@/lib/angelone/auth';

// ── POST /api/market-data ─────────────────────────────────────────────────────
// Body: { tokens: Array<{ exchange: string; token: string; instrumentType?: string }> }
// Mode: 'LTP' | 'OHLC' | 'FULL'  (default FULL)
// Returns normalised quote objects keyed by token
export interface LiveQuote {
  token:         string;
  exchange:      string;
  tradingSymbol: string;
  ltp:           number;
  open:          number;
  high:          number;
  low:           number;
  close:         number;
  netChange:     number;
  percentChange: number;
  volume:        number;
  avgPrice:      number;
  oi:            number;
  week52High:    number;
  week52Low:     number;
  bid:           number;
  ask:           number;
  upperCircuit:  number;
  lowerCircuit:  number;
}

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    tokens: Array<{ exchange: string; token: string; instrumentType?: string }>;
    mode?: 'LTP' | 'OHLC' | 'FULL';
  };
  const { tokens = [], mode = 'FULL' } = body;

  if (!tokens.length) {
    return NextResponse.json({ quotes: {}, error: 'No tokens provided' });
  }

  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;

  if (!apiKey || !clientId || !password || !totpSecret) {
    return NextResponse.json(
      { quotes: {}, error: 'AngelOne credentials not configured' },
      { status: 503 },
    );
  }

  // Group tokens by the correct AngelOne exchange segment
  // (NSE equities → "NSE", NSE F&O → "NFO", BSE equities → "BSE", BSE F&O → "BFO")
  const exchangeTokens: Record<string, string[]> = {};
  // Map token → original exchange (so we can tag results correctly)
  const tokenMeta: Record<string, { exchange: string; apiExchange: string }> = {};

  for (const { exchange, token, instrumentType = 'EQ' } of tokens) {
    const apiExch = toApiExchange(exchange, instrumentType);
    if (!exchangeTokens[apiExch]) exchangeTokens[apiExch] = [];
    if (!exchangeTokens[apiExch].includes(token)) {
      exchangeTokens[apiExch].push(token);
    }
    tokenMeta[token] = { exchange: exchange.toUpperCase(), apiExchange: apiExch };
  }

  try {
    const session     = await getAngelSession(apiKey, clientId, password, totpSecret);
    const result      = await getMarketQuote(apiKey, session.accessToken, mode, exchangeTokens);
    const fetched     = result?.fetched ?? [];

    const quotes: Record<string, LiveQuote> = {};
    for (const q of fetched) {
      const tk  = q.symbolToken;
      const exch = tokenMeta[tk]?.exchange ?? q.exchange;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const full = q as any;
      quotes[tk] = {
        token:         tk,
        exchange:      exch,
        tradingSymbol: q.tradingSymbol,
        ltp:           q.ltp            ?? 0,
        open:          q.open           ?? 0,
        high:          q.high           ?? 0,
        low:           q.low            ?? 0,
        close:         q.close          ?? 0,
        netChange:     q.netChange      ?? 0,
        percentChange: q.percentChange  ?? 0,
        volume:        q.tradeVolume    ?? 0,
        avgPrice:      q.avgPrice       ?? 0,
        oi:            q.opnInterest    ?? 0,
        week52High:    full['52WeekHigh'] ?? 0,
        week52Low:     full['52WeekLow']  ?? 0,
        bid:           full.depth?.buy?.[0]?.price  ?? 0,
        ask:           full.depth?.sell?.[0]?.price ?? 0,
        upperCircuit:  parseFloat(full.upperCircuit ?? '0') || 0,
        lowerCircuit:  parseFloat(full.lowerCircuit ?? '0') || 0,
      };
    }

    return NextResponse.json({ quotes, unfetched: result?.unfetched ?? [] });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ quotes: {}, error: msg }, { status: 500 });
  }
}
