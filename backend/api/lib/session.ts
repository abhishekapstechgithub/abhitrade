/**
 * Redis-backed session store.
 * Sessions live for SESSION_TTL_SECONDS (12 hours).
 * Each access resets the TTL (sliding window).
 */
import { redis } from './redis-client';
import { randomBytes } from 'crypto';

export const SESSION_TTL_SECONDS = 12 * 60 * 60; // 12 hours
export const SESSION_COOKIE = 'at_sid';
const PREFIX = 'at:session:';

export interface SessionData {
  userId: string;
  email: string;
  name: string;
  phone: string;
  createdAt: string;
  expiresAt: string;
}

export async function createSession(data: Omit<SessionData, 'createdAt' | 'expiresAt'>): Promise<string> {
  const sessionId = randomBytes(32).toString('hex');
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000);
  await redis.hset(PREFIX + sessionId, {
    userId:    data.userId,
    email:     data.email,
    name:      data.name,
    phone:     data.phone ?? '',
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
  });
  await redis.expire(PREFIX + sessionId, SESSION_TTL_SECONDS);
  return sessionId;
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  if (!sessionId) return null;
  const data = await redis.hgetall(PREFIX + sessionId);
  if (!data?.userId) return null;
  // Sliding TTL — reset on every access
  await redis.expire(PREFIX + sessionId, SESSION_TTL_SECONDS);
  return data as unknown as SessionData;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await redis.del(PREFIX + sessionId);
}

export async function deleteAllUserSessions(userId: string): Promise<void> {
  let cursor = '0';
  do {
    const [next, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 100);
    cursor = next;
    for (const key of keys) {
      const uid = await redis.hget(key, 'userId');
      if (uid === userId) await redis.del(key);
    }
  } while (cursor !== '0');
}
