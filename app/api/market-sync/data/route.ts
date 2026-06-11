export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getCachedQuotes } from '@/lib/market-sync';

// GET /api/market-sync/data — return all cached quotes as a symbol-keyed map
export async function GET() {
  const quotes = await getCachedQuotes();
  return NextResponse.json(quotes);
}
