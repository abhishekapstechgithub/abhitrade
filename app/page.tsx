'use client';
import {
  ArrowUpRight, BarChart2, ChevronRight, Clock, Eye,
  Loader2, Newspaper, PieChart, RefreshCw,
  Settings2, Star, TrendingDown, TrendingUp, Zap,
} from 'lucide-react';
import { useMarketStore } from '@/store/useMarketStore';
import { useUIStore } from '@/store/useUIStore';
import { lookupToken } from '@/lib/angelone/tokens';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import { useAngelOnePrices } from '@/hooks/useAngelOneWs';
import { WatchlistItem } from '@/types';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { Suspense, useId } from 'react';
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
const GOLD    = '255,214,0';

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
const NIFTY_SPARK     = [22100,22200,22150,22300,22250,22380,22410,22456];
const SENSEX_SPARK    = [73200,73400,73350,73600,73550,73780,73820,73891];
const BANKNIFTY_SPARK = [47800,47950,47900,48100,48050,48200,48220,48234];
const FINNIFTY_SPARK  = [21800,21900,21850,22000,21980,22100,22110,22123];
const MIDCP_SPARK     = [44200,44350,44300,44500,44450,44600,44620,44650];

const SECTORS = [
  { name:'BANK',    pct:+1.8 }, { name:'IT',      pct:-0.6 },
  { name:'PHARMA',  pct:+2.1 }, { name:'AUTO',    pct:+0.9 },
  { name:'ENERGY',  pct:-1.2 }, { name:'METAL',   pct:+0.4 },
  { name:'FMCG',    pct:-0.3 }, { name:'REALTY',  pct:+3.2 },
  { name:'INFRA',   pct:+1.1 }, { name:'MEDIA',   pct:-0.8 },
  { name:'TELECOM', pct:+0.7 }, { name:'PSU',     pct:+1.5 },
];

const AI_STRATEGIES = [
  { name:'Bull Call Spread', badge:'Bullish', col:BLUE,    sym:'NIFTY',     expiry:'26 Jun', confidence:87, pop:72, maxProfit:8500,  maxLoss:1500,  risk:'Low',    pnl:+2134 },
  { name:'Bear Put Spread',  badge:'Bearish', col:RED,     sym:'BANKNIFTY', expiry:'26 Jun', confidence:74, pop:68, maxProfit:6200,  maxLoss:2000,  risk:'Medium', pnl:-340  },
  { name:'Iron Condor',      badge:'Neutral', col:ORANGE,  sym:'NIFTY',     expiry:'03 Jul', confidence:81, pop:78, maxProfit:4000,  maxLoss:1000,  risk:'Low',    pnl:+890  },
  { name:'Short Straddle',   badge:'Neutral', col:PURPLE,  sym:'FINNIFTY',  expiry:'26 Jun', confidence:69, pop:65, maxProfit:3500,  maxLoss:-1,    risk:'High',   pnl:+1245 },
  { name:'Covered Call',     badge:'Income',  col:EMERALD, sym:'TCS',       expiry:'31 Jul', confidence:83, pop:80, maxProfit:2200,  maxLoss:18000, risk:'Medium', pnl:+567  },
];

const OC_SNAP = {
  tabs: ['NIFTY','BANKNIFTY','FINNIFTY'] as const,
  data: {
    NIFTY:     { spot:22456.8, pcr:1.23, maxPain:22400, oi:'₹2.8L Cr', strikes:[{k:22300,ce:28450,pe:8920},{k:22400,ce:18230,pe:14560},{k:22500,ce:8940,pe:28760}] },
    BANKNIFTY: { spot:48234.5, pcr:0.98, maxPain:48000, oi:'₹1.2L Cr', strikes:[{k:48000,ce:24560,pe:9840},{k:48200,ce:14230,pe:18450},{k:48400,ce:7890,pe:29340}] },
    FINNIFTY:  { spot:22123.4, pcr:1.12, maxPain:22000, oi:'₹48K Cr',  strikes:[{k:21900,ce:18900,pe:7430},{k:22000,ce:12340,pe:14230},{k:22100,ce:6780,pe:21450}] },
  } as Record<string, {spot:number;pcr:number;maxPain:number;oi:string;strikes:{k:number;ce:number;pe:number}[]}>,
};

