export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { generateOtp, storeOtp, sendOtp } from '@/lib/otp';
import { getUserByEmail, getUserByName } from '@/lib/db/repositories';
import { isDbAvailable } from '@/lib/db/client';
import { isRedisAvailable } from '@/lib/redis-client';

export async function POST(req: NextRequest) {
  try {
    const { email, name } = await req.json();

    const hasName  = !!name?.trim();
    const hasEmail = !!email?.trim();

    if (!hasName && !hasEmail) {
      return NextResponse.json({ error: 'Name or email is required' }, { status: 400 });
    }

    if (!(await isRedisAvailable())) {
      return NextResponse.json({ error: 'Service unavailable — Redis offline' }, { status: 503 });
    }

    let userExists = false;
    let userEmail  = '';

    if (await isDbAvailable()) {
      if (hasName) {
        const user = await getUserByName(name.trim());
        userExists = !!user;
        if (user) userEmail = user.email;
      } else {
        const emailLower = email.trim().toLowerCase();
        const user = await getUserByEmail(emailLower);
        userExists = !!user;
        if (user) userEmail = user.email;
      }
    }

    if (!userExists || !userEmail) {
      return NextResponse.json({ ok: true, userExists: false });
    }

    const otp = generateOtp();
    await storeOtp(userEmail, otp);
    const { devOtp } = await sendOtp(userEmail, otp, 'email');

    return NextResponse.json({
      ok: true,
      userExists: true,
      ...(devOtp ? { devOtp } : {}),
    });
  } catch (err) {
    console.error('[send-otp]', err);
    return NextResponse.json({ error: 'Failed to send OTP' }, { status: 500 });
  }
}
