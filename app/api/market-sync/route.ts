export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getSyncStatus, runMarketSync } from '@/lib/market-sync';

// GET /api/market-sync — return current sync status
export async function GET() {
  const status = await getSyncStatus();
  return NextResponse.json(status);
}

// POST /api/market-sync — trigger an immediate manual sync
export async function POST() {
  const result = await runMarketSync();
  return NextResponse.json(result, { status: result.status === 'ok' ? 200 : 500 });
}
