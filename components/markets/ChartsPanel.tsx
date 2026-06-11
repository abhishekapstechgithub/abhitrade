'use client';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

const LightweightChartView = dynamic(
  () => import('@/components/charts/LightweightChart').then(m => ({ default: m.LightweightChartView })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center w-full h-full" style={{ background: '#fff' }}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={24} className="animate-spin" style={{ color: '#2563eb' }} />
          <span className="text-xs" style={{ color: '#94a3b8' }}>Loading chart…</span>
        </div>
      </div>
    ),
  },
);

export function ChartsPanel() {
  return (
    <div
      className="rounded-xl overflow-hidden w-full"
      style={{
        height: 'calc(100vh - 160px)',
        minHeight: 560,
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
      <LightweightChartView
        symbol="NIFTY 50"
        exchange="NSE"
        token="99926000"
        name="NIFTY 50"
        instrumentType="IDX"
        underlying="NIFTY"
      />
    </div>
  );
}