const NEWS_ITEMS = [
  { time:'10:05', cat:'Market',    headline:'SEBI proposes new F&O margin rules effective July 2026', sentiment:'neutral' },
  { time:'09:58', cat:'Economy',   headline:'RBI keeps repo rate unchanged at 6.25% in June MPC meet', sentiment:'bullish' },
  { time:'09:45', cat:'Corporate', headline:'TCS Q4 results beat estimates; stock up 2.3% in early trade', sentiment:'bullish' },
  { time:'09:30', cat:'Global',    headline:'US Fed signals one rate cut in 2026; Asian markets rally', sentiment:'bullish' },
  { time:'09:15', cat:'Market',    headline:'Nifty opens above 22,400 amid broad-based buying', sentiment:'bullish' },
  { time:'08:52', cat:'Economy',   headline:'India CPI inflation eases to 4.2% in May, lowest in 18 months', sentiment:'bullish' },
];

const VOL_SHOCKERS = [
  { sym:'ZOMATO',  ltp: 214.5, chg:+5.8, extra:'+420%' },
  { sym:'PAYTM',   ltp: 342.8, chg:-3.2, extra:'+285%' },
  { sym:'ADANI',   ltp: 892.3, chg:+2.1, extra:'+190%' },
  { sym:'YESBANK', ltp:  21.4, chg:+8.4, extra:'+165%' },
  { sym:'IRFC',    ltp: 148.7, chg:+3.9, extra:'+148%' },
];

const OI_LONG = [
  { sym:'NIFTY 22500 CE',      ltp:  88.4, chg:+12.4, extra:'+28%' },
  { sym:'BANKNIFTY 48500 CE',  ltp: 124.6, chg:+18.2, extra:'+22%' },
  { sym:'RELIANCE FUT',        ltp:2892.0, chg:+2.1,  extra:'+18%' },
  { sym:'TCS FUT',             ltp:3847.0, chg:+1.8,  extra:'+15%' },
  { sym:'SBIN FUT',            ltp: 782.4, chg:+3.4,  extra:'+12%' },
];

const OI_SHORT = [
  { sym:'NIFTY 22200 PE',      ltp:  62.8, chg:-14.2, extra:'+32%' },
  { sym:'BANKNIFTY 47500 PE',  ltp:  98.4, chg:-18.4, extra:'+24%' },
  { sym:'HDFC FUT',            ltp:1748.0, chg:-1.9,  extra:'+19%' },
  { sym:'INFY FUT',            ltp:1432.0, chg:-2.4,  extra:'+16%' },
  { sym:'ICICIBANK FUT',       ltp:1124.0, chg:-1.6,  extra:'+13%' },
];

