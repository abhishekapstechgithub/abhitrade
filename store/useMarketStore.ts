'use client';
import { create } from 'zustand';
import { MarketIndex, WatchlistItem } from '@/types';
import { marketIndices } from '@/lib/mock-data/market';
import type { CachedQuote, IndexPrice } from '@/lib/market-sync';
import type { PriceTick } from '@/lib/angelone/websocket';

// Maps AngelOne index tokens → display symbol (for WS price routing)
const WS_TOKEN_TO_SYMBOL: Record<string, string> = {
  '99926000': 'NIFTY 50',
  '99926009': 'NIFTY BANK',
  '99919000': 'SENSEX',
  '99926006': 'NIFTY IT',
  '99926003': 'NIFTY MIDCAP 100',
};

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
  // Called by MarketTickerProvider on every WebSocket price tick for indices
  updateLivePrice: (tick: PriceTick) => void;
  // Called on mount with cached Redis index prices (before WebSocket connects)
  setIndexData: (symbol: string, ip: IndexPrice) => void;
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

  updateLivePrice: (tick) => set(state => {
    const symbol = WS_TOKEN_TO_SYMBOL[tick.token];
    if (!symbol) return state; // not a tracked index

    const dirs        = { ...state.priceDirections };
    const newPriceMap = { ...state.priceMap };

    const newIndices = state.indices.map(idx => {
      if (idx.symbol !== symbol) return idx;
      dirs[idx.symbol] = tick.ltp >= idx.ltp ? 'up' : 'down';
      newPriceMap[idx.symbol.toUpperCase()] = tick.ltp;
      if (symbol === 'NIFTY 50') newPriceMap['NIFTY'] = tick.ltp;

      // Use close from WS (prev-day close) for change computation when available
      const prevClose = tick.close && tick.close > 0 ? tick.close : (idx.ltp || tick.ltp);
      const change        = parseFloat((tick.ltp - prevClose).toFixed(2));
      const changePercent = prevClose > 0
        ? parseFloat(((change / prevClose) * 100).toFixed(2))
        : idx.changePercent;
      return {
        ...idx,
        ltp: tick.ltp,
        change,
        changePercent,
        open:      tick.open  && tick.open  > 0 ? tick.open  : idx.open,
        high:      tick.high  && tick.high  > 0 ? Math.max(tick.high, idx.high || 0) : idx.high,
        low:       tick.low   && tick.low   > 0 ? (idx.low > 0 ? Math.min(tick.low, idx.low) : tick.low) : idx.low,
        prevClose: tick.close && tick.close > 0 ? tick.close : idx.prevClose,
      };
    });

    return { indices: newIndices, priceDirections: dirs, priceMap: newPriceMap };
  }),

  setIndexData: (symbol, ip) => set(state => {
    const dirs        = { ...state.priceDirections };
    const newPriceMap = { ...state.priceMap };

    const newIndices = state.indices.map(idx => {
      if (idx.symbol !== symbol) return idx;
      dirs[idx.symbol] = ip.ltp >= idx.ltp ? 'up' : 'down';
      newPriceMap[idx.symbol.toUpperCase()] = ip.ltp;
      if (symbol === 'NIFTY 50') newPriceMap['NIFTY'] = ip.ltp;
      return {
        ...idx,
        ltp:           ip.ltp,
        open:          ip.open,
        high:          ip.high,
        low:           ip.low,
        change:        parseFloat(ip.change.toFixed(2)),
        changePercent: parseFloat(ip.changePercent.toFixed(2)),
      };
    });

    return { indices: newIndices, priceDirections: dirs, priceMap: newPriceMap };
  }),

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
