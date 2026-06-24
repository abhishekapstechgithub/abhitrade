import { Router, Request, Response } from 'express';
import { createHmac } from 'crypto';
import { getPosition, getProfile, getRMS, getMarketQuote, searchScrip, getCandleData, getOrderMargin, getOrderBook, getTradeBook, getAllHolding, type CandleInterval } from '../lib/angelone/client.js';
import { candleDateRange, TF_TO_INTERVAL } from '../lib/angelone/tokens.js';

const router = Router();
const ANGEL_LOGIN_URL = 'https://apiconnect.angelone.in/rest/auth/angelbroking/user/v1/loginByPassword';
const ANGEL_API_BASE  = 'https://apiconnect.angelbroking.com';

function base32Decode(s: string): Buffer {
  const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const input = s.toUpperCase().replace(/=+$/, '');
  let bits = 0, val = 0;
  const out: number[] = [];
  for (const c of input) {
    const idx = ALPHA.indexOf(c);
    if (idx < 0) continue;
    val = (val << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

function generateTOTP(secret: string, windowOffset = 0): string {
  const key  = base32Decode(secret);
  const step = Math.floor(Date.now() / 1000 / 30) + windowOffset;
  const buf  = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step >>> 0, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const off  = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1_000_000).padStart(6, '0');
}

async function tryLogin(apiKey: string, clientId: string, clientPassword: string, totp: string) {
  const res = await fetch(ANGEL_LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json',
      'X-UserType': 'USER', 'X-SourceID': 'WEB',
      'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '106.51.128.1',
      'X-MACAddress': '00:00:00:00:00:00', 'X-PrivateKey': apiKey,
    },
    body: JSON.stringify({ clientcode: clientId, password: clientPassword, totp }),
  });
  return res.json() as Promise<{ status: boolean; message: string; errorcode: string; data: { jwtToken: string; refreshToken: string; feedToken: string; name?: string; email?: string } | null }>;
}

// POST /api/angel-one/connect
router.post('/connect', async (req: Request, res: Response) => {
  try {
    const { apiKey, clientId, clientPassword, totpSecret } = req.body;
    if (!apiKey || !clientId || !clientPassword) { res.status(400).json({ error: 'Client ID, API Key, and Password are required' }); return; }
    if (!totpSecret) { res.status(400).json({ error: 'TOTP secret is required' }); return; }
    let lastError = 'Authentication failed';
    for (const offset of [0, 1, -1]) {
      const totp = generateTOTP(totpSecret, offset);
      const data = await tryLogin(apiKey, clientId, clientPassword, totp);
      if (data.status && data.data?.jwtToken) {
        res.json({ accessToken: data.data.jwtToken, feedToken: data.data.feedToken, refreshToken: data.data.refreshToken, profile: { name: data.data.name, email: data.data.email } });
        return;
      }
      const isTotpError = data.errorcode === 'AG8004' || (data.message ?? '').toLowerCase().includes('totp');
      lastError = data.message || lastError;
      if (!isTotpError) break;
    }
    res.status(401).json({ error: lastError });
  } catch (err) {
    res.status(500).json({ error: 'Connection failed: ' + (err instanceof Error ? err.message : String(err)) });
  }
});

