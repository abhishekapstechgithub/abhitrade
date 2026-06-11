'use client';
import { useEffect, useState } from 'react';
import { WatchlistItem } from '@/types';

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

// No pre-loaded scrips — pages manage their own lists via search + localStorage.
export function useRealScrips() {
  return { items: [] as WatchlistItem[], loading: false };
}

// Fetch top N equity instruments from PostgreSQL for pages that need a symbol list.
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
