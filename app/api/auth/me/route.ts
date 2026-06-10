export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthPayload } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const payload = await getAuthPayload(req);
  if (!payload) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  return NextResponse.json({
    user: { id: payload.sub, email: payload.email, name: payload.name, phone: payload.phone },
  });
}