// ── Sparkline SVG ──────────────────────────────────────────────────────────────
function Sparkline({ data, positive, width = 72, height = 32 }: {
  data: number[]; positive: boolean; width?: number; height?: number;
}) {
  const uid = useId();
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = (max - min) || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return [x, y] as [number, number];
  });
  const line = pts.map(([x, y]) => `${x},${y}`).join(' L ');
  const area = `M ${pts[0][0]},${pts[0][1]} L ${line} L ${width},${height} L 0,${height} Z`;
  const stroke = positive ? '#16a34a' : '#dc2626';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow:'visible' }}>
      <defs>
        <linearGradient id={`sk-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sk-${uid})`} />
      <path d={`M ${line}`} fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ConfBar({ value, col }: { value: number; col: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background:`rgba(${col},0.15)` }}>
        <div className="h-full rounded-full" style={{ width:`${value}%`, background:`rgb(${col})` }} />
      </div>
      <span className="text-[10px] font-bold w-7 text-right shrink-0" style={{ color:`rgb(${col})` }}>{value}%</span>
    </div>
  );
}

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
      <AITradeOpportunitiesRow />
      <CenterRow watchlist={dashWatchlist} onOrder={openOrderPanel} />
      <BottomRow />
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

  const h = parseInt(now.toLocaleString('en-IN', { hour:'2-digit', hour12:false, timeZone:'Asia/Kolkata' }), 10);
  const m = parseInt(now.toLocaleString('en-IN', { minute:'2-digit', timeZone:'Asia/Kolkata' }), 10);
  const day = new Date(now.toLocaleString('en-US', { timeZone:'Asia/Kolkata' })).getDay();
  const isOpen = day >= 1 && day <= 5 && (h > 9 || (h === 9 && m >= 15)) && (h < 15 || (h === 15 && m < 30));

  const timeStr = now.toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true, timeZone:'Asia/Kolkata' });
  const dateStr = now.toLocaleDateString('en-IN', { weekday:'short', day:'2-digit', month:'short', timeZone:'Asia/Kolkata' });

  return (
    <div className="glass rounded-xl px-3 py-1.5 flex items-center gap-3 overflow-x-auto no-scrollbar text-[11px]">
      <div className="flex items-center gap-1.5 shrink-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${isOpen ? 'animate-pulse' : ''}`}
          style={{ background: isOpen ? 'var(--accent-green)' : 'var(--accent-red)' }} />
        <span className="font-bold" style={{ color: isOpen ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {isOpen ? 'MARKET OPEN' : 'MARKET CLOSED'}
        </span>
      </div>
      <div className="w-px h-4 shrink-0" style={{ background:'var(--panel-divider)' }} />
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
  { searchKey:'NIFTY',    label:'NIFTY 50',   spark:NIFTY_SPARK,     mockLtp:22456.80, mockPct:+1.2  },
  { searchKey:'SENSEX',   label:'SENSEX',      spark:SENSEX_SPARK,    mockLtp:73891.20, mockPct:+0.8  },
  { searchKey:'BANK',     label:'BANKNIFTY',   spark:BANKNIFTY_SPARK, mockLtp:48234.56, mockPct:+1.5  },
  { searchKey:'FIN',      label:'FINNIFTY',    spark:FINNIFTY_SPARK,  mockLtp:22123.45, mockPct:+0.9  },
  { searchKey:'MIDCP',    label:'MIDCPNIFTY',  spark:MIDCP_SPARK,     mockLtp:44650.30, mockPct:+0.6  },
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
  card: { label:string; spark:number[]; ltp:number; chg:number; pct:number };
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
      <div className="flex items-end justify-between">
        <span className="text-[10px] font-mono" style={{ color: gainColor(pos) }}>
          {pos ? '+' : ''}{formatNumber(Math.abs(card.chg))}
        </span>
        <Sparkline data={card.spark} positive={pos} />
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
// 3. AI TRADE OPPORTUNITIES ROW
// ─────────────────────────────────────────────────────────────────────────────
function AITradeOpportunitiesRow() {
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
        style={{ borderBottom:'1px solid var(--panel-divider)', background:G(BLUE, 0.04) }}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background:G(BLUE, 0.2), border:`1px solid rgba(${BLUE},0.4)` }}>
            <Zap size={13} style={{ color:C(BLUE) }} />
          </div>
          <span className="text-sm font-bold" style={{ color:'var(--text-bright)' }}>AI Trade Opportunities</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background:G(BLUE, 0.15), color:C(BLUE), border:`1px solid rgba(${BLUE},0.3)` }}>
            5 Active
          </span>
        </div>
        <Link href="/?tab=strategies" className="text-[11px] font-semibold flex items-center gap-1 hover:opacity-75"
          style={{ color:C(CYAN) }}>
          View All <ArrowUpRight size={11} />
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_290px]">
        {AI_STRATEGIES.map((s, i) => (
          <div key={s.name}
            style={{ borderRight:`1px solid var(--panel-divider)`, borderBottom: i < AI_STRATEGIES.length ? `1px solid var(--panel-divider)` : 'none' }}>
            <AIStrategyCard s={s} />
          </div>
        ))}
        <OptionChainSnapshotCard />
      </div>
    </div>
  );
}

