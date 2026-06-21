import { Pool, PoolClient, QueryResultRow } from 'pg';

declare global {
  // eslint-disable-next-line no-var
  var _pgLivePool: Pool | undefined;
}

function createPool(database: string): Pool {
  return new Pool({
    host:     process.env.POSTGRES_HOST     ?? 'localhost',
    port:     Number(process.env.POSTGRES_PORT ?? 5432),
    database,
    user:     process.env.POSTGRES_USER     ?? 'abhitrade',
    password: process.env.POSTGRES_PASSWORD ?? 'abhitrade',
    max:      20,
    idleTimeoutMillis:       30_000,
    connectionTimeoutMillis: 5_000,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

const LIVE_DB = process.env.POSTGRES_DB_LIVE ?? 'abhitrade_live';

// Singleton — survives Next.js hot-reloads in dev
export const livePool: Pool = global._pgLivePool ?? (global._pgLivePool = createPool(LIVE_DB));

// Kept for backwards compatibility — always returns livePool
export function getPool(_mode?: string): Pool {
  return livePool;
}

export function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: any[],
) {
  return livePool.query<T>(sql, params);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await livePool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function isDbAvailable(): Promise<boolean> {
  try {
    await livePool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
