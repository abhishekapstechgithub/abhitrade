export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';

export async function GET() {
  const Redis = (await import('ioredis')).default;
  const client = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    lazyConnect: true,
    connectTimeout: 5000,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    return NextResponse.json({ ok: true, pong, host: process.env.REDIS_HOST ?? 'localhost', port: process.env.REDIS_PORT ?? '6379' });
  } catch (e: any) {
    await client.quit().catch(() => {});
    return NextResponse.json({ ok: false, error: e.message, code: e.code, host: process.env.REDIS_HOST ?? 'localhost', port: process.env.REDIS_PORT ?? '6379' }, { status: 500 });
  }
}
