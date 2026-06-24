'use client';

import type { BacktestMetrics } from '../types/backtest.types';

// ─── colour helpers (same pattern as the rest of the app) ────────────────────
const G = (col: string, a = 0.1) => `rgba(${col},${a})`;
const C = (col: string)           => `rgb(${col})`;
const BLUE   = '41,121,255';
const GREEN  = '0,230,118';
const RED    = '255,23,68';
const GOLD   = '255,214,0';
const CYAN   = '0,212,255';
const PURPLE = '170,0,255';

interface KPI {
  label:    string;
  value:    string;
  sub:      string;
  gain?:    boolean | null;   // null = neutral
  col:      string;
  border?:  string;
}

function buildKPIs(m: BacktestMetrics): KPI[] {
  const fmt    = (n: number) => n >= 0
    ? `+₹${(n / 1000).toFixed(1)}K`
    : `−₹${(Math.abs(n) / 1000).toFixed(1)}K`;
  const pct    = (n: number, digits = 1) => `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`;

  return [
    {
      label: 'Net P&L',
      value: fmt(m.netPnl),
      sub:   `${pct(m.absoluteReturnPct)} absolute · ${pct(m.annualizedRetPct)} p.a.`,
      gain:  m.netPnl >= 0,
      col:   m.netPnl >= 0 ? GREEN : RED,
    },
    {
      label: 'Win Rate',
      value: `${m.winRate.toFixed(1)}%`,
      sub:   `${m.winningTrades}W / ${m.losingTrades}L of ${m.totalTrades} trades`,
      gain:  m.winRate >= 50,
      col:   m.winRate >= 60 ? GREEN : m.winRate >= 45 ? GOLD : RED,
    },
    {
      label: 'Max Drawdown',
      value: fmt(m.maxDrawdown),
      sub:   `${pct(m.maxDrawdownPct, 2)} · ${m.recoveryDays}d recovery`,
      gain:  false,
      col:   RED,
    },
    {
      label: 'Profit Factor',
      value: m.profitFactor.toFixed(2),
      sub:   `Gross wins / gross losses`,
      gain:  m.profitFactor >= 1.5,
      col:   m.profitFactor >= 1.5 ? GREEN : m.profitFactor >= 1 ? GOLD : RED,
    },
    {
      label: 'Avg Trade',
      value: fmt(m.avgTrade),
      sub:   `Win ₹${(m.avgWin / 1000).toFixed(1)}K · Loss ₹${(Math.abs(m.avgLoss) / 1000).toFixed(1)}K`,
      gain:  m.avgTrade >= 0,
      col:   m.avgTrade >= 0 ? CYAN : RED,
    },
    {
      label: 'Sharpe',
      value: m.sharpeRatio.toFixed(2),
      sub:   `Sortino ${m.sortinoRatio.toFixed(2)} · Calmar ${m.calmarRatio.toFixed(2)}`,
      gain:  null,
      col:   m.sharpeRatio >= 1.5 ? GREEN : m.sharpeRatio >= 0.8 ? GOLD : RED,
    },
  ];
}

interface Props {
  metrics:   BacktestMetrics;
  loading?:  boolean;
}

export function MetricsBar({ metrics, loading }: Props) {
  if (loading) return <MetricsSkeleton />;
  const kpis = buildKPIs(metrics);

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
      {kpis.map(k => (
        <div
          key={k.label}
          className="glass rounded-xl p-3 flex flex-col gap-1.5 cursor-default"
          style={{ border: `1px solid ${G(k.col, 0.2)}` }}
        >
          <div className="text-[10px] uppercase tracking-wide" style={{ color: 'var(--text-label)' }}>
            {k.label}
          </div>

          <div
            className="text-xl font-bold font-mono leading-none"
            style={{
              color: k.gain === null
                ? C(k.col)
                : k.gain
                  ? 'var(--accent-green)'
                  : 'var(--accent-red)',
            }}
          >
            {k.value}
          </div>

          <div className="text-[10px] leading-snug" style={{ color: 'var(--text-dim)' }}>
            {k.sub}
          </div>

          {/* Accent bar */}
          <div className="h-0.5 rounded-full mt-1" style={{ background: G(k.col, 0.3) }} />
        </div>
      ))}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function MetricsSkeleton() {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="glass rounded-xl p-3 space-y-2 animate-pulse">
          <div className="h-2.5 rounded w-1/2" style={{ background: 'var(--card-inner-bg)' }} />
          <div className="h-6 rounded w-3/4"   style={{ background: 'var(--card-inner-bg)' }} />
          <div className="h-2 rounded w-full"   style={{ background: 'var(--card-inner-bg)' }} />
          <div className="h-0.5 rounded"        style={{ background: 'var(--card-inner-bg)' }} />
        </div>
      ))}
    </div>
  );
}
