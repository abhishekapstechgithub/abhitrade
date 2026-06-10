export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getRedisStats } from '@/lib/security-master-loader';

export async function GET() {
  const stats = await getRedisStats();
  return NextResponse.json(stats);
}
