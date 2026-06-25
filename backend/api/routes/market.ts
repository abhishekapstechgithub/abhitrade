import { Router, Request, Response } from 'express';
import { redis } from '../lib/redis-client.js';
import { getSyncStatus, runMarketSync, getCachedQuotes, getIndexPrices } from '../lib/market-sync.js';
import { getMarketMovers, syncMarketMovers, syncMoverType, isMoversStale, MOVER_KEY_TO_CODE, type MoverTypeKey } from '../lib/groww-movers.js';
import { getAngelSession } from '../lib/angelone/auth.js';
import { getMarketQuote, getGainersLosers } from '../lib/angelone/client.js';
import { toApiExchange } from '../lib/angelone/tokens.js';

const router = Router();

const VALID_MOVER_TYPES = new Set<MoverTypeKey>(['gainers', 'losers', 'volume_shockers', 'top_by_volume', '52w_high', '52w_low']);

// GET /api/market-sync
router.get('/market-sync', async (_req: Request, res: Response) => {
  res.json(await getSyncStatus());
});
// POST /api/market-sync
router.post('/market-sync', async (_req: Request, res: Response) => {
  const result = await runMarketSync();
  res.status(result.status === 'ok' ? 200 : 500).json(result);
});
// GET /api/market-sync/data
router.get('/market-sync/data', async (_req: Request, res: Response) => {
  res.json(await getCachedQuotes());
});

// GET /api/index-prices
router.get('/index-prices', async (_req: Request, res: Response) => {
  try { res.json({ prices: await getIndexPrices() }); }
  catch (err) { res.status(500).json({ prices: {}, error: err instanceof Error ? err.message : String(err) }); }
});

// GET /api/market-movers
router.get('/market-movers', async (req: Request, res: Response) => {
  const typeKey = (req.query.type as MoverTypeKey | undefined) ?? 'gainers';
  const resolvedType: MoverTypeKey = VALID_MOVER_TYPES.has(typeKey) ? typeKey : 'gainers';
  const limit = Math.min(parseInt(req.query.limit as string ?? '50', 10) || 50, 50);
  try {
    const stale = await isMoversStale();
    if (stale) syncMarketMovers().catch(e => console.error('[market-movers] bg sync:', e));
    const items = await getMarketMovers(MOVER_KEY_TO_CODE[resolvedType], limit);
    res.set('Cache-Control', 'no-store').json({ items, fetchedAt: items[0]?.fetched_at ?? null, stale, total: items.length, type: resolvedType });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e), items: [] }); }
});
// POST /api/market-movers
router.post('/market-movers', async (req: Request, res: Response) => {
  const typeRaw = req.query.type as string | undefined;
  try {
    if (typeRaw && VALID_MOVER_TYPES.has(typeRaw as MoverTypeKey)) {
      const count = await syncMoverType(typeRaw as MoverTypeKey);
      res.json({ ok: true, type: typeRaw, count }); return;
    }
    res.json({ ok: true, ...(await syncMarketMovers()) });
  } catch (e) { res.status(500).json({ error: e instanceof Error ? e.message : String(e) }); }
});

// GET /api/gainers-losers
router.get('/gainers-losers', async (req: Request, res: Response) => {
  const type  = req.query.type as string ?? 'gainers';
  const limit = Math.min(parseInt(req.query.limit as string ?? '10'), 25);
  const cacheKey = `at:gl:${type}`;
  try {
    const cached = await redis.get(cacheKey);
    if (cached) { res.json({ items: JSON.parse(cached), source: 'cache' }); return; }
  } catch { /* ignore */ }
  const apiKey = process.env.ANGELONE_API_KEY, clientId = process.env.ANGELONE_CLIENT_ID, password = process.env.ANGELONE_PASSWORD, totpSecret = process.env.ANGELONE_TOTP_SECRET;
  if (!apiKey || !clientId || !password || !totpSecret) { res.status(503).json({ items: [], error: 'AngelOne credentials not configured' }); return; }
  try {
    const session  = await getAngelSession(apiKey, clientId, password, totpSecret);
    const datatype = type === 'losers' ? 'PercPriceLosers' : 'PercPriceGainers';
    const raw = await getGainersLosers(apiKey, session.accessToken, datatype) as Array<{ tradingSymbol: string; symbolToken: string; exchange: string; ltp: number; netChange: number; percentChange: number; open: number; high: number; low: number; close: number; tradeVolume?: number }> | null;
    if (!Array.isArray(raw) || !raw.length) { res.json({ items: [], error: 'No data from AngelOne' }); return; }
    const items = raw.slice(0, limit).map(r => ({ symbol: r.tradingSymbol.replace(/-EQ$|-BE$/, ''), tradingSymbol: r.tradingSymbol, token: r.symbolToken, exchange: r.exchange, ltp: r.ltp, netChange: r.netChange, percentChange: r.percentChange, volume: r.tradeVolume ?? 0, open: r.open, high: r.high, low: r.low, close: r.close }));
    await redis.setex(cacheKey, 28800, JSON.stringify(items)).catch(() => {});
    res.json({ items, source: 'angelone' });
  } catch (err) { res.status(500).json({ items: [], error: err instanceof Error ? err.message : String(err) }); }
});

