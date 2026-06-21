import { NextRequest, NextResponse } from 'next/server';
import { createHmac } from 'crypto';

const ANGEL_LOGIN_URL =
  'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword';

// ── Pure-Node TOTP (RFC 6238) — no external dependency ────────────────────────
function base32Decode(s: string): Buffer {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const input = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of input) {
    const idx = ALPHA.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateTOTP(secret: string, windowOffset = 0): string {
  const key = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / 30) + windowOffset;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[off] & 0x7f) << 24) |
    (hmac[off + 1] << 16) |
    (hmac[off + 2] << 8) |
    hmac[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

// ── AngelOne login attempt ─────────────────────────────────────────────────────
async function tryLogin(
  apiKey: string,
  clientId: string,
  clientPassword: string,
  totp: string
) {
  const res = await fetch(ANGEL_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-UserType': 'USER',
      'X-SourceID': 'WEB',
      'X-ClientLocalIP': '127.0.0.1',
      'X-ClientPublicIP': '106.51.128.1',
      'X-MACAddress': '00:00:00:00:00:00',
      'X-PrivateKey': apiKey,
    },
    body: JSON.stringify({ clientcode: clientId, password: clientPassword, totp }),
  });
  return res.json() as Promise<{
    status: boolean;
    message: string;
    errorcode: string;
    data: {
      jwtToken: string;
      refreshToken: string;
      feedToken: string;
      name?: string;
      email?: string;
    } | null;
  }>;
}

// ── POST handler ───────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { apiKey, clientId, clientPassword, totpSecret } = await req.json();

    if (!apiKey || !clientId || !clientPassword) {
      return NextResponse.json(
        { error: 'Client ID, API Key, and Password are required' },
        { status: 400 }
      );
    }
    if (!totpSecret) {
      return NextResponse.json(
        { error: 'TOTP secret is required. Get it from AngelOne 2FA setup.' },
        { status: 400 }
      );
    }

    // Try current window, then +1 (handle clock drift / near-boundary timing),
    // then -1 as a final fallback.
    const WINDOWS = [0, 1, -1];
    let lastError = 'Authentication failed';

    for (const offset of WINDOWS) {
      const totp = generateTOTP(totpSecret, offset);
      const data = await tryLogin(apiKey, clientId, clientPassword, totp);

      if (data.status && data.data?.jwtToken) {
        return NextResponse.json({
          accessToken: data.data.jwtToken,
          feedToken: data.data.feedToken,
          refreshToken: data.data.refreshToken,
          profile: { name: data.data.name, email: data.data.email },
        });
      }

      // Only retry on TOTP errors; for other errors (wrong password, invalid client)
      // bail out immediately.
      const isTotpError =
        data.errorcode === 'AG8004' ||
        (data.message ?? '').toLowerCase().includes('totp');

      lastError = data.message || lastError;

      if (!isTotpError) break; // wrong password / client — no point retrying
    }

    return NextResponse.json({ error: lastError }, { status: 401 });
  } catch (err) {
    return NextResponse.json(
      { error: 'Connection failed: ' + (err instanceof Error ? err.message : String(err)) },
      { status: 500 }
    );
  }
}
