export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { getRefreshToken, revokeRefreshToken, storeRefreshToken, getUserById } from '@/lib/db/repositories';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'abhitrade-dev-secret';
const REFRESH_TTL = 7 * 24 * 60 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const raw = req.cookies.get('tk_refresh')?.value;
    if (!raw) return NextResponse.json({ error: 'No refresh token' }, { status: 401 });

    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const stored = await getRefreshToken(hash);
    if (!stored) return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });

    const user = await getUserById(stored.user_id);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 401 });

    // Rotate: revoke old, issue new
    await revokeRefreshToken(hash);
    const newRaw = crypto.randomBytes(40).toString('hex');
    const newHash = crypto.createHash('sha256').update(newRaw).digest('hex');
    await storeRefreshToken(user.id, newHash, new Date(Date.now() + REFRESH_TTL));

    const accessToken = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });

    const res = NextResponse.json({ accessToken });
    res.cookies.set('tk_refresh', newRaw, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', maxAge: REFRESH_TTL / 1000, path: '/api/auth',
    });
    return res;
  } catch (err) {
    console.error('[auth/refresh]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
