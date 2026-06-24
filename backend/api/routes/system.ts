import { Router, Request, Response } from 'express';
import { isRedisAvailable, redis } from '../lib/redis-client.js';
import { isDbAvailable } from '../lib/db/client.js';
import { getRedisStats } from '../lib/security-master-loader.js';
import { getAngelSession } from '../lib/angelone/auth.js';

const router = Router();

// GET /api/health
router.get('/health', async (_req: Request, res: Response) => {
  const [redisOk, liveOk] = await Promise.all([isRedisAvailable(), isDbAvailable()]);
  const allHealthy = redisOk && liveOk;
  res.status(allHealthy ? 200 : 503).json({
    status:    allHealthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    services: {
      api:           'healthy',
      redis:         redisOk ? 'connected' : 'unavailable',
      postgres_live: liveOk  ? 'connected' : 'unavailable',
    },
  });
});

// GET /api/redis-stats
router.get('/redis-stats', async (_req: Request, res: Response) => {
  res.json(await getRedisStats());
});

// DELETE /api/redis-clear
router.delete('/redis-clear', async (_req: Request, res: Response) => {
  try {
    if (!(await isRedisAvailable())) { res.status(503).json({ error: 'Redis is not available' }); return; }
    const pipeline = redis.pipeline();
    let cursor = '0';
    let deleted = 0;
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', 'at:*', 'COUNT', 200);
      cursor = next;
      if (keys.length) { keys.forEach(k => pipeline.del(k)); deleted += keys.length; }
    } while (cursor !== '0');
    await pipeline.exec();
    res.json({ ok: true, deleted, message: `Cleared ${deleted} Redis keys (at:* namespace)` });
  } catch (err) {
    console.error('[redis-clear]', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to clear Redis' });
  }
});

// GET /api/debug-redis
router.get('/debug-redis', async (_req: Request, res: Response) => {
  const Redis = (await import('ioredis')).default;
  const client = new Redis({
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    lazyConnect: true,
    connectTimeout: 5000,
  });
  try {
    await client.connect();
    const pong = await client.ping();
    await client.quit();
    res.json({ ok: true, pong, host: process.env.REDIS_HOST ?? 'localhost', port: process.env.REDIS_PORT ?? '6379' });
  } catch (e: unknown) {
    await client.quit().catch(() => {});
    const err = e as NodeJS.ErrnoException;
    res.status(500).json({ ok: false, error: err.message, code: err.code, host: process.env.REDIS_HOST ?? 'localhost', port: process.env.REDIS_PORT ?? '6379' });
  }
});

// GET /api/ws-credentials
router.get('/ws-credentials', async (_req: Request, res: Response) => {
  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;
  if (!apiKey || !clientId || !password || !totpSecret) {
    res.status(503).json({ error: 'AngelOne credentials not configured' }); return;
  }
  try {
    const session = await getAngelSession(apiKey, clientId, password, totpSecret);
    res.json({ feedToken: session.feedToken, clientCode: clientId, apiKey });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
