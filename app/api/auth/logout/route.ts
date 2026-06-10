export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { deleteSession, SESSION_COOKIE } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
    if (sessionId) {
      await deleteSession(sessionId);
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, '', { maxAge: 0, path: '/' });
    return res;
  } catch (err) {
    console.error('[logout]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
