export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { redis, KEYS, isRedisAvailable } from '@/lib/redis-client';

export async function DELETE() {
  try {
    if (!(await isRedisAvailable())) {
      return NextResponse.json({ error: 'Redis is not available' }, { status: 503 });
    }

    // Delete all AbhiTrade-namespaced keys (at:*) — never flushes the whole DB
    const pipeline = redis.pipeline();
    let cursor = '0';
    let deleted = 0;

    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'at:*', 'COUNT', 200);
      cursor = next;
      if (keys.length) {
        keys.forEach(k => pipeline.del(k));
        deleted += keys.length;
      }
    } while (cursor !== '0');

    await pipeline.exec();

    return NextResponse.json({
      ok: true,
      deleted,
      message: `Cleared ${deleted} Redis keys (at:* namespace)`,
    });
  } catch (err) {
    console.error('[redis-clear]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to clear Redis' },
      { status: 500 },
    );
  }
}
