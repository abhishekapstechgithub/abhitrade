import { Router, Request, Response } from 'express';
import { redis, KEYS, isRedisAvailable } from '../lib/redis-client.js';
import { getPool } from '../lib/db/client.js';
import { searchInstrumentsPg, getInstrumentByToken } from '../lib/db/repositories.js';
import { isDbAvailable } from '../lib/db/client.js';

const router = Router();

const ZERO = (symbol: string, exchange: string) => ({
  symbol, exchange, ltp: 0, open: 0, high: 0, low: 0, close: 0,
  netChange: 0, percentChange: 0, volume: 0, week52High: 0, week52Low: 0,
  updatedAt: null, source: 'unavailable',
});

async function lookupOne(symbol: string, exchange: string) {
  try {
    const raw = await redis.get(`at:market:quote:${exchange}:${symbol}`);
    if (raw) {
      const q = JSON.parse(raw) as Record<string, unknown>;
      return { symbol, exchange, ltp: Number(q.ltp ?? 0), open: Number(q.open ?? 0), high: Number(q.high ?? 0), low: Number(q.low ?? 0), close: Number(q.close ?? 0), netChange: Number(q.netChange ?? 0), percentChange: Number(q.percentChange ?? q.changePct ?? 0), volume: Number(q.volume ?? 0), week52High: Number(q.week52High ?? 0), week52Low: Number(q.week52Low ?? 0), updatedAt: q.updatedAt ?? null, source: 'live' };
    }
  } catch { /* fall through */ }
  try {
    const raw = await redis.get(`at:market:eod:${exchange}:${symbol}`);
    if (raw) {
      const q = JSON.parse(raw) as Record<string, unknown>;
      return { symbol, exchange, ltp: Number(q.ltp ?? 0), open: Number(q.open ?? 0), high: Number(q.high ?? 0), low: Number(q.low ?? 0), close: Number(q.close ?? 0), netChange: Number(q.netChange ?? 0), percentChange: Number(q.changePct ?? 0), volume: Number(q.volume ?? 0), week52High: Number(q.high52w ?? 0), week52Low: Number(q.low52w ?? 0), updatedAt: q.updatedAt ?? null, source: 'eod' };
    }
  } catch { /* fall through */ }
  try {
    const { rows } = await getPool('live').query<Record<string, unknown>>(`SELECT ltp, open, high, low, close, net_change, percent_change, volume, week52_high, week52_low, synced_at FROM market_quotes WHERE symbol = $1 AND exchange = $2 LIMIT 1`, [symbol, exchange]);
    if (rows.length) { const r = rows[0]; return { symbol, exchange, ltp: Number(r.ltp), open: Number(r.open), high: Number(r.high), low: Number(r.low), close: Number(r.close), netChange: Number(r.net_change), percentChange: Number(r.percent_change), volume: Number(r.volume), week52High: Number(r.week52_high), week52Low: Number(r.week52_low), updatedAt: r.synced_at, source: 'db-live' }; }
  } catch { /* fall through */ }
  try {
    const { rows } = await getPool('live').query<Record<string, unknown>>(`SELECT ltp, open_price, high_price, low_price, close_price, net_change, change_pct, volume, price_updated_at FROM security_master WHERE symbol = $1 AND exchange = $2 AND ltp IS NOT NULL LIMIT 1`, [symbol, exchange]);
    if (rows.length) { const r = rows[0]; return { symbol, exchange, ltp: Number(r.ltp), open: Number(r.open_price), high: Number(r.high_price), low: Number(r.low_price), close: Number(r.close_price), netChange: Number(r.net_change), percentChange: Number(r.change_pct), volume: Number(r.volume), week52High: 0, week52Low: 0, updatedAt: r.price_updated_at, source: 'db-eod' }; }
  } catch { /* fall through */ }
  return ZERO(symbol, exchange);
}

// GET /api/quote
router.get('/quote', async (req: Request, res: Response) => {
  const symbol   = (req.query.symbol as string ?? '').toUpperCase();
  const exchange = (req.query.exchange as string ?? 'NSE').toUpperCase();
  if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }
  res.json(await lookupOne(symbol, exchange));
});

// GET /api/quotes
router.get('/quotes', async (req: Request, res: Response) => {
  const raw = req.query.symbols as string ?? '';
  if (!raw) { res.status(400).json({ error: 'symbols query param required (e.g. NSE:HDFCBANK,BSE:SENSEX)' }); return; }
  const pairs = raw.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).map(s => {
    const colon = s.indexOf(':');
    if (colon > 0) return { exchange: s.slice(0, colon), symbol: s.slice(colon + 1) };
    return { exchange: 'NSE', symbol: s };
  });
  if (!pairs.length) { res.status(400).json({ error: 'No valid symbols provided' }); return; }
  const quotes = await Promise.all(pairs.map(p => lookupOne(p.symbol, p.exchange)));
  res.json({ quotes });
});

