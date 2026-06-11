export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { isRedisAvailable } from '@/lib/redis-client';
import { isDbAvailable } from '@/lib/db/client';
import { getMongoDb } from '@/lib/mongodb';

async function isMongoAvailable(): Promise<boolean> {
  try {
    const db = await getMongoDb();
    await db.command({ ping: 1 });
    return true;
  } catch { return false; }
}

export async function GET() {
  const [redisOk, liveOk, paperOk, mongoOk] = await Promise.all([
    isRedisAvailable(),
    isDbAvailable('live'),
    isDbAvailable('paper'),
    isMongoAvailable(),
  ]);
  const allHealthy = redisOk && liveOk && paperOk && mongoOk;
  return NextResponse.json(
    {
      status:    allHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      mongo:     mongoOk  ? 'ok' : 'unavailable',
      services: {
        api:                 'healthy',
        redis:               redisOk  ? 'connected' : 'unavailable',
        mongo:               mongoOk  ? 'connected' : 'unavailable',
        postgres_live:       liveOk   ? 'connected' : 'unavailable',
        postgres_papertrade: paperOk  ? 'connected' : 'unavailable',
      },
    },
    { status: allHealthy ? 200 : 503 },
  );
}
