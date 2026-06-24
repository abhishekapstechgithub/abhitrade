// Server-side AngelOne SmartStream 2.0 WebSocket — Node.js only (not browser).
// Uses the 'ws' npm package. Connects Mon-Fri 9:00-15:35 IST.
// Each tick is buffered and flushed to Redis every 3s and to Postgres every 30s.

import WebSocket from 'ws';
import { redis } from '../redis-client';
import { getPool } from '../db/client';
import { INDEX_TOKENS, EQUITY_TOKENS } from './tokens';

// ── Token → symbol/exchange maps ──────────────────────────────────────────────
const TOKEN_SYMBOL   = new Map<string, string>();
const TOKEN_EXCHANGE = new Map<string, string>();
const TOKEN_TRADING  = new Map<string, string>(); // token → tradingSymbol

for (const [sym, info] of [
  ...Object.entries(INDEX_TOKENS),
  ...Object.entries(EQUITY_TOKENS),
]) {
  if (!TOKEN_SYMBOL.has(info.token)) {
    TOKEN_SYMBOL.set(info.token, sym.toUpperCase());
    TOKEN_EXCHANGE.set(info.token, info.exchange);
    TOKEN_TRADING.set(info.token, info.tradingSymbol);
  }
}

// ExchangeType codes for AngelOne WS
const EXCH_TYPE: Record<string, number> = { NSE: 1, BSE: 3 };
const EXCH_FROM_TYPE: Record<number, string> = { 1: 'NSE', 2: 'NSE', 3: 'BSE', 4: 'BSE' };

interface PriceTick {
  token:        string;
  exchangeType: number;
  exchange:     string;
  ltp:          number;
  open:         number;
  high:         number;
  low:          number;
  close:        number; // previous day close from AngelOne
  volume:       number;
  ts:           number;
}

// Build subscription list grouped by exchangeType
function buildTokenList(): Array<{ exchangeType: number; tokens: string[] }> {
  const byType = new Map<number, string[]>();
  const seen   = new Set<string>();
  for (const info of [...Object.values(INDEX_TOKENS), ...Object.values(EQUITY_TOKENS)]) {
    if (seen.has(info.token)) continue;
    seen.add(info.token);
    const et = EXCH_TYPE[info.exchange] ?? 1;
    if (!byType.has(et)) byType.set(et, []);
    byType.get(et)!.push(info.token);
  }
  return Array.from(byType.entries()).map(([exchangeType, tokens]) => ({ exchangeType, tokens }));
}

// ── Market hours check ─────────────────────────────────────────────────────────
function isMarketHours(): boolean {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = ist.getDay();
  if (day === 0 || day === 6) return false; // weekends
  const t = ist.getHours() * 60 + ist.getMinutes();
  return t >= 9 * 60 && t <= 15 * 60 + 35; // 09:00 – 15:35 IST
}

// ── Postgres UNNEST upsert ─────────────────────────────────────────────────────
const UPSERT_LIVE_SQL = `
INSERT INTO market_quotes
  (exchange, symbol, trading_symbol, token, ltp, open, high, low, close,
   net_change, percent_change, volume, synced_at)
SELECT
  UNNEST($1::text[]),  UNNEST($2::text[]),  UNNEST($3::text[]),  UNNEST($4::text[]),
  UNNEST($5::numeric[]), UNNEST($6::numeric[]), UNNEST($7::numeric[]), UNNEST($8::numeric[]),
  UNNEST($9::numeric[]), UNNEST($10::numeric[]), UNNEST($11::numeric[]), UNNEST($12::bigint[]),
  NOW()
ON CONFLICT (exchange, symbol) DO UPDATE SET
  trading_symbol  = EXCLUDED.trading_symbol,
  token           = EXCLUDED.token,
  ltp             = EXCLUDED.ltp,
  open            = EXCLUDED.open,
  high            = GREATEST(COALESCE(market_quotes.high, 0), EXCLUDED.high),
  low             = CASE
                      WHEN COALESCE(market_quotes.low, 0) = 0 THEN EXCLUDED.low
                      ELSE LEAST(market_quotes.low, EXCLUDED.low)
                    END,
  close           = EXCLUDED.close,
  net_change      = EXCLUDED.net_change,
  percent_change  = EXCLUDED.percent_change,
  volume          = EXCLUDED.volume,
  synced_at       = NOW()
`;

