/**
 * GET /api/optionchain/greeks?symbol=NIFTY&expiry=2025-06-26
 *
 * Fetches Option Greeks (Delta, Gamma, Theta, Vega, IV) from Angel One's
 * SmartAPI for a given underlying + expiry, writes them into the Redis quote
 * cache, and returns the enriched data.
 *
 * The option chain service (`buildOptionChain`) reads from the same Redis
 * cache, so calling this endpoint first ensures real Greeks appear in the chain.
 *
 * Response shape:
 * {
 *   symbol:    "NIFTY",
 *   expiry:    "2025-06-26",
 *   source:    "live" | "unavailable",
 *   written:   42,       // number of tokens updated in Redis
 *   rows: [
 *     { strike: 24500, optionType: "CE", iv: 16.33, delta: 0.492,
 *       gamma: 0.0028, theta: -4.09, vega: 2.30, volume: 24048 },
 *     ...
 *   ]
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAngelSession }           from '@/lib/angelone/auth';
import { getOptionGreeks }           from '@/lib/angelone/client';
import { getStrikes }                from '@/lib/optionchain/security-master';
import { getSpot }                   from '@/lib/optionchain/market-data';
import { writeGreeks, GreeksTick }   from '@/lib/optionchain/market-data';
import { redis }                     from '@/lib/redis-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Expiry format conversion: "2025-06-26" → "26JUN2025"
function toAngelExpiry(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN',
                  'JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${d}${MONTHS[Number(m) - 1]}${y}`;
}

// Cache key: avoid hammering Angel One on every chain request
const greeksKey = (sym: string, exp: string) => `oc:greeks:${sym}:${exp}`;
const GREEKS_CACHE_TTL = 180; // 3 minutes — Greeks change slowly

export async function GET(req: NextRequest) {
  const p      = req.nextUrl.searchParams;
  const symbol = (p.get('symbol') ?? '').trim().toUpperCase();
  const expiry = (p.get('expiry') ?? '').trim();

  if (!symbol || !expiry) {
    return NextResponse.json(
      { error: 'symbol and expiry (YYYY-MM-DD) are required' },
      { status: 400 },
    );
  }

  // ── Serve from short-lived cache to avoid hammering Angel One ────────────────
  try {
    const cached = await redis.get(greeksKey(symbol, expiry));
    if (cached) {
      return NextResponse.json(JSON.parse(cached), {
        headers: { 'X-Greeks-Source': 'cache' },
      });
    }
  } catch { /* Redis unavailable — proceed to live fetch */ }

  // ── Angel One session ─────────────────────────────────────────────────────────
  const apiKey     = process.env.ANGELONE_API_KEY      ?? '';
  const clientId   = process.env.ANGELONE_CLIENT_ID    ?? '';
  const password   = process.env.ANGELONE_PASSWORD      ?? '';
  const totpSecret = process.env.ANGELONE_TOTP_SECRET  ?? '';

  if (!apiKey || !clientId || !password || !totpSecret) {
    return NextResponse.json(
      { error: 'Angel One credentials not configured', source: 'unavailable', symbol, expiry, rows: [] },
      { status: 503 },
    );
  }

  let session: { accessToken: string; feedToken: string };
  try {
    session = await getAngelSession(apiKey, clientId, password, totpSecret);
  } catch (err) {
    console.error('[/api/optionchain/greeks] session error:', (err as Error).message);
    return NextResponse.json(
      { error: 'Could not authenticate with Angel One', detail: (err as Error).message,
        source: 'unavailable', symbol, expiry, rows: [] },
      { status: 502 },
    );
  }

  // ── Fetch Greeks from Angel One ───────────────────────────────────────────────
  const angelExpiry = toAngelExpiry(expiry);
  let rawGreeks: Awaited<ReturnType<typeof getOptionGreeks>>;

  try {
    rawGreeks = await getOptionGreeks(
      apiKey, session.accessToken,
      symbol,       // "NIFTY" / "TCS" etc.
      angelExpiry,  // "26JUN2025"
    );
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[/api/optionchain/greeks] Angel One error for ${symbol} ${angelExpiry}:`, msg);
    return NextResponse.json(
      { error: 'Angel One Greeks API failed', detail: msg,
        source: 'unavailable', symbol, expiry, rows: [] },
      { status: 502 },
    );
  }

  if (!rawGreeks || rawGreeks.length === 0) {
    return NextResponse.json(
      { symbol, expiry, source: 'unavailable', written: 0, rows: [],
        message: `No Greeks data returned for ${symbol} ${angelExpiry}` },
    );
  }

  // ── Map to tokens via security master ─────────────────────────────────────────
  const [strikePairs, spotData] = await Promise.all([
    getStrikes(symbol, expiry),
    getSpot(symbol),
  ]);

  const ticks: GreeksTick[]                  = [];
  const rows:  Array<Record<string, unknown>> = [];

  for (const g of rawGreeks) {
    const strike    = parseFloat(g.strikePrice);
    const optType   = g.optionType as 'CE' | 'PE';
    const iv        = parseFloat(g.impliedVolatility);
    const delta     = parseFloat(g.delta);
    const gamma     = parseFloat(g.gamma);
    const theta     = parseFloat(g.theta);
    const vega      = parseFloat(g.vega);
    const volume    = parseFloat(g.tradeVolume);

    // Build response row regardless of token availability
    rows.push({ strike, optionType: optType, iv, delta, gamma, theta, vega, volume });

    // Look up token so we can write to Redis
    const pair = strikePairs?.get(strike);
    if (!pair) continue; // strike not in security master — skip Redis write

    const token        = optType === 'CE' ? pair.ceToken  : pair.peToken;
    const tradingSymbol = optType === 'CE' ? pair.ceSymbol : pair.peSymbol;
    if (!token) continue;

    ticks.push({
      token,
      tradingSymbol,
      strike,
      optType,
      spot:   spotData.ltp,
      iv,
      delta,
      gamma,
      theta,
      vega,
      volume,
    });
  }

  // ── Write Greeks into Redis quote cache ───────────────────────────────────────
  const written = await writeGreeks(ticks);

  const result = { symbol, expiry, source: 'live' as const, written, rows };

  // Cache the result so repeated chain builds within 3 min don't re-call Angel One
  try {
    await redis.set(greeksKey(symbol, expiry), JSON.stringify(result), 'EX', GREEKS_CACHE_TTL);
  } catch { /* non-fatal */ }

  return NextResponse.json(result, {
    headers: {
      'Cache-Control': `public, s-maxage=${GREEKS_CACHE_TTL}`,
      'X-Greeks-Source': 'live',
      'X-Greeks-Written': String(written),
    },
  });
}