// POST /api/market-data
router.post('/market-data', async (req: Request, res: Response) => {
  const { tokens = [], mode = 'FULL' } = req.body as { tokens: Array<{ exchange: string; token: string; instrumentType?: string }>; mode?: 'LTP' | 'OHLC' | 'FULL' };
  if (!tokens.length) { res.json({ quotes: {}, error: 'No tokens provided' }); return; }
  const apiKey = process.env.ANGELONE_API_KEY, clientId = process.env.ANGELONE_CLIENT_ID, password = process.env.ANGELONE_PASSWORD, totpSecret = process.env.ANGELONE_TOTP_SECRET;
  if (!apiKey || !clientId || !password || !totpSecret) { res.status(503).json({ quotes: {}, error: 'AngelOne credentials not configured' }); return; }
  const exchangeTokens: Record<string, string[]> = {};
  const tokenMeta: Record<string, { exchange: string; apiExchange: string }> = {};
  for (const { exchange, token, instrumentType = 'EQ' } of tokens) {
    const apiExch = toApiExchange(exchange, instrumentType);
    if (!exchangeTokens[apiExch]) exchangeTokens[apiExch] = [];
    if (!exchangeTokens[apiExch].includes(token)) exchangeTokens[apiExch].push(token);
    tokenMeta[token] = { exchange: exchange.toUpperCase(), apiExchange: apiExch };
  }
  try {
    const session = await getAngelSession(apiKey, clientId, password, totpSecret);
    const result  = await getMarketQuote(apiKey, session.accessToken, mode, exchangeTokens);
    const fetched = (result as { fetched?: unknown[] })?.fetched ?? [];
    const quotes: Record<string, unknown> = {};
    for (const q of fetched as Array<Record<string, unknown>>) {
      const tk = q.symbolToken as string;
      const full = q as Record<string, unknown>;
      quotes[tk] = { token: tk, exchange: tokenMeta[tk]?.exchange ?? q.exchange, tradingSymbol: q.tradingSymbol, ltp: q.ltp ?? 0, open: q.open ?? 0, high: q.high ?? 0, low: q.low ?? 0, close: q.close ?? 0, netChange: q.netChange ?? 0, percentChange: q.percentChange ?? 0, volume: q.tradeVolume ?? 0, avgPrice: q.avgPrice ?? 0, oi: q.opnInterest ?? 0, week52High: full['52WeekHigh'] ?? 0, week52Low: full['52WeekLow'] ?? 0, bid: (full.depth as Record<string, unknown[]> | undefined)?.buy?.[0] ? ((full.depth as Record<string, unknown[]>).buy[0] as Record<string, number>).price : 0, ask: (full.depth as Record<string, unknown[]> | undefined)?.sell?.[0] ? ((full.depth as Record<string, unknown[]>).sell[0] as Record<string, number>).price : 0 };
    }
    res.json({ quotes, unfetched: (result as { unfetched?: unknown[] })?.unfetched ?? [] });
  } catch (err) { res.status(500).json({ quotes: {}, error: err instanceof Error ? err.message : String(err) }); }
});

// GET /api/market-stream — SSE
router.get('/market-stream', (req: Request, res: Response) => {
  const symbolsParam = req.query.symbols as string ?? '';
  interface Entry { exchange: string; symbol: string }
  const entries: Entry[] = symbolsParam.split(',').map(s => s.trim().toUpperCase()).filter(Boolean).map(s => {
    const colon = s.indexOf(':');
    if (colon > 0) return { exchange: s.slice(0, colon), symbol: s.slice(colon + 1) };
    return { exchange: 'NSE', symbol: s };
  });

  if (!entries.length) {
    res.status(400).set('Content-Type', 'text/event-stream').send('data: {"error":"No symbols specified. Use ?symbols=NSE:NIFTY50,BSE:SENSEX"}\n\n'); return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  req.on('close', () => { closed = true; });

  async function fetchQuotes() {
    const pipe = redis.pipeline();
    for (const { exchange, symbol } of entries) {
      pipe.get(`at:market:quote:${exchange}:${symbol}`);
      pipe.get(`at:market:eod:${exchange}:${symbol}`);
    }
    const result = await pipe.exec();
    if (!result) return [];
    const out: Array<Record<string, unknown>> = [];
    for (let i = 0; i < entries.length; i++) {
      const live = result[i * 2]?.[1] as string | null;
      const eod  = result[i * 2 + 1]?.[1] as string | null;
      const raw  = live || eod;
      if (!raw) continue;
      try {
        const q = JSON.parse(raw) as Record<string, unknown>;
        out.push({ symbol: entries[i].symbol, exchange: entries[i].exchange, ltp: q.ltp ?? null, open: q.open ?? null, high: q.high ?? null, low: q.low ?? null, close: q.close ?? null, prevClose: q.prevClose ?? null, netChange: q.netChange ?? null, changePct: q.percentChange ?? q.changePct ?? null, volume: q.volume ?? null, source: live ? 'live' : 'eod', updatedAt: q.updatedAt ?? null });
      } catch { /* malformed */ }
    }
    return out;
  }

  (async () => {
    try { const initial = await fetchQuotes(); if (initial.length) res.write(`data: ${JSON.stringify(initial)}\n\n`); } catch { /* Redis down */ }
    const lastSent = new Map<string, string>();
    let heartbeat = 0;
    while (!closed) {
      await new Promise(r => setTimeout(r, 500));
      if (closed) break;
      try {
        const quotes = await fetchQuotes();
        const updates = quotes.filter(q => {
          const key = `${q.exchange}:${q.symbol}`;
          const serialized = JSON.stringify(q);
          if (serialized === lastSent.get(key)) return false;
          lastSent.set(key, serialized);
          return true;
        });
        if (updates.length) res.write(`data: ${JSON.stringify(updates)}\n\n`);
      } catch { /* Redis unavailable */ }
      heartbeat += 1500;
      if (heartbeat >= 15_000) { heartbeat = 0; if (!closed) res.write(': ping\n\n'); }
    }
    try { res.end(); } catch { /* already closed */ }
  })();
});

export default router;