// ── Live Feed Manager ──────────────────────────────────────────────────────────
class LiveFeedManager {
  private ws:          WebSocket | null = null;
  private buffer       = new Map<string, PriceTick>(); // token → latest tick
  private flushTimer:  ReturnType<typeof setInterval> | null = null;
  private pgTimer:     ReturnType<typeof setInterval> | null = null;
  private flushing     = false;
  private reconnTimer: ReturnType<typeof setTimeout>  | null = null;
  private reconnDelay  = 3_000;
  private running      = false;
  private creds:       { feedToken: string; clientCode: string; apiKey: string };

  constructor(creds: { feedToken: string; clientCode: string; apiKey: string }) {
    this.creds = creds;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.doConnect();
    // Flush to Redis + Postgres every 3 s — skip tick if previous flush still running
    this.flushTimer = setInterval(() => {
      if (this.flushing) return;
      this.flushing = true;
      this.flush().catch(() => {}).finally(() => { this.flushing = false; });
    }, 3_000);
    console.log('[ws-live] Started — subscribing to', TOKEN_SYMBOL.size, 'instruments');
  }

  private doConnect() {
    if (!this.running || this.ws) return;
    const { feedToken, clientCode, apiKey } = this.creds;
    const url = [
      'wss://smartapisocket.angelone.in/smart-stream',
      `?clientCode=${encodeURIComponent(clientCode)}`,
      `&feedToken=${encodeURIComponent(feedToken)}`,
      `&apiKey=${encodeURIComponent(apiKey)}`,
    ].join('');

    const ws = new WebSocket(url);
    this.ws   = ws;

    ws.on('open', () => {
      this.reconnDelay = 3_000;
      console.log('[ws-live] Connected to AngelOne SmartStream');
      // Subscribe to all tokens in mode 3 (SnapQuote = full OHLCV)
      ws.send(JSON.stringify({
        correlationID: 'sv001',
        action: 1,
        params: { mode: 3, tokenList: buildTokenList() },
      }));
    });

    ws.on('message', (data: Buffer) => {
      const tick = this.parse(data);
      if (tick) this.buffer.set(tick.token, tick);
    });

    ws.on('close', () => {
      this.ws = null;
      if (!this.running) return;
      console.log(`[ws-live] Disconnected — reconnecting in ${this.reconnDelay / 1000}s`);
      this.reconnTimer = setTimeout(() => {
        this.reconnDelay = Math.min(this.reconnDelay * 2, 60_000);
        this.doConnect();
      }, this.reconnDelay);
    });

    ws.on('error', (e) => {
      console.warn('[ws-live] WS error:', e.message);
      ws.terminate();
    });

    // 30 s heartbeat
    const hb = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, 30_000);
    ws.on('close', () => clearInterval(hb));
  }

  // ── Binary parser (Little Endian, AngelOne SmartStream 2.0) ──────────────────
  private parse(data: Buffer | ArrayBuffer): PriceTick | null {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
    if (buf.length < 51) return null;

    const mode         = buf.readInt8(0);
    const exchangeType = buf.readInt8(1);

    // Token: 25 bytes at offset 2, null-terminated UTF-8
    let token = '';
    for (let i = 2; i < 27 && buf[i] !== 0; i++) token += String.fromCharCode(buf[i]);

    const ltp      = Number(buf.readBigInt64LE(43)) / 100;
    const exchange = EXCH_FROM_TYPE[exchangeType] ?? 'NSE';

    // SnapQuote (mode 3): full OHLCV starts at offset 51
    let open = ltp, high = ltp, low = ltp, close = 0, volume = 0;
    if (mode >= 3 && buf.length >= 123) {
      volume = Number(buf.readBigInt64LE(67));
      open   = Number(buf.readBigInt64LE(91))  / 100;
      high   = Number(buf.readBigInt64LE(99))  / 100;
      low    = Number(buf.readBigInt64LE(107)) / 100;
      close  = Number(buf.readBigInt64LE(115)) / 100; // previous day close
    }

    return { token, exchangeType, exchange, ltp, open, high, low, close, volume, ts: Date.now() };
  }

  // ── Flush buffer → Redis + Postgres ──────────────────────────────────────────
  private async flush() {
    if (this.buffer.size === 0) return;
    const ticks = Array.from(this.buffer.values());
    this.buffer.clear();

    // ── Redis pipeline ──────────────────────────────────────────────────────────
    const TTL = 3600; // 1 h TTL — live prices survive between ticks & short outages
    const pipeline = redis.pipeline();

    for (const t of ticks) {
      const symbol  = TOKEN_SYMBOL.get(t.token);
      if (!symbol) continue;

      const netChg = t.close > 0 ? parseFloat((t.ltp - t.close).toFixed(2)) : 0;
      const pctChg = t.close > 0 ? parseFloat(((netChg / t.close) * 100).toFixed(4)) : 0;

      const quote = {
        symbol, exchange: t.exchange, token: t.token,
        tradingSymbol: TOKEN_TRADING.get(t.token) ?? symbol,
        ltp: t.ltp, open: t.open, high: t.high, low: t.low, close: t.close,
        volume: t.volume, netChange: netChg, percentChange: pctChg,
        updatedAt: t.ts,
      };

      // Same Redis keys as REST sync — frontend reads these transparently
      pipeline.setex(`at:market:ltp:${t.exchange}:${symbol}`,   TTL, String(t.ltp));
      pipeline.setex(`at:market:quote:${t.exchange}:${symbol}`, TTL, JSON.stringify(quote));
      // Secondary key for index symbols (e.g. "Nifty 50")
      const ts = TOKEN_TRADING.get(t.token);
      if (ts && ts.toUpperCase() !== symbol) {
        pipeline.setex(`at:market:ltp:${t.exchange}:${ts.toUpperCase()}`,   TTL, String(t.ltp));
        pipeline.setex(`at:market:quote:${t.exchange}:${ts.toUpperCase()}`, TTL, JSON.stringify(quote));
      }
      // Raw tick key for WebSocket proxy / option chain
      pipeline.setex(`at:live:tick:${t.exchangeType}:${t.token}`, TTL, JSON.stringify(t));
      // Token-keyed LTP for paper trading engine (strategy-api reads this)
      pipeline.setex(`at:market:ltp:token:${t.token}`, TTL, String(t.ltp));
      // Token-keyed full quote for WebSocket push server
      pipeline.setex(`at:market:quote:token:${t.token}`, TTL, JSON.stringify(quote));
    }

    await pipeline.exec().catch(e => console.warn('[ws-live] Redis flush error:', e.message));

    // Publish OHLCV ticks to Redis pub/sub — strategy-api WebSocket streams consume this
    for (const t of ticks) {
      redis.publish('market:ticks', JSON.stringify({
        token: t.token, exchange: t.exchange,
        ltp: t.ltp, open: t.open, high: t.high, low: t.low, close: t.close,
        volume: t.volume, ts: t.ts,
      })).catch(() => {});
    }

    // ── Postgres UNNEST batch upsert ────────────────────────────────────────────
    const rows = ticks.filter(t => TOKEN_SYMBOL.has(t.token));
    if (!rows.length) return;

    const exch: string[] = [], sym: string[] = [], ts: string[] = [], tok: string[] = [];
    const ltps: string[] = [], opns: string[] = [], highs: string[] = [], lows: string[] = [];
    const closes: string[] = [], netChgs: string[] = [], pcts: string[] = [], vols: string[] = [];

    for (const t of rows) {
      const symbol  = TOKEN_SYMBOL.get(t.token)!;
      const netChg  = t.close > 0 ? parseFloat((t.ltp - t.close).toFixed(2)) : 0;
      const pctChg  = t.close > 0 ? parseFloat(((netChg / t.close) * 100).toFixed(4)) : 0;

      exch.push(t.exchange);
      sym.push(symbol);
      ts.push(TOKEN_TRADING.get(t.token) ?? symbol);
      tok.push(t.token);
      ltps.push(String(t.ltp));
      opns.push(String(t.open));
      highs.push(String(t.high));
      lows.push(String(t.low));
      closes.push(String(t.close));
      netChgs.push(String(netChg));
      pcts.push(String(pctChg));
      vols.push(String(t.volume));
    }

    try {
      await getPool('live').query(UPSERT_LIVE_SQL, [
        exch, sym, ts, tok, ltps, opns, highs, lows, closes, netChgs, pcts, vols,
      ]);
    } catch (e) {
      console.warn('[ws-live] Postgres flush error:', (e as Error).message);
    }
  }

  stop() {
    this.running = false;
    if (this.flushTimer)  clearInterval(this.flushTimer);
    if (this.pgTimer)     clearInterval(this.pgTimer);
    if (this.reconnTimer) clearTimeout(this.reconnTimer);
    this.ws?.terminate();
    this.ws = null;
    console.log('[ws-live] Stopped');
  }

  get isConnected() { return this.ws?.readyState === WebSocket.OPEN; }
}

