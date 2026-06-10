export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { generateOtp, storeOtp, sendOtp } from '@/lib/otp';
import { getUserByEmail } from '@/lib/db/repositories';
import { isDbAvailable } from '@/lib/db/client';
import { isRedisAvailable } from '@/lib/redis-client';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email?.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const emailLower = email.trim().toLowerCase();
    const emailRx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRx.test(emailLower)) {
      return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
    }

    if (!(await isRedisAvailable())) {
      return NextResponse.json({ error: 'Service unavailable — Redis offline' }, { status: 503 });
    }

    // Check if user exists (for login flow)
    let userExists = false;
    if (await isDbAvailable()) {
      const user = await getUserByEmail(emailLower);
      userExists = !!user;
    }

    const otp = generateOtp();
    await storeOtp(emailLower, otp);
    const { devOtp } = await sendOtp(emailLower, otp, 'email');

    return NextResponse.json({
      ok: true,
      userExists,
      message: `OTP sent to ${emailLower}`,
      // Only returned in development so you can test without email service
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (err) {
    console.error('[send-otp]', err);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
