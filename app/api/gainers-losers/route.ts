export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis-client';
import { getAngelSession } from '@/lib/angelone/auth';
import { getGainersLosers } from '@/lib/angelone/client';

const CACHE_TTL = 28_800; // 8-hour cache — data persists outside market hours

export interface GainerLoserItem {
  symbol:        string;
  tradingSymbol: string;
  token:         string;
  exchange:      string;
  ltp:           number;
  netChange:     number;
  percentChange: number;
  volume:        number;
  open:          number;
  high:          number;
  low:           number;
  close:         number;
}

// GET /api/gainers-losers?type=gainers|losers&limit=10
export async function GET(req: NextRequest) {
  const type  = req.nextUrl.searchParams.get('type') ?? 'gainers';
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') ?? '10'), 25);
  const cacheKey = `at:gl:${type}`;

  // Redis cache first
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return NextResponse.json({ items: JSON.parse(cached), source: 'cache' });
  } catch { /* ignore */ }

  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;

  if (!apiKey || !clientId || !password || !totpSecret) {
    return NextResponse.json({ items: [], error: 'AngelOne credentials not configured' }, { status: 503 });
  }

  try {
    const session  = await getAngelSession(apiKey, clientId, password, totpSecret);
    const datatype = type === 'losers' ? 'PercPriceLosers' : 'PercPriceGainers';
    // callApi in client.ts already extracts json.data, so result is the array directly
    const raw = await getGainersLosers(apiKey, session.accessToken, datatype) as Array<{
      tradingSymbol: string; symbolToken: string; exchange: string;
      ltp: number; netChange: number; percentChange: number;
      open: number; high: number; low: number; close: number; tradeVolume?: number;
    }> | null;

    if (!Array.isArray(raw) || !raw.length) {
      return NextResponse.json({ items: [], error: 'No data from AngelOne' });
    }

    const items: GainerLoserItem[] = raw.slice(0, limit).map(r => ({
      symbol:        r.tradingSymbol.replace(/-EQ$|-BE$/, ''),
      tradingSymbol: r.tradingSymbol,
      token:         r.symbolToken,
      exchange:      r.exchange,
      ltp:           r.ltp,
      netChange:     r.netChange,
      percentChange: r.percentChange,
      volume:        r.tradeVolume ?? 0,
      open:          r.open,
      high:          r.high,
      low:           r.low,
      close:         r.close,
    }));

    await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(items)).catch(() => {});
    return NextResponse.json({ items, source: 'angelone' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ items: [], error: msg }, { status: 500 });
  }
}
