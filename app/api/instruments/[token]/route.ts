export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getInstrumentByToken } from '@/lib/db/repositories';
import { redis, KEYS } from '@/lib/redis-client';

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const exchange = req.nextUrl.searchParams.get('exchange') ?? 'NSE';

  // Try Redis first (faster)
  try {
    const hash = await redis.hgetall(KEYS.instr(exchange, params.token));
    if (Object.keys(hash).length) {
      return NextResponse.json({ instrument: hash, source: 'redis' });
    }
  } catch { /* fall through */ }

  // PostgreSQL fallback
  try {
    const row = await getInstrumentByToken(params.token, exchange);
    if (!row) return NextResponse.json({ error: 'Instrument not found' }, { status: 404 });
    return NextResponse.json({ instrument: row, source: 'postgres' });
  } catch (err) {
    console.error('[instruments GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
