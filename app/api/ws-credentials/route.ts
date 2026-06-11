export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getAngelSession } from '@/lib/angelone/auth';

// GET /api/ws-credentials
// Returns { feedToken, clientCode, apiKey } for browser-side WebSocket connection.
// The feedToken is short-lived — client should call this once per page load.
export async function GET() {
  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;

  if (!apiKey || !clientId || !password || !totpSecret) {
    return NextResponse.json({ error: 'AngelOne credentials not configured' }, { status: 503 });
  }

  try {
    const session = await getAngelSession(apiKey, clientId, password, totpSecret);
    return NextResponse.json({
      feedToken:  session.feedToken,
      clientCode: clientId,
      apiKey,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
