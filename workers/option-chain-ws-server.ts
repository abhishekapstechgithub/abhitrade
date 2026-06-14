#!/usr/bin/env node
/**
 * Standalone WebSocket server for Option Chain streaming.
 *
 * Runs as a separate Node.js process alongside Next.js.
 * Clients subscribe to channels: "optionchain:{SYMBOL}:{EXPIRY}"
 *
 * Usage:
 *   npx ts-node workers/option-chain-ws-server.ts
 *   # or via Docker:
 *   node --loader ts-node/esm workers/option-chain-ws-server.ts
 *
 * Install dependency:
 *   npm install ws @types/ws
 *
 * Architecture:
 *   Browser → WS ws://host:3001 → this server
 *                                  ↓ reads
 *                              Redis quote cache (oc:q:{token})
 *                                  ↓ assembles
 *                              OptionChainResponse diff
 *                                  ↓ pushes to
 *                              subscribed clients
 *
 * Client usage:
 *   const ws = new WebSocket('ws://localhost:3001');
 *   ws.send(JSON.stringify({ action: 'subscribe', channel: 'optionchain:NIFTY:2025-06-26' }));
 *   ws.onmessage = e => {
 *     const msg = JSON.parse(e.data);
 *     if (msg.type === 'snapshot') { /* full chain *\/ }
 *     if (msg.type === 'delta')    { /* changed rows *\/ }
 *   };
 */

// ── NOTE: Uncomment after running: npm install ws @types/ws ──────────────────
// import { WebSocketServer, WebSocket } from 'ws';
// import { buildOptionChain, diffChain }  from '../lib/optionchain/service';
// import { OptionChainResponse }           from '../lib/optionchain/types';

const WS_PORT  = Number(process.env.WS_PORT ?? 3001);
const TICK_MS  = 2000;

/*
const wss = new WebSocketServer({ port: WS_PORT });

// channel → Set of subscribed WebSocket clients
const channels = new Map<string, Set<WebSocket>>();
// channel → previous snapshot for diff
const snapshots = new Map<string, OptionChainResponse>();
// channel → interval handle
const timers = new Map<string, NodeJS.Timeout>();

wss.on('connection', (ws) => {
  const clientChannels = new Set<string>();

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        action: 'subscribe' | 'unsubscribe';
        channel: string;
      };
      const { action, channel } = msg;

      if (!channel || !channel.startsWith('optionchain:')) return;

      if (action === 'subscribe') {
        if (!channels.has(channel)) channels.set(channel, new Set());
        channels.get(channel)!.add(ws);
        clientChannels.add(channel);
        startTicker(channel);

        // Send immediate snapshot
        const [, symbol, expiry] = channel.split(':');
        try {
          const snap = await buildOptionChain({ symbol, expiry, strikeCount: 15 });
          snapshots.set(channel, snap);
          ws.send(JSON.stringify({ type: 'snapshot', channel, data: snap }));
        } catch (e) {
          ws.send(JSON.stringify({ type: 'error', channel, message: (e as Error).message }));
        }
      }

      if (action === 'unsubscribe') {
        channels.get(channel)?.delete(ws);
        clientChannels.delete(channel);
        stopIfEmpty(channel);
      }
    } catch { // malformed message — ignore }
  });

  ws.on('close', () => {
    for (const ch of clientChannels) {
      channels.get(ch)?.delete(ws);
      stopIfEmpty(ch);
    }
  });
});

function startTicker(channel: string) {
  if (timers.has(channel)) return;
  const timer = setInterval(async () => {
    const subs = channels.get(channel);
    if (!subs || subs.size === 0) { stopIfEmpty(channel); return; }

    const [, symbol, expiry] = channel.split(':');
    try {
      const curr = await buildOptionChain({ symbol, expiry, strikeCount: 15 });
      const prev = snapshots.get(channel);
      snapshots.set(channel, curr);

      const payload = prev
        ? { type: 'delta',    channel, data: diffChain(prev, curr) }
        : { type: 'snapshot', channel, data: curr };

      const msg = JSON.stringify(payload);
      for (const ws of subs) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    } catch (e) {
      const err = JSON.stringify({ type: 'error', channel, message: (e as Error).message });
      for (const ws of subs ?? []) {
        if (ws.readyState === WebSocket.OPEN) ws.send(err);
      }
    }
  }, TICK_MS);

  timers.set(channel, timer);
}

function stopIfEmpty(channel: string) {
  if ((channels.get(channel)?.size ?? 0) === 0) {
    clearInterval(timers.get(channel));
    timers.delete(channel);
    channels.delete(channel);
    snapshots.delete(channel);
  }
}

console.log(`[OptionChain WS] Listening on ws://0.0.0.0:${WS_PORT}`);
*/

// Placeholder until `ws` is installed
console.log(
  '[OptionChain WS] WebSocket server stub.\n' +
  'Run: npm install ws @types/ws\n' +
  'Then uncomment the code in workers/option-chain-ws-server.ts\n' +
  `WS port: ${WS_PORT}`,
);
export {};
