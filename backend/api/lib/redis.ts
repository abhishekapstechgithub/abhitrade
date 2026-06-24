// Redis client singleton
// In production, use ioredis: import Redis from 'ioredis'
// const redis = new Redis({ host: process.env.REDIS_HOST, port: Number(process.env.REDIS_PORT) })

export interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { ex?: number }): Promise<void>;
  hset(key: string, fields: Record<string, string>): Promise<void>;
  hgetall(key: string): Promise<Record<string, string> | null>;
  sadd(key: string, ...members: string[]): Promise<void>;
  smembers(key: string): Promise<string[]>;
}

// Mock Redis client for development (replace with real ioredis in production)
const mockStore = new Map<string, any>();

export const redis: RedisClient = {
  async get(key) { return mockStore.get(key) ?? null; },
  async set(key, value) { mockStore.set(key, value); },
  async hset(key, fields) {
    const existing = mockStore.get(key) ?? {};
    mockStore.set(key, { ...existing, ...fields });
  },
  async hgetall(key) { return mockStore.get(key) ?? null; },
  async sadd(key, ...members) {
    const set = mockStore.get(key) ?? new Set<string>();
    members.forEach(m => set.add(m));
    mockStore.set(key, set);
  },
  async smembers(key) {
    const set = mockStore.get(key);
    return set ? Array.from(set) : [];
  },
};

export async function searchInstruments(query: string, limit = 20): Promise<any[]> {
  // In production: SCAN idx:prefix:* or use Redis SEARCH module
  // This is a placeholder that falls back to mock data
  return [];
}
