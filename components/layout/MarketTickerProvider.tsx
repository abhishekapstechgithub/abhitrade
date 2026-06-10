'use client';
import { useEffect } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';
import { useAngelOneStore } from '@/store/useAngelOneStore';

export function MarketTickerProvider({ children }: { children: React.ReactNode }) {
  const tickPrices  = useMarketStore(s => s.tickPrices);
  const priceMap    = useMarketStore(s => s.priceMap);
  const syncPrices  = usePaperTradingStore(s => s.syncPrices);
  const isConnected = useAngelOneStore(s => s.isConnected);
  const mode        = useAngelOneStore(s => s.mode);

  // Mock ticker runs ONLY in paper mode or when Angel One is not connected.
  // In live + connected mode, real prices come from Angel One APIs — the mock
  // ticker must be stopped so it doesn't overwrite live quotes.
  const isMockActive = !(isConnected && mode === 'live');

  useEffect(() => {
    if (!isMockActive) return;
    const id = setInterval(tickPrices, 400);
    return () => clearInterval(id);
  }, [tickPrices, isMockActive]);

  // Paper positions always sync to whichever price map is active
  useEffect(() => {
    syncPrices(priceMap);
  }, [priceMap, syncPrices]);

  return <>{children}</>;
}
