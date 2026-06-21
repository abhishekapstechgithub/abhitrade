'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Activity, AlertCircle, RefreshCw, Download, Play,
  ArrowLeft, TrendingUp, BarChart2, List, Info, Clock,
  Target, Shield, Zap, ChevronRight,
} from 'lucide-react';
import { MetricsBar }          from './MetricsBar';
import { EquityCurveChart }    from './EquityCurveChart';
import { MonthlyReturnsGrid }  from './MonthlyReturnsGrid';
import { TradeLog }            from './TradeLog';
import type { BacktestDashboardProps } from '../types/backtest.types';

// ─── colour helpers ───────────────────────────────────────────────────────────
const G = (col: string, a = 0.1) => `rgba(${col},${a})`;
const C = (col: string)           => `rgb(${col})`;
const BLUE   = '41,121,255';
const GREEN  = '0,230,118';
const RED    = '255,23,68';
const GOLD   = '255,214,0';
const PURPLE = '170,0,255';

type Tab = 'equity' | 'trades' | 'stats';

// ─── Panel header (same pattern as the rest of the app) ──────────────────────
function PanelHeader({
  icon, title, right,
}: {
  icon:   React.ReactNode;
  title:  string;
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5"
      style={{ borderBottom: '1px solid var(--panel-divider)' }}
    >
      <span style={{ color: 'var(--text-label)' }}>{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide flex-1"
        style={{ color: 'var(--text-label)' }}>
        {title}
      </span>
      {right}
    </div>
  );
}

// ─── Deep stats sidebar ───────────────────────────────────────────────────────
function StatsSidebar({ result }: { result: NonNullable<BacktestDashboardProps['result']> }) {
  const m = result.metrics;
  const c = result.config;

  const rows: [string, string, string?][] = [
    // Trade quality
    ['Expectancy',       `₹${m.expectancy.toFixed(0)}`,                undefined],
    ['Avg Winner',       `+₹${(m.avgWin / 1000).toFixed(1)}K`,        '#00e676'],
    ['Avg Loser',        `−₹${(Math.abs(m.avgLoss) / 1000).toFixed(1)}K`, '#ff1744'],
    ['Consec. Wins',     String(m.maxConsecWins),                      '#00e676'],
    ['Consec. Losses',   String(m.maxConsecLosses),                    '#ff1744'],
    ['Break-even',       String(m.breakEven),                          undefined],
    // Time
    ['Avg Hold',         m.avgHoldingMins >= 1440
                           ? `${Math.round(m.avgHoldingMins / 1440)}d`
                           : `${Math.round(m.avgHoldingMins / 60)}h ${m.avgHoldingMins % 60}m`,
                         undefined],
    // Capital
    ['Peak Capital',     `₹${(m.peakCapital / 1000).toFixed(1)}K`,    undefined],
    ['Final Capital',    `₹${(m.finalCapital / 1000).toFixed(1)}K`,   '#00e676'],
    ['Total Brokerage',  `₹${(m.totalBrokerage / 1000).toFixed(1)}K`, '#ff1744'],
    ['Gross P&L',        `+₹${(m.grossPnl / 1000).toFixed(1)}K`,      '#00e676'],
    // Risk
    ['Max DD %',         `${m.maxDrawdownPct.toFixed(2)}%`,            '#ff1744'],
    ['Recovery Days',    String(m.recoveryDays) || 'N/A',              undefined],
    ['Sortino',          m.sortinoRatio.toFixed(2),                    undefined],
    ['Calmar',           m.calmarRatio.toFixed(2),                     undefined],
  ];

  const cfgRows: [string, string][] = [
    ['Symbol',         `${c.symbol} (${c.exchange})`],
    ['Period',         `${c.fromDate} → ${c.toDate}`],
    ['Timeframe',      c.timeframe],
    ['Initial Cap',    `₹${(c.initialCapital / 1000).toFixed(0)}K`],
    ['Slippage',       `${c.slippagePct}%`],
    ['Brokerage/Lot',  `₹${c.brokeragePerLot}`],
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* Deep metrics */}
      <div className="glass rounded-2xl overflow-hidden flex flex-col">
        <PanelHeader icon={<Target size={12} />} title="Deep Stats" />
        <div className="flex-1 overflow-y-auto no-scrollbar">
          {rows.map(([label, value, col]) => (
            <div
              key={label}
              className="flex items-center justify-between px-4 py-1.5"
              style={{ borderBottom: '1px solid var(--row-border)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="text-[11px]" style={{ color: 'var(--text-label)' }}>{label}</span>
              <span className="text-[11px] font-bold font-mono" style={{ color: col ?? 'var(--text-secondary)' }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Config panel */}
      <div className="glass rounded-2xl overflow-hidden">
        <PanelHeader icon={<Info size={12} />} title="Config" />
        {cfgRows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between px-4 py-1.5"
            style={{ borderBottom: '1px solid var(--row-border)' }}
          >
            <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>{label}</span>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-secondary)' }}>{value}</span>
          </div>
        ))}
        <div className="px-4 py-2">
          <div className="text-[9px] font-mono" style={{ color: 'var(--text-dim)' }}>
            Run ID: {result.id}
          </div>
          <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
            {new Date(result.runAt).toLocaleString('en-IN')} · {result.durationMs ?? 0}ms
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main BacktestDashboard ───────────────────────────────────────────────────

export function BacktestDashboard({
  result, loading = false, error = null, onRerun, onExport,
}: BacktestDashboardProps) {
  const [tab, setTab] = useState<Tab>('equity');

  // ── Error state ──────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center"
          style={{ background: G(RED, 0.12), border: `1px solid ${G(RED, 0.3)}` }}
        >
          <AlertCircle size={28} style={{ color: C(RED) }} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-bright)' }}>Backtest failed</p>
          <p className="text-xs max-w-sm" style={{ color: 'var(--text-dim)' }}>{error}</p>
        </div>
        {onRerun && (
          <button
            onClick={onRerun}
            className="flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-semibold"
            style={{ background: `linear-gradient(135deg,${C(BLUE)},rgb(0,212,255))`, color: '#fff' }}
          >
            <RefreshCw size={14} /> Retry
          </button>
        )}
      </div>
    );
  }

  // ── Empty / pre-run state ────────────────────────────────────────────────
  if (!loading && !result) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div
          className="w-16 h-16 rounded-2xl flex items-center justify-center"
          style={{ background: G(BLUE, 0.1), border: `1.5px dashed ${G(BLUE, 0.35)}` }}
        >
          <Activity size={32} style={{ color: C(BLUE), opacity: 0.5 }} />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold mb-1" style={{ color: 'var(--text-bright)' }}>No backtest results yet</p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
            Select a strategy and click Run to backtest it
          </p>
        </div>
        {onRerun && (
          <button
            onClick={onRerun}
            className="flex items-center gap-2 h-9 px-5 rounded-xl text-sm font-semibold"
            style={{ background: `linear-gradient(135deg,${C(BLUE)},rgb(0,212,255))`, color: '#fff' }}
          >
            <Play size={14} /> Run Backtest
          </button>
        )}
      </div>
    );
  }

  const cfg = result?.config;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-3 space-y-3">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <Link
          href="/strategy"
          className="flex items-center gap-1 text-[11px] transition-opacity hover:opacity-70"
          style={{ color: 'var(--text-dim)' }}
        >
          <ArrowLeft size={12} /> Strategy
        </Link>
        <ChevronRight size={11} style={{ color: 'var(--text-label)' }} />

        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: G(BLUE, 0.14), border: `1px solid ${G(BLUE, 0.28)}` }}
          >
            <BarChart2 size={16} style={{ color: C(BLUE) }} />
          </div>
          <div>
            <h1 className="text-sm font-bold leading-tight" style={{ color: 'var(--text-bright)' }}>
              {loading ? 'Running backtest…' : (cfg?.strategyName ?? 'Backtest Results')}
            </h1>
            {cfg && !loading && (
              <div className="flex items-center gap-2 flex-wrap">
                {[
                  cfg.symbol,
                  cfg.exchange,
                  cfg.timeframe,
                  `${cfg.fromDate} → ${cfg.toDate}`,
                ].map(t => (
                  <span key={t} className="text-[10px] px-1.5 py-px rounded"
                    style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}>
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1" />

        {/* Status badge */}
        {loading && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px]"
            style={{ background: G(GOLD, 0.12), border: `1px solid ${G(GOLD, 0.3)}`, color: C(GOLD) }}>
            <span className="live-dot" style={{ background: C(GOLD) }} />
            Running…
          </div>
        )}
        {!loading && result?.status === 'completed' && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px]"
            style={{ background: G(GREEN, 0.1), border: `1px solid ${G(GREEN, 0.25)}`, color: C(GREEN) }}>
            <Zap size={10} /> Completed · {result.durationMs}ms
          </div>
        )}

        {/* Action buttons */}
        {onRerun && (
          <button
            onClick={onRerun}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] transition-all"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
            onMouseEnter={e => { e.currentTarget.style.color = C(BLUE); e.currentTarget.style.borderColor = G(BLUE, 0.4); }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--card-inner-border)'; }}
          >
            <RefreshCw size={12} /> Re-run
          </button>
        )}
        {onExport && (
          <button
            onClick={() => onExport('csv')}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-[11px] transition-all"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
            onMouseEnter={e => { e.currentTarget.style.color = C(GREEN); e.currentTarget.style.borderColor = G(GREEN, 0.4); }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--card-inner-border)'; }}
          >
            <Download size={12} /> Export
          </button>
        )}
      </div>

      {/* ── Metrics bar ──────────────────────────────────────────────────── */}
      {result && <MetricsBar metrics={result.metrics} loading={loading} />}
      {loading && !result && <MetricsBar metrics={{} as never} loading />}

      {/* ── Mobile tab switcher ───────────────────────────────────────────── */}
      <div className="flex gap-1 lg:hidden">
        {([
          { id: 'equity', label: 'Chart',  icon: TrendingUp },
          { id: 'trades', label: 'Trades', icon: List        },
          { id: 'stats',  label: 'Stats',  icon: Shield      },
        ] as { id: Tab; label: string; icon: typeof TrendingUp }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex items-center gap-1.5 flex-1 justify-center h-8 rounded-lg text-[11px] font-semibold transition-all"
            style={{
              background: tab === id ? G(BLUE, 0.15) : 'var(--card-inner-bg)',
              color:      tab === id ? C(BLUE)        : 'var(--text-dim)',
              border:     `1px solid ${tab === id ? G(BLUE, 0.35) : 'var(--card-inner-border)'}`,
            }}
          >
            <Icon size={12} /> {label}
          </button>
        ))}
      </div>

      {/* ── Main content: charts (left) + stats sidebar (right) ──────────── */}
      <div className="grid gap-3 lg:grid-cols-[1fr_280px]">

        {/* Left column: charts + trade log */}
        <div className="flex flex-col gap-3">

          {/* Equity curve + drawdown */}
          <div
            className={`glass rounded-2xl overflow-hidden flex flex-col ${tab !== 'equity' ? 'hidden lg:flex' : ''}`}
          >
            <PanelHeader
              icon={<TrendingUp size={12} />}
              title="Equity Curve &amp; Drawdown"
              right={
                result && (
                  <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-dim)' }}>
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-0.5 inline-block rounded" style={{ background: '#2979ff' }} />
                      Equity
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-0.5 inline-block rounded" style={{ background: '#ff1744' }} />
                      Drawdown
                    </span>
                    <Clock size={10} />
                    {result.config.fromDate} → {result.config.toDate}
                  </div>
                )
              }
            />
            <div className="px-2 pt-1 pb-2">
              <EquityCurveChart
                equityCurve={result?.equityCurve ?? []}
                loading={loading}
              />
            </div>
          </div>

          {/* Trade log */}
          <div
            className={`glass rounded-2xl overflow-hidden flex flex-col ${tab !== 'trades' ? 'hidden lg:flex' : ''}`}
          >
            <PanelHeader icon={<List size={12} />} title="Trade Log" />
            <TradeLog trades={result?.trades ?? []} loading={loading} />
          </div>
        </div>

        {/* Right column: monthly returns + deep stats */}
        <div
          className={`flex flex-col gap-3 ${tab !== 'stats' ? 'hidden lg:flex' : ''}`}
        >
          {/* Monthly returns grid */}
          <div className="glass rounded-2xl overflow-hidden">
            <PanelHeader icon={<Activity size={12} />} title="Monthly P&amp;L" />
            <div className="p-3">
              <MonthlyReturnsGrid
                months={result?.monthlyReturns ?? []}
                loading={loading}
              />
            </div>
          </div>

          {/* Deep stats + config */}
          {result && <StatsSidebar result={result} />}
          {loading && <DeepStatsSkeleton />}
        </div>
      </div>
    </div>
  );
}

// ─── Skeletons for secondary panels ──────────────────────────────────────────

function DeepStatsSkeleton() {
  return (
    <div className="glass rounded-2xl p-3 space-y-1.5 animate-pulse">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="flex justify-between">
          <div className="h-3 w-24 rounded" style={{ background: 'var(--card-inner-bg)' }} />
          <div className="h-3 w-14 rounded" style={{ background: 'var(--card-inner-bg)' }} />
        </div>
      ))}
    </div>
  );
}
