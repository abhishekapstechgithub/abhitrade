export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/otp';
import { getUserByEmail } from '@/lib/db/repositories';
import { createSession, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/session';
import { isDbAvailable } from '@/lib/db/client';

export async function POST(req: NextRequest) {
  try {
    const { email, otp } = await req.json();
    if (!email?.trim() || !otp?.trim()) {
      return NextResponse.json({ error: 'email and otp are required' }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();
    const result = await verifyOtp(emailLower, otp.trim());

    if (result === 'expired') {
      return NextResponse.json({ error: 'OTP expired. Please request a new one.' }, { status: 400 });
    }
    if (result === 'locked') {
      return NextResponse.json({ error: 'Too many failed attempts. Please request a new OTP.' }, { status: 429 });
    }
    if (result === 'invalid') {
      return NextResponse.json({ error: 'Incorrect OTP. Please try again.' }, { status: 400 });
    }

    // OTP verified — fetch or create user
    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    const user = await getUserByEmail(emailLower);
    if (!user) {
      return NextResponse.json(
        { error: 'No account found for this email. Please sign up first.' },
        { status: 404 },
      );
    }

    const sessionId = await createSession({
      userId: user.id,
      email:  user.email,
      name:   user.name,
      phone:  user.phone ?? '',
    });

    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
    });
    res.cookies.set(SESSION_COOKIE, sessionId, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
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
