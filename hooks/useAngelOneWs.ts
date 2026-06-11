'use client';
import { useEffect, useRef } from 'react';
import { getAngelWs } from '@/lib/angelone/websocket';
import type { PriceTick } from '@/lib/angelone/websocket';
import { toWsExchangeType } from '@/lib/angelone/tokens';

// ── useAngelOneWsInit ─────────────────────────────────────────────────────────
// Call once (in MarketTickerProvider) to establish the WebSocket connection.
// Fetches credentials from /api/ws-credentials and connects.
export function useAngelOneWsInit(): void {
  useEffect(() => {
    const ws = getAngelWs();
    if (!ws) return;

    fetch('/api/ws-credentials')
      .then(r => r.ok ? r.json() : null)
      .then((creds: { feedToken: string; clientCode: string; apiKey: string } | null) => {
        if (!creds?.feedToken || !creds.clientCode || !creds.apiKey) return;
        ws.setCredentials(creds);
        ws.connect();
      })
      .catch(() => { /* no credentials — price updates stay on REST polling */ });

    return () => ws.disconnect();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount-once
}

// ── WsToken ───────────────────────────────────────────────────────────────────
export interface WsToken {
  token:          string; // AngelOne instrument token (same as WatchlistItem.id)
  exchange:       string; // 'NSE' | 'BSE'
  instrumentType: string; // 'EQ' | 'INDEX' | 'CE' | 'PE' | 'FUT' | ...
}

// ── useAngelOnePrices ─────────────────────────────────────────────────────────
// Subscribe to a list of tokens.  onTick is called for every incoming price tick
// that matches one of the subscribed tokens.
//
// Unsubscribes automatically on unmount (or when the token list changes).
export function useAngelOnePrices(
  tokens: WsToken[],
  onTick: (tick: PriceTick) => void,
): void {
  // Keep a stable ref to the latest callback so the effect never needs to
  // tear down and re-subscribe just because the caller re-renders.
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  // Stable dependency: a sorted string encoding of all tokens
  const tokenKey = tokens
    .filter(t => !!t.token)
    .map(t => `${t.exchange}:${t.instrumentType}:${t.token}`)
    .sort()
    .join('|');

  useEffect(() => {
    const ws = getAngelWs();
    if (!ws || !tokenKey) return;

    // Group tokens by AngelOne exchange type (1=nse_cm, 2=nse_fo, 3=bse_cm …)
    const byExch = new Map<number, string[]>();
    for (const t of tokens) {
      if (!t.token) continue;
      const et = toWsExchangeType(t.exchange, t.instrumentType);
      if (!byExch.has(et)) byExch.set(et, []);
      byExch.get(et)!.push(t.token);
    }

    byExch.forEach((toks, et) => ws.subscribe(et, toks));

    const tokenSet = new Set(tokens.map(t => t.token));
    const removeCb = ws.addListener(tick => {
      if (tokenSet.has(tick.token)) onTickRef.current(tick);
    });

    return () => {
      removeCb();
      byExch.forEach((toks, et) => ws.unsubscribe(et, toks));
    };
  // tokenKey is the only real dep — tokens/onTick are accessed via ref
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenKey]);
}
