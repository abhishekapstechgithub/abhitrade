export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getAuthPayload } from '@/lib/auth';

const JWT_SECRET = process.env.JWT_SECRET ?? 'abhitrade-dev-secret';

/** Issue a JWT Bearer token for strategy-api from an existing Next.js session. */
export async function GET(req: NextRequest) {
  const payload = await getAuthPayload(req);
  if (!payload) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const accessToken = jwt.sign({ sub: payload.sub, email: payload.email }, JWT_SECRET, { expiresIn: '24h' });
  return NextResponse.json({ accessToken });
}
