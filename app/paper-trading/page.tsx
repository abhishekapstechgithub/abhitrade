'use client';
import { useState, useMemo } from 'react';
import {
  FlaskConical, RefreshCw, TrendingUp, TrendingDown, Wallet, BarChart2,
  Target, History, LayoutGrid, CheckCircle2, XCircle, ChevronRight, Calculator,
  Info,
} from 'lucide-react';
import { usePaperTradingStore, PaperPosition, PaperTrade, Segment } from '@/store/usePaperTradingStore';
import { useMarketStore } from '@/store/useMarketStore';
import {
  calcChargeBreakdown, calcRoundTrip, SEGMENT_LABELS, SEGMENTS,
  ChargeBreakdown, TradeSide, brokerageLabel, sttLabel,
  EXCHANGE_RATE_LABELS, STAMP_RATE_LABELS,
} from '@/lib/brokerage';
import Link from 'next/link';

const AMBER        = 'rgb(245,158,11)';
const AMBER_BG     = 'rgba(245,158,11,0.12)';
const AMBER_BORDER = 'rgba(245,158,11,0.28)';

const QUICK_SYMBOLS = ['RELIANCE','TCS','INFY','HDFCBANK','ICICIBANK','SBIN','WIPRO','AXISBANK','NIFTY 50','BANKNIFTY'];

function fmtINR(n: number) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(n);
}
function fmtShort(n: number) {
  const abs = Math.abs(n), sign = n < 0 ? '-' : '';
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000)    return `${sign}₹${(abs / 1_000).toFixed(1)}K`;
  return `${sign}₹${abs.toFixed(0)}`;
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

// ─── Charge rows definition ─────────────────────────────────────────────────
const CHARGE_ROWS: {
  key:     keyof ChargeBreakdown;
  label:   string;
  rateOf:  (seg: Segment, side: TradeSide) => string;
}[] = [
  { key: 'brokerage',       label: 'Brokerage',                       rateOf: (seg) => brokerageLabel(seg) },
  { key: 'stt',             label: 'STT / Securities Transaction Tax', rateOf: sttLabel },
  { key: 'ctt',             label: 'CTT / Commodities Transaction Tax',rateOf: (seg, side) => seg === 'COMMODITY' && side === 'SELL' ? '0.01% on sell' : 'N/A' },
  { key: 'exchangeCharges', label: 'Exchange Transaction Charges',     rateOf: (seg) => EXCHANGE_RATE_LABELS[seg] },
  { key: 'sebiCharges',     label: 'SEBI Charges',                     rateOf: () => '₹10 per crore turnover' },
  { key: 'gst',             label: 'GST (Goods & Services Tax)',        rateOf: () => '18% on brok + exch + SEBI' },
  { key: 'stampDuty',       label: 'Stamp Duty',                       rateOf: (seg, side) => side === 'SELL' ? 'Nil (sell side)' : STAMP_RATE_LABELS[seg] },
  { key: 'dpCharges',       label: 'DP Charges (Demat debit)',          rateOf: (seg, side) => seg === 'EQUITY_DELIVERY' && side === 'SELL' ? '₹13.5 + GST per ISIN/day' : 'N/A' },
];

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="glass rounded-xl p-4 flex flex-col gap-2" style={{ border: `1px solid ${AMBER_BORDER}` }}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: 'rgba(245,158,11,0.7)' }}>{label}</span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: AMBER_BG }}>
          <span style={{ color: AMBER }}>{icon}</span>
        </div>
      </div>
      <div className="text-xl font-bold font-mono" style={{ color: color ?? AMBER }}>{value}</div>
      {sub && <div className="text-[11px]" style={{ color: 'rgba(245,158,11,0.55)' }}>{sub}</div>}
    </div>
  );
}

