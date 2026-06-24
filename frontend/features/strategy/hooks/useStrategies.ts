'use client';
import { useState, useEffect, useCallback } from 'react';
import { Strategy, StrategyFilters }   from '../types/strategy.types';
import { strategyService }             from '../services/strategy.service';
import { ApiError }                    from '../services/api.client';
import type { PaginationMeta }         from '../services/api.client';
import type { StrategyListParams }     from '../services/api.types';
import { strategyMatchesFilters }      from '../utils/strategy.utils';

const DEFAULT_FILTERS: StrategyFilters = { category: 'all', status: 'all', symbol: '' };

export function useStrategies(initialParams?: StrategyListParams) {
  const [all,     setAll]     = useState<Strategy[]>([]);
  const [meta,    setMeta]    = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [filters, setFilters] = useState<StrategyFilters>(DEFAULT_FILTERS);
  const [params,  setParams]  = useState<StrategyListParams>(initialParams ?? {});

  const load = useCallback(async (overrideParams?: StrategyListParams) => {
    setLoading(true);
    setError(null);
    try {
      const { strategies, meta: m } = await strategyService.list(overrideParams ?? params);
      setAll(strategies);
      setMeta(m);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  // Client-side filter on top of whatever the server returned
  const filtered = all.filter(s => strategyMatchesFilters(s, filters));

  const remove = useCallback(async (id: string) => {
    await strategyService.remove(id);
    setAll(prev => prev.filter(s => s.id !== id));
  }, []);

  const clone = useCallback(async (id: string) => {
    const { strategy } = await strategyService.clone(id);
    setAll(prev => [strategy, ...prev]);
  }, []);

  const deploy = useCallback(async (id: string) => {
    const { strategy } = await strategyService.deploy(id);
    setAll(prev => prev.map(s => s.id === id ? strategy : s));
  }, []);

  const goToPage = useCallback((page: number) => {
    const next = { ...params, page };
    setParams(next);
    load(next);
  }, [params, load]);

  return {
    strategies: filtered,
    total:      all.length,
    meta,
    loading,
    error,
    filters,
    setFilters,
    remove,
    clone,
    deploy,
    reload:   load,
    goToPage,
  };
}
