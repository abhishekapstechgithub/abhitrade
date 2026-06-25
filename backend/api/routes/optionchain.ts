import { Router, Request, Response } from 'express';
import { buildOptionChain, getOptionExpiries, diffChain } from '../lib/optionchain/service.js';
import { pushTicks, setSpot, getQuote } from '../lib/optionchain/market-data.js';
import { syncUnivestToRedis, getUnivestSid, toUnivestExp } from '../lib/optionchain/univest-feed.js';
import { redis } from '../lib/redis-client.js';
import type { OptionChainResponse } from '../lib/optionchain/types.js';

const router = Router();
const EXPIRY_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/optionchain
router.get('/', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string ?? '').trim().toUpperCase();
  const expiry = (req.query.expiry as string ?? '').trim();
  if (!symbol) { res.status(400).json({ error: 'symbol is required' }); return; }
  if (!expiry || !EXPIRY_RE.test(expiry)) { res.status(400).json({ error: 'expiry is required (YYYY-MM-DD)' }); return; }
  const strikeCount = Math.min(50, Math.max(1, Number(req.query.strikeCount ?? 15)));
  const fromStrike  = req.query.fromStrike ? Number(req.query.fromStrike) : undefined;
  const toStrike    = req.query.toStrike   ? Number(req.query.toStrike)   : undefined;
  const t0 = Date.now();
  try {
    const chain = await buildOptionChain({ symbol, expiry, strikeCount, fromStrike, toStrike });
    const elapsed = Date.now() - t0;
    res.set({ 'Cache-Control': 'no-store', 'X-Option-Chain-Latency-Ms': String(elapsed), 'X-Option-Chain-Source': chain.source, 'X-Option-Chain-Rows': String(chain.rows.length) });
    res.json({ ...chain, _latencyMs: elapsed });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes('No instruments')) { res.status(404).json({ error: msg }); return; }
    if (msg.includes('Spot price unavailable')) { res.status(503).json({ error: msg }); return; }
    res.status(500).json({ error: 'Internal server error', detail: msg });
  }
});

// GET /api/optionchain/expiries
router.get('/expiries', async (req: Request, res: Response) => {
  const symbol   = (req.query.symbol   as string ?? '').trim().toUpperCase();
  const exchange = (req.query.exchange as string ?? '').trim().toUpperCase() || undefined;
  if (!symbol) { res.status(400).json({ error: 'symbol is required' }); return; }
  try {
    const result = await getOptionExpiries(symbol, exchange);
    if (!result.expiries.length) { res.status(404).json({ error: `No expiries found for symbol: ${symbol}` }); return; }
    res.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=30');
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', detail: (err as Error).message });
  }
});

