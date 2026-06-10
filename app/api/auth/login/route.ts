export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getUserByEmail, storeRefreshToken, createUser } from '@/lib/db/repositories';
import { isDbAvailable } from '@/lib/db/client';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET ?? 'abhitrade-dev-secret';
const ACCESS_TTL  = '15m';
const REFRESH_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

function signAccess(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: ACCESS_TTL });
}

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, register } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
    }

    if (!(await isDbAvailable())) {
      return NextResponse.json(
        { error: 'Database unavailable. Start Docker services: docker compose up -d postgres' },
        { status: 503 },
      );
    }

    // ── Registration flow ──────────────────────────────────────────────────
    if (register) {
      if (!name) return NextResponse.json({ error: 'name is required for registration' }, { status: 400 });
      const existing = await getUserByEmail(email);
      if (existing) return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
      const hash = await bcrypt.hash(password, 12);
      const user = await createUser({ email, name, password_hash: hash });
      const accessToken = signAccess(user.id, user.email);
      const refreshRaw = crypto.randomBytes(40).toString('hex');
      const refreshHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
      await storeRefreshToken(user.id, refreshHash, new Date(Date.now() + REFRESH_TTL));
      const res = NextResponse.json({ accessToken, user: { id: user.id, email: user.email, name: user.name } });
      res.cookies.set('tk_refresh', refreshRaw, {
        httpOnly: true, secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict', maxAge: REFRESH_TTL / 1000, path: '/api/auth',
      });
      return res;
    }

    // ── Login flow ─────────────────────────────────────────────────────────
    const user = await getUserByEmail(email);
    if (!user) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });

    const accessToken = signAccess(user.id, user.email);
    const refreshRaw = crypto.randomBytes(40).toString('hex');
    const refreshHash = crypto.createHash('sha256').update(refreshRaw).digest('hex');
    await storeRefreshToken(user.id, refreshHash, new Date(Date.now() + REFRESH_TTL));

    const res = NextResponse.json({
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, kyc_status: user.kyc_status },
    });
    res.cookies.set('tk_refresh', refreshRaw, {
      httpOnly: true, secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict', maxAge: REFRESH_TTL / 1000, path: '/api/auth',
    });
    return res;
  } catch (err) {
    console.error('[auth/login]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
