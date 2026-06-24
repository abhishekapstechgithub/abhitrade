import { getSession, SESSION_COOKIE, type SessionData } from './session.js';

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

/** Parse a session ID from a raw cookie header string. */
function parseCookieHeader(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.split(';').find(c => c.trim().startsWith(`${SESSION_COOKIE}=`));
  return match ? match.trim().split('=').slice(1).join('=') : undefined;
}

/** Read session from cookie string → Redis. Returns null if not authenticated. */
export async function getAuthPayload(cookieHeader: string | undefined): Promise<AuthPayload | null> {
  const sessionId = parseCookieHeader(cookieHeader);
  if (!sessionId) return null;
  const session = await getSession(sessionId);
  if (!session) return null;
  return { sub: session.userId, email: session.email, name: session.name, phone: session.phone };
}

/** Same as getAuthPayload but throws AuthError if not authenticated. */
export async function requireAuth(cookieHeader: string | undefined): Promise<AuthPayload> {
  const payload = await getAuthPayload(cookieHeader);
  if (!payload) throw new AuthError('Unauthorized');
  return payload;
}

export type { SessionData };
