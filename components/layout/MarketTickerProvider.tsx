'use client';
import { useEffect } from 'react';
import { useMarketStore } from '@/store/useMarketStore';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';

const REAL_DATA_REFRESH_MS = 15 * 60 * 1000; // re-read AngelOne cache every 15 min

export function MarketTickerProvider({ children }: { children: React.ReactNode }) {
  const fetchRealData = useMarketStore(s => s.fetchRealData);
  const priceMap      = useMarketStore(s => s.priceMap);
  const syncPrices    = usePaperTradingStore(s => s.syncPrices);

  // Pull real prices from AngelOne cache on mount and every 15 min.
  // No fake ticker — prices update only when real data arrives.
  useEffect(() => {
    fetchRealData();
    const id = setInterval(fetchRealData, REAL_DATA_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchRealData]);

  useEffect(() => {
    syncPrices(priceMap);
  }, [priceMap, syncPrices]);

  return <>{children}</>;
}
