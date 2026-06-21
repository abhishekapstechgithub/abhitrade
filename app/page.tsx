'use client';
import {
  ArrowUpRight, BarChart2, ChevronRight, Clock, Eye,
  Loader2, PieChart, RefreshCw,
  Settings2, Star, TrendingDown, TrendingUp,
} from 'lucide-react';
import { useMarketStore } from '@/store/useMarketStore';
import { useUIStore } from '@/store/useUIStore';
import { lookupToken } from '@/lib/angelone/tokens';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { useAngelOnePrices } from '@/hooks/useAngelOneWs';
import { WatchlistItem } from '@/types';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { Suspense } from 'react';
import { OptionChain } from '@/components/markets/OptionChain';
import { StockComposition } from '@/components/markets/StockComposition';
import { FavouriteStrategies } from '@/components/markets/FavouriteStrategies';

// ── Color constants ────────────────────────────────────────────────────────────
const BLUE    = '41,121,255';
const CYAN    = '0,212,255';
const PURPLE  = '170,0,255';
const ORANGE  = '249,115,22';
const EMERALD = '16,185,129';
const RED     = '220,38,38';

function G(col: string, a = 0.1) { return `rgba(${col},${a})`; }
function C(col: string)           { return `rgb(${col})`; }
function gainColor(pos: boolean)  { return pos ? 'var(--accent-green)' : 'var(--accent-red)'; }

interface MarketMoverItem {
  id: number;
  isin: string | null;
  gsin: string | null;
  company_name: string;
  company_short: string | null;
  nse_code: string | null;
  bse_code: string | null;
  ltp: number | string;        // pg returns NUMERIC as string
  prev_close: number | string;
  change: number | string;
  change_pct: number | string;
  market_cap: number | string | null;
  year_high: number | string | null;
  year_low: number | string | null;
  volume: number | string | null;
  logo_url: string | null;
  tag: string | null;
  is_gainer: number;
  rank: number;
  fetched_at: string;
}

