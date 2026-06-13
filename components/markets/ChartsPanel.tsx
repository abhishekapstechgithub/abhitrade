'use client';
import { ReligareChart } from '@/components/charts/ReligareChart';

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
      {/* token 99926000 → remapped to 26000 (NIFTY 50) inside ReligareChart */}
      <ReligareChart token="99926000" mktsegid={1} theme="light" interval="DAY" />
    </div>
  );
}
