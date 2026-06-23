/**
 * POST /api/tokens/watch
 * Body: { tokens: ["1333", "3045"] }
 *
 * Registers tokens for priority caching. Stores in a Redis sorted set
 * at:watch:tokens with score = current timestamp, so market-sync can
 * prioritize fresh data for frequently-watched tokens.
 * Returns 200 immediately — non-blocking.
 */
export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis-client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { tokens?: unknown };
    const tokens = Array.isArray(body?.tokens)
      ? (body.tokens as unknown[]).map(t => String(t)).filter(Boolean)
      : [];

    if (tokens.length === 0) {
      return NextResponse.json({ ok: true, registered: 0 });
    }

    const now = Date.now();
    const pipeline = redis.pipeline();
    for (const t of tokens) {
      pipeline.zadd('at:watch:tokens', now, t);
    }
    // Keep set bounded — trim to 500 most-recently watched
    pipeline.zremrangebyrank('at:watch:tokens', 0, -501);
    await pipeline.exec().catch(() => {});

    return NextResponse.json({ ok: true, registered: tokens.length });
  } catch {
    // Never fail — client can always proceed
    return NextResponse.json({ ok: true, registered: 0 });
  }
}
