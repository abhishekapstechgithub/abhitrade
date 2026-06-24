// Shared AngelOne authentication — used by server-side API routes.
// Caches the session (accessToken + feedToken) in Redis for ~23 hours.
import { redis } from '@/lib/redis-client';
import { createHmac } from 'crypto';

const LOGIN_URL   = 'https://apiconnect.angelbroking.com/rest/auth/angelbroking/user/v1/loginByPassword';
const SESSION_KEY = 'at:market:session';
const LOCK_KEY    = 'at:market:session:lock';
const LOCK_TTL    = 20; // seconds — max time a login is expected to take

export interface AngelSession {
  accessToken: string;
  feedToken:   string;
  expiresAt:   number;
}

// ── TOTP helpers ──────────────────────────────────────────────────────────────
function base32Decode(s: string): Buffer {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const input = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of input) {
    const idx = A.indexOf(c); if (idx < 0) continue;
    val = (val << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function totp(secret: string, offset = 0): string {
  const key  = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / 30) + offset;
  const buf  = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const off  = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off+1] << 16) | (hmac[off+2] << 8) | hmac[off+3];
  return String(code % 1_000_000).padStart(6, '0');
}

// ── Main function ─────────────────────────────────────────────────────────────
export async function getAngelSession(
  apiKey: string, clientId: string, password: string, totpSecret: string,
): Promise<AngelSession> {
  // Return cached session if still valid and has feedToken
  const cached = await redis.get(SESSION_KEY).catch(() => null);
  if (cached) {
    const s = JSON.parse(cached) as AngelSession;
    if (s.feedToken && Date.now() < s.expiresAt) return s;
  }

  // Acquire a Redis lock so concurrent requests don't all race to login.
  // SET NX EX returns 'OK' if lock acquired, null if already held.
  const lockAcquired = await redis.set(LOCK_KEY, '1', 'EX', LOCK_TTL, 'NX').catch(() => 'OK');
  if (!lockAcquired) {
    // Another request is logging in — poll for the cached session up to 10 s
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500));
      const waiting = await redis.get(SESSION_KEY).catch(() => null);
      if (waiting) {
        const s = JSON.parse(waiting) as AngelSession;
        if (s.feedToken && Date.now() < s.expiresAt) return s;
      }
    }
    throw new Error('AngelOne session unavailable — concurrent login timed out');
  }

  // Login with TOTP retry (±1 step for clock skew)
  try {
  for (const offset of [0, 1, -1]) {
    const res = await fetch(LOGIN_URL, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'X-UserType': 'USER', 'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '106.51.128.1',
        'X-MACAddress': '00:00:00:00:00:00', 'X-PrivateKey': apiKey,
      },
      body: JSON.stringify({ clientcode: clientId, password, totp: totp(totpSecret, offset) }),
    });
    const data = await res.json() as {
      status: boolean; message: string; errorcode: string;
      data: { jwtToken: string; feedToken: string; refreshToken: string } | null;
    };
    if (data.status && data.data?.jwtToken) {
      const session: AngelSession = {
        accessToken: data.data.jwtToken,
        feedToken:   data.data.feedToken ?? '',
        expiresAt:   Date.now() + 23 * 3600 * 1000,
      };
      await redis.setex(SESSION_KEY, 23 * 3600, JSON.stringify(session)).catch(() => {});
      return session;
    }
    const isTotpErr =
      data.errorcode === 'AG8004' ||
      (data.message ?? '').toLowerCase().includes('totp');
    if (!isTotpErr) throw new Error(data.message || 'AngelOne login failed');
  }
  throw new Error('AngelOne login failed after 3 TOTP attempts');
  } finally {
    await redis.del(LOCK_KEY).catch(() => {});
  }
}
