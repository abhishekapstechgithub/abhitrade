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
// Server pushes every 1.5 s: { token, ltp, net_change, percent_change, high, low, open, close, volume, mode: 'full' }

const wss = new WebSocketServer({ server, path: '/ws/stream' });

interface WsClient {
  ws: WebSocket;
  tokens: Set<string>;
  timer: ReturnType<typeof setInterval>;
}

wss.on('connection', (ws: WebSocket) => {
  const client: WsClient = { ws, tokens: new Set(), timer: null as unknown as ReturnType<typeof setInterval> };

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as { type: string; tokens?: string[] };
      if (msg.type === 'subscribe' && Array.isArray(msg.tokens)) {
        msg.tokens.forEach(t => client.tokens.add(String(t)));
      } else if (msg.type === 'unsubscribe' && Array.isArray(msg.tokens)) {
        msg.tokens.forEach(t => client.tokens.delete(String(t)));
      }
    } catch { /* ignore malformed */ }
  });

  ws.on('close', () => clearInterval(client.timer));
  ws.on('error', () => { clearInterval(client.timer); try { ws.terminate(); } catch { /* ignore */ } });

  client.timer = setInterval(async () => {
    if (ws.readyState !== WebSocket.OPEN || client.tokens.size === 0) return;
    try {
      const pipe = redis.pipeline();
      const tokens = Array.from(client.tokens);
      for (const token of tokens) {
        pipe.get(`at:market:quote:token:${token}`);
      }
      const results = await pipe.exec();
      if (!results) return;
      for (let i = 0; i < tokens.length; i++) {
        const raw = results[i]?.[1] as string | null;
        if (!raw) continue;
        const q = JSON.parse(raw) as Record<string, unknown>;
        const tick = {
          token:          tokens[i],
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
        if ((tick.ltp as number) > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(tick));
        }
      }
    } catch { /* Redis unavailable — skip tick */ }
  }, 1500);
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