// POST /api/angel-one/positions
router.post('/positions', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    res.json({ positions: (await getPosition(apiKey, accessToken)) ?? [] });
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/profile
router.post('/profile', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const [profile, rms] = await Promise.all([getProfile(apiKey, accessToken), getRMS(apiKey, accessToken)]);
    res.json({ profile, rms });
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/quotes
router.post('/quotes', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken, mode = 'FULL', exchangeTokens } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (!exchangeTokens) { res.status(400).json({ error: 'exchangeTokens required' }); return; }
    res.json(await getMarketQuote(apiKey, accessToken, mode, exchangeTokens));
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/search
router.post('/search', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken, exchange = 'NSE', query } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (!query) { res.json({ results: [] }); return; }
    const [nse, bse] = await Promise.allSettled([
      exchange === 'NSE' || exchange === 'ALL' ? searchScrip(apiKey, accessToken, 'NSE', query) : Promise.resolve([]),
      exchange === 'BSE' || exchange === 'ALL' ? searchScrip(apiKey, accessToken, 'BSE', query) : Promise.resolve([]),
    ]);
    const results = [
      ...(nse.status === 'fulfilled' ? nse.value ?? [] : []),
      ...(bse.status === 'fulfilled' ? bse.value ?? [] : []),
    ];
    res.json({ results });
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/candles
router.post('/candles', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken, exchange, symboltoken, timeframe } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (!exchange || !symboltoken) { res.status(400).json({ error: 'exchange and symboltoken required' }); return; }
    const interval = (TF_TO_INTERVAL[timeframe] ?? 'ONE_DAY') as CandleInterval;
    const { from, to } = candleDateRange(interval);
    const candles = await getCandleData(apiKey, accessToken, exchange, symboltoken, interval, from, to);
    res.json({ candles: candles ?? [], interval, from, to });
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/ltp
router.post('/ltp', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken, symbol, exchange = 'NSE' } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (!symbol) { res.status(400).json({ error: 'symbol required' }); return; }
    const results = await searchScrip(apiKey, accessToken, exchange, symbol);
    if (!results?.length) { res.status(404).json({ error: `Symbol "${symbol}" not found on ${exchange}` }); return; }
    const scrip = results.find((r: { instrumenttype: string }) => r.instrumenttype === 'EQ') ?? results.find((r: { instrumenttype: string }) => r.instrumenttype === 'INDEX') ?? results[0];
    const quote = await getMarketQuote(apiKey, accessToken, 'FULL', { [scrip.exchange]: [scrip.symboltoken] });
    const fetched = (quote as { fetched?: Array<Record<string, unknown>> })?.fetched?.[0];
    if (!fetched) { res.status(404).json({ error: 'Quote not available' }); return; }
    res.json({ ltp: fetched.ltp, open: fetched.open, high: fetched.high, low: fetched.low, close: fetched.close, netChange: fetched.netChange, percentChange: fetched.percentChange, volume: fetched.tradeVolume, token: scrip.symboltoken, tradingsymbol: scrip.tradingsymbol, exchange: scrip.exchange });
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/margin
router.post('/margin', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken, positions } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    if (!Array.isArray(positions) || !positions.length) { res.status(400).json({ error: 'positions array required' }); return; }
    res.json(await getOrderMargin(apiKey, accessToken, positions));
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/orderbook
router.post('/orderbook', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const [orders, trades] = await Promise.all([
      getOrderBook(apiKey, accessToken).catch(() => []),
      getTradeBook(apiKey, accessToken).catch(() => []),
    ]);
    res.json({ orders: orders ?? [], trades: trades ?? [] });
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/place-order
router.post('/place-order', async (req: Request, res: Response) => {
  try {
    const { accessToken, apiKey, order } = req.body;
    if (!accessToken || !apiKey) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const apiRes = await fetch(`${ANGEL_API_BASE}/rest/secure/angelbroking/order/v1/placeOrder`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: 'application/json',
        'X-UserType': 'USER', 'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1', 'X-ClientPublicIP': '127.0.0.1',
        'X-MACAddress': '00:00:00:00:00:00',
        'X-PrivateKey': apiKey, Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(order),
    });
    const text = await apiRes.text();
    let data: { status?: boolean; message?: string; data?: { orderid?: string } };
    try { data = JSON.parse(text); } catch {
      const hint = text.toLowerCase();
      const msg = hint.includes('access') ? 'Access denied — check API key and token' : hint.includes('rate') ? 'Rate limit exceeded' : text.substring(0, 200);
      res.status(502).json({ error: msg }); return;
    }
    if (!data.status) { res.status(400).json({ error: data.message || 'Order placement failed' }); return; }
    res.json({ orderId: data.data?.orderid, message: data.message });
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// POST /api/angel-one/portfolio
router.post('/portfolio', async (req: Request, res: Response) => {
  try {
    const { apiKey, accessToken } = req.body;
    if (!apiKey || !accessToken) { res.status(401).json({ error: 'Not authenticated' }); return; }
    const [holdingData, rms] = await Promise.all([getAllHolding(apiKey, accessToken), getRMS(apiKey, accessToken)]);
    res.json({ holdingData, rms });
  } catch (err) { res.status(500).json({ error: String(err instanceof Error ? err.message : err) }); }
});

export default router;
