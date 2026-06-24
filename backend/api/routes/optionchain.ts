import { Router, Request, Response } from 'express';
import { buildOptionChain, getOptionExpiries, diffChain } from '../lib/optionchain/service.js';
import { pushTicks, setSpot, getQuote, writeGreeks, type GreeksTick } from '../lib/optionchain/market-data.js';
import { getStrikes } from '../lib/optionchain/security-master.js';
import { getAngelSession } from '../lib/angelone/auth.js';
import { getOptionGreeks } from '../lib/angelone/client.js';
import { redis } from '../lib/redis-client.js';
import type { OptionChainResponse } from '../lib/optionchain/types.js';

const router = Router();
const EXPIRY_RE = /^\d{4}-\d{2}-\d{2}$/;

function toAngelExpiry(yyyymmdd: string): string {
  const [y, m, d] = yyyymmdd.split('-');
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  return `${d}${MONTHS[Number(m) - 1]}${y}`;
}

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

// GET /api/optionchain/greeks
router.get('/greeks', async (req: Request, res: Response) => {
  const symbol = (req.query.symbol as string ?? '').trim().toUpperCase();
  const expiry = (req.query.expiry as string ?? '').trim();
  if (!symbol || !expiry) { res.status(400).json({ error: 'symbol and expiry (YYYY-MM-DD) are required' }); return; }

  const greeksKey = `oc:greeks:${symbol}:${expiry}`;
  const GREEKS_CACHE_TTL = 180;
  try {
    const cached = await redis.get(greeksKey);
    if (cached) { res.set('X-Greeks-Source', 'cache').json(JSON.parse(cached)); return; }
  } catch { /* fall through */ }

  const apiKey = process.env.ANGELONE_API_KEY ?? '';
  const clientId = process.env.ANGELONE_CLIENT_ID ?? '';
  const password = process.env.ANGELONE_PASSWORD ?? '';
  const totpSecret = process.env.ANGELONE_TOTP_SECRET ?? '';
  if (!apiKey || !clientId || !password || !totpSecret) {
    res.status(503).json({ error: 'Angel One credentials not configured', source: 'unavailable', symbol, expiry, rows: [] }); return;
  }

  let session: { accessToken: string; feedToken: string };
  try { session = await getAngelSession(apiKey, clientId, password, totpSecret); }
  catch (err) { res.status(502).json({ error: 'Could not authenticate with Angel One', detail: (err as Error).message, source: 'unavailable', symbol, expiry, rows: [] }); return; }

  const angelExpiry = toAngelExpiry(expiry);
  let rawGreeks: Awaited<ReturnType<typeof getOptionGreeks>>;
  try { rawGreeks = await getOptionGreeks(apiKey, session.accessToken, symbol, angelExpiry); }
  catch (err) { res.status(502).json({ error: 'Angel One Greeks API failed', detail: (err as Error).message, source: 'unavailable', symbol, expiry, rows: [] }); return; }

  if (!rawGreeks?.length) { res.json({ symbol, expiry, source: 'unavailable', written: 0, rows: [] }); return; }

  const [strikePairs, spotData] = await Promise.all([getStrikes(symbol, expiry), (await import('../lib/optionchain/market-data.js')).getSpot(symbol)]);

  const ticks: GreeksTick[] = [];
  const rows: Array<Record<string, unknown>> = [];
  for (const g of rawGreeks) {
    const strike = parseFloat(g.strikePrice), optType = g.optionType as 'CE' | 'PE';
    const iv = parseFloat(g.impliedVolatility), delta = parseFloat(g.delta), gamma = parseFloat(g.gamma), theta = parseFloat(g.theta), vega = parseFloat(g.vega), volume = parseFloat(g.tradeVolume);
    rows.push({ strike, optionType: optType, iv, delta, gamma, theta, vega, volume });
    const pair = strikePairs?.get(strike);
    if (!pair) continue;
    const token = optType === 'CE' ? pair.ceToken : pair.peToken;
    const tradingSymbol = optType === 'CE' ? pair.ceSymbol : pair.peSymbol;
    if (!token) continue;
    ticks.push({ token, tradingSymbol, strike, optType, spot: spotData.ltp, iv, delta, gamma, theta, vega, volume });
  }

  const written = await writeGreeks(ticks);
  const result = { symbol, expiry, source: 'live' as const, written, rows };
  try { await redis.set(greeksKey, JSON.stringify(result), 'EX', GREEKS_CACHE_TTL); } catch { /* non-fatal */ }
  res.set({ 'Cache-Control': `public, s-maxage=${GREEKS_CACHE_TTL}`, 'X-Greeks-Source': 'live', 'X-Greeks-Written': String(written) }).json(result);
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
  const TICK_MS  = 2000;
  const MAX_TICKS = 3600;

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
