/**
 * POST /api/tokens/unwatch
 * Body: { tokens: ["1333", "3045"] }
 *
 * Removes tokens from the priority watch set.
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

    if (tokens.length > 0) {
      const pipeline = redis.pipeline();
      for (const t of tokens) pipeline.zrem('at:watch:tokens', t);
      await pipeline.exec().catch(() => {});
    }
    return NextResponse.json({ ok: true, removed: tokens.length });
  } catch {
    return NextResponse.json({ ok: true, removed: 0 });
  }
}
