'use client';
import { useState, useEffect, useCallback } from 'react';
import { Strategy, StrategyFilters } from '../types/strategy.types';
import { strategyService } from '../services/strategy.service';
import { strategyMatchesFilters } from '../utils/strategy.utils';

const DEFAULT_FILTERS: StrategyFilters = { category: 'all', status: 'all', symbol: '' };

export function useStrategies() {
  const [all, setAll]         = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [filters, setFilters] = useState<StrategyFilters>(DEFAULT_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { strategies } = await strategyService.list();
      setAll(strategies);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  return { strategies: filtered, total: all.length, loading, error, filters, setFilters, remove, clone, deploy, reload: load };
}
