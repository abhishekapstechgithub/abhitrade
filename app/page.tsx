'use client';
import { ArrowUpRight, Layers, Activity, ShoppingCart, Zap, Target, Shield, Eye, Wallet, TrendingUp, TrendingDown, BarChart2, FlaskConical, DollarSign, GitBranch } from 'lucide-react';
import { useMarketStore } from '@/store/useMarketStore';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';
import { useUIStore } from '@/store/useUIStore';
import { useChartStore } from '@/store/useChartStore';
import { lookupToken } from '@/lib/angelone/tokens';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils/format';
import { WatchlistItem } from '@/types';
import { PaperPosition } from '@/store/usePaperTradingStore';
import Link from 'next/link';
import React from 'react';

// Accent RGB strings — used ONLY for rgba() tints, never for text color directly
const BLUE   = '41,121,255';
const CYAN   = '0,212,255';
const PURPLE = '170,0,255';
const GOLD    = '255,214,0';
const ORANGE  = '249,115,22';
const EMERALD = '16,185,129';
const VIOLET  = '139,92,246';

// Theme-aware text colors via CSS vars
const GAIN_VAR = 'var(--accent-green)';
const LOSS_VAR = 'var(--accent-red)';

function G(col: string, a = 0.1) { return `rgba(${col},${a})`; }
function C(col: string)           { return `rgb(${col})`; }

function gainColor(pos: boolean) { return pos ? GAIN_VAR : LOSS_VAR; }
function gainBg(pos: boolean, a = 0.1) {
  return pos ? `rgba(var(--gain-rgb),${a})` : `rgba(var(--loss-rgb),${a})`;
}

function Pill({ col, label }: { col: string; label: string }) {
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
      style={{ background: G(col, 0.25), color: C(col), border: `1px solid rgba(${col},0.5)` }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { indices, activeWatchlistItems, priceDirections } = useMarketStore();
  const { openOrderPanel } = useUIStore();
  const { active: paperActive, virtualBalance, unrealizedPnl, realizedPnl, totalPnl, positions: paperPositions } = usePaperTradingStore();

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-3 space-y-3 relative z-10">

      {/* Row 1 — live ticker strip */}
      <div className="glass rounded-xl px-3 py-1.5 flex items-center gap-4 overflow-x-auto no-scrollbar">
        {indices.map((idx, i) => (
          <div key={idx.symbol} className="flex items-center gap-2.5 shrink-0">
            {i > 0 && <div className="w-px h-4" style={{ background: 'var(--panel-divider)' }} />}
            <IndexChip idx={idx} dir={priceDirections[idx.symbol]} />
          </div>
        ))}
      </div>

      {/* Row 2 — P&L card + strategy strip */}
      <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-3">
        <PnlCard
          onBuy={() => openOrderPanel('NIFTY', 'BUY')}
          paperActive={paperActive}
          paperData={{ virtualBalance, unrealizedPnl, realizedPnl, totalPnl, count: paperPositions.length }}
        />
        <StrategyStrip />
      </div>

      {/* Row 3 — Watchlist | Top Gainers/Losers | Quick panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <WatchlistPanel items={activeWatchlistItems} onOrder={openOrderPanel} />
        <TopGainersLosers />
        <SidePanel items={activeWatchlistItems} />
      </div>

      {/* Row 4 — Holdings (shows paper positions when active) */}
      <HoldingsTable paperActive={paperActive} paperPositions={paperPositions} />
    </div>
  );
}

// ── Index chip — live from store ──────────────────────────────────────────────
function IndexChip({ idx, dir }: {
  idx: { symbol: string; ltp: number; change: number; changePercent: number };
  dir?: 'up' | 'down';
}) {
  const pos = idx.change >= 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-semibold" style={{ color: 'var(--text-dim)' }}>{idx.symbol}</span>
      {/* key forces remount on each price change → restarts CSS animation */}
      <span key={idx.ltp} className={`text-xs font-mono font-bold ${dir === 'up' ? 'tick-up' : dir === 'down' ? 'tick-down' : ''}`}
        style={{ color: 'var(--text-bright)' }}>
        {formatNumber(idx.ltp)}
      </span>
      <span className="text-[10px] font-semibold flex items-center gap-0.5" style={{ color: gainColor(pos) }}>
        {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
        {formatPercent(idx.changePercent)}
      </span>
    </div>
  );
}