// ── Singleton scheduler ────────────────────────────────────────────────────────
declare global { var _wsLiveMgr: LiveFeedManager | null | undefined; }

async function getWsCreds(): Promise<{ feedToken: string; clientCode: string; apiKey: string } | null> {
  const apiKey     = process.env.ANGELONE_API_KEY;
  const clientId   = process.env.ANGELONE_CLIENT_ID;
  const password   = process.env.ANGELONE_PASSWORD;
  const totpSecret = process.env.ANGELONE_TOTP_SECRET;

  if (!apiKey || !clientId) {
    console.warn('[ws-live] ANGELONE_API_KEY or ANGELONE_CLIENT_ID missing from env — cannot start WS');
    return null;
  }

  try {
    // Check cached session first
    const cached = await redis.get('at:market:session');
    if (cached) {
      const sess = JSON.parse(cached) as {
        accessToken: string; feedToken?: string; clientCode?: string; expiresAt: number;
      };
      if (sess.feedToken && Date.now() < sess.expiresAt) {
        return { feedToken: sess.feedToken, clientCode: sess.clientCode ?? clientId, apiKey };
      }
      console.log('[ws-live] Cached session expired or missing feedToken — re-logging in');
    } else {
      console.log('[ws-live] No cached session found — logging in to AngelOne');
    }

    // Auto-login using env vars (no manual trigger needed)
    if (!password || !totpSecret) {
      console.warn('[ws-live] ANGELONE_PASSWORD or ANGELONE_TOTP_SECRET missing — cannot auto-login');
      return null;
    }

    const { getAngelSession } = await import('./auth');
    const sess = await getAngelSession(apiKey, clientId, password, totpSecret);

    if (!sess.feedToken) {
      console.warn('[ws-live] AngelOne login succeeded but returned empty feedToken — WS cannot start');
      return null;
    }

    console.log('[ws-live] Auto-login successful — feedToken acquired');
    return { feedToken: sess.feedToken, clientCode: clientId, apiKey };
  } catch (e) {
    console.error('[ws-live] Failed to get credentials:', (e as Error).message);
    return null;
  }
}

