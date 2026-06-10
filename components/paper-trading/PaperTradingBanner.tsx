'use client';
import { AlertTriangle, X } from 'lucide-react';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';

const AMBER = 'rgb(245,158,11)';
const AMBER_BG = 'rgba(245,158,11,0.12)';
const AMBER_BORDER = 'rgba(245,158,11,0.3)';

function fmt(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(n));
}

export function PaperTradingBanner() {
  const { active, virtualBalance, totalPnl, trades, toggle } = usePaperTradingStore();

  if (!active) return null;

  const pnlSign = totalPnl >= 0 ? '+' : '−';
  const pnlColor = totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';

  return (
    <div
      className="sticky top-[52px] z-30 flex items-center justify-between px-4 shrink-0"
      style={{
        height: '36px',
        background: AMBER_BG,
        borderBottom: `1px solid ${AMBER_BORDER}`,
        color: AMBER,
      }}
    >
      {/* Left */}
      <div className="flex items-center gap-2 text-[11px] font-semibold">
        <AlertTriangle size={13} style={{ color: AMBER }} />
        <span>PAPER TRADING MODE</span>
        <span className="hidden sm:inline" style={{ color: 'rgba(245,158,11,0.7)', fontWeight: 400 }}>
          — Orders will NOT be executed in real markets
        </span>
      </div>

      {/* Center */}
      <div className="hidden md:flex items-center gap-4 text-[11px] font-mono">
        <span>
          Virtual Balance:{' '}
          <span className="font-bold" style={{ color: AMBER }}>
            ₹{fmt(virtualBalance)}
          </span>
        </span>
        <span>
          P&amp;L:{' '}
          <span className="font-bold" style={{ color: pnlColor }}>
            {pnlSign}₹{fmt(totalPnl)}
          </span>
        </span>
        <span>
          Trades:{' '}
          <span className="font-bold" style={{ color: AMBER }}>
            {trades.length}
          </span>
        </span>
      </div>

      {/* Right */}
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 px-3 py-0.5 rounded-md text-[11px] font-bold transition-all"
        style={{
          background: 'rgba(245,158,11,0.18)',
          border: `1px solid ${AMBER_BORDER}`,
          color: AMBER,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = 'rgba(245,158,11,0.28)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'rgba(245,158,11,0.18)';
        }}
      >
        <X size={11} />
        Exit Paper Mode
      </button>
    </div>
  );
}