function AIStrategyCard({ s }: { s: typeof AI_STRATEGIES[0] }) {
  const pos = s.pnl >= 0;
  return (
    <div className="p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ background:G(s.col, 0.15), color:C(s.col) }}>
            {s.badge}
          </span>
          <div className="text-xs font-bold mt-1.5" style={{ color:'var(--text-secondary)' }}>{s.name}</div>
          <div className="text-[10px]" style={{ color:'var(--text-label)' }}>{s.sym} · {s.expiry}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px]" style={{ color:'var(--text-label)' }}>Live P&amp;L</div>
          <div className="text-sm font-bold font-mono" style={{ color: gainColor(pos) }}>
            {pos ? '+' : ''}₹{Math.abs(s.pnl).toLocaleString('en-IN')}
          </div>
        </div>
      </div>
      <div>
        <div className="text-[10px] mb-1" style={{ color:'var(--text-label)' }}>AI Confidence</div>
        <ConfBar value={s.confidence} col={s.col} />
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[10px]">
        {([
          ['POP',        `${s.pop}%`,                         'var(--text-secondary)'],
          ['Risk',       s.risk, s.risk==='Low'?'var(--accent-green)':s.risk==='High'?'var(--accent-red)':'var(--accent-blue)'],
          ['Max Profit', s.maxProfit > 0 ? `₹${s.maxProfit.toLocaleString('en-IN')}` : '∞', 'var(--accent-green)'],
          ['Max Loss',   s.maxLoss < 0 ? 'Unlimited' : `₹${s.maxLoss.toLocaleString('en-IN')}`, 'var(--accent-red)'],
        ] as [string,string,string][]).map(([l, v, col]) => (
          <div key={l} className="rounded-lg px-2 py-1.5"
            style={{ background:'var(--card-inner-bg)', border:'1px solid var(--card-inner-border)' }}>
            <div style={{ color:'var(--text-label)' }}>{l}</div>
            <div className="font-bold mt-0.5" style={{ color: col }}>{v}</div>
          </div>
        ))}
      </div>
      <Link href="/?tab=strategies">
        <div className="flex items-center justify-center gap-1 py-1.5 rounded-lg text-[11px] font-semibold hover:opacity-85 transition-opacity"
          style={{ background:G(s.col, 0.12), color:C(s.col), border:`1px solid rgba(${s.col},0.3)` }}>
          View Strategy <ChevronRight size={11} />
        </div>
      </Link>
    </div>
  );
}

