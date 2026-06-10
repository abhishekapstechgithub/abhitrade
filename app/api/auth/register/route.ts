export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getUserByEmail, createUser } from '@/lib/db/repositories';
import { generateOtp, storeOtp, sendOtp } from '@/lib/otp';
import { isDbAvailable } from '@/lib/db/client';
import { isRedisAvailable } from '@/lib/redis-client';

export async function POST(req: NextRequest) {
  try {
    const { name, email, phone } = await req.json();

    if (!name?.trim() || !email?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: 'name, email and phone are required' }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(emailLower)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    const phoneClean = phone.replace(/\D/g, '');
    if (phoneClean.length < 10) {
      return NextResponse.json({ error: 'Invalid mobile number' }, { status: 400 });
    }

    if (!(await isDbAvailable())) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }
    if (!(await isRedisAvailable())) {
      return NextResponse.json({ error: 'Service unavailable — Redis offline' }, { status: 503 });
    }

    const existing = await getUserByEmail(emailLower);
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 409 });
    }

    // Create user with empty password_hash (OTP-only auth)
    await createUser({ email: emailLower, phone: phoneClean, name: name.trim(), password_hash: '' });

    // Send OTP to verify email
    const otp = generateOtp();
    await storeOtp(emailLower, otp);
    const { devOtp } = await sendOtp(emailLower, otp, 'email');

    return NextResponse.json({
      ok: true,
      message: `Account created. OTP sent to ${emailLower}`,
      ...(devOtp ? { devOtp } : {}),
    }, { status: 201 });
  } catch (err) {
    console.error('[register]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
