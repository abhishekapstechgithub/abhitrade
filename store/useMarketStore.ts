'use client';
import { create } from 'zustand';
import { MarketIndex, WatchlistItem } from '@/types';
import { marketIndices, watchlistItems } from '@/lib/mock-data/market';

// Tiny per-tick move with slight upward bias; volatility ≈ 0.0008 at 400 ms → realistic drift
function applyTick(price: number, volatility = 0.0008): number {
  const pct = (Math.random() - 0.488) * volatility;
  return Math.max(1, Math.round(price * (1 + pct) * 100) / 100);
}

function buildPriceMap(items: WatchlistItem[], indices: MarketIndex[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const item of items) map[item.symbol.toUpperCase()] = item.ltp;
  for (const idx of indices) map[idx.symbol.toUpperCase()] = idx.ltp;
  // Aliases used across the app
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
  setSelectedSymbol: (symbol: string | null) => void;
  getPrice: (symbol: string) => number | null;
  tickPrices: () => void;
}

export const useMarketStore = create<MarketStore>((set, get) => ({
  indices: marketIndices,
  activeWatchlistItems: watchlistItems,
  priceMap: buildPriceMap(watchlistItems, marketIndices),
  priceDirections: {},
  selectedSymbol: null,

  setSelectedSymbol: (symbol) => set({ selectedSymbol: symbol }),

  getPrice: (symbol) => get().priceMap[symbol.toUpperCase()] ?? null,

  tickPrices: () => {
    set(state => {
      const dirs: Record<string, 'up' | 'down'> = { ...state.priceDirections };

      // ── Watchlist: update 50-70% of items each tick, leave rest flat ─────
      const total = state.activeWatchlistItems.length;
      const updateCount = Math.max(2, Math.floor(total * (0.5 + Math.random() * 0.2)));
      // Shuffle indices, pick first updateCount
      const shuffled = Array.from({ length: total }, (_, i) => i)
        .sort(() => Math.random() - 0.5)
        .slice(0, updateCount);
      const updateSet = new Set(shuffled);

      // 4% chance: one random stock gets a 3x spike move
      const spikeIdx = Math.random() < 0.04 ? shuffled[0] : -1;

      const newItems = state.activeWatchlistItems.map((item, i) => {
        if (!updateSet.has(i)) return item;
        const vol = i === spikeIdx ? 0.0028 : 0.0008;
        const newLtp = applyTick(item.ltp, vol);
        dirs[item.symbol] = newLtp >= item.ltp ? 'up' : 'down';
        const change = parseFloat((newLtp - item.prevClose).toFixed(2));
        const changePercent = parseFloat(((change / item.prevClose) * 100).toFixed(2));
        return { ...item, ltp: newLtp, change, changePercent };
      });

      // ── Indices: tick every time but with smaller volatility ─────────────
      const newIndices = state.indices.map(idx => {
        const newLtp = applyTick(idx.ltp, 0.0004);
        dirs[idx.symbol] = newLtp >= idx.ltp ? 'up' : 'down';
        const change = parseFloat((newLtp - idx.prevClose).toFixed(2));
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
