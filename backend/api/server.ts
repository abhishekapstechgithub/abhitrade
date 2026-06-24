import http from 'http';
import express from 'express';
import cookieParser from 'cookie-parser';
import { WebSocketServer, WebSocket } from 'ws';
import { corsMiddleware } from './middleware/cors.js';
import { registerRoutes } from './routes/index.js';
import { scheduleMarketSync } from './lib/market-sync.js';
import { scheduleMoversSync } from './lib/groww-movers.js';
import { scheduleWsLive } from './lib/angelone/ws-live.js';
import { scheduleBhavcopyCron } from './lib/bhavcopy-auto.js';
import { redis } from './lib/redis-client.js';
import { tickBus, type LiveTick } from './lib/tick-bus.js';

const app  = express();
const PORT = Number(process.env.PORT ?? 3001);

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(corsMiddleware);
app.options('*', corsMiddleware);           // preflight
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ── Routes ──────────────────────────────────────────────────────────────────
registerRoutes(app);

// ── 404 fallback ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ────────────────────────────────────────────────────
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[server error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── HTTP + WebSocket server ─────────────────────────────────────────────────
const server = http.createServer(app);

// ── WebSocket push server (/ws/stream) ─────────────────────────────────────
// Clients send: { type: 'subscribe', tokens: ['26000', '3045', ...] }
//               { type: 'unsubscribe', tokens: [...] }
// Server pushes on each AngelOne tick (< 100ms from exchange) via tickBus.
// On subscribe, an immediate Redis snapshot is sent for currently-cached prices.

const wss = new WebSocketServer({ server, path: '/ws/stream' });

function makeTick(token: string, q: Record<string, unknown>) {
  return {
    token,
    mode:           'full',
    ltp:            q.ltp            ?? 0,
    net_change:     q.netChange      ?? 0,
    percent_change: q.percentChange  ?? 0,
    high:           q.high           ?? 0,
    low:            q.low            ?? 0,
    open:           q.open           ?? 0,
    close:          q.close          ?? 0,
    volume:         q.volume         ?? 0,
  };
}

wss.on('connection', (ws: WebSocket) => {
  const subscribedTokens = new Set<string>();

  // Send a Redis snapshot for newly subscribed tokens so the client sees prices
  // immediately (e.g. outside market hours when tickBus is idle)
  async function sendSnapshot(tokens: string[]) {
    if (!tokens.length || ws.readyState !== WebSocket.OPEN) return;
    try {
      const pipe = redis.pipeline();
      for (const token of tokens) pipe.get(`at:market:quote:token:${token}`);
      const results = await pipe.exec();
      if (!results) return;
      for (let i = 0; i < tokens.length; i++) {
        const raw = results[i]?.[1] as string | null;
        if (!raw || ws.readyState !== WebSocket.OPEN) continue;
        const q = JSON.parse(raw) as Record<string, unknown>;
        if ((q.ltp as number) > 0) ws.send(JSON.stringify(makeTick(tokens[i], q)));
      }
    } catch { /* Redis unavailable */ }
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type: string; tokens?: string[] };
      if (msg.type === 'subscribe' && Array.isArray(msg.tokens)) {
        const newTokens = msg.tokens.map(String).filter(t => !subscribedTokens.has(t));
        newTokens.forEach(t => subscribedTokens.add(t));
        sendSnapshot(newTokens);
      } else if (msg.type === 'unsubscribe' && Array.isArray(msg.tokens)) {
        msg.tokens.forEach(t => subscribedTokens.delete(String(t)));
      }
    } catch { /* ignore malformed */ }
  });

  // Forward each AngelOne tick directly to this client if the token is subscribed
  const tickHandler = (tick: LiveTick) => {
    if (!subscribedTokens.has(tick.token) || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({
      token:          tick.token,
      mode:           'full',
      ltp:            tick.ltp,
      net_change:     tick.netChange,
      percent_change: tick.percentChange,
      high:           tick.high,
      low:            tick.low,
      open:           tick.open,
      close:          tick.close,
      volume:         tick.volume,
    }));
  };

  tickBus.onTick(tickHandler);

  ws.on('close', () => tickBus.offTick(tickHandler));
  ws.on('error', () => { tickBus.offTick(tickHandler); try { ws.terminate(); } catch { /* ignore */ } });
});

server.listen(PORT, () => {
  console.log(`AbhiTrade API server listening on :${PORT}`);
  console.log(`WebSocket server ready at ws://localhost:${PORT}/ws/stream`);
  // Background jobs (market sync, WS feed, movers, bhavcopy)
  scheduleMarketSync();
  scheduleMoversSync();
  scheduleWsLive();
  scheduleBhavcopyCron();
});

export default app;
