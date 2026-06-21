'use client';

import type { MonthlyReturn } from '../types/backtest.types';

// ─── colour scale ──────────────────────────────────────────────────────────────
function cellColor(pct: number): { bg: string; text: string } {
  if (pct === 0) return { bg: 'rgba(255,255,255,0.04)',  text: '#6b7fa3'  };
  if (pct  > 3)  return { bg: 'rgba(0,230,118,0.22)',   text: '#00e676'  };
  if (pct  > 1)  return { bg: 'rgba(0,230,118,0.12)',   text: '#00e676'  };
  if (pct  > 0)  return { bg: 'rgba(0,230,118,0.06)',   text: '#00b64e'  };
  if (pct > -1)  return { bg: 'rgba(255,23,68,0.06)',   text: '#ff5a79'  };
  if (pct > -3)  return { bg: 'rgba(255,23,68,0.12)',   text: '#ff1744'  };
  return               { bg: 'rgba(255,23,68,0.22)',    text: '#ff1744'  };
}

interface Props {
  months:   MonthlyReturn[];
  loading?: boolean;
}

export function MonthlyReturnsGrid({ months, loading }: Props) {
  if (loading) return <GridSkeleton />;
  if (!months.length) return null;

  const totalPnl  = months.reduce((s, m) => s + m.netPnl,  0);
  const totalPct  = months.reduce((s, m) => s + m.pnlPct,  0);
  const totalTrades = months.reduce((s, m) => s + m.trades, 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Grid cells */}
      <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {months.map(m => {
          const { bg, text } = cellColor(m.pnlPct);
          const sign = m.netPnl >= 0;
          return (
            <div
              key={`${m.year}-${m.month}`}
              className="rounded-xl p-2.5 flex flex-col gap-1 cursor-default transition-transform hover:scale-[1.03]"
              style={{ background: bg, border: `1px solid ${text}22` }}
              title={`${m.trades} trades · ${m.wins}W/${m.trades - m.wins}L`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold" style={{ color: 'var(--text-label)' }}>
                  {m.label}
                </span>
                <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
                  {m.trades}T
                </span>
              </div>
              <div className="text-sm font-bold font-mono leading-none" style={{ color: text }}>
                {sign ? '+' : '−'}₹{(Math.abs(m.netPnl) / 1000).toFixed(1)}K
              </div>
              <div className="text-[10px] font-mono" style={{ color: text, opacity: 0.8 }}>
                {sign ? '+' : ''}{m.pnlPct.toFixed(2)}%
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary row */}
      <div
        className="rounded-xl px-3 py-2 grid grid-cols-3 gap-2"
        style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}
      >
        {[
          { label: 'Total P&L', value: `${totalPnl >= 0 ? '+' : '−'}₹${(Math.abs(totalPnl) / 1000).toFixed(1)}K`, col: totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
          { label: 'Return',    value: `${totalPct >= 0 ? '+' : ''}${totalPct.toFixed(2)}%`,                        col: totalPct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' },
          { label: 'Trades',    value: String(totalTrades),                                                          col: 'var(--text-secondary)' },
        ].map(({ label, value, col }) => (
          <div key={label} className="text-center">
            <div className="text-[9px] uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-label)' }}>{label}</div>
            <div className="text-xs font-bold font-mono" style={{ color: col }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>Return scale:</span>
        {[
          { label: '>+3%', col: 'rgba(0,230,118,0.22)' },
          { label: '+1–3%', col: 'rgba(0,230,118,0.12)' },
          { label: '0–1%',  col: 'rgba(0,230,118,0.06)' },
          { label: '−1–0%', col: 'rgba(255,23,68,0.06)' },
          { label: '<−3%',  col: 'rgba(255,23,68,0.22)' },
        ].map(({ label, col }) => (
          <div key={label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ background: col }} />
            <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function GridSkeleton() {
  return (
    <div className="grid gap-1.5 animate-pulse" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl h-16" style={{ background: 'var(--card-inner-bg)' }} />
      ))}
    </div>
  );
}
