'use client';
import { useState } from 'react';
import { TrendingUp, TrendingDown, Download, Plus, ChevronDown, ChevronRight, FlaskConical, Zap, Loader2 } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';
import { useAngelOneStore } from '@/store/useAngelOneStore';
import { useAngelOnePortfolio } from '@/hooks/useAngelOneData';
import Link from 'next/link';

const PORTFOLIO_TABS = [
  { id: 'holdings',  label: 'Holdings' },
  { id: 'grouped',   label: 'Grouped' },
  { id: 'trades',    label: 'Trades' },
  { id: 'sip',       label: 'SIP' },
  { id: 'pledged',   label: 'Pledged' },
  { id: 'statements',label: 'Statements' },
];

const GROUPS = ['Long Term','Short Term','Swing','High Conviction','Hedge','Own Research'];

function c(v: number) { return v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'; }
function gainBg(pos: boolean, a = 0.1) { return pos ? `rgba(var(--gain-rgb),${a})` : `rgba(var(--loss-rgb),${a})`; }

export default function PortfolioPage() {
  const { openOrderPanel } = useUIStore();
  const { active: paperActive, totalPnl: paperTotalPnl, virtualBalance, positions: paperPositions, unrealizedPnl: paperUnrealizedPnl, realizedPnl: paperRealizedPnl } = usePaperTradingStore();
  const { isConnected, mode } = useAngelOneStore();
  const isLive = isConnected && mode === 'live';

  const { data, loading, error } = useAngelOnePortfolio();
  const holdings = data?.holdingData?.holdings ?? [];
  const totalHolding = data?.holdingData?.totalholding;
  const rms = data?.rms;

  const totalInvested = parseFloat(totalHolding?.totalinvvalue || '0');
  const totalCurrent = parseFloat(totalHolding?.totalholdingvalue || '0');
  const totalPnl = parseFloat(totalHolding?.totalprofitandloss || '0');
  const availableCash = parseFloat(rms?.availablecash || '0');
  const marginUsed = parseFloat(rms?.utiliseddebits || '0');

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Portfolio</h1>
          {isLive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(var(--gain-rgb),0.1)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.25)' }}>
              <Zap size={9} /> LIVE
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm"><Download size={12} /> Export</Button>
          <Button variant="primary" size="sm"><Plus size={12} /> Add Holding</Button>
        </div>
      </div>

      {paperActive && !isLive && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <FlaskConical size={13} style={{ color: 'rgb(245,158,11)' }} />
          <span className="text-xs font-semibold" style={{ color: 'rgb(245,158,11)' }}>Paper Trading Mode</span>
          <span className="text-xs" style={{ color: 'var(--text-label)' }}>— Showing virtual paper portfolio stats</span>
          <Link href="/paper-trading" className="ml-auto text-xs font-semibold hover:opacity-80" style={{ color: 'rgb(245,158,11)' }}>Manage →</Link>
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {[
          { label:'Invested',       value: isLive ? formatCurrency(totalInvested, true) : '—',     pnl: null,          col: '41,121,255'  },
          { label:'Current Value',  value: isLive ? formatCurrency(totalCurrent, true)  : '—',     pnl: null,          col: '0,212,255'  },
          { label:"Today's P&L",    value: paperActive && !isLive ? formatCurrency(paperTotalPnl, true) : isLive ? formatCurrency(totalPnl, true) : '—', pnl: paperActive && !isLive ? paperTotalPnl : isLive ? totalPnl : 0, col: '' },
          { label:'Unrealized P&L', value: paperActive && !isLive ? formatCurrency(paperUnrealizedPnl, true) : isLive ? formatCurrency(totalPnl, true) : '—', pnl: paperActive && !isLive ? paperUnrealizedPnl : isLive ? totalPnl : 0, col: '' },
          { label:'Realized P&L',   value: paperActive && !isLive ? formatCurrency(paperRealizedPnl, true) : isLive ? formatCurrency(parseFloat(rms?.m2mrealized||'0'), true) : '—', pnl: paperActive && !isLive ? paperRealizedPnl : isLive ? parseFloat(rms?.m2mrealized||'0') : 0, col: '' },
          { label: paperActive && !isLive ? 'Virtual Balance' : 'Available Cash', value: paperActive && !isLive ? formatCurrency(virtualBalance, true) : isLive ? formatCurrency(availableCash, true) : '—', pnl: null, col: '41,121,255' },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-label)' }}>{s.label}</div>
            <div className="text-sm font-bold font-mono" style={{ color: s.pnl !== null && s.pnl !== 0 ? c(s.pnl) : s.col ? `rgb(${s.col})` : 'var(--text-bright)' }}>
              {s.pnl !== null && s.pnl !== 0 && s.pnl >= 0 ? '+' : ''}{s.value}
            </div>
            {s.pnl !== null && s.pnl !== 0 && (
              <div className="flex items-center gap-0.5 mt-0.5">
                {s.pnl >= 0 ? <TrendingUp size={9} style={{ color: 'var(--accent-green)' }} /> : <TrendingDown size={9} style={{ color: 'var(--accent-red)' }} />}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Margin row */}
      <div className="grid grid-cols-3 gap-2.5">
        {[
          { label: 'Margin Used',      value: isLive ? formatCurrency(marginUsed, true) : '—', pnl: null },
          { label: 'Margin Available', value: isLive ? formatCurrency(availableCash - marginUsed, true) : '—', pnl: null },
          { label: 'MTM Unrealized',   value: isLive ? formatCurrency(parseFloat(rms?.m2munrealized||'0'), true) : '—', pnl: isLive ? parseFloat(rms?.m2munrealized||'0') : null },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-label)' }}>{s.label}</div>
            <div className="text-sm font-bold font-mono" style={{ color: s.pnl !== null ? c(s.pnl) : 'var(--text-secondary)' }}>
              {s.pnl !== null && s.pnl >= 0 ? '+' : ''}{s.value}
            </div>
          </div>
        ))}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text-label)' }}>
          <Loader2 size={16} className="animate-spin" /> Loading portfolio…
        </div>
      )}
      {error && !loading && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(var(--loss-rgb),0.08)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.2)' }}>
          Error: {error}
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <Tabs tabs={PORTFOLIO_TABS}>
          {(tab) => (
            <div>
              {tab === 'holdings' && (
                isLive && holdings.length > 0
                  ? <LiveHoldingsTab holdings={holdings} onBuy={s => openOrderPanel(s, 'BUY')} onSell={s => openOrderPanel(s, 'SELL')} />
                  : paperActive && !isLive && paperPositions.length > 0
                    ? <PaperHoldingsTab positions={paperPositions} />
                    : <div className="py-16 text-center text-xs" style={{ color: 'var(--text-label)' }}>
                        {loading ? 'Loading…' : isLive ? 'No holdings found' : 'Connect AngelOne in Live mode or enable Paper Trading'}
                      </div>
              )}
              {tab !== 'holdings' && (
                <div className="py-16 text-center text-xs" style={{ color: 'var(--text-label)' }}>No data for {tab}</div>
              )}
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
}

function LiveHoldingsTab({ holdings, onBuy, onSell }: {
  holdings: NonNullable<ReturnType<typeof useAngelOnePortfolio>['data']>['holdingData']['holdings'];
  onBuy: (s: string) => void; onSell: (s: string) => void;
}) {
  const BLUE = '41,121,255';
  const totalQty = holdings.reduce((s, h) => s + h.quantity, 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
          <tr>
            {['Symbol','Qty','Avg Price','LTP','Invested','Current Value','P&L','P&L %','Product',''].map(h => (
              <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap" style={{ color: 'var(--text-label)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => {
            const invested = h.quantity * h.averageprice;
            const current = h.quantity * h.ltp;
            const pnl = h.profitandloss;
            const pnlPct = h.pnlpercentage;
            return (
              <tr key={h.symboltoken} className="group transition-colors hover:bg-white/[0.02]" style={{ borderBottom: '1px solid var(--row-border)' }}>
                <td className="px-3 py-3">
                  <div className="font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>{h.tradingsymbol}</div>
                  <div className="text-[10px] truncate max-w-[120px]" style={{ color: 'var(--text-label)' }}>{h.symbolname}</div>
                </td>
                <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>{h.quantity}</td>
                <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-dim)' }}>₹{formatNumber(h.averageprice)}</td>
                <td className="px-3 py-3 font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
                    ₹{formatNumber(h.ltp)}
                  </span>
                </td>
                <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-dim)' }}>{formatCurrency(invested, true)}</td>
                <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>{formatCurrency(current, true)}</td>
                <td className="px-3 py-3 font-mono font-bold" style={{ color: c(pnl) }}>
                  {pnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(pnl))}
                </td>
                <td className="px-3 py-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: gainBg(pnl >= 0), color: c(pnl), border: `1px solid ${gainBg(pnl >= 0, 0.25)}` }}>
                    {formatPercent(pnlPct)}
                  </span>
                </td>
                <td className="px-3 py-3"><Badge variant="neutral" size="sm">{h.product}</Badge></td>
                <td className="px-3 py-3">
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button onClick={() => onBuy(h.tradingsymbol)} className="px-2 py-1 rounded text-[10px] font-semibold" style={{ background: 'rgba(var(--gain-rgb),0.15)', color: 'var(--accent-green)' }}>Buy</button>
                    <button onClick={() => onSell(h.tradingsymbol)} className="px-2 py-1 rounded text-[10px] font-semibold" style={{ background: 'rgba(var(--loss-rgb),0.15)', color: 'var(--accent-red)' }}>Sell</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaperHoldingsTab({ positions }: { positions: ReturnType<typeof usePaperTradingStore.getState>['positions'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
          <tr>
            {['Symbol', 'Qty', 'Avg Price', 'LTP', 'Current Value', 'P&L', 'P&L %', 'Product'].map(h => (
              <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap" style={{ color: 'var(--text-label)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(pos => {
            const currentValue = pos.quantity * pos.ltp;
            return (
              <tr key={pos.symbol} className="hover:bg-white/[0.02]" style={{ borderBottom: '1px solid var(--row-border)' }}>
                <td className="px-3 py-3">
                  <div className="font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>{pos.symbol}</div>
                  <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{pos.exchange}</div>
                </td>
                <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>{pos.quantity}</td>
                <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-dim)' }}>₹{formatNumber(pos.avgPrice)}</td>
                <td className="px-3 py-3 font-mono font-bold" style={{ color: 'var(--text-bright)' }}>₹{formatNumber(pos.ltp)}</td>
                <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>{formatCurrency(currentValue, true)}</td>
                <td className="px-3 py-3 font-mono font-bold" style={{ color: c(pos.pnl) }}>
                  {pos.pnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(pos.pnl))}
                </td>
                <td className="px-3 py-3">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{ background: pos.pnl >= 0 ? 'rgba(var(--gain-rgb),0.1)' : 'rgba(var(--loss-rgb),0.1)', color: c(pos.pnl) }}>
                    {formatPercent(pos.pnlPercent)}
                  </span>
                </td>
                <td className="px-3 py-3"><Badge variant="neutral" size="sm">{pos.productType}</Badge></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
