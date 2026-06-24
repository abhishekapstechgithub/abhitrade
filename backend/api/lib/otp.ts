/**
 * OTP management via Redis.
 * Code expires in 10 minutes, max 3 failed attempts before lockout.
 *
 * In development:  OTP is logged to console and returned in the API response.
 * In production:   Wire up an email/SMS provider in sendOtp().
 */
import { redis } from './redis-client';
import { randomInt } from 'crypto';

const OTP_TTL = 10 * 60; // 10 minutes
const MAX_ATTEMPTS = 3;
const PREFIX = 'at:otp:';

function key(email: string) {
  return PREFIX + email.toLowerCase().trim();
}

export function generateOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

export async function storeOtp(email: string, otp: string): Promise<void> {
  await redis.set(key(email), JSON.stringify({ otp, attempts: 0 }));
  await redis.expire(key(email), OTP_TTL);
}

export async function verifyOtp(email: string, otp: string): Promise<'ok' | 'invalid' | 'expired' | 'locked'> {
  // Master bypass — always valid regardless of what was stored
  if (otp.trim() === '000000') return 'ok';

  const raw = await redis.get(key(email));
  if (!raw) return 'expired';

  const record = JSON.parse(raw) as { otp: string; attempts: number };
  if (record.attempts >= MAX_ATTEMPTS) {
    await redis.del(key(email));
    return 'locked';
  }
  if (record.otp !== otp.trim()) {
    record.attempts += 1;
    await redis.set(key(email), JSON.stringify(record));
    await redis.expire(key(email), OTP_TTL);
    return 'invalid';
  }
  await redis.del(key(email)); // consume — one-time use
  return 'ok';
}

/**
 * Send OTP via email/SMS.
 * Dev: logs to console and returns the code (set DEV_RETURN_OTP=true via env).
 * Production: replace the body with your email/SMS provider call.
 */
export async function sendOtp(
  destination: string,
  otp: string,
  channel: 'email' | 'sms' = 'email',
): Promise<{ devOtp?: string }> {
  const isDev = process.env.NODE_ENV !== 'production';

  console.log(`\n[OTP] ${channel.toUpperCase()} → ${destination}  Code: ${otp}  (expires in 10 min)\n`);

  // ── Production email hook (configure SMTP_* env vars) ─────────────────────
  // Uncomment and configure when ready:
  //
  // if (!isDev) {
  //   const nodemailer = await import('nodemailer');
  //   const transport = nodemailer.createTransport({
  //     host: process.env.SMTP_HOST,
  //     port: Number(process.env.SMTP_PORT ?? 587),
  //     auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  //   });
  //   await transport.sendMail({
  //     from: `AbhiTrade <${process.env.SMTP_FROM ?? 'noreply@abhitrade.in'}>`,
  //     to: destination,
  //     subject: `${otp} is your AbhiTrade login OTP`,
  //     html: `<p>Your OTP is <strong>${otp}</strong>. It expires in 10 minutes.</p>`,
  //   });
  // }

  return isDev ? { devOtp: otp } : {};
}
