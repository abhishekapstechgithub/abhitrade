export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis-client';
import { loadIndexBhavcopy } from '@/lib/index-bhavcopy';

const STATUS_KEY = 'at:index-bhavcopy:last';

export async function POST() {
  try {
    const stats  = await loadIndexBhavcopy();
    const status = { ...stats, loadedAt: new Date().toISOString() };
    await redis.set(STATUS_KEY, JSON.stringify(status)).catch(() => {});
    return NextResponse.json(status);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  try {
    const cached = await redis.get(STATUS_KEY).catch(() => null);
    if (cached) return NextResponse.json(JSON.parse(cached));
    return NextResponse.json({ files: 0, totalLoaded: 0, totalSkipped: 0, results: [], loadedAt: null });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