// ─── Brokerage Calculator Panel ───────────────────────────────────────────────
function BrokerageCalcPanel() {
  const [calcSegment, setCalcSegment] = useState<Segment>('EQUITY_DELIVERY');
  const [calcSide, setCalcSide]       = useState<TradeSide>('BUY');
  const [calcValue, setCalcValue]     = useState('100000');

  const turnover  = parseFloat(calcValue) || 0;
  const breakdown = useMemo(
    () => calcChargeBreakdown(calcSegment, calcSide, turnover),
    [calcSegment, calcSide, turnover],
  );
  const roundTrip = useMemo(
    () => turnover > 0 ? calcRoundTrip(calcSegment, turnover) : null,
    [calcSegment, turnover],
  );

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="glass rounded-xl p-5 space-y-4" style={{ border: `1px solid ${AMBER_BORDER}` }}>
        <div className="flex items-center gap-2">
          <Calculator size={14} style={{ color: AMBER }} />
          <span className="text-sm font-bold" style={{ color: AMBER }}>Brokerage Calculator</span>
          <span className="text-[10px] ml-auto" style={{ color: 'var(--text-label)' }}>All rates per NSE/MCX schedule (2024)</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Segment</label>
            <select value={calcSegment} onChange={e => setCalcSegment(e.target.value as Segment)}
              className="w-full px-3 py-2 rounded-lg text-xs outline-none"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}>
              {SEGMENTS.map(s => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>Side</label>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--panel-divider)' }}>
              {(['BUY', 'SELL'] as TradeSide[]).map(s => (
                <button key={s} onClick={() => setCalcSide(s)}
                  className="flex-1 py-2 text-xs font-bold transition-all"
                  style={calcSide === s ? {
                    background: s === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)', color: '#fff',
                  } : { background: 'transparent', color: 'var(--text-label)' }}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-label)' }}>
              Trade Value (₹) {calcSegment === 'OPTIONS' ? '— premium amount' : '— qty × price'}
            </label>
            <input type="number" value={calcValue} onChange={e => setCalcValue(e.target.value)}
              placeholder="100000"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none transition-all"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
              onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
          </div>
        </div>
      </div>

      {/* Breakdown table */}
      {turnover > 0 && (
        <div className="glass rounded-xl overflow-hidden" style={{ border: `1px solid ${AMBER_BORDER}` }}>
          <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${AMBER_BORDER}`, background: AMBER_BG }}>
            <span className="text-xs font-bold" style={{ color: AMBER }}>
              {SEGMENT_LABELS[calcSegment]} — {calcSide} ₹{fmtINR(turnover)}
            </span>
            <span className="text-[10px]" style={{ color: 'rgba(245,158,11,0.6)' }}>
              Charges = {((breakdown.total / turnover) * 100).toFixed(4)}% of trade value
            </span>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: `1px solid ${AMBER_BORDER}`, background: 'rgba(245,158,11,0.05)' }}>
                <th className="px-4 py-2.5 text-left font-semibold" style={{ color: 'rgba(245,158,11,0.75)' }}>Charge</th>
                <th className="px-4 py-2.5 text-right font-semibold" style={{ color: 'rgba(245,158,11,0.75)' }}>Amount</th>
                <th className="px-4 py-2.5 text-right font-semibold hidden md:table-cell" style={{ color: 'rgba(245,158,11,0.75)' }}>Rate / Note</th>
              </tr>
            </thead>
            <tbody>
              {CHARGE_ROWS.map(({ key, label, rateOf }) => {
                const amt = breakdown[key] as number;
                const note = rateOf(calcSegment, calcSide);
                const isNA = note === 'N/A' || note === 'Nil (buy side)' || note === 'Nil (sell side)';
                return (
                  <tr key={key} style={{ borderBottom: '1px solid var(--row-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-4 py-2.5" style={{ color: 'var(--text-accent)' }}>{label}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold"
                      style={{ color: amt > 0 ? AMBER : 'var(--text-label)' }}>
                      {amt > 0 ? `₹${fmtINR(amt)}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-[10px] hidden md:table-cell"
                      style={{ color: isNA ? 'var(--text-label)' : 'var(--text-accent)', opacity: isNA ? 0.5 : 1 }}>
                      {note}
                    </td>
                  </tr>
                );
              })}

              {/* Total row */}
              <tr style={{ borderTop: `2px solid ${AMBER_BORDER}`, background: AMBER_BG }}>
                <td className="px-4 py-3 font-bold text-sm" style={{ color: AMBER }}>Total Charges</td>
                <td className="px-4 py-3 text-right font-mono font-bold text-sm" style={{ color: AMBER }}>
                  ₹{fmtINR(breakdown.total)}
                </td>
                <td className="px-4 py-3 text-right text-[10px] hidden md:table-cell" style={{ color: 'rgba(245,158,11,0.7)' }}>
                  Net proceeds: ₹{fmtINR(calcSide === 'BUY' ? turnover + breakdown.total : turnover - breakdown.total)}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Break-even info */}
          {breakdown.total > 0 && (
            <div className="px-4 py-3 flex flex-wrap items-center gap-4 text-xs"
              style={{ borderTop: `1px solid ${AMBER_BORDER}`, background: 'rgba(245,158,11,0.04)' }}>
              <div className="flex items-center gap-1.5">
                <Target size={12} style={{ color: AMBER }} />
                <span style={{ color: 'var(--text-accent)' }}>Break-even profit needed:</span>
                <span className="font-mono font-bold" style={{ color: AMBER }}>₹{fmtINR(breakdown.total)}</span>
                <span style={{ color: 'var(--text-label)' }}>
                  ({((breakdown.total / turnover) * 100).toFixed(4)}% price move)
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <Info size={11} style={{ color: 'var(--text-label)' }} />
                <span style={{ color: 'var(--text-label)' }}>Rates: NSE/MCX 2024, standard broker tariff</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Round-trip summary */}
      {roundTrip && turnover > 0 && (
        <div className="glass rounded-xl p-4 space-y-3" style={{ border: `1px solid ${AMBER_BORDER}` }}>
          <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'rgba(245,158,11,0.6)' }}>
            Round Trip (Buy + Sell at same price)
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg p-3 space-y-0.5 text-center"
              style={{ background: 'rgba(var(--gain-rgb),0.06)', border: '1px solid rgba(var(--gain-rgb),0.2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>Buy Charges</div>
              <div className="font-mono font-bold text-sm" style={{ color: 'var(--accent-green)' }}>
                ₹{fmtINR(roundTrip.buy.total)}
              </div>
            </div>
            <div className="rounded-lg p-3 space-y-0.5 text-center"
              style={{ background: 'rgba(var(--loss-rgb),0.06)', border: '1px solid rgba(var(--loss-rgb),0.2)' }}>
              <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>Sell Charges</div>
              <div className="font-mono font-bold text-sm" style={{ color: 'var(--accent-red)' }}>
                ₹{fmtINR(roundTrip.sell.total)}
              </div>
            </div>
            <div className="rounded-lg p-3 space-y-0.5 text-center" style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}` }}>
              <div className="text-[10px]" style={{ color: 'rgba(245,158,11,0.6)' }}>Total Round Trip</div>
              <div className="font-mono font-bold text-sm" style={{ color: AMBER }}>
                ₹{fmtINR(roundTrip.total)}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 text-xs"
            style={{ background: 'var(--card-inner-bg)', borderRadius: '0.5rem', padding: '0.5rem 1rem' }}>
            <Target size={12} style={{ color: AMBER }} />
            <span style={{ color: 'var(--text-accent)' }}>
              Need <span className="font-bold font-mono" style={{ color: AMBER }}>
                {roundTrip.breakEvenPct}%
              </span> profit on ₹{fmtINR(turnover)} just to break even
            </span>
          </div>

          {/* Per-100-orders estimate */}
          <div className="rounded-lg px-4 py-3 text-xs space-y-1"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)' }}>
            <p className="font-semibold" style={{ color: 'var(--text-accent)' }}>Daily active trader estimate:</p>
            <div className="flex flex-wrap gap-x-6 gap-y-0.5" style={{ color: 'var(--text-label)' }}>
              <span>10 orders/day → <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(10 * roundTrip.total)}</span>/day</span>
              <span>Monthly (20 days) → <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(20 * 10 * roundTrip.total)}</span></span>
            </div>
          </div>
        </div>
      )}

      {/* Quick reference table */}
      <div className="glass rounded-xl overflow-hidden" style={{ border: `1px solid ${AMBER_BORDER}` }}>
        <div className="px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest" style={{ background: AMBER_BG, color: AMBER }}>
          Quick Reference — All Segments at ₹1,00,000 Trade Value
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: `1px solid ${AMBER_BORDER}`, background: 'rgba(245,158,11,0.04)' }}>
                {['Segment', 'Buy Charges', 'Sell Charges', 'Round Trip', 'Break-even %'].map(h => (
                  <th key={h} className="px-4 py-2 text-left font-semibold" style={{ color: 'rgba(245,158,11,0.75)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SEGMENTS.map(seg => {
                const rt = calcRoundTrip(seg, 100_000);
                return (
                  <tr key={seg}
                    onClick={() => { setCalcSegment(seg); setCalcValue('100000'); }}
                    className="cursor-pointer"
                    style={{ borderBottom: '1px solid var(--row-border)', background: seg === calcSegment ? AMBER_BG : 'transparent' }}
                    onMouseEnter={e => { if (seg !== calcSegment) e.currentTarget.style.background = 'rgba(245,158,11,0.04)'; }}
                    onMouseLeave={e => { if (seg !== calcSegment) e.currentTarget.style.background = 'transparent'; }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: seg === calcSegment ? AMBER : 'var(--text-bright)' }}>
                      {SEGMENT_LABELS[seg]}
                    </td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--accent-green)' }}>₹{fmtINR(rt.buy.total)}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--accent-red)' }}>₹{fmtINR(rt.sell.total)}</td>
                    <td className="px-4 py-2.5 font-mono font-semibold" style={{ color: AMBER }}>₹{fmtINR(rt.total)}</td>
                    <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--text-accent)' }}>{rt.breakEvenPct}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PaperTradingPage() {
  const {
    active, virtualBalance, usedFunds, unrealizedPnl, realizedPnl, totalPnl,
    trades, positions, toggle, placeOrder, reset,
  } = usePaperTradingStore();

  const { priceMap, activeWatchlistItems } = useMarketStore();

  const [symbol,    setSymbol]    = useState('RELIANCE');
  const [segment,   setSegment]   = useState<Segment>('EQUITY_DELIVERY');
  const [side,      setSide]      = useState<'BUY' | 'SELL'>('BUY');
  const [qty,       setQty]       = useState(1);
  const [orderType, setOrderType] = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [limitPrice, setLimitPrice] = useState('');
  const [orderMsg,  setOrderMsg]  = useState<{ text: string; ok: boolean } | null>(null);
  const [activeTab, setActiveTab] = useState<'positions' | 'trades' | 'calc'>('positions');

  const ltp        = priceMap[symbol.toUpperCase()] ?? null;
  const execPrice  = orderType === 'MARKET' ? (ltp ?? 0) : (parseFloat(limitPrice) || 0);
  const orderValue = execPrice * qty;

  const chargeBreakdown = useMemo(
    () => calcChargeBreakdown(segment, side, orderValue),
    [segment, side, orderValue],
  );

  // Derived stats
  const winCount    = useMemo(() => trades.filter(t => t.side === 'SELL' && t.realizedPnl > 0).length, [trades]);
  const lossCount   = useMemo(() => trades.filter(t => t.side === 'SELL' && t.realizedPnl < 0).length, [trades]);
  const closedTrades = winCount + lossCount;
  const winRate     = closedTrades > 0 ? Math.round((winCount / closedTrades) * 100) : 0;

  function handlePlaceOrder() {
    if (qty <= 0) { setOrderMsg({ text: 'Quantity must be > 0', ok: false }); return; }
    if (!execPrice || execPrice <= 0) { setOrderMsg({ text: `No price found for "${symbol.toUpperCase()}"`, ok: false }); return; }
    if (side === 'BUY' && orderValue + chargeBreakdown.total > virtualBalance) {
      setOrderMsg({ text: 'Insufficient virtual balance', ok: false }); return;
    }

    const productType = segment === 'EQUITY_DELIVERY' ? 'CNC'
      : segment === 'EQUITY_INTRADAY' ? 'MIS' : 'NRML';

    placeOrder(symbol.toUpperCase(), side, qty, execPrice, orderType, productType, segment);
    setOrderMsg({
      text: `${side} ${qty} × ${symbol.toUpperCase()} @ ₹${fmtINR(execPrice)} | Charges: ₹${fmtINR(chargeBreakdown.total)}`,
      ok: true,
    });
    setTimeout(() => setOrderMsg(null), 4000);
  }

  const pnlColor = totalPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  const pnlSign  = totalPnl >= 0 ? '+' : '';

  return (
    <div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}` }}>
            <FlaskConical size={20} style={{ color: AMBER }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-bright)' }}>Paper Trading</h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wider"
                style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}`, color: AMBER }}>
                PAPER MODE
              </span>
              {active && (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: 'rgba(var(--gain-rgb),0.1)', border: '1px solid rgba(var(--gain-rgb),0.3)', color: 'var(--accent-green)' }}>
                  <span className="w-1.5 h-1.5 rounded-full live-dot" style={{ background: 'var(--accent-green)' }} />
                  LIVE PRICES
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-label)' }}>
              Practice with ₹10,00,000 virtual funds — real charges, zero risk
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!active && (
            <button onClick={toggle}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all"
              style={{ background: AMBER_BG, border: `1px solid ${AMBER_BORDER}`, color: AMBER }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.2)')}
              onMouseLeave={e => (e.currentTarget.style.background = AMBER_BG)}>
              <FlaskConical size={14} />
              Activate Paper Trading
            </button>
          )}
          <button onClick={() => { if (confirm('Reset paper trading portfolio? This cannot be undone.')) reset(); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-accent)' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')}>
            <RefreshCw size={13} /> Reset
          </button>
          <Link href="/"
            className="flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-accent)' }}>
            Dashboard <ChevronRight size={13} />
          </Link>
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard icon={<Wallet size={14} />} label="Virtual Balance"
          value={fmtShort(virtualBalance)} sub="Available to trade" />
        <StatCard icon={<LayoutGrid size={14} />} label="Used Funds"
          value={fmtShort(usedFunds)} sub={`${positions.length} position${positions.length !== 1 ? 's' : ''}`} />
        <StatCard icon={unrealizedPnl >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          label="Unrealised P&L" value={`${unrealizedPnl >= 0 ? '+' : ''}${fmtShort(unrealizedPnl)}`}
          color={positions.length > 0 ? (unrealizedPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : AMBER} />
        <StatCard icon={<Target size={14} />} label="Realised P&L"
          value={`${realizedPnl >= 0 ? '+' : ''}${fmtShort(realizedPnl)}`}
          color={realizedPnl !== 0 ? (realizedPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)') : AMBER} />
        <StatCard icon={<BarChart2 size={14} />} label="Total P&L"
          value={`${pnlSign}${fmtShort(totalPnl)}`}
          color={trades.length > 0 ? pnlColor : AMBER}
          sub={`${trades.length} trade${trades.length !== 1 ? 's' : ''}`} />
        <StatCard icon={winRate >= 50 ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
          label="Win Rate" value={closedTrades > 0 ? `${winRate}%` : '—'}
          sub={`${winCount}W / ${lossCount}L`}
          color={closedTrades > 0 ? (winRate >= 50 ? 'var(--accent-green)' : 'var(--accent-red)') : AMBER} />
      </div>

      {/* ── Main Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Order Entry */}
        <div className="glass rounded-xl p-5 space-y-4" style={{ border: `1px solid ${AMBER_BORDER}` }}>
          <div className="flex items-center gap-2 mb-1">
            <FlaskConical size={14} style={{ color: AMBER }} />
            <span className="text-sm font-bold" style={{ color: AMBER }}>Paper Order Entry</span>
          </div>

          {/* Symbol */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-accent)' }}>Symbol</label>
            <input type="text" value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. RELIANCE"
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none transition-all"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
              onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
            {ltp != null ? (
              <div className="text-[11px]" style={{ color: 'rgba(245,158,11,0.8)' }}>
                Live LTP:{' '}
                <span className="font-mono font-bold" style={{ color: 'var(--text-bright)' }}>₹{fmtINR(ltp)}</span>
                <span className="ml-1.5 text-[10px]" style={{ color: 'var(--accent-green)' }}>● LIVE</span>
              </div>
            ) : symbol.length > 1 ? (
              <div className="text-[11px]" style={{ color: 'var(--accent-red)' }}>Symbol not in market data</div>
            ) : null}
          </div>

          {/* Segment */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-accent)' }}>Segment</label>
            <select value={segment} onChange={e => setSegment(e.target.value as Segment)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-all"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
              onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')}>
              {SEGMENTS.map(s => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
            </select>
          </div>

          {/* BUY / SELL */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--panel-divider)' }}>
            {(['BUY', 'SELL'] as const).map(s => (
              <button key={s} onClick={() => setSide(s)}
                className="flex-1 py-2 text-xs font-bold transition-all"
                style={side === s ? {
                  background: s === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)', color: '#fff',
                } : { background: 'transparent', color: 'var(--text-label)' }}>
                {s === 'BUY' ? '▲' : '▼'} {s}
              </button>
            ))}
          </div>

          {/* Qty */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium" style={{ color: 'var(--text-accent)' }}>Quantity</label>
            <input type="number" min={1} value={qty}
              onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none transition-all"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
              onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
              onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
          </div>

          {/* Order type */}
          <div className="flex gap-1">
            {(['MARKET', 'LIMIT'] as const).map(t => (
              <button key={t} onClick={() => setOrderType(t)}
                className="flex-1 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{
                  background: orderType === t ? AMBER_BG : 'var(--card-inner-bg)',
                  color:  orderType === t ? AMBER : 'var(--text-label)',
                  border: `1px solid ${orderType === t ? AMBER_BORDER : 'var(--card-inner-border)'}`,
                }}>{t}</button>
            ))}
          </div>

          {/* Limit price */}
          {orderType === 'LIMIT' && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium" style={{ color: 'var(--text-accent)' }}>Limit Price (₹)</label>
              <input type="number" value={limitPrice}
                onChange={e => setLimitPrice(e.target.value)}
                placeholder={ltp ? ltp.toFixed(2) : '0.00'}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none transition-all"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-bright)' }}
                onFocus={e => (e.currentTarget.style.borderColor = AMBER_BORDER)}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--card-inner-border)')} />
            </div>
          )}

          {/* Order summary with detailed charges */}
          {execPrice > 0 && qty > 0 && (
            <div className="rounded-lg p-3 space-y-1 text-xs"
              style={{ background: 'rgba(245,158,11,0.06)', border: `1px solid ${AMBER_BORDER}` }}>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-accent)' }}>Order Value</span>
                <span className="font-mono font-semibold" style={{ color: 'var(--text-bright)' }}>₹{fmtINR(orderValue)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-accent)' }}>Brokerage</span>
                <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(chargeBreakdown.brokerage)}</span>
              </div>
              {chargeBreakdown.stt > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-accent)' }}>STT</span>
                  <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(chargeBreakdown.stt)}</span>
                </div>
              )}
              {chargeBreakdown.ctt > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-accent)' }}>CTT</span>
                  <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(chargeBreakdown.ctt)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-accent)' }}>Exch + SEBI</span>
                <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(chargeBreakdown.exchangeCharges + chargeBreakdown.sebiCharges)}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text-accent)' }}>GST</span>
                <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(chargeBreakdown.gst)}</span>
              </div>
              {chargeBreakdown.stampDuty > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-accent)' }}>Stamp Duty</span>
                  <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(chargeBreakdown.stampDuty)}</span>
                </div>
              )}
              {chargeBreakdown.dpCharges > 0 && (
                <div className="flex justify-between">
                  <span style={{ color: 'var(--text-accent)' }}>DP Charges</span>
                  <span className="font-mono" style={{ color: AMBER }}>₹{fmtINR(chargeBreakdown.dpCharges)}</span>
                </div>
              )}
              <div className="flex justify-between pt-1 border-t" style={{ borderColor: AMBER_BORDER }}>
                <span className="font-semibold" style={{ color: 'var(--text-accent)' }}>Total Charges</span>
                <span className="font-mono font-bold" style={{ color: AMBER }}>₹{fmtINR(chargeBreakdown.total)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t" style={{ borderColor: AMBER_BORDER }}>
                <span className="font-semibold" style={{ color: 'var(--text-accent)' }}>
                  {side === 'BUY' ? 'Balance After' : 'Proceeds'}
                </span>
                <span className="font-mono font-bold" style={{ color: AMBER }}>
                  {side === 'BUY'
                    ? `₹${fmtINR(Math.max(0, virtualBalance - orderValue - chargeBreakdown.total))}`
                    : `₹${fmtINR(orderValue - chargeBreakdown.total)}`}
                </span>
              </div>
            </div>
          )}

          {/* Place button */}
          <button onClick={handlePlaceOrder}
            className="w-full py-2.5 rounded-lg text-sm font-bold transition-all"
            style={{
              background: side === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)',
              color: '#fff',
              boxShadow: side === 'BUY' ? '0 2px 14px rgba(var(--gain-rgb),0.4)' : '0 2px 14px rgba(var(--loss-rgb),0.4)',
            }}>
            {side === 'BUY' ? '▲ Place BUY' : '▼ Place SELL'} — Paper
          </button>

          {/* Feedback */}
          {orderMsg && (
            <div className="text-[11px] rounded-lg px-3 py-2 text-center"
              style={{
                background: orderMsg.ok ? 'rgba(var(--gain-rgb),0.1)' : 'rgba(var(--loss-rgb),0.1)',
                border: `1px solid ${orderMsg.ok ? 'rgba(var(--gain-rgb),0.3)' : 'rgba(var(--loss-rgb),0.3)'}`,
                color:  orderMsg.ok ? 'var(--accent-green)' : 'var(--accent-red)',
              }}>
              {orderMsg.ok ? '✓ ' : '✗ '}{orderMsg.text}
            </div>
          )}

          {/* Quick symbols */}
          <div className="pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p className="text-[10px] mb-1.5" style={{ color: 'var(--text-label)' }}>Quick select:</p>
            <div className="flex flex-wrap gap-1">
              {QUICK_SYMBOLS.map(s => (
                <button key={s} onClick={() => setSymbol(s)}
                  className="px-1.5 py-0.5 rounded text-[10px] font-mono transition-all"
                  style={{
                    background: symbol === s ? AMBER_BG : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${symbol === s ? AMBER_BORDER : 'rgba(255,255,255,0.07)'}`,
                    color:  symbol === s ? AMBER : 'var(--text-label)',
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel — Positions / Trades / Brokerage Calc */}
        <div className="lg:col-span-2 space-y-4">

          {/* Tabs */}
          <div className="flex gap-1" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
            {([
              { id: 'positions', icon: <LayoutGrid size={12} />, label: `Positions (${positions.length})` },
              { id: 'trades',    icon: <History size={12} />,     label: `Trade History (${trades.length})` },
              { id: 'calc',      icon: <Calculator size={12} />,  label: 'Brokerage Calc' },
            ] as const).map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="px-4 py-2 text-xs font-semibold transition-all flex items-center gap-1.5"
                style={activeTab === tab.id
                  ? { color: AMBER, borderBottom: `2px solid ${AMBER}`, marginBottom: '-1px' }
                  : { color: 'var(--text-label)' }}>
                {tab.icon}{tab.label}
              </button>
            ))}
          </div>

          {/* Positions Table */}
          {activeTab === 'positions' && (
            <div className="glass rounded-xl overflow-hidden" style={{ border: `1px solid ${AMBER_BORDER}` }}>
              {positions.length === 0 ? <EmptyState /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${AMBER_BORDER}`, background: AMBER_BG }}>
                        {['Symbol', 'Segment', 'Qty', 'Avg Price', 'LTP', 'Unrealised P&L', 'P&L %', 'Action'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: 'rgba(245,158,11,0.75)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {positions.map(pos => (
                        <PositionRow key={pos.symbol} pos={pos} onSquareOff={placeOrder} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Trades Table */}
          {activeTab === 'trades' && (
            <div className="glass rounded-xl overflow-hidden" style={{ border: `1px solid ${AMBER_BORDER}` }}>
              {trades.length === 0 ? <EmptyState /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${AMBER_BORDER}`, background: AMBER_BG }}>
                        {['Date', 'Time', 'Symbol', 'Seg', 'Side', 'Qty', 'Price', 'Charges', 'Value', 'Realised P&L'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left font-semibold" style={{ color: 'rgba(245,158,11,0.75)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {trades.map(trade => <TradeRow key={trade.id} trade={trade} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Brokerage Calc */}
          {activeTab === 'calc' && <BrokerageCalcPanel />}

          {/* Live market snapshot (only for positions/trades tabs) */}
          {activeTab !== 'calc' && (
            <div className="glass rounded-xl p-4" style={{ border: `1px solid ${AMBER_BORDER}` }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: AMBER }}>
                Live Market — Tradeable Symbols
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {activeWatchlistItems.slice(0, 12).map(item => {
                  const pos = item.changePercent >= 0;
                  return (
                    <button key={item.symbol}
                      onClick={() => setSymbol(item.symbol)}
                      className="flex items-center justify-between px-2.5 py-2 rounded-lg transition-all text-left"
                      style={{
                        background: symbol === item.symbol ? AMBER_BG : 'var(--card-inner-bg)',
                        border: `1px solid ${symbol === item.symbol ? AMBER_BORDER : 'var(--card-inner-border)'}`,
                      }}>
                      <div>
                        <div className="text-[11px] font-bold font-mono" style={{ color: 'var(--text-secondary)' }}>{item.symbol}</div>
                        <div className="text-[10px] font-mono" style={{ color: 'var(--text-bright)' }}>
                          ₹{item.ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                        </div>
                      </div>
                      <div className="text-[10px] font-semibold"
                        style={{ color: pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {pos ? '▲' : '▼'}{Math.abs(item.changePercent).toFixed(2)}%
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── PositionRow ─────────────────────────────────────────────────────────────
function PositionRow({ pos, onSquareOff }: {
  pos: PaperPosition;
  onSquareOff: (symbol: string, side: 'BUY' | 'SELL', qty: number, price: number, orderType: 'MARKET' | 'LIMIT', productType: string, segment: Segment) => void;
}) {
  const pnlColor = pos.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)';
  const sign = pos.pnl >= 0 ? '+' : '';
  return (
    <tr style={{ borderBottom: '1px solid var(--row-border)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <td className="px-3 py-2.5 font-mono font-bold" style={{ color: 'var(--text-bright)' }}>{pos.symbol}</td>
      <td className="px-3 py-2.5 text-[10px]" style={{ color: 'var(--text-label)' }}>
        {SEGMENT_LABELS[pos.segment ?? 'EQUITY_DELIVERY']}
      </td>
      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-accent)' }}>{pos.quantity}</td>
      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-accent)' }}>₹{fmtINR(pos.avgPrice)}</td>
      <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: 'var(--text-bright)' }}>
        ₹{fmtINR(pos.ltp)}<span className="ml-1 text-[11px]" style={{ color: 'var(--accent-green)' }}>●</span>
      </td>
      <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: pnlColor }}>
        {sign}₹{fmtINR(pos.pnl)}
      </td>
      <td className="px-3 py-2.5 font-mono" style={{ color: pnlColor }}>
        {sign}{pos.pnlPercent.toFixed(2)}%
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={() => onSquareOff(pos.symbol, 'SELL', pos.quantity, pos.ltp, 'MARKET', pos.productType, pos.segment ?? 'EQUITY_DELIVERY')}
          className="px-2.5 py-1 rounded-md text-[11px] font-bold transition-all"
          style={{ background: 'rgba(var(--loss-rgb),0.12)', border: '1px solid rgba(var(--loss-rgb),0.3)', color: 'var(--accent-red)' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(var(--loss-rgb),0.22)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(var(--loss-rgb),0.12)')}>
          Square Off
        </button>
      </td>
    </tr>
  );
}

// ─── TradeRow ─────────────────────────────────────────────────────────────────
function TradeRow({ trade }: { trade: PaperTrade }) {
  const isBuy = trade.side === 'BUY';
  const hasRealised = trade.side === 'SELL' && trade.realizedPnl !== 0;
  return (
    <tr style={{ borderBottom: '1px solid var(--row-border)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(245,158,11,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text-label)' }}>{fmtDate(trade.timestamp)}</td>
      <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text-label)' }}>{fmtTime(trade.timestamp)}</td>
      <td className="px-3 py-2.5 font-mono font-bold" style={{ color: 'var(--text-bright)' }}>{trade.symbol}</td>
      <td className="px-3 py-2.5 text-[10px]" style={{ color: 'var(--text-label)' }}>
        {trade.segment ? SEGMENT_LABELS[trade.segment].split(' ')[0] : 'EQ'}
      </td>
      <td className="px-3 py-2.5">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold"
          style={{
            background: isBuy ? 'rgba(var(--gain-rgb),0.12)' : 'rgba(var(--loss-rgb),0.12)',
            color:      isBuy ? 'var(--accent-green)' : 'var(--accent-red)',
          }}>
          {isBuy ? '▲' : '▼'} {trade.side}
        </span>
      </td>
      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-accent)' }}>{trade.quantity}</td>
      <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-bright)' }}>₹{fmtINR(trade.price)}</td>
      <td className="px-3 py-2.5 font-mono" style={{ color: 'rgba(245,158,11,0.8)' }}>₹{fmtINR(trade.charges)}</td>
      <td className="px-3 py-2.5 font-mono font-semibold" style={{ color: 'var(--text-bright)' }}>
        ₹{fmtINR(trade.quantity * trade.price)}
      </td>
      <td className="px-3 py-2.5 font-mono font-semibold">
        {hasRealised ? (
          <span style={{ color: trade.realizedPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {trade.realizedPnl >= 0 ? '+' : ''}₹{fmtINR(trade.realizedPnl)}
          </span>
        ) : <span style={{ color: 'var(--text-label)' }}>—</span>}
      </td>
    </tr>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3">
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
        style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)' }}>
        <FlaskConical size={22} style={{ color: 'rgba(245,158,11,0.45)' }} />
      </div>
      <p className="text-sm font-medium" style={{ color: 'var(--text-label)' }}>No data yet</p>
      <p className="text-xs" style={{ color: 'var(--text-label)', opacity: 0.6 }}>
        Place a paper order to see your virtual portfolio here
      </p>
    </div>
  );
}