// GET /api/tokens/ltp
router.get('/tokens/ltp', async (req: Request, res: Response) => {
  const raw = req.query.tokens as string ?? '';
  if (!raw.trim()) { res.status(400).json({ error: 'tokens query param required' }); return; }
  const tokens = raw.split(',').map(t => t.trim()).filter(Boolean);
  if (!tokens.length) { res.json({ prices: {} }); return; }
  const pipeline = redis.pipeline();
  for (const t of tokens) pipeline.get(`at:market:quote:token:${t}`);
  const redisResults = await pipeline.exec().catch(() => null);
  const prices: Record<string, unknown> = {};
  const missingTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const val = redisResults?.[i]?.[1];
    if (val) {
      try {
        const q = JSON.parse(String(val)) as Record<string, unknown>;
        prices[tokens[i]] = { ltp: Number(q.ltp ?? 0), change_pct: Number(q.percentChange ?? q.changePct ?? 0), close: Number(q.close ?? 0), open: Number(q.open ?? 0), high: Number(q.high ?? 0), low: Number(q.low ?? 0), volume: Number(q.volume ?? 0), net_change: Number(q.netChange ?? 0), token: tokens[i], source: 'live' };
      } catch { missingTokens.push(tokens[i]); }
    } else { missingTokens.push(tokens[i]); }
  }
  if (missingTokens.length) {
    try {
      const { rows } = await getPool('live').query<Record<string, unknown>>(`SELECT token, ltp, open, high, low, close, net_change, percent_change, volume FROM market_quotes WHERE token = ANY($1)`, [missingTokens]);
      const dbMap = new Map(rows.map(r => [String(r.token), r]));
      for (const t of missingTokens) {
        const r = dbMap.get(t);
        prices[t] = r ? { ltp: Number(r.ltp), change_pct: Number(r.percent_change), close: Number(r.close), open: Number(r.open), high: Number(r.high), low: Number(r.low), volume: Number(r.volume), net_change: Number(r.net_change), token: t, source: 'db' } : { ltp: 0, change_pct: 0, close: 0, open: 0, high: 0, low: 0, volume: 0, net_change: 0, token: t, source: 'unavailable' };
      }
    } catch { for (const t of missingTokens) { if (!prices[t]) prices[t] = { ltp: 0, change_pct: 0, close: 0, open: 0, high: 0, low: 0, volume: 0, net_change: 0, token: t, source: 'unavailable' }; } }
  }
  res.json({ prices });
});

// POST /api/tokens/watch
router.post('/tokens/watch', async (req: Request, res: Response) => {
  try {
    const tokens = Array.isArray(req.body?.tokens) ? (req.body.tokens as unknown[]).map(t => String(t)).filter(Boolean) : [];
    if (!tokens.length) { res.json({ ok: true, registered: 0 }); return; }
    const now = Date.now();
    const pipeline = redis.pipeline();
    for (const t of tokens) pipeline.zadd('at:watch:tokens', now, t);
    pipeline.zremrangebyrank('at:watch:tokens', 0, -501);
    await pipeline.exec().catch(() => {});
    res.json({ ok: true, registered: tokens.length });
  } catch { res.json({ ok: true, registered: 0 }); }
});

// POST /api/tokens/unwatch
router.post('/tokens/unwatch', async (req: Request, res: Response) => {
  try {
    const tokens = Array.isArray(req.body?.tokens) ? (req.body.tokens as unknown[]).map(t => String(t)).filter(Boolean) : [];
    if (tokens.length) { const p = redis.pipeline(); for (const t of tokens) p.zrem('at:watch:tokens', t); await p.exec().catch(() => {}); }
    res.json({ ok: true, removed: tokens.length });
  } catch { res.json({ ok: true, removed: 0 }); }
});

