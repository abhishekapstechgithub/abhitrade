/**
 * GET /api/market-stream?symbols=NSE:NIFTY50,NSE:RELIANCE,BSE:SENSEX
 *
 * Server-Sent Events stream. Polls Redis every 1.5 s and pushes only changed quotes.
 * Priority per symbol: Redis live (AngelOne WS) → Redis EOD (bhavcopy) → nothing.
 *
 * Client usage:
 *   const es = new EventSource('/api/market-stream?symbols=NSE:NIFTY50,NSE:RELIANCE');
 *   es.onmessage = e => console.log(JSON.parse(e.data)); // array of quote objects
 *
 * Mobile (React Native / Expo):
 *   Use the 'react-native-sse' package or fetch with streaming + TextDecoder.
 */
export const dynamic = 'force-dynamic';
import { NextRequest } from 'next/server';
import { redis } from '@/lib/redis-client';

interface Entry { exchange: string; symbol: string }

function parseSymbols(param: string): Entry[] {
  return param
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean)
    .map(s => {
      const colon = s.indexOf(':');
      if (colon > 0) return { exchange: s.slice(0, colon), symbol: s.slice(colon + 1) };
      return { exchange: 'NSE', symbol: s };
    });
}

async function fetchQuotes(entries: Entry[]): Promise<Array<Record<string, unknown>>> {
  const pipe = redis.pipeline();
  for (const { exchange, symbol } of entries) {
    pipe.get(`at:market:quote:${exchange}:${symbol}`);   // live WS data
    pipe.get(`at:market:eod:${exchange}:${symbol}`);     // EOD bhavcopy data
  }
  const res = await pipe.exec();
  if (!res) return [];

  const out: Array<Record<string, unknown>> = [];
  for (let i = 0; i < entries.length; i++) {
    const live = res[i * 2]?.[1]     as string | null;
    const eod  = res[i * 2 + 1]?.[1] as string | null;
    const raw  = live || eod;
    if (!raw) continue;
    try {
      const q = JSON.parse(raw) as Record<string, unknown>;
      out.push({
        symbol:        entries[i].symbol,
        exchange:      entries[i].exchange,
        ltp:           q.ltp           ?? null,
        open:          q.open          ?? null,
        high:          q.high          ?? null,
        low:           q.low           ?? null,
        close:         q.close         ?? null,
        prevClose:     q.prevClose     ?? null,
        netChange:     q.netChange     ?? null,
        changePct:     q.percentChange ?? q.changePct ?? null,
        volume:        q.volume        ?? null,
        source:        live ? 'live' : 'eod',
        updatedAt:     q.updatedAt     ?? null,
      });
    } catch { /* malformed */ }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') ?? '';
  const entries = parseSymbols(symbolsParam);

  if (!entries.length) {
    return new Response('data: {"error":"No symbols specified. Use ?symbols=NSE:NIFTY50,BSE:SENSEX"}\n\n', {
      status: 400,
      headers: { 'Content-Type': 'text/event-stream' },
    });
  }

  const encoder = new TextEncoder();
  let closed = false;
  req.signal.addEventListener('abort', () => { closed = true; });

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        if (!closed) controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // Initial snapshot — send all current values immediately
      try {
        const initial = await fetchQuotes(entries);
        if (initial.length) send(initial);
      } catch { /* Redis down — client will retry */ }

      const lastSent = new Map<string, string>();
      let heartbeat = 0;

      while (!closed) {
        await new Promise(r => setTimeout(r, 1500));
        if (closed) break;

        try {
          const quotes = await fetchQuotes(entries);
          const updates = quotes.filter(q => {
            const key = `${q.exchange}:${q.symbol}`;
            const serialized = JSON.stringify(q);
            if (serialized === lastSent.get(key)) return false;
            lastSent.set(key, serialized);
            return true;
          });
          if (updates.length) send(updates);
        } catch { /* Redis unavailable — keep polling */ }

        // Keep-alive comment every 15 s so nginx / mobile don't drop the connection
        heartbeat += 1500;
        if (heartbeat >= 15_000) {
          heartbeat = 0;
          if (!closed) controller.enqueue(encoder.encode(': ping\n\n'));
        }
      }

      try { controller.close(); } catch { /* already closed */ }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // tell nginx not to buffer SSE responses
    },
  });
}