// ── P&L card ──────────────────────────────────────────────────────────────────
interface PaperData { virtualBalance: number; unrealizedPnl: number; realizedPnl: number; totalPnl: number; count: number }
function PnlCard({ onBuy, paperActive, paperData }: { onBuy: () => void; paperActive: boolean; paperData: PaperData }) {
  if (paperActive) {
    // Show paper portfolio data
    const p = paperData;
    const pos = p.totalPnl >= 0;
    return (
      <div className="glass-bright rounded-2xl p-4 relative overflow-hidden"
        style={{ borderColor: gainBg(pos, 0.3), boxShadow: `0 0 28px ${gainBg(pos, 0.08)}` }}>
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: `radial-gradient(ellipse at top right,${gainBg(pos, 0.1)},transparent 60%)` }} />
        <div className="relative flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <FlaskConical size={11} style={{ color: 'rgb(245,158,11)' }} />
              <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'rgb(245,158,11)' }}>
                Paper Portfolio
              </span>
            </div>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
              style={{ background: gainBg(pos, 0.18), color: gainColor(pos), border: `1px solid ${gainBg(pos, 0.35)}` }}>
              {pos ? '▲ PROFIT' : '▼ LOSS'}
            </span>
          </div>
          <div>
            <div className="text-2xl font-bold font-mono" style={{ color: gainColor(pos) }}>
              {pos ? '+' : ''}{formatCurrency(p.totalPnl, true)}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>
              {p.count} position{p.count !== 1 ? 's' : ''} open
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {[
              ['Balance', formatCurrency(p.virtualBalance, true)],
              ['Unrealised', formatCurrency(p.unrealizedPnl, true)],
              ['Realised', formatCurrency(p.realizedPnl, true)],
              ['Total P&L', formatCurrency(p.totalPnl, true)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-lg px-2 py-1.5"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>{l}</div>
                <div className="text-[11px] font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{v}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={onBuy}
              className="flex-1 h-8 rounded-xl text-xs font-bold text-white hover:opacity-85 transition-opacity"
              style={{ background: 'linear-gradient(135deg,#2979ff,#00d4ff)', boxShadow: '0 2px 14px rgba(41,121,255,0.4)' }}>
              Quick Buy
            </button>
            <Link href="/paper-trading" className="flex-1">
              <button className="w-full h-8 rounded-xl text-xs font-semibold transition-colors"
                style={{ border: '1px solid rgba(245,158,11,0.4)', color: 'rgb(245,158,11)', background: 'rgba(245,158,11,0.1)' }}>
                Paper Trading
              </button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Live portfolio — data comes from broker integration (Angel One)
  return (
    <div className="glass-bright rounded-2xl p-4 relative overflow-hidden"
      style={{ borderColor: 'var(--card-inner-border)' }}>
      <div className="relative flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-label)' }}>
            Portfolio
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(41,121,255,0.12)', color: '#2979ff', border: '1px solid rgba(41,121,255,0.25)' }}>
            LIVE
          </span>
        </div>
        <div className="flex items-center justify-center py-6 flex-col gap-2">
          <Wallet size={28} style={{ color: 'var(--text-dim)' }} />
          <span className="text-xs" style={{ color: 'var(--text-label)' }}>Connect Angel One to view portfolio</span>
          <Link href="/profile">
            <button className="mt-1 px-4 h-7 rounded-lg text-xs font-semibold transition-colors"
              style={{ background: 'rgba(41,121,255,0.12)', color: '#2979ff', border: '1px solid rgba(41,121,255,0.25)' }}>
              Connect broker
            </button>
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {[['Invested', '—'], ['Current', '—'], ['Cash', '—'], ['Margin', '—']].map(([l, v]) => (
            <div key={l} className="rounded-lg px-2 py-1.5"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>
              <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>{l}</div>
              <div className="text-[11px] font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{v}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onBuy}
            className="flex-1 h-8 rounded-xl text-xs font-bold text-white hover:opacity-85 transition-opacity"
            style={{ background: 'linear-gradient(135deg,#2979ff,#00d4ff)', boxShadow: '0 2px 14px rgba(41,121,255,0.4)' }}>
            Quick Buy
          </button>
          <Link href="/portfolio" className="flex-1">
            <button className="w-full h-8 rounded-xl text-xs font-semibold transition-colors"
              style={{ border: '1px solid var(--panel-divider)', color: 'var(--text-accent)' }}>
              Holdings
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Strategy strip — compact horizontal cards ──────────────────────────────────
const STRATEGIES = [
  { name: 'Bull Call Spread', sym: 'NIFTY',     expiry: '26 Jun', legs: 2, pnl: +4250, col: BLUE,    Icon: Target,      badge: 'Bullish' },
  { name: 'Iron Condor',      sym: 'BANKNIFTY', expiry: '26 Jun', legs: 4, pnl: -820,  col: ORANGE,  Icon: Shield,      badge: 'Neutral' },
  { name: 'Long Straddle',    sym: 'RELIANCE',  expiry: '31 Jul', legs: 2, pnl: 0,     col: PURPLE,  Icon: Zap,         badge: 'Hedged'  },
  { name: 'Bear Put Spread',  sym: 'NIFTY',     expiry: '03 Jul', legs: 2, pnl: +560,  col: EMERALD, Icon: TrendingDown, badge: 'Bearish' },
  { name: 'Covered Call',     sym: 'TCS',       expiry: '26 Jun', legs: 2, pnl: +1250, col: CYAN,    Icon: DollarSign,  badge: 'Income'  },
  { name: 'Butterfly Spread', sym: 'BANKNIFTY', expiry: '03 Jul', legs: 4, pnl: +320,  col: VIOLET,  Icon: GitBranch,   badge: 'Neutral' },
];

function StrategyStrip() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {STRATEGIES.map(s => <StrategyCard key={s.name} s={s} />)}
    </div>
  );
}

function StrategyCard({ s }: { s: typeof STRATEGIES[0] }) {
  const { Icon } = s;
  const pos = s.pnl > 0;
  const pnlColor = s.pnl === 0 ? 'var(--text-label)' : gainColor(pos);

  return (
    <div className="glass rounded-2xl p-3 relative overflow-hidden card-hover"
      style={{ borderColor: `rgba(${s.col},0.35)`, boxShadow: `0 0 20px rgba(${s.col},0.1)` }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at bottom left,rgba(${s.col},0.11),transparent 65%)` }} />
      <div className="relative flex flex-col gap-2.5">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: G(s.col, 0.22), border: `1px solid rgba(${s.col},0.45)` }}>
              <Icon size={13} style={{ color: C(s.col) }} />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold leading-tight" style={{ color: 'var(--text-secondary)' }}>{s.name}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>
                {s.sym} · {s.expiry} · {s.legs} legs
              </div>
            </div>
          </div>
          <Pill col={s.col} label={s.badge} />
        </div>

        {/* P&L row */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Unrealised P&amp;L</div>
            <div className="text-base font-bold font-mono mt-0.5" style={{ color: pnlColor }}>
              {s.pnl === 0 ? '—' : `${pos ? '+' : ''}₹${Math.abs(s.pnl).toLocaleString('en-IN')}`}
            </div>
          </div>
          <Link href="/markets?tab=strategies">
            <span className="text-[10px] font-semibold px-2 py-1 rounded-lg cursor-pointer transition-opacity hover:opacity-80"
              style={{ background: G(s.col, 0.2), color: C(s.col), border: `1px solid rgba(${s.col},0.42)` }}>
              Manage →
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Watchlist row — isolated component so key trick restarts animation ────────
function WatchlistRow({ item, dir, onOrder }: {
  item: WatchlistItem;
  dir?: 'up' | 'down';
  onOrder: (sym: string, side: 'BUY' | 'SELL') => void;
}) {
  const pos = item.changePercent >= 0;
  const openChart = useChartStore(s => s.openChart);
  function handleChartOpen(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return;
    const info = lookupToken(item.symbol);
    openChart({
      symbol:   item.symbol,
      exchange: info?.exchange ?? (item.exchange as string | undefined) ?? 'NSE',
      token:    info?.token    ?? '',
      name:     item.name,
    });
  }
  return (
    <div className="flex items-center px-3 py-2 group cursor-pointer"
      style={{ borderBottom: '1px solid var(--row-border)' }}
      onClick={handleChartOpen}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold truncate" style={{ color: 'var(--text-secondary)' }}>{item.symbol}</div>
        <div className="text-[10px] truncate" style={{ color: 'var(--text-label)' }}>{item.name}</div>
      </div>
      <div className="text-right mr-2 shrink-0">
        {/* key forces remount → restarts the CSS tick animation */}
        <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
          <span key={item.ltp} className={dir === 'up' ? 'tick-up' : dir === 'down' ? 'tick-down' : ''}>
            ₹{formatNumber(item.ltp)}
          </span>
        </div>
        <div className="text-[10px] font-semibold" style={{ color: gainColor(pos) }}>
          {pos ? '▲' : '▼'} {formatPercent(item.changePercent)}
        </div>
      </div>
      <div className="hidden group-hover:flex gap-1 shrink-0">
        <button onClick={() => onOrder(item.symbol, 'BUY')}
          className="w-5 h-5 rounded text-[11px] font-bold text-white flex items-center justify-center"
          style={{ background: 'var(--accent-green)' }}>B</button>
        <button onClick={() => onOrder(item.symbol, 'SELL')}
          className="w-5 h-5 rounded text-[11px] font-bold text-white flex items-center justify-center"
          style={{ background: 'var(--accent-red)' }}>S</button>
      </div>
    </div>
  );
}

// ── Watchlist panel — live prices from store ──────────────────────────────────
function WatchlistPanel({ items, onOrder }: { items: WatchlistItem[]; onOrder: (sym: string, side: 'BUY' | 'SELL') => void }) {
  const priceDirections = useMarketStore(s => s.priceDirections);
  return (
    <div className="glass rounded-2xl overflow-hidden" style={{ maxHeight: 360 }}>
      <PanelHeader title="Watchlist" icon={<Eye size={12} style={{ color: C(CYAN) }} />} href="/watchlist" />
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2">
          <Eye size={24} style={{ color: 'var(--text-dim)' }} />
          <span className="text-xs" style={{ color: 'var(--text-label)' }}>No scrips in watchlist</span>
          <Link href="/watchlist">
            <button className="mt-1 px-4 h-7 rounded-lg text-xs font-semibold"
              style={{ background: `rgba(${CYAN},0.1)`, color: `rgb(${CYAN})`, border: `1px solid rgba(${CYAN},0.25)` }}>
              Add scrips →
            </button>
          </Link>
        </div>
      ) : (
        <div className="overflow-y-auto no-scrollbar">
          {items.slice(0, 10).map(item => (
            <WatchlistRow key={item.id} item={item} dir={priceDirections[item.symbol]} onOrder={onOrder} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Top Gainers / Losers panel (data from AngelOne sync) ─────────────────────
interface QuoteItem {
  symbol: string; exchange: string; ltp: number;
  netChange: number; percentChange: number; volume: number;
}

function TopGainersLosers() {
  const [quotes, setQuotes]   = React.useState<QuoteItem[]>([]);
  const [tab, setTab]         = React.useState<'gainers' | 'losers'>('gainers');
  const [loading, setLoading] = React.useState(true);
  const [lastSync, setLastSync] = React.useState<string | null>(null);
  const openChart = useChartStore(s => s.openChart);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [dataRes, statusRes] = await Promise.all([
          fetch('/api/market-sync/data', { cache: 'no-store' }),
          fetch('/api/market-sync',      { cache: 'no-store' }),
        ]);
        if (!alive) return;
        const raw    = await dataRes.json()   as Record<string, QuoteItem>;
        const status = await statusRes.json() as { lastSync: string | null };

        // Deduplicate: one entry per symbol (skip trading-symbol aliases like SBIN-EQ)
        const seen = new Set<string>();
        const items: QuoteItem[] = [];
        for (const q of Object.values(raw)) {
          if (seen.has(q.symbol)) continue;
          seen.add(q.symbol);
          items.push(q);
        }
        setQuotes(items);
        setLastSync(status.lastSync);
      } catch { /* silently fall through to empty state */ }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  const gainers = quotes.filter(q => q.percentChange > 0)
    .sort((a, b) => b.percentChange - a.percentChange).slice(0, 8);
  const losers  = quotes.filter(q => q.percentChange < 0)
    .sort((a, b) => a.percentChange - b.percentChange).slice(0, 8);
  const list = tab === 'gainers' ? gainers : losers;

  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col" style={{ maxHeight: 360 }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
          <BarChart2 size={12} style={{ color: C(EMERALD) }} />
          Top Gainers / Losers
        </span>
        <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
          {lastSync
            ? `Synced ${new Date(lastSync).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
            : 'AngelOne Live'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        {(['gainers', 'losers'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="flex-1 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all"
            style={{
              color: tab === t
                ? (t === 'gainers' ? 'var(--accent-green)' : 'var(--accent-red)')
                : 'var(--text-dim)',
              borderBottom: tab === t
                ? `2px solid ${t === 'gainers' ? 'var(--accent-green)' : 'var(--accent-red)'}`
                : '2px solid transparent',
              background: tab === t
                ? (t === 'gainers' ? 'rgba(var(--gain-rgb),0.07)' : 'rgba(var(--loss-rgb),0.07)')
                : 'transparent',
            }}>
            {t === 'gainers' ? '▲ Gainers' : '▼ Losers'}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="overflow-y-auto no-scrollbar flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-xs" style={{ color: 'var(--text-dim)' }}>
            Loading…
          </div>
        ) : list.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-1.5 text-center px-4">
            <TrendingUp size={24} style={{ color: 'var(--text-dim)', opacity: 0.4 }} />
            <span className="text-xs" style={{ color: 'var(--text-dim)' }}>No data — market closed or sync pending</span>
            <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>AngelOne syncs every 4 h</span>
          </div>
        ) : (
          <table className="w-full text-[10px]">
            <thead className="sticky top-0" style={{ background: 'var(--table-head-bg)' }}>
              <tr>
                <th className="text-left px-3 py-1.5 font-semibold" style={{ color: 'var(--text-label)' }}>#&nbsp;Symbol</th>
                <th className="text-right px-2 py-1.5 font-semibold" style={{ color: 'var(--text-label)' }}>LTP</th>
                <th className="text-right px-2 py-1.5 font-semibold" style={{ color: 'var(--text-label)' }}>Chg</th>
                <th className="text-right px-3 py-1.5 font-semibold" style={{ color: 'var(--text-label)' }}>Chg %</th>
              </tr>
            </thead>
            <tbody>
              {list.map((q, i) => {
                const pos = q.percentChange >= 0;
                const info = lookupToken(q.symbol);
                return (
                  <tr key={q.symbol} className="cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid var(--row-border)' }}
                    onClick={() => openChart({ symbol: q.symbol, exchange: q.exchange, token: info?.token ?? '' })}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-bold w-4 h-4 flex items-center justify-center rounded"
                          style={{
                            color:      pos ? 'var(--accent-green)' : 'var(--accent-red)',
                            background: pos ? 'rgba(var(--gain-rgb),0.14)' : 'rgba(var(--loss-rgb),0.14)',
                          }}>
                          {i + 1}
                        </span>
                        <div>
                          <div className="font-bold text-[11px] leading-tight" style={{ color: 'var(--text-secondary)' }}>
                            {q.symbol}
                          </div>
                          <div className="text-[9px]" style={{ color: 'var(--text-dim)' }}>{q.exchange}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                      {formatNumber(q.ltp)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono text-[10px]" style={{ color: gainColor(pos) }}>
                      {pos ? '+' : ''}{formatNumber(q.netChange)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                        style={{
                          background: pos ? 'rgba(var(--gain-rgb),0.12)' : 'rgba(var(--loss-rgb),0.12)',
                          color: gainColor(pos),
                        }}>
                        {pos ? '+' : ''}{q.percentChange.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Side panel ────────────────────────────────────────────────────────────────
function SidePanel({ items }: { items: WatchlistItem[] }) {
  const movers = [...items.filter(i => i.instrumentType === 'EQ')]
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 5);
  return (
    <div className="flex flex-col gap-3" style={{ maxHeight: 360 }}>
      {/* Quick actions */}
      <div className="glass rounded-2xl p-3">
        <div className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-label)' }}>Quick Actions</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Option Chain', href: '/markets?tab=option-chain', Icon: Layers,       col: CYAN   },
            { label: 'Charts',       href: '/markets?tab=charts',       Icon: Activity,     col: '0,200,80' },
            { label: 'Orders',       href: '/orders',                   Icon: ShoppingCart, col: GOLD   },
            { label: 'Strategies',   href: '/markets?tab=strategies',   Icon: Zap,          col: PURPLE },
          ].map(a => {
            const { Icon } = a;
            return (
              <Link key={a.label} href={a.href}
                className="flex items-center gap-2 px-2.5 py-2 rounded-xl card-hover"
                style={{ background: G(a.col, 0.15), border: `1px solid rgba(${a.col},0.32)` }}>
                <Icon size={13} style={{ color: C(a.col) }} />
                <span className="text-[11px] font-semibold" style={{ color: C(a.col) }}>{a.label}</span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Top movers — live */}
      <div className="glass rounded-2xl p-3 flex-1 overflow-hidden">
        <div className="text-[11px] font-bold uppercase tracking-widest mb-2.5" style={{ color: 'var(--text-label)' }}>Top Movers</div>
        <div className="space-y-2">
          {movers.map(item => {
            const pos = item.changePercent >= 0;
            return (
              <div key={item.id} className="flex items-center justify-between cursor-pointer hover:opacity-80 transition-opacity">
                <div>
                  <div className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>{item.symbol}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{item.exchange}</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-bright)' }}>₹{formatNumber(item.ltp)}</div>
                  <div className="text-[10px] font-semibold" style={{ color: gainColor(pos) }}>
                    {pos ? '▲' : '▼'} {formatPercent(item.changePercent)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Holdings table ────────────────────────────────────────────────────────────
function HoldingsTable({ paperActive, paperPositions }: { paperActive: boolean; paperPositions: PaperPosition[] }) {
  if (paperActive && paperPositions.length > 0) {
    return (
      <div className="glass rounded-2xl overflow-hidden">
        <PanelHeader title="Paper Positions" icon={<FlaskConical size={12} style={{ color: 'rgb(245,158,11)' }} />} href="/paper-trading" />
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
              <tr>
                {['Symbol', 'Qty', 'Avg Price', 'LTP', 'Value', 'P&L', 'P&L %'].map(h => (
                  <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-[11px]"
                    style={{ color: 'var(--text-label)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paperPositions.map(pos => {
                const isProfit = pos.pnl >= 0;
                return (
                  <tr key={pos.symbol} className="transition-colors cursor-pointer"
                    style={{ borderBottom: '1px solid var(--row-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td className="px-3 py-2.5">
                      <div className="font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>{pos.symbol}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{pos.exchange}</div>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--text-accent)' }}>{pos.quantity}</td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--text-dim)' }}>₹{formatNumber(pos.avgPrice)}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-xs" style={{ color: 'var(--text-bright)' }}>₹{formatNumber(pos.ltp)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs" style={{ color: 'var(--text-accent)' }}>{formatCurrency(pos.ltp * pos.quantity, true)}</td>
                    <td className="px-3 py-2.5 font-mono font-bold text-xs" style={{ color: gainColor(isProfit) }}>
                      {isProfit ? '+' : '-'}₹{formatNumber(Math.abs(pos.pnl))}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                        style={{
                          background: gainBg(isProfit, 0.14),
                          color: gainColor(isProfit),
                          border: `1px solid ${gainBg(isProfit, 0.3)}`,
                        }}>
                        {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <PanelHeader title="Holdings" icon={<Wallet size={12} style={{ color: C(GOLD) }} />} href="/portfolio" />
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
            <tr>
              {['Symbol', 'Qty', 'Avg Price', 'LTP', 'Value', 'P&L', 'P&L %'].map(h => (
                <th key={h} className="text-left px-3 py-2 font-semibold uppercase tracking-wider text-[11px]"
                  style={{ color: 'var(--text-label)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colSpan={7} className="px-3 py-8 text-center text-xs" style={{ color: 'var(--text-label)' }}>
                No holdings — connect Angel One or start paper trading
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared panel header ───────────────────────────────────────────────────────
function PanelHeader({ title, icon, href }: { title: string; icon: React.ReactNode; href: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5"
      style={{ borderBottom: '1px solid var(--panel-divider)' }}>
      <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color: 'var(--text-secondary)' }}>
        {icon}{title}
      </span>
      <Link href={href} className="text-[10px] font-semibold flex items-center gap-0.5 hover:opacity-75 transition-opacity"
        style={{ color: C(CYAN) }}>
        View all <ArrowUpRight size={10} />
      </Link>
    </div>
  );
}
