'use client';
import { create } from 'zustand';
import { MarketIndex, WatchlistItem } from '@/types';
import { marketIndices } from '@/lib/mock-data/market';
import type { CachedQuote } from '@/lib/market-sync';

interface MarketStore {
  indices: MarketIndex[];
  activeWatchlistItems: WatchlistItem[];
  priceMap: Record<string, number>;
  priceDirections: Record<string, 'up' | 'down'>;
  selectedSymbol: string | null;
  lastRealFetch: number | null;
  setSelectedSymbol: (symbol: string | null) => void;
  getPrice: (symbol: string) => number | null;
  fetchRealData: () => Promise<void>;
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  indices: marketIndices,
  activeWatchlistItems: [],
  priceMap: {},
  priceDirections: {},
  selectedSymbol: null,
  lastRealFetch: null,

  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  getPrice: (symbol) => get().priceMap[symbol.toUpperCase()] ?? null,

  fetchRealData: async () => {
    try {
      const res = await fetch('/api/market-sync/data', { cache: 'no-store' });
      if (!res.ok) return;
      const quotes = await res.json() as Record<string, CachedQuote>;
      if (Object.keys(quotes).length === 0) return;

      set(state => {
        const dirs: Record<string, 'up' | 'down'> = { ...state.priceDirections };
        const newPriceMap: Record<string, number> = { ...state.priceMap };

        const newIndices = state.indices.map(idx => {
          const q =
            quotes[idx.symbol.toUpperCase()] ??
            quotes[idx.symbol.toUpperCase().replace(/\s+/g, '_')] ??
            null;
          if (!q) return idx;
          dirs[idx.symbol] = q.ltp >= idx.ltp ? 'up' : 'down';
          newPriceMap[idx.symbol.toUpperCase()] = q.ltp;
          const n50key = idx.symbol === 'NIFTY 50' ? 'NIFTY' : null;
          if (n50key) newPriceMap[n50key] = q.ltp;
          return {
            ...idx,
            ltp: q.ltp,
            open: q.open,
            high: q.high,
            low: q.low,
            change: parseFloat(q.netChange.toFixed(2)),
            changePercent: parseFloat(q.percentChange.toFixed(2)),
          };
        });

        const newItems = state.activeWatchlistItems.map(item => {
          const q =
            quotes[item.symbol.toUpperCase()] ??
            quotes[`${item.symbol.toUpperCase()}-EQ`] ??
            null;
          if (!q) return item;
          dirs[item.symbol] = q.ltp >= item.ltp ? 'up' : 'down';
          newPriceMap[item.symbol.toUpperCase()] = q.ltp;
          const prevClose     = item.prevClose || q.close;
          const change        = parseFloat((q.ltp - prevClose).toFixed(2));
          const changePercent = parseFloat(((change / prevClose) * 100).toFixed(2));
          return { ...item, ltp: q.ltp, change, changePercent };
        });

        return {
          indices: newIndices,
          activeWatchlistItems: newItems,
          priceMap: newPriceMap,
          priceDirections: dirs,
          lastRealFetch: Date.now(),
        };
      });
    } catch (e) {
      console.error('[market-store] fetchRealData failed:', e);
    }
  },
}));
