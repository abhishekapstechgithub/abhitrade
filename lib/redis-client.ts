import Redis from 'ioredis';

declare global {
  // eslint-disable-next-line no-var
  var _redisClient: Redis | undefined;
}

function createRedisClient(): Redis {
  const client = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: true,
  });

  client.on('error', (err) => {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[Redis] Connection error:', err.message);
    }
  });

  return client;
}

// Singleton — reuse across Next.js hot-reloads in dev
export const redis: Redis =
  global._redisClient ?? (global._redisClient = createRedisClient());

export async function isRedisAvailable(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

// Key constants — all keys use the at: namespace
export const KEYS = {
  AUTOCOMPLETE: 'at:auto',
  instr:    (exchange: string, token: string)  => `at:instr:${exchange}:${token}`,
  bySymbol: (exchange: string, symbol: string) => `at:sym:${exchange}:${symbol.toUpperCase()}`,
  job:      (id: string)                       => `at:job:${id}`,
  count:    (exchange: string)                 => `at:count:${exchange.toUpperCase()}`,
};