function OptionChainSnapshotCard() {
  const [idx, setIdx] = React.useState<typeof OC_SNAP.tabs[number]>('NIFTY');
  const d = OC_SNAP.data[idx];
  return (
    <div className="flex flex-col" style={{ borderLeft:'1px solid var(--panel-divider)' }}>
      <div className="px-3 py-2" style={{ borderBottom:'1px solid var(--panel-divider)', background:'var(--panel-bg)' }}>
        <span className="text-[11px] font-bold" style={{ color:'var(--text-secondary)' }}>Option Chain Snapshot</span>
      </div>
      <div className="flex" style={{ borderBottom:'1px solid var(--panel-divider)' }}>
        {OC_SNAP.tabs.map(tab => (
          <button key={tab} onClick={() => setIdx(tab)}
            className="flex-1 py-1.5 text-[10px] font-bold transition-all"
            style={{
              color: idx===tab ? C(BLUE) : 'var(--text-dim)',
              borderBottom: idx===tab ? `2px solid ${C(BLUE)}` : '2px solid transparent',
              background: idx===tab ? G(BLUE, 0.06) : 'transparent',
            }}>
            {tab}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 p-2.5" style={{ borderBottom:'1px solid var(--panel-divider)' }}>
        {([
          ['Spot',     formatNumber(d.spot),          'var(--text-bright)'],
          ['PCR',      String(d.pcr),                 d.pcr >= 1 ? 'var(--accent-green)' : 'var(--accent-red)'],
          ['Max Pain', formatNumber(d.maxPain),        'var(--text-dim)'],
          ['Total OI', d.oi,                           C(BLUE)],
        ] as [string,string,string][]).map(([l, v, col]) => (
          <div key={l} className="rounded-lg px-2 py-1.5"
            style={{ background:'var(--card-inner-bg)', border:'1px solid var(--card-inner-border)' }}>
            <div className="text-[9px]" style={{ color:'var(--text-label)' }}>{l}</div>
            <div className="text-[11px] font-bold font-mono" style={{ color: col }}>{v}</div>
          </div>
        ))}
      </div>
      <table className="w-full text-[10px]">
        <thead style={{ background:'var(--table-head-dim)' }}>
          <tr>
            <th className="px-2 py-1.5 text-left font-semibold" style={{ color:'var(--accent-green)' }}>CE OI</th>
            <th className="px-2 py-1.5 text-center font-semibold" style={{ color:'var(--text-secondary)' }}>Strike</th>
            <th className="px-2 py-1.5 text-right font-semibold" style={{ color:'var(--accent-red)' }}>PE OI</th>
          </tr>
        </thead>
        <tbody>
          {d.strikes.map(s => (
            <tr key={s.k} style={{ borderBottom:'1px solid var(--row-border)' }}>
              <td className="px-2 py-1.5 font-mono" style={{ color:'var(--accent-green)' }}>
                {(s.ce / 1000).toFixed(1)}K
              </td>
              <td className="px-2 py-1.5 text-center font-bold" style={{ color:'var(--text-bright)' }}>
                {s.k.toLocaleString('en-IN')}
              </td>
              <td className="px-2 py-1.5 text-right font-mono" style={{ color:'var(--accent-red)' }}>
                {(s.pe / 1000).toFixed(1)}K
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="p-2.5 mt-auto" style={{ borderTop:'1px solid var(--panel-divider)' }}>
        <Link href="/?tab=option-chain">
          <button className="w-full py-1.5 rounded-lg text-[11px] font-semibold"
            style={{ background:G(BLUE, 0.12), color:C(BLUE), border:`1px solid rgba(${BLUE},0.3)` }}>
            Open Full Option Chain →
          </button>
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. CENTER 4-COLUMN ROW
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

function CenterRow({ watchlist, onOrder }: {
  watchlist: WatchlistItem[];
  onOrder: (sym: string, side: 'BUY' | 'SELL') => void;
}) {
  const [gridCols, setGridCols] = React.useState('repeat(4,1fr)');
  React.useEffect(() => {
    function update() {
      const w = window.innerWidth;
      if (w >= 1280)      setGridCols('1fr 1.25fr 1.5fr 1.6fr');
      else if (w >= 768)  setGridCols('repeat(2,1fr)');
      else                setGridCols('1fr');
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  return (
    <div className="grid gap-3"
      style={{ minHeight: 380, gridTemplateColumns: gridCols }}>
      <MarketHeatmapPanel />
      <TopMoversTabPanel />
      <DashWatchlistPanel items={watchlist} onOrder={onOrder} />
      <AIMarketInsightsPanel />
    </div>
  );
}

function MarketHeatmapPanel() {
  const maxAbs = Math.max(...SECTORS.map(s => Math.abs(s.pct)));
  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col">
      <PanelHeader title="Market Heatmap" icon={<PieChart size={12} style={{ color:C(CYAN) }} />} href="/tools/heatmap" />
      <div className="flex-1 p-2.5 grid grid-cols-3 gap-1.5" style={{ gridTemplateRows:'repeat(4, 1fr)' }}>
        {SECTORS.map(s => {
          const pos = s.pct >= 0;
          const alpha = 0.2 + (Math.abs(s.pct) / maxAbs) * 0.65;
          const bg = pos ? `rgba(22,163,74,${alpha.toFixed(2)})` : `rgba(220,38,38,${alpha.toFixed(2)})`;
          return (
            <div key={s.name} className="rounded-xl flex flex-col items-center justify-center gap-0.5 cursor-pointer hover:scale-105 transition-transform"
              style={{ background:bg, border:'1px solid rgba(255,255,255,0.06)' }}>
              <span className="text-[9px] font-bold tracking-wider" style={{ color:'rgba(255,255,255,0.88)' }}>{s.name}</span>
              <span className="text-[10px] font-bold font-mono" style={{ color: pos ? '#86efac' : '#fca5a5' }}>
                {pos ? '+' : ''}{s.pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-4 px-3 pb-2.5 text-[10px]">
        <span className="flex items-center gap-1.5" style={{ color:'var(--text-label)' }}>
          <span className="w-3 h-3 rounded" style={{ background:'rgba(22,163,74,0.6)' }} /> Positive
        </span>
        <span className="flex items-center gap-1.5" style={{ color:'var(--text-label)' }}>
          <span className="w-3 h-3 rounded" style={{ background:'rgba(220,38,38,0.6)' }} /> Negative
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TOP MOVERS TAB PANEL (replaces chart in center row)
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

function AIMarketInsightsPanel() {
  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col">
      <PanelHeader title="AI Market Insights" icon={<Zap size={12} style={{ color:C(BLUE) }} />} />
      <div className="flex-1 p-3 flex flex-col gap-3 overflow-y-auto no-scrollbar">
        <div className="rounded-xl p-3" style={{ background:G(EMERALD, 0.08), border:`1px solid rgba(${EMERALD},0.2)` }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color:'var(--text-label)' }}>Market Sentiment</div>
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={15} style={{ color:C(EMERALD) }} />
            <span className="text-sm font-bold" style={{ color:C(EMERALD) }}>Bullish</span>
          </div>
          <ConfBar value={72} col={EMERALD} />
        </div>

        <div className="space-y-2 text-[11px]">
          {([
            ['Leading Sector', 'Banking ▲1.8%', G(BLUE, 0.12), C(BLUE)],
            ['Put-Call Ratio', '1.23 (Bullish)', 'transparent', 'var(--accent-green)'],
          ] as [string,string,string,string][]).map(([l, v, bg, col]) => (
            <div key={l} className="flex items-center justify-between">
              <span style={{ color:'var(--text-label)' }}>{l}</span>
              <span className="font-bold px-2 py-0.5 rounded text-[10px]"
                style={{ background:bg, color:col }}>
                {v}
              </span>
            </div>
          ))}
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color:'var(--text-label)' }}>Support &amp; Resistance</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg p-2 text-center" style={{ background:G(EMERALD, 0.1), border:`1px solid rgba(${EMERALD},0.2)` }}>
              <div className="text-[9px]" style={{ color:'var(--text-label)' }}>Support</div>
              <div className="text-xs font-bold font-mono" style={{ color:C(EMERALD) }}>22,200</div>
            </div>
            <div className="rounded-lg p-2 text-center" style={{ background:G(RED, 0.1), border:`1px solid rgba(${RED},0.2)` }}>
              <div className="text-[9px]" style={{ color:'var(--text-label)' }}>Resistance</div>
              <div className="text-xs font-bold font-mono" style={{ color:C(RED) }}>22,700</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl p-3 flex-1 flex flex-col gap-1.5"
          style={{ background:G(BLUE, 0.06), border:`1px solid rgba(${BLUE},0.18)` }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color:C(BLUE) }}>Best Opportunity</div>
          <div className="text-[11px] font-semibold" style={{ color:'var(--text-secondary)' }}>Iron Condor on NIFTY</div>
          <div className="text-[10px]" style={{ color:'var(--text-label)' }}>High IVR · PCR 1.23 · Low risk setup</div>
        </div>

        <Link href="/?tab=strategies">
          <button className="w-full py-2 rounded-xl text-[11px] font-semibold hover:opacity-85 transition-opacity"
            style={{ background:G(BLUE, 0.12), color:C(BLUE), border:`1px solid rgba(${BLUE},0.3)` }}>
            View Detailed Insights →
          </button>
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. BOTTOM 6-COLUMN ROW
// ─────────────────────────────────────────────────────────────────────────────
function BottomRow() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3" style={{ minHeight:280 }}>
      <NewsEventsPanel />
      <MiniMoversTable title="Volume Shockers" icon={<BarChart2 size={12} style={{ color:C(ORANGE) }} />} items={VOL_SHOCKERS} />
      <MiniMoversTable title="OI Buildup Long"  icon={<TrendingUp size={12} style={{ color:C(EMERALD) }} />} items={OI_LONG} />
      <MiniMoversTable title="OI Buildup Short" icon={<TrendingDown size={12} style={{ color:C(RED) }} />} items={OI_SHORT} />
    </div>
  );
}

const NEWS_CATS = ['All','Market','Economy','Corporate','Global'] as const;
type NewsCat = typeof NEWS_CATS[number];

function NewsEventsPanel() {
  const [cat, setCat] = React.useState<NewsCat>('All');
  const items = cat === 'All' ? NEWS_ITEMS : NEWS_ITEMS.filter(n => n.cat === cat);
  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col">
      <PanelHeader title="News & Events" icon={<Newspaper size={12} style={{ color:C(GOLD) }} />} />
      <div className="flex gap-0.5 px-2 py-1.5 overflow-x-auto no-scrollbar shrink-0"
        style={{ borderBottom:'1px solid var(--panel-divider)' }}>
        {NEWS_CATS.map(c => (
          <button key={c} onClick={() => setCat(c)}
            className="px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap transition-all"
            style={cat===c ? { background:G(GOLD, 0.2), color:C(GOLD) } : { color:'var(--text-dim)' }}>
            {c}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {items.map((n, i) => (
          <div key={i} className="px-3 py-2 cursor-pointer hover:opacity-80 transition-opacity"
            style={{ borderBottom:'1px solid var(--row-border)' }}>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background:G(GOLD, 0.15), color:C(GOLD) }}>{n.cat}</span>
              <span className="text-[9px]" style={{ color:'var(--text-dim)' }}>{n.time}</span>
            </div>
            <div className="text-[10px] font-medium leading-relaxed" style={{ color:'var(--text-secondary)' }}>
              {n.headline}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}


function MiniMoversTable({ title, icon, items }: {
  title: string;
  icon: React.ReactNode;
  items: { sym:string; ltp:number; chg:number; extra:string }[];
}) {
  return (
    <div className="glass rounded-2xl overflow-hidden flex flex-col">
      <PanelHeader title={title} icon={icon} />
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {items.map((item, i) => {
          const pos = item.chg >= 0;
          return (
            <div key={item.sym} className="flex items-center px-3 py-2 cursor-pointer"
              style={{ borderBottom:'1px solid var(--row-border)' }}
              onMouseEnter={e => (e.currentTarget.style.background='var(--row-hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background='')}>
              <span className="text-[9px] font-bold w-4 shrink-0" style={{ color:'var(--text-dim)' }}>{i+1}</span>
              <div className="flex-1 min-w-0 mx-1.5">
                <div className="text-[10px] font-bold truncate" style={{ color:'var(--text-secondary)' }}>{item.sym}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-[10px] font-mono" style={{ color:'var(--text-bright)' }}>{formatNumber(item.ltp)}</div>
                <div className="flex items-center gap-1 justify-end">
                  <span className="text-[9px] font-bold" style={{ color: gainColor(pos) }}>
                    {pos ? '+' : ''}{item.chg.toFixed(1)}%
                  </span>
                  <span className="text-[9px] font-semibold px-1 rounded"
                    style={{ background:G(ORANGE, 0.15), color:C(ORANGE) }}>
                    {item.extra}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
