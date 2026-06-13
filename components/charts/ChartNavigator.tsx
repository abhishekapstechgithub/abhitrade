'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChartStore } from '@/store/useChartStore';

// Replaces ChartModal — instead of opening a popup, navigates to the watchlist
// page with the symbol pre-selected via URL params.
export function ChartNavigator() {
  const { isOpen, target, closeChart } = useChartStore();
  const router = useRouter();

  useEffect(() => {
    if (!isOpen || !target) return;
    closeChart();
    const params = new URLSearchParams({
      sym:   target.symbol,
      exch:  target.exchange,
      token: target.token,
      name:  target.name  ?? target.symbol,
      type:  target.instrumentType ?? 'EQ',
    });
    router.push(`/watchlist?${params.toString()}`);
  }, [isOpen, target, closeChart, router]);

  return null;
}
