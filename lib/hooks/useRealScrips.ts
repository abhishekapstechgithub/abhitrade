'use client';
import { useEffect, useState } from 'react';
import { WatchlistItem } from '@/types';
import { watchlistItems as mockItems } from '@/lib/mock-data/market';

interface ScripMeta {
  token: string;
  exchange: string;
  symbol: string;
  tradingSymbol: string;
  name: string;
  instrumentType: string;
  isin: string;
  lotSize: number;
  tickSize: number;
}

/**
 * Fetches real scrip metadata from /api/scrips (Redis-backed) and merges
 * with mock price data so pages show real instrument names and tokens
 * while prices remain simulated.
 */
export function useRealScrips() {
  const [items, setItems] = useState<WatchlistItem[]>(mockItems);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const symbols = mockItems
      .filter(i => i.instrumentType === 'EQ')
      .map(i => i.symbol)
      .join(',');

    fetch(`/api/scrips?symbols=${symbols}&exchange=NSE`)
      .then(r => r.json())
      .then((data: { results: ScripMeta[] }) => {
        if (!data.results?.length) return;
        const metaMap = new Map<string, ScripMeta>(
          data.results.map(r => [r.symbol.toUpperCase(), r])
        );

        setItems(
          mockItems.map(item => {
            const meta = metaMap.get(item.symbol.toUpperCase());
            if (!meta) return item;
            return {
              ...item,
              id: meta.token,               // real token from Redis
              name: meta.name,              // real full name
              // keep mock prices for display
            };
          })
        );
      })
      .catch(() => { /* fall back to mock on error */ })
      .finally(() => setLoading(false));
  }, []);

  return { items, loading };
}

/**
 * Fetch top N equity instruments from Redis for any page that needs a
 * live symbol list (screener, heatmap etc.)
 */
export function useTopEquities(limit = 40) {
  const [equities, setEquities] = useState<ScripMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/scrips?type=EQ&limit=${limit}`)
      .then(r => r.json())
      .then((data: { results: ScripMeta[] }) => {
        if (data.results?.length) setEquities(data.results);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [limit]);

  return { equities, loading };
}