export function scheduleWsLive(): void {
  // Check every 30 s whether to start/stop based on market hours
  setInterval(async () => {
    if (isMarketHours()) {
      if (!global._wsLiveMgr) {
        const creds = await getWsCreds();
        if (!creds) {
          console.warn('[ws-live] Still no credentials — will retry in 30 s');
          return;
        }
        global._wsLiveMgr = new LiveFeedManager(creds);
        global._wsLiveMgr.start();
      }
    } else {
      if (global._wsLiveMgr) {
        global._wsLiveMgr.stop();
        global._wsLiveMgr = null;
      }
    }
  }, 30_000);

  // Try to start immediately if we're inside market hours (no waiting for market-sync)
  setTimeout(async () => {
    if (!isMarketHours()) {
      console.log('[ws-live] Outside market hours — WS will auto-start at 09:00 IST');
      return;
    }
    const creds = await getWsCreds();
    if (!creds) {
      console.warn('[ws-live] Could not get credentials at startup — will retry every 30 s');
      return;
    }
    if (!global._wsLiveMgr) {
      global._wsLiveMgr = new LiveFeedManager(creds);
      global._wsLiveMgr.start();
    }
  }, 5_000); // try at 5 s — auto-login doesn't need market-sync to run first

  console.log('[ws-live] Scheduler started — will connect Mon–Fri 09:00–15:35 IST');
}