// GET /api/optionchain/univest?symbol=NIFTY&expiry=2026-06-30
// Proxies the Univest OptChainGeeks API for any supported index.
// Supported symbols: NIFTY (13), BANKNIFTY (25), FINNIFTY (27), SENSEX (51), BANKEX (69).
// Date conversion: Univest Exp = Unix ts of (date - 10 years) at midnight IST.
router.get('/univest', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string ?? 'NIFTY').trim().toUpperCase();
  const expiry = (req.query.expiry as string ?? '').trim();
  if (!expiry || !EXPIRY_RE.test(expiry)) {
    res.status(400).json({ error: 'expiry is required (YYYY-MM-DD)' }); return;
  }
  const sid = getUnivestSid(symbol);
  if (!sid) {
    res.status(400).json({ error: `Unsupported symbol: ${symbol}. Supported: NIFTY, BANKNIFTY, FINNIFTY, SENSEX, BANKEX` }); return;
  }
  const exp = toUnivestExp(expiry);
  try {
    const upstream = await fetch('https://livepub.univest.in/DataPub/api/SData/OptChainGeeks', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'Accept':          'application/json, text/plain, */*',
        'Origin':          'https://www.univest.in',
        'Referer':         'https://www.univest.in/',
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      body: JSON.stringify({ Data: { UnderlyingSId: sid, Exch: 1, Exp: exp, Count: 1, Seg: '0' } }),
      signal: AbortSignal.timeout(12000),
    });
    if (!upstream.ok) {
      res.status(502).json({ error: `Univest API error: HTTP ${upstream.status}` }); return;
    }
    const raw = await upstream.json() as { code: number; remarks: string; data: unknown };
    res.set('Cache-Control', 'no-store').json(raw);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[optionchain/univest] fetch failed for ${symbol}:`, msg);
    res.status(502).json({ error: 'Failed to reach Univest API', detail: msg });
  }
});

// POST /api/optionchain/sync
// Fetches live option data from Univest and injects LTPs/OI/Greeks into Redis.
// Body: { symbol: 'NIFTY', expiry: '2026-06-30' }
router.post('/sync', async (req: Request, res: Response) => {
  const symbol = (req.body?.symbol as string ?? '').trim().toUpperCase();
  const expiry = (req.body?.expiry as string ?? '').trim();
  if (!symbol) { res.status(400).json({ error: 'symbol is required' }); return; }
  if (!expiry || !EXPIRY_RE.test(expiry)) { res.status(400).json({ error: 'expiry is required (YYYY-MM-DD)' }); return; }
  try {
    const result = await syncUnivestToRedis(symbol, expiry);
    res.json({ ok: true, symbol, expiry, ...result });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', detail: (err as Error).message });
  }
});

// GET /api/optionchain/quote?token=1001
// POST /api/optionchain/quote
router.get('/quote', async (req: Request, res: Response) => {
  const tokenStr = req.query.token as string;
  if (!tokenStr) { res.status(400).json({ error: 'token query param required' }); return; }
  const token = Number(tokenStr);
  if (isNaN(token)) { res.status(400).json({ error: 'token must be a number' }); return; }
  const quote = await getQuote(token);
  if (!quote) { res.status(404).json({ error: `No quote cached for token ${token}` }); return; }
  res.json(quote);
});

router.post('/quote', async (req: Request, res: Response) => {
  const { type } = req.body as { type?: string };
  if (type === 'spot') {
    const { spot } = req.body as { spot: { symbol: string; ltp: number; change: number; changePct: number } };
    if (!spot?.symbol || spot.ltp === undefined) { res.status(400).json({ error: 'spot.symbol and spot.ltp are required' }); return; }
    await setSpot(spot.symbol, { ltp: spot.ltp, change: spot.change ?? 0, changePct: spot.changePct ?? 0 });
    res.json({ ok: true, symbol: spot.symbol.toUpperCase(), ltp: spot.ltp }); return;
  }
  if (type === 'quotes') {
    const { ticks } = req.body as { ticks: unknown[] };
    if (!Array.isArray(ticks) || !ticks.length) { res.status(400).json({ error: 'ticks[] array is required' }); return; }
    const valid = ticks.filter((t: unknown) => t && typeof t === 'object' && 'token' in t && 'ltp' in t) as Parameters<typeof pushTicks>[0];
    await pushTicks(valid);
    res.json({ ok: true, pushed: valid.length }); return;
  }
  res.status(400).json({ error: 'type must be "quotes" or "spot"' });
});

// GET /api/optionchain/stream — SSE
router.get('/stream', (req: Request, res: Response) => {
  const symbol      = (req.query.symbol as string ?? '').trim().toUpperCase();
  const expiry      = (req.query.expiry as string ?? '').trim();
  const strikeCount = Math.min(50, Number(req.query.strikeCount ?? 15));
  const TICK_MS     = 2000;
  const MAX_TICKS   = 3600;
  // Re-sync from Univest every 30 ticks (~60s) to keep LTPs fresh
  const UNIVEST_SYNC_EVERY = 30;

  if (!symbol || !expiry || !EXPIRY_RE.test(expiry)) {
    res.status(400).json({ error: 'symbol and expiry (YYYY-MM-DD) are required' }); return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  let closed = false;
  let ticks = 0;
  let prev: OptionChainResponse | null = null;

  req.on('close', () => { closed = true; });

  function send(event: string, data: unknown) {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  async function tick() {
    if (closed || ticks >= MAX_TICKS) { res.end(); return; }
    // Periodically refresh Univest data into Redis (non-blocking, errors ignored)
    if (ticks % UNIVEST_SYNC_EVERY === 0) {
      syncUnivestToRedis(symbol, expiry).catch(() => { /* non-fatal */ });
    }
    try {
      const curr = await buildOptionChain({ symbol, expiry, strikeCount });
      if (!prev) {
        send('snapshot', curr);
      } else {
        const delta = diffChain(prev, curr);
        if (delta.changedRows.length > 0 || curr.spot !== prev.spot) send('delta', delta);
        else if (!closed) res.write(': heartbeat\n\n');
      }
      prev = curr;
    } catch (err) {
      send('error', { message: (err as Error).message });
    }
    ticks++;
    if (!closed) setTimeout(tick, TICK_MS);
  }

  tick();
});

export default router;
