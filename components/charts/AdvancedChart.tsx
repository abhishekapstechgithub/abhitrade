'use client';
/**
 * AdvancedChart — wraps KlineAdvancedChart with dynamic import (browser-only canvas).
 */
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

export const AdvancedChart = dynamic(
  () => import('./KlineAdvancedChart').then(m => ({ default: m.KlineAdvancedChart })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center" style={{background:'#ffffff'}}>
        <div className="flex flex-col items-center gap-2">
          <Loader2 size={24} className="animate-spin" style={{color:'#4f46e5'}}/>
          <span className="text-xs" style={{color:'#94a3b8'}}>Loading advanced chart…</span>
        </div>
      </div>
    ),
  }
);
