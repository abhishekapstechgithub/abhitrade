'use client';
import { create } from 'zustand';
import { MarketIndex, WatchlistItem } from '@/types';
import { marketIndices, watchlistItems } from '@/lib/mock-data/market';
import type { CachedQuote } from '@/lib/market-sync';

function applyTick(price: number, volatility = 0.0008): number {
  const pct = (Math.random() - 0.488) * volatility;
  return Math.max(1, Math.round(price * (1 + pct) * 100) / 100);
}

function buildPriceMap(items: WatchlistItem[], indices: MarketIndex[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) map[item.symbol.toUpperCase()] = item.ltp;
  for (const idx of indices) map[idx.symbol.toUpperCase()] = idx.ltp;
  const n50 = indices.find(i => i.symbol === 'NIFTY 50');
  if (n50) map['NIFTY'] = n50.ltp;
  return map;
}

interface MarketStore {
  indices: MarketIndex[];
  activeWatchlistItems: WatchlistItem[];
  priceMap: Record<string, number>;
  priceDirections: Record<string, 'up' | 'down'>;
  selectedSymbol: string | null;
  lastRealFetch: number | null;
  setSelectedSymbol: (symbol: string | null) => void;
  getPrice: (symbol: string) => number | null;
  tickPrices: () => void;
  fetchRealData: () => Promise<void>;
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  indices: marketIndices,
  activeWatchlistItems: watchlistItems,
  priceMap: buildPriceMap(watchlistItems, marketIndices),
  priceDirections: {},
  selectedSymbol: null,
  lastRealFetch: null,

  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  getPrice: (symbol) => get().priceMap[symbol.toUpperCase()] ?? null,

  // Fetch real prices from the server-side Redis cache (populated by AngelOne sync)
  fetchRealData: async () => {
    try {
      const res = await fetch('/api/market-sync/data', { cache: 'no-store' });
      if (!res.ok) return;
      const quotes = await res.json() as Record<string, CachedQuote>;
      if (Object.keys(quotes).length === 0) return;

      set(state => {
        const dirs: Record<string, 'up' | 'down'> = { ...state.priceDirections };

        const newIndices = state.indices.map(idx => {
          // Try exact symbol, then without space, then with "NIFTY" alias
          const q =
            quotes[idx.symbol.toUpperCase()] ??
            quotes[idx.symbol.toUpperCase().replace(/\s+/g, '_')] ??
            null;
          if (!q) return idx;
          dirs[idx.symbol] = q.ltp >= idx.ltp ? 'up' : 'down';
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
          const prevClose = item.prevClose || q.close;
          const change        = parseFloat((q.ltp - prevClose).toFixed(2));
          const changePercent = parseFloat(((change / prevClose) * 100).toFixed(2));
          return { ...item, ltp: q.ltp, change, changePercent };
        });

        return {
          indices: newIndices,
          activeWatchlistItems: newItems,
          priceMap: buildPriceMap(newItems, newIndices),
          priceDirections: dirs,
          lastRealFetch: Date.now(),
        };
      });
    } catch (e) {
      console.error('[market-store] fetchRealData failed:', e);
    }
  },

  tickPrices: () => {
    set(state => {
      const dirs: Record<string, 'up' | 'down'> = { ...state.priceDirections };

      const total       = state.activeWatchlistItems.length;
      const updateCount = Math.max(2, Math.floor(total * (0.5 + Math.random() * 0.2)));
      const shuffled    = Array.from({ length: total }, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, updateCount);
      const updateSet = new Set(shuffled);
      const spikeIdx  = Math.random() < 0.04 ? shuffled[0] : -1;

      const newItems = state.activeWatchlistItems.map((item, i) => {
        if (!updateSet.has(i)) return item;
        const vol    = i === spikeIdx ? 0.0028 : 0.0008;
        const newLtp = applyTick(item.ltp, vol);
        dirs[item.symbol] = newLtp >= item.ltp ? 'up' : 'down';
        const change        = parseFloat((newLtp - item.prevClose).toFixed(2));
        const changePercent = parseFloat(((change / item.prevClose) * 100).toFixed(2));
        return { ...item, ltp: newLtp, change, changePercent };
      });

      const newIndices = state.indices.map(idx => {
        const newLtp = applyTick(idx.ltp, 0.0004);
        dirs[idx.symbol] = newLtp >= idx.ltp ? 'up' : 'down';
        const change        = parseFloat((newLtp - idx.prevClose).toFixed(2));
        const changePercent = parseFloat(((change / idx.prevClose) * 100).toFixed(2));
        return { ...idx, ltp: newLtp, change, changePercent };
      });

      return {
        activeWatchlistItems: newItems,
        indices: newIndices,
        priceMap: buildPriceMap(newItems, newIndices),
        priceDirections: dirs,
      };
    });
  },
}));
