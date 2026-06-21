'use client';

import { useState, useCallback } from 'react';

import {
  Plus, Trash2, Info, ChevronDown, ChevronLeft, ChevronRight,
  TrendingUp, BarChart2, Activity, Maximize2, LayoutGrid, Brain,
  Zap, ArrowRight, Settings2, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';

/* ─────────────────────── types ─────────────────────── */
type Action = 'B' | 'S';
type OptionType = 'CE' | 'PE';

interface Leg {
  id: string;
  action: Action;
  type: OptionType;
  strike: number;
  expiry: string;
  lots: number;
  price: number;
}

interface WatchSymbol {
  symbol: string;
  ltp: number;
  chgPct: number;
}

/* ─────────────────────── mock data ─────────────────────── */
const WATCHLIST: WatchSymbol[] = [
  { symbol: 'NIFTY 50',    ltp: 23922.20, chgPct:  0.29 },
  { symbol: 'BANKNIFTY',  ltp: 51623.10, chgPct:  0.45 },
  { symbol: 'FINNIFTY',   ltp: 23218.55, chgPct:  0.26 },
  { symbol: 'MIDCPNIFTY', ltp: 12045.80, chgPct: -0.12 },
  { symbol: 'SENSEX',     ltp: 78621.12, chgPct:  0.31 },
  { symbol: 'RELIANCE',   ltp: 2956.35,  chgPct:  0.48 },
  { symbol: 'HDFCBANK',   ltp: 1679.80,  chgPct:  0.22 },
  { symbol: 'ICICIBANK',  ltp: 1132.95,  chgPct:  0.19 },
  { symbol: 'TCS',        ltp: 3745.10,  chgPct: -0.08 },
  { symbol: 'INFY',       ltp: 1532.60,  chgPct:  0.16 },
];

const EXPIRY_OPTIONS = ['16 Jun', '23 Jun', '30 Jun', '7 Jul'];

const INITIAL_LEGS: Leg[] = [
  { id: 'l1', action: 'B', type: 'CE', strike: 23950, expiry: '16 Jun', lots: 1, price: 66.25 },
  { id: 'l2', action: 'S', type: 'CE', strike: 24100, expiry: '16 Jun', lots: 1, price: 41.80 },
];

const AI_SUGGESTIONS = [
  'Bull Call Spread',
  'Bull Put Spread',
  'Call Ratio Backspread',
  'Iron Condor',
];

/* ─────────────────────── helpers ─────────────────────── */
function fmt(n: number, dp = 2) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

let legCounter = 3;
function mkId() { return `l${legCounter++}`; }

/* ─────────────────────── Payoff SVG ─────────────────────── */
function PayoffChart() {
  const W = 600, H = 260;
  const PAD = { t: 20, r: 20, b: 40, l: 52 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  // Bull Call Spread payoff data points  
  const minX = 22800, maxX = 24800, currentX = 23922;
  const breakevenLow = 23862, breakevenHigh = 24088;
  const maxProfit = 4150, maxLoss = -1850;
  const yRange = maxProfit - maxLoss;

  function toSvgX(x: number) { return PAD.l + ((x - minX) / (maxX - minX)) * chartW; }
  function toSvgY(y: number) { return PAD.t + ((maxProfit - y) / yRange) * chartH; }
  const zeroY = toSvgY(0);

  // Payoff shape: loss before low BE, rise to profit zone, capped profit
  const payoffPoints: [number, number][] = [
    [minX,          maxLoss   ],
    [breakevenLow,  0         ],
    [breakevenHigh, maxProfit ],
    [maxX,          maxProfit ],
  ];
  const svgPoints = payoffPoints.map(([x, y]) => [toSvgX(x), toSvgY(y)] as [number, number]);

  const linePath = svgPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');

  // Fill below zero = red, above zero = green
  const greenFill = [
    `M${toSvgX(breakevenLow).toFixed(1)} ${zeroY.toFixed(1)}`,
    `L${toSvgX(breakevenHigh).toFixed(1)} ${toSvgY(maxProfit).toFixed(1)}`,
    `L${toSvgX(maxX).toFixed(1)} ${toSvgY(maxProfit).toFixed(1)}`,
    `L${toSvgX(maxX).toFixed(1)} ${zeroY.toFixed(1)}`,
    'Z',
  ].join(' ');

  const redFill = [
    `M${toSvgX(minX).toFixed(1)} ${toSvgY(maxLoss).toFixed(1)}`,
    `L${toSvgX(breakevenLow).toFixed(1)} ${zeroY.toFixed(1)}`,
    `L${toSvgX(breakevenLow).toFixed(1)} ${zeroY.toFixed(1)}`,
    `L${toSvgX(minX).toFixed(1)} ${zeroY.toFixed(1)}`,
    'Z',
  ].join(' ');

  const curX = toSvgX(currentX);
  const xLabels = [22800, 23000, 23200, 23400, 23600, 23800, 24000, 24200, 24400, 24600, 24800];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block', overflow: 'visible' }}>
      {/* Green profit fill */}
      <path d={greenFill} fill="rgba(22,163,74,0.12)" />
      {/* Red loss fill */}
      <path d={redFill} fill="rgba(220,38,38,0.10)" />

      {/* Zero line */}
      <line x1={PAD.l} y1={zeroY} x2={W - PAD.r} y2={zeroY}
        stroke="rgba(255,255,255,0.15)" strokeWidth={1} strokeDasharray="4 3" />

      {/* Payoff line */}
      <path d={linePath} fill="none" stroke="#22c55e" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

      {/* Loss portion (red segment) */}
      <path
        d={`M${toSvgX(minX).toFixed(1)} ${toSvgY(maxLoss).toFixed(1)} L${toSvgX(breakevenLow).toFixed(1)} ${zeroY.toFixed(1)}`}
        fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round"
      />

      {/* Current price dashed vertical */}
      <line x1={curX} y1={PAD.t} x2={curX} y2={H - PAD.b}
        stroke="rgba(255,255,255,0.4)" strokeWidth={1} strokeDasharray="5 3" />

      {/* Current price label */}
      <text x={curX + 4} y={PAD.t + 14} fontSize={9} fill="rgba(255,255,255,0.7)" fontFamily="monospace">
        Current Price
      </text>
      <text x={curX + 4} y={PAD.t + 24} fontSize={9} fill="rgba(255,255,255,0.85)" fontFamily="monospace" fontWeight="bold">
        {fmt(currentX)}
      </text>

      {/* Max Profit label */}
      <rect x={toSvgX(24250) - 2} y={toSvgY(maxProfit) - 18} width={100} height={16} rx={4}
        fill="rgba(22,163,74,0.85)" />
      <text x={toSvgX(24250) + 1} y={toSvgY(maxProfit) - 6} fontSize={9} fill="#fff" fontFamily="monospace">
        Max Profit: ₹4,150
      </text>

      {/* Max Loss label */}
      <rect x={toSvgX(22850) - 2} y={toSvgY(maxLoss) + 4} width={96} height={16} rx={4}
        fill="rgba(220,38,38,0.85)" />
      <text x={toSvgX(22850) + 1} y={toSvgY(maxLoss) + 16} fontSize={9} fill="#fff" fontFamily="monospace">
        Max Loss: ₹1,850
      </text>

      {/* Breakeven dots */}
      <circle cx={toSvgX(breakevenLow)} cy={zeroY} r={4} fill="rgba(37,99,235,0.8)" stroke="#fff" strokeWidth={1} />
      <text x={toSvgX(breakevenLow) - 16} y={zeroY + 16} fontSize={9} fill="rgba(37,99,235,0.9)" fontFamily="monospace">
        {breakevenLow}
      </text>
      <circle cx={toSvgX(breakevenHigh)} cy={zeroY} r={4} fill="rgba(37,99,235,0.8)" stroke="#fff" strokeWidth={1} />
      <text x={toSvgX(breakevenHigh) - 16} y={zeroY + 16} fontSize={9} fill="rgba(37,99,235,0.9)" fontFamily="monospace">
        {breakevenHigh}
      </text>

      {/* Y axis labels */}
      {[maxProfit, maxProfit / 2, 0, maxLoss / 2, maxLoss].map(v => (
        <text key={v} x={PAD.l - 6} y={toSvgY(v) + 4} fontSize={9}
          fill="rgba(255,255,255,0.4)" textAnchor="end" fontFamily="monospace">
          {v === 0 ? '0' : v > 0 ? `${(v / 1000).toFixed(0)}k` : `-${(Math.abs(v) / 1000).toFixed(0)}k`}
        </text>
      ))}

      {/* Y axis label */}
      <text x={12} y={H / 2} fontSize={9} fill="rgba(255,255,255,0.35)"
        textAnchor="middle" transform={`rotate(-90, 12, ${H / 2})`} fontFamily="sans-serif">
        Profit / Loss (₹)
      </text>

      {/* X axis labels */}
      {xLabels.map(v => (
        <text key={v} x={toSvgX(v)} y={H - PAD.b + 14} fontSize={8.5}
          fill="rgba(255,255,255,0.35)" textAnchor="middle" fontFamily="monospace">
          {(v / 1000).toFixed(1)}k
        </text>
      ))}

      {/* X axis label */}
      <text x={PAD.l + chartW / 2} y={H - 2} fontSize={9}
        fill="rgba(255,255,255,0.35)" textAnchor="middle" fontFamily="sans-serif">
        Underlying Price
      </text>
    </svg>
  );
}

/* ─────────────────────── main page ─────────────────────── */
export default function StrategyDashboardPage() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedSymbol, setSelectedSymbol] = useState(WATCHLIST[0]);
  const [strategyName, setStrategyName] = useState('Bull Call Spread');
  const [expiry, setExpiry] = useState('16 Jun 2024');
  const [legs, setLegs] = useState<Leg[]>(INITIAL_LEGS);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [lots, setLots] = useState(1);
  const [riskFree, setRiskFree] = useState('6.5');
  const [slippage, setSlippage] = useState('0.05');
  const [commission, setCommission] = useState('20');
  const [chartView, setChartView] = useState<'pnl' | 'line' | 'grid'>('pnl');

  const addLeg = useCallback(() => {
    setLegs(prev => [...prev, {
      id: mkId(), action: 'B', type: 'CE', strike: 24000, expiry: '16 Jun', lots: 1, price: 50,
    }]);
  }, []);

  const removeLeg = useCallback((id: string) => {
    setLegs(prev => prev.filter(l => l.id !== id));
  }, []);

  const updateLeg = useCallback((id: string, patch: Partial<Leg>) => {
    setLegs(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  }, []);

  return (
    <div className="flex h-[calc(100vh-52px)] overflow-hidden" style={{ background: 'var(--bg-base)' }}>

      {/* ── Watchlist Sidebar ─────────────────────────────── */}
      <aside
        className="flex flex-col shrink-0 overflow-hidden transition-all duration-300"
        style={{
          width: sidebarOpen ? 160 : 0,
          borderRight: sidebarOpen ? '1px solid var(--panel-divider)' : 'none',
          background: 'var(--bg-surface)',
          minWidth: 0,
        }}
      >
        {sidebarOpen && (
          <>
            {/* Sidebar header */}
            <div className="flex items-center justify-between px-3 py-2.5 shrink-0"
              style={{ borderBottom: '1px solid var(--panel-divider)' }}>
              <span className="text-[11px] font-bold tracking-wider uppercase"
                style={{ color: 'var(--text-secondary)' }}>Watchlist</span>
              <button className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                style={{ color: 'var(--text-dim)' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}>
                <Plus size={13} />
              </button>
            </div>

            {/* Symbol list */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {WATCHLIST.map(sym => {
                const sel = sym.symbol === selectedSymbol.symbol;
                const pos = sym.chgPct >= 0;
                return (
                  <div key={sym.symbol}
                    onClick={() => setSelectedSymbol(sym)}
                    className="px-3 py-2 cursor-pointer transition-colors"
                    style={{
                      borderBottom: '1px solid var(--row-border)',
                      background: sel ? 'rgba(37,99,235,0.07)' : 'transparent',
                      borderLeft: sel ? '2px solid #2563eb' : '2px solid transparent',
                    }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = 'var(--row-hover-bg)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = sel ? 'rgba(37,99,235,0.07)' : 'transparent'; }}>
                    <div className="text-[11px] font-semibold truncate"
                      style={{ color: sel ? '#60a5fa' : 'var(--text-secondary)' }}>
                      {sym.symbol}
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] font-mono" style={{ color: 'var(--text-bright)' }}>
                        {fmt(sym.ltp)}
                      </span>
                      <span className="text-[9px] font-semibold"
                        style={{ color: pos ? '#22c55e' : '#ef4444' }}>
                        {pos ? '+' : ''}{sym.chgPct.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Add Symbol */}
            <button className="flex items-center justify-center gap-1.5 py-2.5 text-[11px] font-medium transition-colors shrink-0"
              style={{
                borderTop: '1px solid var(--panel-divider)',
                color: 'var(--text-dim)',
                background: 'transparent',
              }}
              onMouseEnter={e => e.currentTarget.style.color = '#60a5fa'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dim)'}>
              <Plus size={11} /> Add Symbol
            </button>
          </>
        )}
      </aside>

      {/* ── Toggle button (always visible) ──────────────────── */}
      <button
        onClick={() => setSidebarOpen(v => !v)}
        title={sidebarOpen ? 'Hide Watchlist' : 'Show Watchlist'}
        className="self-start mt-3 -ml-0 flex items-center justify-center w-5 h-10 rounded-r-lg shrink-0 transition-all z-10"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--panel-divider)',
          borderLeft: 'none',
          color: 'var(--text-dim)',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = '#60a5fa'; e.currentTarget.style.background = 'rgba(37,99,235,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}>
        {sidebarOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>

      {/* ── Main Content ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* ── Instrument Top Bar ───────────────────────────── */}
        <div className="flex items-center px-4 py-2 shrink-0"
          style={{ borderBottom: '1px solid var(--panel-divider)', background: 'var(--bg-surface)' }}>
          {/* Left: symbol info */}
          <div className="flex items-center gap-3">
            <div>
              <div className="text-[10px] font-bold tracking-widest uppercase"
                style={{ color: 'var(--text-label)' }}>
                {selectedSymbol.symbol}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-lg font-bold font-mono" style={{ color: 'var(--text-bright)' }}>
                  {fmt(selectedSymbol.ltp)}
                </span>
                <span className="text-[11px] font-semibold"
                  style={{ color: selectedSymbol.chgPct >= 0 ? '#22c55e' : '#ef4444' }}>
                  {selectedSymbol.chgPct >= 0 ? '+' : ''}{selectedSymbol.chgPct.toFixed(2)}%
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button className="flex items-center justify-center w-7 h-7 rounded-lg transition-colors"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; e.currentTarget.style.color = '#60a5fa'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-inner-border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}>
                <TrendingUp size={13} />
              </button>
              <button className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] font-medium transition-colors"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; e.currentTarget.style.color = '#60a5fa'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-inner-border)'; e.currentTarget.style.color = 'var(--text-dim)'; }}>
                <Info size={11} /> Info
              </button>
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-2 ml-auto">
            <button className="flex items-center gap-1.5 h-8 px-4 rounded-lg text-[11px] font-medium transition-all"
              style={{ border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)', background: 'var(--card-inner-bg)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(37,99,235,0.5)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-inner-border)'}>
              Save Draft
            </button>
            <div className="flex rounded-lg overflow-hidden"
              style={{ border: '1px solid rgba(37,99,235,0.5)' }}>
              <button className="flex items-center gap-1.5 h-8 px-4 text-[11px] font-semibold transition-colors"
                style={{ background: '#2563eb', color: '#fff' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1d4ed8'}
                onMouseLeave={e => e.currentTarget.style.background = '#2563eb'}>
                Backtest
              </button>
              <button className="flex items-center justify-center w-7 h-8 transition-colors"
                style={{ background: '#1d4ed8', color: '#fff', borderLeft: '1px solid rgba(255,255,255,0.15)' }}
                onMouseEnter={e => e.currentTarget.style.background = '#1e40af'}
                onMouseLeave={e => e.currentTarget.style.background = '#1d4ed8'}>
                <ChevronDown size={12} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3 no-scrollbar">

          {/* ── Builder + Chart row ─────────────────────── */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1.1fr' }}>

            {/* Strategy Builder */}
            <div className="glass rounded-xl overflow-hidden flex flex-col">
              {/* Builder header */}
              <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
                style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                <span className="text-[11px] font-bold tracking-wider uppercase"
                  style={{ color: 'var(--text-secondary)' }}>Strategy Builder</span>
                <button className="text-[10px] font-medium transition-opacity hover:opacity-70"
                  style={{ color: '#2563eb' }}>
                  ↺ Clear All
                </button>
              </div>

              <div className="p-3 flex flex-col gap-3">
                {/* Strategy Name + Expiry */}
                <div className="grid gap-2" style={{ gridTemplateColumns: '1fr auto' }}>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-label)' }}>Strategy Name</div>
                    <input
                      value={strategyName}
                      onChange={e => setStrategyName(e.target.value)}
                      className="w-full h-8 px-3 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                    />
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--text-label)' }}>Expiry</div>
                    <select
                      className="h-8 px-2.5 rounded-lg text-xs outline-none"
                      style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                      value={expiry}
                      onChange={e => setExpiry(e.target.value)}>
                      <option>16 Jun 2024</option>
                      <option>23 Jun 2024</option>
                      <option>30 Jun 2024</option>
                    </select>
                  </div>
                </div>

                {/* Legs section */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider"
                      style={{ color: 'var(--text-label)' }}>Legs</span>
                    <span className="w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center"
                      style={{ background: '#2563eb', color: '#fff' }}>
                      {legs.length}
                    </span>
                  </div>

                  {/* Column headers */}
                  <div className="grid text-[9px] uppercase tracking-wider px-1 mb-1"
                    style={{
                      color: 'var(--text-label)',
                      gridTemplateColumns: '28px 36px 36px 60px 72px 40px 56px 28px',
                      gap: '4px',
                    }}>
                    <span>B/S</span>
                    <span>Type</span>
                    <span></span>
                    <span>Strike</span>
                    <span>Expiry</span>
                    <span className="text-center">Lots</span>
                    <span className="text-right">Price</span>
                    <span></span>
                  </div>

                  {/* Leg rows */}
                  <div className="flex flex-col gap-1.5">
                    {legs.map(leg => (
                      <div key={leg.id}
                        className="grid items-center px-1 py-1.5 rounded-lg"
                        style={{
                          background: 'var(--card-inner-bg)',
                          border: '1px solid var(--card-inner-border)',
                          gridTemplateColumns: '28px 36px 36px 60px 72px 40px 56px 28px',
                          gap: '4px',
                        }}>
                        {/* B/S tag */}
                        <button
                          onClick={() => updateLeg(leg.id, { action: leg.action === 'B' ? 'S' : 'B' })}
                          className="w-6 h-6 rounded text-[10px] font-bold flex items-center justify-center transition-colors"
                          style={{
                            background: leg.action === 'B' ? 'rgba(37,99,235,0.2)' : 'rgba(220,38,38,0.2)',
                            color: leg.action === 'B' ? '#60a5fa' : '#f87171',
                            border: `1px solid ${leg.action === 'B' ? 'rgba(37,99,235,0.4)' : 'rgba(220,38,38,0.4)'}`,
                          }}>
                          {leg.action}
                        </button>

                        {/* Option type */}
                        <button
                          onClick={() => updateLeg(leg.id, { type: leg.type === 'CE' ? 'PE' : 'CE' })}
                          className="h-6 px-1.5 rounded text-[10px] font-bold flex items-center justify-center transition-colors"
                          style={{
                            background: leg.type === 'CE' ? 'rgba(37,99,235,0.15)' : 'rgba(168,85,247,0.15)',
                            color: leg.type === 'CE' ? '#60a5fa' : '#c084fc',
                            border: `1px solid ${leg.type === 'CE' ? 'rgba(37,99,235,0.3)' : 'rgba(168,85,247,0.3)'}`,
                          }}>
                          {leg.type}
                        </button>

                        {/* Dash separator */}
                        <span className="text-center text-[11px]" style={{ color: 'var(--text-label)' }}>—</span>

                        {/* Strike */}
                        <input
                          type="number"
                          value={leg.strike}
                          onChange={e => updateLeg(leg.id, { strike: Number(e.target.value) })}
                          className="h-6 w-full px-1.5 rounded text-[10px] outline-none font-mono text-right"
                          style={{ background: 'transparent', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                        />

                        {/* Expiry select */}
                        <select
                          value={leg.expiry}
                          onChange={e => updateLeg(leg.id, { expiry: e.target.value })}
                          className="h-6 w-full px-1 rounded text-[9px] outline-none"
                          style={{ background: 'var(--bg-base)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}>
                          {EXPIRY_OPTIONS.map(o => <option key={o}>{o}</option>)}
                        </select>

                        {/* Lots */}
                        <input
                          type="number"
                          min={1}
                          value={leg.lots}
                          onChange={e => updateLeg(leg.id, { lots: Number(e.target.value) })}
                          className="h-6 w-full px-1 rounded text-[10px] outline-none font-mono text-center"
                          style={{ background: 'transparent', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                        />

                        {/* Price */}
                        <div className="text-[10px] font-mono text-right pr-1"
                          style={{ color: 'var(--text-dim)' }}>
                          {leg.price.toFixed(2)}
                        </div>

                        {/* Delete */}
                        <button
                          onClick={() => removeLeg(leg.id)}
                          className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                          style={{ color: 'var(--text-label)' }}
                          onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-label)'}>
                          <Trash2 size={11} />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Add Leg */}
                  <button
                    onClick={addLeg}
                    className="flex items-center justify-center gap-1.5 w-full h-8 mt-2 rounded-lg text-[11px] font-medium transition-all"
                    style={{ border: '1px dashed rgba(37,99,235,0.35)', color: '#60a5fa', background: 'rgba(37,99,235,0.04)' }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.08)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.6)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(37,99,235,0.04)'; e.currentTarget.style.borderColor = 'rgba(37,99,235,0.35)'; }}>
                    <Plus size={12} /> Add Leg
                  </button>
                </div>

                {/* Strategy Settings */}
                <div className="rounded-lg overflow-hidden"
                  style={{ border: '1px solid var(--card-inner-border)' }}>
                  <button
                    onClick={() => setSettingsOpen(v => !v)}
                    className="flex items-center justify-between w-full px-3 py-2 transition-colors"
                    style={{ background: 'var(--card-inner-bg)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'var(--card-inner-bg)'}>
                    <div className="flex items-center gap-1.5">
                      <Settings2 size={11} style={{ color: 'var(--text-label)' }} />
                      <span className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: 'var(--text-secondary)' }}>Strategy Settings</span>
                    </div>
                    <ChevronDown size={12} style={{ color: 'var(--text-dim)', transform: settingsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                  </button>
                  {settingsOpen && (
                    <div className="grid grid-cols-4 gap-2 px-3 py-2.5"
                      style={{ borderTop: '1px solid var(--card-inner-border)' }}>
                      {[
                        { label: 'Lots', value: String(lots), onChange: (v: string) => setLots(Number(v)), type: 'number' },
                        { label: 'Risk Free Rate (%)', value: riskFree, onChange: setRiskFree, type: 'number' },
                        { label: 'Slippage (%)', value: slippage, onChange: setSlippage, type: 'number' },
                        { label: 'Commission', value: commission, onChange: setCommission, type: 'text', suffix: '/lot' },
                      ].map(f => (
                        <div key={f.label}>
                          <div className="text-[9px] mb-1 truncate" style={{ color: 'var(--text-label)' }}>{f.label}</div>
                          <div className="relative">
                            <input
                              type={f.type}
                              value={f.value}
                              onChange={e => f.onChange(e.target.value)}
                              className="w-full h-7 px-2 rounded text-[10px] outline-none font-mono"
                              style={{ background: 'var(--bg-base)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Payoff Chart */}
            <div className="glass rounded-xl overflow-hidden flex flex-col">
              {/* Chart header */}
              <div className="flex items-center justify-between px-4 py-2.5 shrink-0"
                style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                <span className="text-[11px] font-bold tracking-wider uppercase"
                  style={{ color: 'var(--text-secondary)' }}>Payoff Chart</span>
                <div className="flex items-center gap-2">
                  <select className="h-6 px-2 rounded text-[10px] outline-none"
                    style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}>
                    <option>P&amp;L</option>
                    <option>Greeks</option>
                  </select>
                  {([
                    { v: 'line' as const, I: TrendingUp },
                    { v: 'pnl'  as const, I: BarChart2 },
                    { v: 'grid' as const, I: LayoutGrid },
                  ] as { v: 'pnl'|'line'|'grid'; I: React.ElementType }[]).map(({ v, I }) => (
                    <button key={v}
                      onClick={() => setChartView(v)}
                      className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                      style={{
                        background: chartView === v ? 'rgba(37,99,235,0.15)' : 'transparent',
                        color: chartView === v ? '#60a5fa' : 'var(--text-label)',
                        border: chartView === v ? '1px solid rgba(37,99,235,0.3)' : '1px solid transparent',
                      }}>
                      <I size={11} />
                    </button>
                  ))}
                  <button className="w-6 h-6 flex items-center justify-center rounded transition-colors"
                    style={{ color: 'var(--text-label)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-label)'}>
                    <Maximize2 size={11} />
                  </button>
                </div>
              </div>

              {/* Chart legend */}
              <div className="flex items-center gap-4 px-4 pt-2.5">
                {[
                  { label: 'Profit',     color: '#22c55e' },
                  { label: 'Loss',       color: '#ef4444' },
                  { label: 'Breakeven',  color: 'rgba(255,255,255,0.4)', dashed: true },
                ].map(({ label, color, dashed }) => (
                  <div key={label} className="flex items-center gap-1.5">
                    <div className="w-5 h-0.5" style={{ background: dashed ? 'transparent' : color, borderTop: dashed ? `2px dashed ${color}` : 'none' }} />
                    <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{label}</span>
                  </div>
                ))}
              </div>

              {/* SVG Chart */}
              <div className="flex-1 px-2 pt-1 pb-1 min-h-[220px]">
                <PayoffChart />
              </div>

              {/* Projected profit */}
              <div className="px-4 pb-3">
                <div className="flex items-center justify-between px-3 py-2 rounded-lg"
                  style={{ background: 'rgba(22,163,74,0.08)', border: '1px solid rgba(22,163,74,0.2)' }}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: '#22c55e' }} />
                    <span className="text-[11px] font-semibold" style={{ color: '#22c55e' }}>
                      Projected Profit: ₹401 (+0.61%)
                    </span>
                  </div>
                  <button className="w-5 h-5 flex items-center justify-center rounded transition-colors"
                    style={{ color: 'var(--text-dim)' }}>
                    <RefreshCw size={10} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Metrics Strip ───────────────────────────────── */}
          <div className="glass rounded-xl" style={{ borderRadius: 10 }}>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
              {([
                {
                  label: 'POP',
                  value: '62.18%',
                  sub: null,
                  icon: '🛡️',
                  color: 'var(--text-bright)',
                },
                {
                  label: 'Max Profit',
                  value: '₹ 4,150',
                  sub: null,
                  icon: null,
                  color: '#22c55e',
                  iconEl: <TrendingUp size={16} style={{ color: '#22c55e' }} />,
                },
                {
                  label: 'Max Loss',
                  value: '₹1,850',
                  sub: null,
                  icon: null,
                  color: '#ef4444',
                  iconEl: <Activity size={16} style={{ color: '#ef4444', transform: 'scaleY(-1)' }} />,
                },
                {
                  label: 'Risk Reward',
                  value: '2.24',
                  sub: null,
                  icon: '⚖️',
                  color: 'var(--text-bright)',
                },
                {
                  label: 'Breakeven',
                  value: '23862 - 24088',
                  sub: null,
                  icon: '⚙️',
                  color: 'var(--text-secondary)',
                },
                {
                  label: 'Margin Needed',
                  value: '₹ 21,450',
                  sub: null,
                  icon: null,
                  color: 'var(--text-bright)',
                  iconEl: <LayoutGrid size={16} style={{ color: 'var(--text-label)' }} />,
                },
              ] as { label: string; value: string; sub: string | null; icon: string | null; color: string; iconEl?: React.ReactNode }[]).map(({ label, value, color, icon, iconEl }, i) => (
                <div key={label}
                  className="flex items-center justify-between px-4 py-3"
                  style={{ borderLeft: i > 0 ? '1px solid var(--panel-divider)' : 'none' }}>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider mb-1"
                      style={{ color: 'var(--text-label)' }}>{label}</div>
                    <div className="text-sm font-bold font-mono"
                      style={{ color }}>{value}</div>
                  </div>
                  <div className="text-lg opacity-70">
                    {iconEl ?? <span>{icon}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Bottom row: Greeks + Insights + AI + Quick Actions ── */}
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr 1fr auto' }}>

            {/* Greeks */}
            <div className="glass rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}>Greeks</span>
                  <span className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px]"
                    style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}>i</span>
                </div>
                <button className="text-[10px] font-medium transition-opacity hover:opacity-70"
                  style={{ color: '#2563eb' }}>View Full Greeks</button>
              </div>
              <div className="p-3">
                <div className="grid grid-cols-5 gap-1 text-center mb-2">
                  {['Delta', 'Theta', 'Vega', 'Gamma', 'IV'].map(g => (
                    <div key={g} className="text-[9px] uppercase tracking-wider"
                      style={{ color: 'var(--text-label)' }}>{g}</div>
                  ))}
                </div>
                <div className="grid grid-cols-5 gap-1 text-center">
                  {['+0.48', '-29.45', '+87.60', '0.0014', '21.65%'].map((v, i) => (
                    <div key={i} className="text-[11px] font-mono font-semibold"
                      style={{ color: v.startsWith('+') ? '#22c55e' : v.startsWith('-') ? '#ef4444' : 'var(--text-bright)' }}>
                      {v}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Strategy Insights */}
            <div className="glass rounded-xl overflow-hidden">
              <div className="flex items-center px-3 py-2"
                style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                <span className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}>Strategy Insights</span>
              </div>
              <div className="p-3 flex flex-col gap-2">
                {[
                  { icon: <AlertCircle size={10} />, text: 'This is a limited risk strategy with defined profit potential.', color: 'var(--text-dim)' },
                  { icon: <CheckCircle2 size={10} />, text: 'Best suited for mildly bullish outlook.', color: 'var(--text-dim)' },
                  { icon: <CheckCircle2 size={10} />, text: 'Maximum profit occurs when NIFTY is above 24100 at expiry.', color: '#22c55e' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0" style={{ color: item.color }}>{item.icon}</span>
                    <p className="text-[10px] leading-relaxed" style={{ color: item.color }}>{item.text}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Suggestions */}
            <div className="glass rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2"
                style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                <div className="flex items-center gap-1.5">
                  <Brain size={11} style={{ color: '#a78bfa' }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider"
                    style={{ color: 'var(--text-secondary)' }}>AI Suggestions</span>
                </div>
                <button className="text-[10px] font-medium transition-opacity hover:opacity-70"
                  style={{ color: '#2563eb' }}>View All</button>
              </div>
              <div className="p-3 grid grid-cols-2 gap-1.5">
                {AI_SUGGESTIONS.map(s => (
                  <button key={s}
                    className="text-[10px] py-1.5 px-2 rounded-lg font-medium transition-all text-left"
                    style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'; e.currentTarget.style.color = '#60a5fa'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--card-inner-border)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Actions */}
            <div className="glass rounded-xl overflow-hidden flex flex-col" style={{ minWidth: 160 }}>
              <div className="flex items-center px-3 py-2 shrink-0"
                style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                <span className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: 'var(--text-secondary)' }}>Quick Actions</span>
              </div>
              <div className="p-3 flex flex-col gap-2 flex-1">
                <div className="grid grid-cols-2 gap-1.5">
                  <button className="flex items-center justify-center gap-1 h-8 rounded-lg text-[10px] font-medium transition-all"
                    style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-inner-border)'}>
                    <TrendingUp size={10} /> Backtest
                  </button>
                  <button className="flex items-center justify-center gap-1 h-8 rounded-lg text-[10px] font-medium transition-all"
                    style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(37,99,235,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--card-inner-border)'}>
                    <Zap size={10} /> Paper Trade
                  </button>
                </div>
                <button className="flex items-center justify-center gap-2 h-10 rounded-lg text-[12px] font-bold transition-all mt-auto"
                  style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'linear-gradient(135deg, #1d4ed8, #1e40af)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)'}>
                  Trade Now <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>

        </div>
        {/* end scrollable body */}
      </div>
      {/* end main content */}
    </div>
  );
}
