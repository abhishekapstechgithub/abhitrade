/**
 * GET /api/optionchain/stream?symbol=NIFTY&expiry=2025-06-26&strikeCount=15
 *
 * Server-Sent Events (SSE) stream.
 * Pushes option chain updates every 2 seconds.
 * Only sends rows that changed since the previous snapshot (diff).
 *
 * Client usage:
 *   const es = new EventSource('/api/optionchain/stream?symbol=NIFTY&expiry=2025-06-26');
 *   es.addEventListener('snapshot', e => { const data = JSON.parse(e.data); });
 *   es.addEventListener('delta',    e => { const data = JSON.parse(e.data); });
 *   es.addEventListener('error',    e => console.error(e));
 *
 * WebSocket upgrade note:
 *   For true WebSocket support (ws://), deploy a standalone Node.js WebSocket
 *   server (see workers/option-chain-ws-server.ts) alongside Next.js.
 *   The SSE stream here covers 99% of browser use-cases with zero config.
 */

import { NextRequest }   from 'next/server';
import { buildOptionChain, diffChain } from '@/lib/optionchain/service';
import { OptionChainResponse }         from '@/lib/optionchain/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const TICK_MS       = 2000;   // push interval
const MAX_TICKS     = 3600;   // auto-close after 2 hours (= 3600 × 2s)
const EXPIRY_RE     = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const p          = req.nextUrl.searchParams;
  const symbol     = (p.get('symbol') ?? '').trim().toUpperCase();
  const expiry     = (p.get('expiry') ?? '').trim();
  const strikeCount = Math.min(50, Number(p.get('strikeCount') ?? 15));

  if (!symbol || !expiry || !EXPIRY_RE.test(expiry)) {
    return new Response(
      JSON.stringify({ error: 'symbol and expiry (YYYY-MM-DD) are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const encoder = new TextEncoder();

  function sseEvent(event: string, data: unknown): Uint8Array {
    return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const stream = new ReadableStream({
    async start(controller) {
      let prev:   OptionChainResponse | null = null;
      let ticks   = 0;
      let closed  = false;

      // Respect client disconnect
      req.signal.addEventListener('abort', () => { closed = true; });

      async function tick() {
        if (closed || ticks >= MAX_TICKS) {
          controller.close();
          return;
        }

        try {
          const curr = await buildOptionChain({ symbol, expiry, strikeCount });

          if (!prev) {
            // First tick: full snapshot
            controller.enqueue(sseEvent('snapshot', curr));
          } else {
            // Subsequent ticks: diff only
            const delta = diffChain(prev, curr);
            if (delta.changedRows.length > 0 || curr.spot !== prev.spot) {
              controller.enqueue(sseEvent('delta', delta));
            } else {
              // Heartbeat so connection doesn't time out
              controller.enqueue(encoder.encode(': heartbeat\n\n'));
            }
          }

          prev = curr;
        } catch (err) {
          controller.enqueue(
            sseEvent('error', { message: (err as Error).message }),
          );
        }

        ticks++;
        if (!closed) {
          setTimeout(tick, TICK_MS);
        }
      }

      // First tick immediately
      await tick();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':                'text/event-stream',
      'Cache-Control':               'no-cache, no-transform',
      'Connection':                  'keep-alive',
      'X-Accel-Buffering':           'no',   // disable nginx buffering
      'Access-Control-Allow-Origin': '*',
    },
  });
}
