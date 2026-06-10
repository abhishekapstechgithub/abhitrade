export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { isRedisAvailable } from '@/lib/redis-client';
import { isDbAvailable } from '@/lib/db/client';

export async function GET() {
  const [redisOk, liveOk, paperOk] = await Promise.all([
    isRedisAvailable(),
    isDbAvailable('live'),
    isDbAvailable('paper'),
  ]);
  const allHealthy = redisOk && liveOk && paperOk;
  return NextResponse.json(
    {
      status: allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      services: {
        api:                'healthy',
        redis:              redisOk ? 'connected' : 'unavailable',
        postgres_live:      liveOk  ? 'connected' : 'unavailable',
        postgres_papertrade: paperOk ? 'connected' : 'unavailable',
      },
    },
    { status: allHealthy ? 200 : 503 },
  );
}