// ── Mock / seed data ───────────────────────────────────────────────────────────
function PanelHeader({ title, icon, href }: { title: string; icon: React.ReactNode; href?: string }) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
      style={{ borderBottom:'1px solid var(--panel-divider)' }}>
      <span className="text-xs font-semibold flex items-center gap-1.5" style={{ color:'var(--text-secondary)' }}>
        {icon}{title}
      </span>
      {href && (
        <Link href={href} className="text-[10px] font-semibold flex items-center gap-0.5 hover:opacity-75"
          style={{ color:C(CYAN) }}>
          View all <ArrowUpRight size={10} />
        </Link>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MARKETS SECTION — driven by ?tab= URL param (linked from nav)
// ─────────────────────────────────────────────────────────────────────────────
const MARKET_TABS = [
  { key:'option-chain', label:'Option Chain',        Icon:BarChart2 },
  { key:'composition',  label:'Stock Composition',    Icon:PieChart  },
  { key:'strategies',   label:'Favourite Strategies', Icon:Star      },
] as const;
type MarketTab = typeof MARKET_TABS[number]['key'];

function MarketsSection() {
  const searchParams = useSearchParams();
  const rawTab = searchParams.get('tab') as MarketTab | null;
  const validTabs: MarketTab[] = ['option-chain','composition','strategies'];
  const [activeTab, setActiveTab] = React.useState<MarketTab>(
    rawTab && validTabs.includes(rawTab) ? rawTab : 'option-chain'
  );
  React.useEffect(() => {
    const t = searchParams.get('tab') as MarketTab | null;
    if (t && validTabs.includes(t)) setActiveTab(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center px-1 shrink-0"
        style={{ borderBottom:'1px solid var(--panel-divider)', background:'var(--panel-bg)', height:42 }}>
        <span className="text-[11px] font-bold uppercase tracking-widest px-3 mr-1 shrink-0"
          style={{ color:'var(--text-label)' }}>Markets</span>
        <div className="w-px h-4 mx-1 shrink-0" style={{ background:'var(--panel-divider)' }} />
        {MARKET_TABS.map(t => {
          const { Icon } = t;
          const active = activeTab === t.key;
          return (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              className="flex items-center gap-1.5 px-3 h-full text-[11px] font-medium transition-all whitespace-nowrap"
              style={active
                ? { color:'var(--accent-blue)', borderBottom:'2px solid var(--accent-blue)' }
                : { color:'var(--text-label)', borderBottom:'2px solid transparent' }}>
              <Icon size={12} />{t.label}
            </button>
          );
        })}
      </div>
      <div style={{ minHeight:500 }}>
        {activeTab==='option-chain' && <OptionChain />}
        {activeTab==='composition'  && <StockComposition />}
        {activeTab==='strategies'   && <FavouriteStrategies />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  return <Suspense><DashboardContent /></Suspense>;
}

function DashboardContent() {
  const { openOrderPanel } = useUIStore();

  // Live watchlist prices via WebSocket
  const [dashItems, setDashItems] = React.useState<WatchlistItem[]>([]);
  const [dashPrices, setDashPrices] = React.useState<Record<string, { ltp:number; change:number; changePercent:number }>>({});

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('tk:watchlists');
      if (!raw) return;
      const all = JSON.parse(raw) as Record<string, WatchlistItem[]>;
      const items = all['Watchlist1'] ?? Object.values(all).find(v => v.length > 0) ?? [];
      setDashItems(items);
    } catch { /* ignore */ }
  }, []);

  const dashWsTokens = React.useMemo(() =>
    dashItems.map(item => ({
      token:          item.id || lookupToken(item.symbol)?.token || '',
      exchange:       item.exchange,
      instrumentType: item.instrumentType ?? 'EQ',
    })).filter(t => !!t.token),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [dashItems.map(i => i.id).join(',')]);

  useAngelOnePrices(dashWsTokens, React.useCallback((tick) => {
    setDashPrices(prev => {
      const item = dashItems.find(i => (i.id || lookupToken(i.symbol)?.token) === tick.token);
      if (!item) return prev;
      const prevClose = (tick.close && tick.close > 0) ? tick.close : (item.prevClose || tick.ltp);
      const change = parseFloat((tick.ltp - prevClose).toFixed(2));
      const changePercent = prevClose > 0 ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0;
      return { ...prev, [item.symbol]: { ltp:tick.ltp, change, changePercent } };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashItems]));

  const dashWatchlist: WatchlistItem[] = dashItems.map(item => ({
    ...item, ...(dashPrices[item.symbol] ?? {}),
  }));

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-3 space-y-3 relative z-10">
      <SubTickerBar />
      <MarketSnapshotRow />
      <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-3" style={{ minHeight: 400 }}>
        <DashWatchlistPanel items={dashWatchlist} onOrder={openOrderPanel} />
        <TopMoversTabPanel />
      </div>
      <MarketsSection />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SUB-TICKER BAR
// ─────────────────────────────────────────────────────────────────────────────
function SubTickerBar() {
  const { indices } = useMarketStore();
  const [now, setNow] = React.useState(new Date());

  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true, timeZone:'Asia/Kolkata' });
  const dateStr = now.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', timeZone:'Asia/Kolkata' });

  return (
    <div className="glass rounded-xl px-3 py-1.5 flex items-center gap-3 overflow-x-auto no-scrollbar text-[11px]">
      <div className="flex items-center gap-1.5 shrink-0" style={{ color:'var(--text-dim)' }}>
        <Clock size={11} />
        <span className="font-mono">{timeStr}</span>
        <span style={{ color:'var(--text-label)' }}>{dateStr}</span>
      </div>
      <div className="w-px h-4 shrink-0" style={{ background:'var(--panel-divider)' }} />
      {indices.slice(0, 5).map((idx, i) => {
        const pos = idx.change >= 0;
        return (
          <div key={idx.symbol} className="flex items-center gap-2 shrink-0">
            {i > 0 && <div className="w-px h-4" style={{ background:'var(--panel-divider)' }} />}
            <span style={{ color:'var(--text-label)' }}>{idx.symbol}</span>
            <span className="font-mono font-bold" style={{ color:'var(--text-bright)' }}>{formatNumber(idx.ltp)}</span>
            <span className="font-semibold flex items-center gap-0.5" style={{ color: gainColor(pos) }}>
              {pos ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
              {formatPercent(idx.changePercent)}
            </span>
          </div>
        );
      })}
      <div className="flex-1" />
      <button className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
        style={{ background:G(BLUE, 0.1), color:C(BLUE), border:`1px solid rgba(${BLUE},0.25)` }}>
        <Settings2 size={10} /> Customize
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MARKET SNAPSHOT ROW
// ─────────────────────────────────────────────────────────────────────────────
const INDEX_CARDS = [
  { searchKey:'NIFTY',    label:'NIFTY 50',  mockLtp:22456.80, mockPct:+1.2 },
  { searchKey:'SENSEX',   label:'SENSEX',     mockLtp:73891.20, mockPct:+0.8 },
  { searchKey:'BANK',     label:'BANKNIFTY',  mockLtp:48234.56, mockPct:+1.5 },
  { searchKey:'FIN',      label:'FINNIFTY',   mockLtp:22123.45, mockPct:+0.9 },
  { searchKey:'MIDCP',    label:'MIDCPNIFTY', mockLtp:44650.30, mockPct:+0.6 },
];

function MarketSnapshotRow() {
  const { indices } = useMarketStore();
  const cards = INDEX_CARDS.map(c => {
    const live = indices.find(i => i.symbol.toUpperCase().includes(c.searchKey));
    return { ...c, ltp: live?.ltp ?? c.mockLtp, pct: live?.changePercent ?? c.mockPct, chg: live?.change ?? (c.mockLtp * c.mockPct / 100) };
  });
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map(card => <IndexSnapshotCard key={card.label} card={card} />)}
      <MarketBreadthCard />
    </div>
  );
}

function IndexSnapshotCard({ card }: {
  card: { label:string; ltp:number; chg:number; pct:number };
}) {
  const pos = card.pct >= 0;
  return (
    <div className="glass rounded-2xl p-3 flex flex-col gap-2 card-hover cursor-pointer">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'var(--text-label)' }}>{card.label}</span>
        <span className="text-[10px] font-semibold" style={{ color: gainColor(pos) }}>
          {pos ? '▲' : '▼'} {Math.abs(card.pct).toFixed(2)}%
        </span>
      </div>
      <div className="text-xl font-bold font-mono" style={{ color:'var(--text-bright)' }}>{formatNumber(card.ltp)}</div>
      <div className="text-[10px] font-mono" style={{ color: gainColor(pos) }}>
        {pos ? '+' : ''}{formatNumber(Math.abs(card.chg))}
      </div>
    </div>
  );
}

function MarketBreadthCard() {
  const adv = 1247, dec = 783, unc = 165;
  const total = adv + dec + unc;
  return (
    <div className="glass rounded-2xl p-3 flex flex-col gap-2">
      <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color:'var(--text-label)' }}>Market Breadth</div>
      <div>
        <div className="flex justify-between text-[9px] mb-1">
          <span style={{ color:'var(--accent-green)' }}>▲ {adv} Adv</span>
          <span style={{ color:'var(--text-dim)' }}>{unc}</span>
          <span style={{ color:'var(--accent-red)' }}>{dec} Dec ▼</span>
        </div>
        <div className="flex rounded-full overflow-hidden h-2">
          <div style={{ width:`${(adv/total)*100}%`, background:'var(--accent-green)' }} />
          <div style={{ width:`${(unc/total)*100}%`, background:'var(--text-dim)', opacity:.35 }} />
          <div style={{ width:`${(dec/total)*100}%`, background:'var(--accent-red)' }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1 text-[10px]">
        {([
          ['PCR',      '1.23',       'var(--accent-green)'],
          ['VIX',      '14.23',      'var(--accent-red)'],
          ['FII Net',  '+₹2,840 Cr', 'var(--accent-green)'],
          ['DII Net',  '+₹1,245 Cr', 'var(--accent-green)'],
          ['Max Pain', '22,400',     'var(--text-dim)'],
          ['52W High', '142 stocks', 'var(--accent-green)'],
        ] as [string,string,string][]).map(([l, v, col]) => (
          <div key={l} className="flex justify-between items-center">
            <span style={{ color:'var(--text-label)' }}>{l}</span>
            <span className="font-mono font-semibold" style={{ color: col }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. MAIN PANEL ROW
// ─────────────────────────────────────────────────────────────────────────────
const SIG_MAP: Record<string, { label:string; col:string }> = {
  'STRONG BUY': { label:'STRONG BUY', col:EMERALD },
  'BUY':        { label:'BUY', col:'34,197,94' },
  'NEUTRAL':    { label:'NEUTRAL', col:'148,163,184' },
  'SELL':       { label:'SELL', col:RED },
};
function getSignal(chg: number) {
  if (chg > 2) return 'STRONG BUY';
  if (chg > 0.5) return 'BUY';
  if (chg > -0.5) return 'NEUTRAL';
  return 'SELL';
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP MOVERS TAB PANEL
// ─────────────────────────────────────────────────────────────────────────────
type MoverTab = 'gainers' | 'losers' | 'volume_shockers' | 'top_by_volume' | '52w_high' | '52w_low';
const MOVER_TABS: { key: MoverTab; label: string }[] = [
  { key: 'gainers',         label: 'Gainers'    },
  { key: 'losers',          label: 'Losers'     },
  { key: 'volume_shockers', label: 'Vol Shock'  },
  { key: 'top_by_volume',   label: 'Top Vol'    },
  { key: '52w_high',        label: '52W High'   },
  { key: '52w_low',         label: '52W Low'    },
];

function symColor(sym: string): string {
  const palette = [BLUE, CYAN, EMERALD, ORANGE, PURPLE];
  let h = 0;
  for (const c of sym) h = (h * 31 + c.charCodeAt(0)) & 0xff;
  return palette[h % palette.length];
}

const MOVER_PAGE = 8;

function fmtVol(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function moverSecondary(item: MarketMoverItem, tab: MoverTab): { label: string; color: string } {
  const ltp = Number(item.ltp);
  if (tab === 'volume_shockers' || tab === 'top_by_volume') {
    return { label: `Vol ${fmtVol(item.volume)}`, color: C(ORANGE) };
  }
  if (tab === '52w_high') {
    const yh = Number(item.year_high ?? 0);
    const pct = yh > 0 ? ((ltp - yh) / yh * 100).toFixed(1) : null;
    return { label: pct ? `52W H: ₹${formatNumber(yh)} (${pct}%)` : `52W H: ₹${formatNumber(yh)}`, color: C(EMERALD) };
  }
  if (tab === '52w_low') {
    const yl = Number(item.year_low ?? 0);
    const pct = yl > 0 ? ((ltp - yl) / yl * 100).toFixed(1) : null;
    return { label: pct ? `52W L: ₹${formatNumber(yl)} (+${pct}%)` : `52W L: ₹${formatNumber(yl)}`, color: C(CYAN) };
  }
  return { label: item.company_short || item.company_name || item.gsin || '', color: 'var(--text-label)' };
}

function TopMoversTabPanel() {
  const [tab, setTab]         = React.useState<MoverTab>('gainers');
  const [allItems, setAll]    = React.useState<MarketMoverItem[]>([]);
  const [visible, setVisible] = React.useState<MarketMoverItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [syncing, setSyncing] = React.useState(false);
  const [fetchedAt, setFAt]   = React.useState<string | null>(null);
  const scrollRef             = React.useRef<HTMLDivElement>(null);

  const fetchMovers = React.useCallback(async (type: MoverTab) => {
    setLoading(true);
    try {
      const r = await fetch(`/api/market-movers?type=${type}&limit=50`, { cache: 'no-store' });
      const d = await r.json() as { items: MarketMoverItem[]; fetchedAt: string | null };
      const rows = d.items ?? [];
      setAll(rows);
      setVisible(rows.slice(0, MOVER_PAGE));
      setFAt(d.fetchedAt ?? null);
    } catch { /* keep stale */ }
    finally { setLoading(false); }
  }, []);

  React.useEffect(() => { fetchMovers(tab); }, [tab, fetchMovers]);

  function handleScroll() {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollTop + el.clientHeight >= el.scrollHeight - 40) {
      setVisible(prev => {
        if (prev.length >= allItems.length) return prev;
        return allItems.slice(0, prev.length + MOVER_PAGE);
      });
    }
  }

  async function handleSync(e: React.MouseEvent) {
    e.stopPropagation();
    setSyncing(true);
    try {
      await fetch(`/api/market-movers?type=${tab}`, { method: 'POST' });
      await fetchMovers(tab);
    } catch { /* ignore */ }
    finally { setSyncing(false); }
  }

  const remaining = allItems.length - visible.length;

  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <span className="text-xs font-bold" style={{ color: 'var(--text-secondary)' }}>Top Movers</span>
        <div className="flex items-center gap-1.5">
          {fetchedAt && (
            <span className="text-[9px]" style={{ color: 'var(--text-dim)' }}>
              {new Date(fetchedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
            </span>
          )}
          <button onClick={handleSync} title="Sync from Groww"
            className="p-1 rounded hover:opacity-75 transition-opacity"
            style={{ color: 'var(--text-dim)' }}>
            <RefreshCw size={11} className={syncing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        {MOVER_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className="flex-1 py-1.5 text-[9px] font-semibold whitespace-nowrap transition-all"
            style={tab === t.key
              ? { color: 'var(--accent-blue)', borderBottom: '2px solid var(--accent-blue)' }
              : { color: 'var(--text-dim)', borderBottom: '2px solid transparent' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-2 text-xs" style={{ color: 'var(--text-dim)' }}>
          <Loader2 size={13} className="animate-spin" /> Loading…
        </div>
      ) : !allItems.length ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>No data yet</span>
          <button onClick={handleSync} className="px-3 py-1 rounded-lg text-[10px] font-semibold"
            style={{ background: G(EMERALD, 0.12), color: C(EMERALD), border: `1px solid rgba(${EMERALD},0.3)` }}>
            {syncing ? 'Syncing…' : 'Fetch from Groww'}
          </button>
        </div>
      ) : (
        <>
          <div ref={scrollRef} onScroll={handleScroll}
            className="overflow-y-auto no-scrollbar"
            style={{ height: MOVER_PAGE * 44 }}>
            {visible.map((q, i) => {
              const chgPct = Number(q.change_pct);
              const ltp    = Number(q.ltp);
              const pos    = chgPct >= 0;
              const sym    = q.nse_code || q.bse_code || q.gsin?.replace('GSTK', 'BSE:') || '';
              const col    = symColor(sym);
              const sec    = moverSecondary(q, tab);
              return (
                <div key={`${sym}-${i}`}
                  className="flex items-center gap-2 px-3 py-2 cursor-pointer"
                  style={{ borderBottom: '1px solid var(--row-border)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span className="text-[9px] font-bold w-4 shrink-0 text-right" style={{ color: 'var(--text-dim)' }}>{i + 1}</span>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ background: `rgba(${col},0.2)`, color: C(col) }}>
                    {sym.slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] font-bold truncate" style={{ color: 'var(--text-secondary)' }}>{sym}</div>
                    <div className="text-[9px] truncate" style={{ color: sec.color }}>{sec.label}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[11px] font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                      {formatNumber(ltp)}
                    </div>
                    <div className="text-[10px] font-bold" style={{ color: gainColor(pos) }}>
                      {pos ? '▲ +' : '▼ '}{Math.abs(chgPct).toFixed(2)}%
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {remaining > 0 && (
            <div className="shrink-0 flex items-center justify-center gap-1 py-1 text-[9px] font-semibold"
              style={{ borderTop: '1px solid var(--panel-divider)', color: 'var(--text-dim)' }}>
              ↓ scroll for {remaining} more
            </div>
          )}
        </>
      )}
    </div>
  );
}

function DashWatchlistPanel({ items, onOrder }: {
  items: WatchlistItem[];
  onOrder: (sym: string, side: 'BUY' | 'SELL') => void;
}) {
  const dirs = useMarketStore(s => s.priceDirections);
  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col">
      <PanelHeader title="Watchlist" icon={<Eye size={12} style={{ color:C(CYAN) }} />} href="/watchlist" />
      <div className="grid grid-cols-[1fr_60px_52px_72px] px-3 py-1.5 text-[9px] font-bold uppercase tracking-wider shrink-0"
        style={{ borderBottom:'1px solid var(--panel-divider)', color:'var(--text-label)' }}>
        <span>Symbol</span>
        <span className="text-right">LTP</span>
        <span className="text-right">CHG%</span>
        <span className="text-right">Signal</span>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Eye size={22} style={{ color:'var(--text-dim)' }} />
            <span className="text-xs" style={{ color:'var(--text-label)' }}>No scrips in watchlist</span>
            <Link href="/watchlist">
              <button className="mt-1 px-4 h-7 rounded-lg text-xs font-semibold"
                style={{ background:G(CYAN, 0.1), color:C(CYAN), border:`1px solid rgba(${CYAN},0.25)` }}>
                Add scrips →
              </button>
            </Link>
          </div>
        ) : (
          items.slice(0, 12).map(item => {
            const pos = item.changePercent >= 0;
            const sig = getSignal(item.changePercent);
            const sigInfo = SIG_MAP[sig] ?? SIG_MAP['NEUTRAL'];
            const dir = dirs[item.symbol];
            return (
              <div key={item.id} className="grid grid-cols-[1fr_60px_52px_72px] items-center px-3 py-2 cursor-pointer group"
                style={{ borderBottom:'1px solid var(--row-border)' }}
                onMouseEnter={e => (e.currentTarget.style.background='var(--row-hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background='')}>
                <div className="min-w-0 pr-1">
                  <div className="text-[11px] font-bold truncate" style={{ color:'var(--text-secondary)' }}>{item.symbol}</div>
                  <div className="text-[9px] truncate" style={{ color:'var(--text-label)' }}>{item.name}</div>
                </div>
                <div className="text-right">
                  <span key={item.ltp} className={`text-[11px] font-mono font-bold ${dir==='up'?'tick-up':dir==='down'?'tick-down':''}`}
                    style={{ color:'var(--text-bright)' }}>
                    {formatNumber(item.ltp)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-semibold" style={{ color: gainColor(pos) }}>
                    {pos ? '+' : ''}{item.changePercent.toFixed(2)}%
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background:G(sigInfo.col, 0.15), color:C(sigInfo.col) }}>
                    {sigInfo.label}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