// GET /api/scrips
router.get('/scrips', async (req: Request, res: Response) => {
  const symbolsParam = req.query.symbols as string ?? '';
  const exchange = (req.query.exchange as string ?? 'NSE').toUpperCase();
  const type = (req.query.type as string ?? 'EQ').toUpperCase();
  const underlying = (req.query.underlying as string ?? '').toUpperCase();
  const expiry = req.query.expiry as string ?? '';
  const limit = Math.min(parseInt(req.query.limit as string ?? '50', 10) || 50, 200);

  const redisOk = await isRedisAvailable();
  if (!redisOk) { res.status(503).json({ results: [], source: 'redis_unavailable' }); return; }

  function parseHash(h: Record<string, string>) {
    return { token: h.token ?? '', exchange: h.exchange ?? '', symbol: h.symbol ?? '', tradingSymbol: h.tradingSymbol ?? h.symbol ?? '', name: h.name ?? '', instrumentType: h.instrumentType ?? '', series: h.series ?? '', isin: h.isin ?? '', lotSize: parseInt(h.lotSize ?? '1', 10) || 1, tickSize: parseFloat(h.tickSize ?? '0.05') || 0.05, expiry: h.expiry ?? '', strike: h.strike ? parseFloat(h.strike) : null, optionType: h.optionType ?? '', underlying: h.underlying ?? '', underlyingToken: h.underlyingToken ?? '' };
  }

  if (symbolsParam) {
    const symbols = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    const results = [];
    for (const sym of symbols) {
      const tokens = await redis.smembers(KEYS.bySymbol(exchange, sym));
      for (const tok of tokens) {
        const h = await redis.hgetall(KEYS.instr(exchange, tok));
        if (!h) continue;
        if (type === 'ALL' || (h.instrumentType ?? '').toUpperCase() === type) { results.push(parseHash(h)); break; }
      }
    }
    res.json({ results, total: results.length, source: 'redis' }); return;
  }

  if (underlying && (type === 'CE' || type === 'PE' || type === 'OPTIONS' || type === 'ALL')) {
    const tokens = await redis.smembers(KEYS.bySymbol(exchange, underlying));
    const results = [];
    for (const tok of tokens) {
      const h = await redis.hgetall(KEYS.instr(exchange, tok));
      if (!h) continue;
      const it = (h.instrumentType ?? '').toUpperCase();
      if (it !== 'CE' && it !== 'PE') continue;
      if (expiry && h.expiry !== expiry) continue;
      results.push(parseHash(h));
      if (results.length >= limit) break;
    }
    results.sort((a, b) => (a.strike ?? 0) - (b.strike ?? 0));
    res.json({ results, total: results.length, source: 'redis' }); return;
  }

  res.json({ results: [], total: 0, source: 'redis' });
});

// GET /api/search
router.get('/search', async (req: Request, res: Response) => {
  const q        = (req.query.q as string ?? '').trim();
  const exchange  = req.query.exchange as string ?? 'all';
  const type      = req.query.type as string ?? 'all';
  const limit     = Math.min(Number(req.query.limit ?? 20), 50);
  if (!q || q.length < 1) { res.json({ results: [], total: 0, source: 'empty' }); return; }

  const exFilter   = exchange !== 'all' ? exchange : undefined;
  const typeFilter = type !== 'all' ? type : undefined;
  const redisOk    = await isRedisAvailable().catch(() => false);

  if (redisOk) {
    try {
      const cacheKey = `tk:meta:${exchange.toUpperCase()}:${type.toUpperCase()}:${q.toUpperCase()}`;
      const cached = await redis.get(cacheKey);
      if (cached) {
        const results = JSON.parse(cached);
        res.json({ results, total: results.length, source: 'redis-cache' }); return;
      }
    } catch { /* fall through */ }
  }

  try {
    if (await isDbAvailable()) {
      const rows = await searchInstrumentsPg(q, { exchange: exFilter, type: typeFilter, limit });
      if (rows.length > 0) {
        const results = rows.map(r => ({ token: r.token, exchange: r.exchange, symbol: r.symbol, tradingSymbol: r.trading_symbol ?? r.symbol, name: r.name ?? r.symbol, instrumentType: r.instrument_type, segment: r.segment ?? undefined, expiry: r.expiry ?? undefined, strike: r.strike != null ? Number(r.strike) : undefined, optionType: r.option_type ?? undefined, underlying: r.underlying ?? undefined, lotSize: r.lot_size, ltp: r.ltp != null ? Number(r.ltp) : undefined }));
        if (redisOk) {
          const cacheKey = `tk:meta:${exchange.toUpperCase()}:${type.toUpperCase()}:${q.toUpperCase()}`;
          redis.setex(cacheKey, 300, JSON.stringify(results)).catch(() => {});
        }
        res.json({ results, total: results.length, source: 'postgres' }); return;
      }
    }
  } catch (e) { console.warn('[search] PostgreSQL error:', e); }

  res.json({ results: [], total: 0, source: 'empty' });
});

// GET /api/instruments/:token
router.get('/instruments/:token', async (req: Request, res: Response) => {
  const exchange = req.query.exchange as string ?? 'NSE';
  try {
    const hash = await redis.hgetall(KEYS.instr(exchange, req.params.token));
    if (Object.keys(hash).length) { res.json({ instrument: hash, source: 'redis' }); return; }
  } catch { /* fall through */ }
  try {
    const row = await getInstrumentByToken(req.params.token, exchange);
    if (!row) { res.status(404).json({ error: 'Instrument not found' }); return; }
    res.json({ instrument: row, source: 'postgres' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
