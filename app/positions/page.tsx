'use client';
import { useUIStore } from '@/store/useUIStore';
import { formatCurrency, formatNumber, formatPercent } from '@/lib/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { BarChart2, RefreshCw, FlaskConical, Zap, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { usePaperTradingStore, PaperPosition } from '@/store/usePaperTradingStore';
import { useAngelOneStore } from '@/store/useAngelOneStore';
import { useAngelOnePositions } from '@/hooks/useAngelOneData';

const POS_TABS = [
  { id: 'net',     label: 'Net Positions' },
  { id: 'day',     label: 'Day' },
  { id: 'open',    label: 'Open' },
  { id: 'closed',  label: 'Closed' },
  { id: 'options', label: 'Options' },
  { id: 'futures', label: 'Futures' },
];

function col(v: number) { return v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'; }

export default function PositionsPage() {
  const { openOrderPanel } = useUIStore();
  const { positions: paperPositions, totalPnl: paperTotalPnl, active: paperActive, placeOrder } = usePaperTradingStore();
  const { isConnected, mode } = useAngelOneStore();
  const isLive = isConnected && mode === 'live';

  const { data, loading, error, refetch } = useAngelOnePositions();
  const livePositions = data?.positions ?? [];

  // Filter live positions to non-zero net qty
  const activePositions = livePositions.filter(p => parseInt(p.netqty) !== 0);
  const totalMtm = livePositions.reduce((s, p) => s + parseFloat(p.mtm || '0'), 0);
  const totalPnl = livePositions.reduce((s, p) => s + parseFloat(p.pnl || '0'), 0);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Positions</h1>
          {isLive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(var(--gain-rgb),0.1)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.25)' }}>
              <Zap size={9} /> LIVE — AngelOne
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh</Button>
          <Button variant="danger" size="sm">Square Off All</Button>
        </div>
      </div>

      {/* Mode banners */}
      {paperActive && !isLive && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <FlaskConical size={13} style={{ color: 'rgb(245,158,11)' }} />
          <span className="text-xs font-semibold" style={{ color: 'rgb(245,158,11)' }}>Paper Trading Mode</span>
          <span className="text-xs" style={{ color: 'var(--text-label)' }}>— Showing virtual paper positions</span>
          <Link href="/paper-trading" className="ml-auto text-xs font-semibold hover:opacity-80" style={{ color: 'rgb(245,158,11)' }}>View Details →</Link>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total MTM P&L', value: isLive ? `${totalMtm >= 0 ? '+' : ''}${formatCurrency(totalMtm, true)}` : paperActive ? `${paperTotalPnl >= 0 ? '+' : ''}${formatCurrency(paperTotalPnl, true)}` : '—', v: isLive ? totalMtm : paperTotalPnl },
          { label: 'Realised P&L',  value: isLive ? `${totalPnl >= 0 ? '+' : ''}${formatCurrency(totalPnl, true)}` : '—', v: isLive ? totalPnl : 0 },
          { label: 'Open Positions',value: isLive ? String(activePositions.length) : paperActive ? String(paperPositions.length) : '0', v: 0 },
          { label: 'Total Positions',value: isLive ? String(livePositions.length) : '0', v: 0 },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-label)' }}>{s.label}</div>
            <div className="text-base font-bold font-mono" style={{ color: s.v !== 0 ? col(s.v) : 'var(--accent-blue)' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Loading/Error state */}
      {loading && (
        <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text-label)' }}>
          <Loader2 size={16} className="animate-spin" /> Loading live positions…
        </div>
      )}
      {error && !loading && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(var(--loss-rgb),0.08)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.2)' }}>
          Error: {error}
        </div>
      )}

      {/* Live positions table */}
      {isLive && !loading && livePositions.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <Tabs tabs={POS_TABS}>
            {(tab) => (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
                    <tr>
                      {['Symbol','Net Qty','Avg Price','LTP','Unrealised P&L','Realised P&L','MTM','Product','Type','Actions'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap" style={{ color: 'var(--text-label)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {livePositions
                      .filter(p => {
                        if (tab === 'net') return true;
                        if (tab === 'open') return parseInt(p.netqty) !== 0;
                        if (tab === 'closed') return parseInt(p.netqty) === 0;
                        if (tab === 'options') return p.instrumenttype === 'OPTIDX' || p.instrumenttype === 'OPTSTK';
                        if (tab === 'futures') return p.instrumenttype === 'FUTIDX' || p.instrumenttype === 'FUTSTK';
                        return true;
                      })
                      .map((pos, i) => {
                        const netQty = parseInt(pos.netqty);
                        const avgPrice = parseFloat(pos.avg_price || '0');
                        const ltpVal = parseFloat(pos.ltp || '0');
                        const unrealised = parseFloat(pos.unrealised || '0');
                        const realised = parseFloat(pos.realised || '0');
                        const mtm = parseFloat(pos.mtm || '0');
                        return (
                          <tr key={i} className="group transition-colors hover:bg-white/[0.02]" style={{ borderBottom: '1px solid var(--row-border)' }}>
                            <td className="px-3 py-3">
                              <div className="font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>{pos.tradingsymbol}</div>
                              <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{pos.exchange} {pos.expirydate ? `· ${pos.expirydate}` : ''}</div>
                            </td>
                            <td className="px-3 py-3 font-mono font-semibold" style={{ color: col(netQty) }}>
                              {netQty > 0 ? '+' : ''}{netQty}
                            </td>
                            <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-dim)' }}>₹{formatNumber(avgPrice)}</td>
                            <td className="px-3 py-3 font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                              <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
                                ₹{formatNumber(ltpVal)}
                              </span>
                            </td>
                            <td className="px-3 py-3 font-mono font-bold" style={{ color: col(unrealised) }}>
                              {unrealised >= 0 ? '+' : ''}₹{formatNumber(Math.abs(unrealised))}
                            </td>
                            <td className="px-3 py-3 font-mono" style={{ color: col(realised) }}>
                              {realised >= 0 ? '+' : ''}₹{formatNumber(Math.abs(realised))}
                            </td>
                            <td className="px-3 py-3 font-mono" style={{ color: col(mtm) }}>
                              {mtm >= 0 ? '+' : ''}₹{formatNumber(Math.abs(mtm))}
                            </td>
                            <td className="px-3 py-3"><Badge variant="neutral" size="sm">{pos.producttype}</Badge></td>
                            <td className="px-3 py-3"><Badge variant="info" size="sm">{pos.instrumenttype || 'EQ'}</Badge></td>
                            <td className="px-3 py-3">
                              <div className="hidden group-hover:flex items-center gap-1">
                                <button onClick={() => openOrderPanel(pos.tradingsymbol, netQty > 0 ? 'SELL' : 'BUY')}
                                  className="px-2 py-1 rounded text-[10px] font-semibold" style={{ background: 'rgba(var(--loss-rgb),0.15)', color: 'var(--accent-red)' }}>Exit</button>
                                <Link href="/markets?tab=charts">
                                  <button className="p-1 rounded" style={{ color: 'var(--accent-blue)' }}><BarChart2 size={12} /></button>
                                </Link>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    {livePositions.filter(p => {
                      if (tab === 'options') return p.instrumenttype === 'OPTIDX' || p.instrumenttype === 'OPTSTK';
                      if (tab === 'futures') return p.instrumenttype === 'FUTIDX' || p.instrumenttype === 'FUTSTK';
                      return true;
                    }).length === 0 && (
                      <tr><td colSpan={10} className="px-3 py-12 text-center text-xs" style={{ color: 'var(--text-label)' }}>No positions in this category</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Tabs>
        </div>
      )}

      {/* Paper mode positions */}
      {paperActive && !isLive && !loading && paperPositions.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <PaperPositionsTable positions={paperPositions} onSquareOff={placeOrder} />
        </div>
      )}

      {/* Empty state */}
      {!isLive && !paperActive && !loading && (
        <div className="glass rounded-2xl py-16 text-center">
          <div className="text-sm" style={{ color: 'var(--text-label)' }}>
            Connect AngelOne in Live mode or enable Paper Trading to see positions
          </div>
        </div>
      )}
    </div>
  );
}

function PaperPositionsTable({ positions, onSquareOff }: {
  positions: PaperPosition[];
  onSquareOff: (symbol: string, side: 'BUY' | 'SELL', qty: number, price: number) => void;
}) {
  function c(v: number) { return v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'; }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
          <tr>
            {['Symbol', 'Qty', 'Avg Price', 'LTP', 'P&L', 'P&L %', 'Product', 'Action'].map(h => (
              <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap" style={{ color: 'var(--text-label)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {positions.map(pos => (
            <tr key={pos.symbol} className="group transition-colors hover:bg-white/[0.02]" style={{ borderBottom: '1px solid var(--row-border)' }}>
              <td className="px-3 py-3">
                <div className="font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>{pos.symbol}</div>
                <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{pos.exchange}</div>
              </td>
              <td className="px-3 py-3 font-mono font-semibold" style={{ color: pos.quantity > 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                {pos.quantity > 0 ? '+' : ''}{pos.quantity}
              </td>
              <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-dim)' }}>₹{formatNumber(pos.avgPrice)}</td>
              <td className="px-3 py-3 font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
                  ₹{formatNumber(pos.ltp)}
                </span>
              </td>
              <td className="px-3 py-3 font-mono font-bold" style={{ color: c(pos.pnl) }}>
                {pos.pnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(pos.pnl))}
              </td>
              <td className="px-3 py-3 font-semibold" style={{ color: c(pos.pnlPercent) }}>
                {formatPercent(pos.pnlPercent)}
              </td>
              <td className="px-3 py-3"><Badge variant="neutral" size="sm">{pos.productType}</Badge></td>
              <td className="px-3 py-3">
                <button
                  onClick={() => onSquareOff(pos.symbol, pos.quantity > 0 ? 'SELL' : 'BUY', Math.abs(pos.quantity), pos.ltp)}
                  className="px-2 py-1 rounded text-[10px] font-semibold"
                  style={{ background: 'rgba(var(--loss-rgb),0.15)', color: 'var(--accent-red)' }}>
                  Square Off
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
