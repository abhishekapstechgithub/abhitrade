'use client';
import { useEffect } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { useAngelOneWsInit, useAngelOnePrices } from '@/hooks/useAngelOneWs';
import type { IndexPrice } from '@/lib/market-sync';

// Map server-side symbol names → store symbol names
const IDX_SYMBOL_MAP: Record<string, string> = {
  'NIFTY':           'NIFTY 50',
  'BANKNIFTY':       'BANKNIFTY',
  'SENSEX':          'SENSEX',
  'NIFTY IT':        'NIFTY IT',
  'NIFTY MIDCAP 100':'MIDCPNIFTY',
};

// AngelOne tokens for the five tracked indices
const INDEX_TOKENS = [
  { token: '99926000', exchange: 'NSE', instrumentType: 'INDEX' }, // NIFTY 50
  { token: '99926009', exchange: 'NSE', instrumentType: 'INDEX' }, // BANK NIFTY
  { token: '99919000', exchange: 'BSE', instrumentType: 'INDEX' }, // SENSEX
  { token: '99926006', exchange: 'NSE', instrumentType: 'INDEX' }, // NIFTY IT
  { token: '99926003', exchange: 'NSE', instrumentType: 'INDEX' }, // NIFTY MIDCAP 100
];

export function MarketTickerProvider({ children }: { children: React.ReactNode }) {
  // Establish the WebSocket connection once (no-op if credentials missing)
  useAngelOneWsInit();

  const updateLivePrice = useMarketStore(s => s.updateLivePrice);
  const setIndexData    = useMarketStore(s => s.setIndexData);
  const fetchRealData   = useMarketStore(s => s.fetchRealData);

  // Subscribe to index tokens — every tick updates the Zustand store
  useAngelOnePrices(INDEX_TOKENS, updateLivePrice);

  // On mount: load cached index prices from Redis immediately (before WS connects)
  useEffect(() => {
    fetch('/api/index-prices')
      .then(r => r.ok ? r.json() : null)
      .then((data: { prices: Record<string, IndexPrice> } | null) => {
        if (!data?.prices) return;
        for (const [key, ip] of Object.entries(data.prices)) {
          const storeSymbol = IDX_SYMBOL_MAP[key] ?? key;
          setIndexData(storeSymbol, ip);
        }
      })
      .catch(() => {
        // Fallback: full AngelOne REST fetch if Redis is empty
        fetchRealData();
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{children}</>;
}
