'use client';
import { useState, useEffect, useCallback } from 'react';
import { useAngelOneStore } from '@/store/useAngelOneStore';

// Returns { data, loading, error, refetch }
function useLiveData<T>(
  endpoint: string,
  enabled: boolean,
  refreshMs?: number
) {
  const { credentials, accessToken } = useAngelOneStore();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    if (!enabled || !accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: credentials.apiKey, accessToken }),
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json as T);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [endpoint, enabled, accessToken, credentials.apiKey]);

  useEffect(() => {
    fetch_();
    if (!refreshMs) return;
    const id = setInterval(fetch_, refreshMs);
    return () => clearInterval(id);
  }, [fetch_, refreshMs]);

  return { data, loading, error, refetch: fetch_ };
}

// ── Specific hooks ─────────────────────────────────────────────────────────────

export function useAngelOneProfile() {
  const { isConnected, mode } = useAngelOneStore();
  return useLiveData<{
    profile: { clientcode: string; name: string; email: string; mobileno: string; exchanges: string[]; lastlogintime: string };
    rms: { net: string; availablecash: string; utiliseddebits: string; m2munrealized: string; m2mrealized: string; collateral: string };
  }>('/api/angel-one/profile', isConnected && mode === 'live');
}

export function useAngelOnePortfolio() {
  const { isConnected, mode } = useAngelOneStore();
  return useLiveData<{
    holdingData: {
      totalholding: { totalholdingvalue: string; totalinvvalue: string; totalprofitandloss: string; totalpnlpercentage: string };
      holdings: Array<{
        tradingsymbol: string; symboltoken: string; exchange: string; quantity: number;
        averageprice: number; ltp: number; symbolname: string; close: number;
        profitandloss: number; pnlpercentage: number; product: string; isin: string;
      }>;
    };
    rms: { net: string; availablecash: string; utiliseddebits: string; m2munrealized: string; m2mrealized: string };
  }>('/api/angel-one/portfolio', isConnected && mode === 'live', 30_000);
}

export function useAngelOnePositions() {
  const { isConnected, mode } = useAngelOneStore();
  return useLiveData<{
    positions: Array<{
      tradingsymbol: string; symbolname: string; exchange: string; producttype: string;
      instrumenttype: string; optiontype: string; strikeprice: string; expirydate: string;
      netqty: string; buyavgprice: string; sellavgprice: string; avg_price: string;
      ltp: string; pnl: string; realised: string; unrealised: string; mtm: string;
      day_buy_qty: string; day_sell_qty: string;
    }>;
  }>('/api/angel-one/positions', isConnected && mode === 'live', 15_000);
}

export function useAngelOneOrders() {
  const { isConnected, mode } = useAngelOneStore();
  return useLiveData<{
    orders: Array<{
      orderid: string; uniqueorderid: string; tradingsymbol: string; transactiontype: string;
      quantity: string; ordertype: string; producttype: string; price: string;
      status: string; filledshares: string; unfilledshares: string; averageprice: string;
      exchtime: string; text: string; exchange: string; variety: string;
    }>;
    trades: Array<{
      tradingsymbol: string; transactiontype: string; exchange: string;
      quantity: string; price: string; orderid: string; fillid: string; filltime: string;
    }>;
  }>('/api/angel-one/orderbook', isConnected && mode === 'live', 10_000);
}

// Quotes hook — takes explicit exchange tokens map
export function useAngelOneQuotes(
  exchangeTokens: Record<string, string[]>,
  enabled: boolean,
  refreshMs = 5_000
) {
  const { isConnected, mode, credentials, accessToken } = useAngelOneStore();
  const [data, setData] = useState<Record<string, { ltp: number; change: number; pct: number; open: number; high: number; low: number; close: number }>>({});
  const [loading, setLoading] = useState(false);

  const fetch_ = useCallback(async () => {
    if (!enabled || !isConnected || mode !== 'live' || !accessToken) return;
    setLoading(true);
    try {
      const res = await fetch('/api/angel-one/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: credentials.apiKey, accessToken, mode: 'FULL', exchangeTokens }),
      });
      const json = await res.json();
      if (json.fetched) {
        const map: Record<string, { ltp: number; change: number; pct: number; open: number; high: number; low: number; close: number }> = {};
        for (const q of json.fetched) {
          map[q.symbolToken] = {
            ltp: q.ltp, change: q.netChange, pct: q.percentChange,
            open: q.open, high: q.high, low: q.low, close: q.close,
          };
        }
        setData(map);
      }
    } finally {
      setLoading(false);
    }
  }, [enabled, isConnected, mode, accessToken, credentials.apiKey, exchangeTokens]);

  useEffect(() => {
    fetch_();
    const id = setInterval(fetch_, refreshMs);
    return () => clearInterval(id);
  }, [fetch_, refreshMs]);

  return { data, loading };
}
