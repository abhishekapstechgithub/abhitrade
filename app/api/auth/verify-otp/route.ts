export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import jwt from 'jsonwebtoken';
import { verifyOtp } from '@/lib/otp';
import { getUserByEmail, getUserByName } from '@/lib/db/repositories';
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/session';
import { isDbAvailable } from '@/lib/db/client';

const JWT_SECRET = process.env.JWT_SECRET ?? 'abhitrade-dev-secret';

export async function POST(req: NextRequest) {
  try {
    const { email, name, otp } = await req.json();

    const hasName  = !!name?.trim();
    const hasEmail = !!email?.trim();

    if ((!hasName && !hasEmail) || !otp?.trim()) {
      return NextResponse.json({ error: 'name (or email) and otp are required' }, { status: 400 });
    }

    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    let user: any = null;
    let resolvedEmail = '';

    if (hasName) {
      user = await getUserByName(name.trim());
      if (!user) {
        return NextResponse.json(
          { error: 'No account found with this name. Please sign up first.' },
          { status: 404 },
        );
      }
      resolvedEmail = user.email;
    } else {
      resolvedEmail = email.trim().toLowerCase();
      user = await getUserByEmail(resolvedEmail);
      if (!user) {
        return NextResponse.json(
          { error: 'No account found for this email. Please sign up first.' },
          { status: 404 },
        );
      }
    }

    const result = await verifyOtp(resolvedEmail, otp.trim());

    if (result === 'expired') {
      return NextResponse.json({ error: 'OTP expired. Please request a new one.' }, { status: 400 });
    }
    if (result === 'locked') {
      return NextResponse.json({ error: 'Too many failed attempts. Please request a new OTP.' }, { status: 429 });
    }
    if (result === 'invalid') {
      return NextResponse.json({ error: 'Incorrect OTP. Please try again.' }, { status: 400 });
    }

    const sessionId = await createSession({
      userId: user.id,
      email:  user.email,
      name:   user.name,
      phone:  user.phone ?? '',
    });

    const accessToken = jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });

    const res = NextResponse.json({
      ok:          true,
      accessToken,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
    });
    res.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      // Use COOKIE_SECURE=true only when serving over HTTPS.
      // Leaving it false (default) lets HTTP deployments work without SSL.
      secure:   process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge:   SESSION_TTL_SECONDS,
      path:     '/',
    });
    return res;
  } catch (err) {
    console.error('[verify-otp]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
