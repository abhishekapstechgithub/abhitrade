/**
 * GET /api/tokens/ltp?tokens=1333,3045,99926000
 *
 * Batch token-number LTP lookup used by Flutter watchlist.
 * Flutter sends instrument token IDs (e.g. "1333" = HDFCBANK NSE token).
 *
 * Resolution order:
 *  1. Redis  at:market:quote:token:{token}  (written by market-sync every 60 s)
 *  2. Postgres market_quotes WHERE token = $1
 *  3. Graceful zero — never 404/500
 *
 * Response shape:
 *   { prices: { "1333": { ltp, change_pct, close, open, high, low, volume, token }, ... } }
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis-client';
import { getPool } from '@/lib/db/client';

interface TokenPrice {
  ltp:        number;
  change_pct: number;
  close:      number;
  open:       number;
  high:       number;
  low:        number;
  volume:     number;
  net_change: number;
  token:      string;
  source:     string;
}

const ZERO = (token: string): TokenPrice => ({
  ltp: 0, change_pct: 0, close: 0, open: 0,
  high: 0, low: 0, volume: 0, net_change: 0,
  token, source: 'unavailable',
});

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('tokens') ?? '';
  if (!raw.trim()) {
    return NextResponse.json(
      { error: 'tokens query param required (comma-separated instrument token IDs)' },
      { status: 400 }
    );
  }

  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  if (!tokens.length) {
    return NextResponse.json({ prices: {} });
  }

  // 1. Bulk Redis lookup
  const pipeline = redis.pipeline();
  for (const t of tokens) pipeline.get(`at:market:quote:token:${t}`);
  const redisResults = await pipeline.exec().catch(() => null);

  const prices: Record<string, TokenPrice> = {};
  const missingTokens: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const val = redisResults?.[i]?.[1];
    if (val) {
      try {
        const q = JSON.parse(String(val)) as Record<string, unknown>;
        prices[tokens[i]] = {
          ltp:        Number(q.ltp          ?? 0),
          change_pct: Number(q.percentChange ?? q.changePct ?? 0),
          close:      Number(q.close        ?? 0),
          open:       Number(q.open         ?? 0),
          high:       Number(q.high         ?? 0),
          low:        Number(q.low          ?? 0),
          volume:     Number(q.volume       ?? 0),
          net_change: Number(q.netChange    ?? 0),
          token:      tokens[i],
          source:     'live',
        };
      } catch {
        missingTokens.push(tokens[i]);
      }
    } else {
      missingTokens.push(tokens[i]);
    }
  }

  // 2. Postgres fallback for cache misses
  if (missingTokens.length > 0) {
    try {
      const db = getPool('live');
      const { rows } = await db.query<Record<string, unknown>>(
        `SELECT token, ltp, open, high, low, close,
                net_change, percent_change, volume
         FROM market_quotes WHERE token = ANY($1)`,
        [missingTokens]
      );
      const dbMap = new Map(rows.map(r => [String(r.token), r]));
      for (const t of missingTokens) {
        const r = dbMap.get(t);
        if (r) {
          prices[t] = {
            ltp:        Number(r.ltp),
            change_pct: Number(r.percent_change),
            close:      Number(r.close),
            open:       Number(r.open),
            high:       Number(r.high),
            low:        Number(r.low),
            volume:     Number(r.volume),
            net_change: Number(r.net_change),
            token:      t,
            source:     'db',
          };
        } else {
          prices[t] = ZERO(t);
        }
      }
    } catch {
      for (const t of missingTokens) {
        if (!prices[t]) prices[t] = ZERO(t);
      }
    }
  }

  return NextResponse.json({ prices });
}
