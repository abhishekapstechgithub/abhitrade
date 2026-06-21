'use client';
import { FlaskConical } from 'lucide-react';
import { PaperTradingPanel } from '@/components/paper-trading/PaperTradingPanel';

export default function PositionsPage() {
  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      <div className="glass rounded-2xl overflow-hidden" style={{ minHeight: 560 }}>
        <div className="flex items-center gap-2 px-4 py-3 border-b" style={{ borderColor: 'var(--panel-divider)' }}>
          <FlaskConical size={14} style={{ color: 'var(--accent-cyan)' }} />
          <span className="text-sm font-bold" style={{ color: 'var(--text-bright)' }}>Paper Trading — Positions & Orders</span>
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: 'rgba(41,121,255,0.12)', color: 'var(--accent-cyan)', border: '1px solid rgba(41,121,255,0.25)' }}>
            VIRTUAL
          </span>
        </div>
        <div style={{ height: 560 }}>
          <PaperTradingPanel />
        </div>
      </div>
    </div>
  );
}
