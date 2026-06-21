import { NextRequest } from 'next/server';
import { getSession, SESSION_COOKIE, type SessionData } from './session';

export interface AuthPayload {
  sub: string;   // userId
  email: string;
  name: string;
  phone: string;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

/** Read session from cookie → Redis. Returns null if not authenticated. */
export async function getAuthPayload(req: NextRequest): Promise<AuthPayload | null> {
  const sessionId = req.cookies.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  if (!session) return null;
  return { sub: session.userId, email: session.email, name: session.name, phone: session.phone };
}

/** Same as getAuthPayload but throws AuthError if not authenticated. */
export async function requireAuth(req: NextRequest): Promise<AuthPayload> {
  const payload = await getAuthPayload(req);
  if (!payload) throw new AuthError('Unauthorized');
  return payload;
}

export type { SessionData };
