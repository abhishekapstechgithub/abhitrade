'use client';

import { useState, useCallback } from 'react';
import { BacktestDashboard }     from '@/features/strategy/backtest/components/BacktestDashboard';
import { MOCK_BACKTEST_RESULT }  from '@/features/strategy/backtest/utils/backtest.mock';
import type { BacktestResult }   from '@/features/strategy/backtest/types/backtest.types';

export default function BacktestPage() {
  const [result,  setResult]  = useState<BacktestResult | undefined>(MOCK_BACKTEST_RESULT);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleRerun = useCallback(() => {
    setLoading(true);
    setError(null);
    // Simulate a re-run (1.2s delay)
    setTimeout(() => {
      setResult({ ...MOCK_BACKTEST_RESULT, runAt: new Date().toISOString(), durationMs: 1247 });
      setLoading(false);
    }, 1200);
  }, []);

  const handleExport = useCallback((format: 'csv' | 'json') => {
    if (!result) return;
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `backtest-${result.config.strategyName.replace(/\s+/g, '-')}-${result.config.fromDate}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // CSV export delegates to the TradeLog's own export button — just show a notice
      alert('Use the Export CSV button inside the Trade Log table below.');
    }
  }, [result]);

  return (
    <BacktestDashboard
      result={result}
      loading={loading}
      error={error}
      onRerun={handleRerun}
      onExport={handleExport}
    />
  );
}
