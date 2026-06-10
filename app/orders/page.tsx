'use client';
import { useState } from 'react';
import { Download, RefreshCw, Search, Plus, FlaskConical, Zap, Loader2 } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { formatNumber } from '@/lib/utils/format';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';
import { useAngelOneStore } from '@/store/useAngelOneStore';
import { useAngelOneOrders } from '@/hooks/useAngelOneData';
import Link from 'next/link';

const ORDER_TABS = [
  { id: 'all',      label: 'All Orders' },
  { id: 'active',   label: 'Active' },
  { id: 'complete', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'trades',   label: 'Trade Book' },
];

const S_VARIANT: Record<string, 'success'|'danger'|'warning'|'info'|'neutral'> = {
  'open':           'info',
  'complete':       'success',
  'cancelled':      'neutral',
  'rejected':       'danger',
  'pending':        'warning',
  'trigger pending':'warning',
  'after market order req received': 'info',
  'modified':       'info',
};

export default function OrdersPage() {
  const { openOrderPanel } = useUIStore();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('all');
  const { trades: paperTrades, active: paperActive } = usePaperTradingStore();
  const { isConnected, mode } = useAngelOneStore();
  const isLive = isConnected && mode === 'live';

  const { data, loading, error, refetch } = useAngelOneOrders();
  const liveOrders = data?.orders ?? [];
  const liveTrades = data?.trades ?? [];

  const filteredOrders = liveOrders.filter(o => {
    const status = (o.status || '').toLowerCase();
    if (search && !o.tradingsymbol.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'active')   return ['open', 'trigger pending', 'modified'].includes(status);
    if (tab === 'complete') return status === 'complete';
    if (tab === 'rejected') return status === 'rejected' || status === 'cancelled';
    return true;
  });

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Orders</h1>
          {isLive && (
            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: 'rgba(var(--gain-rgb),0.1)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.25)' }}>
              <Zap size={9} /> LIVE
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refetch}><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh</Button>
          <Button variant="outline" size="sm"><Download size={12} /> Export</Button>
          <Button variant="primary" size="sm" onClick={() => openOrderPanel('NIFTY', 'BUY')}><Plus size={12} /> New Order</Button>
        </div>
      </div>

      {paperActive && !isLive && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <FlaskConical size={13} style={{ color: 'rgb(245,158,11)' }} />
          <span className="text-xs font-semibold" style={{ color: 'rgb(245,158,11)' }}>Paper Trading Mode</span>
          <span className="text-xs" style={{ color: 'var(--text-label)' }}>— Showing simulated orders below</span>
          <Link href="/paper-trading" className="ml-auto text-xs font-semibold hover:opacity-80" style={{ color: 'rgb(245,158,11)' }}>View Details →</Link>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text-label)' }}>
          <Loader2 size={16} className="animate-spin" /> Loading orders…
        </div>
      )}
      {error && !loading && (
        <div className="px-4 py-3 rounded-xl text-sm" style={{ background: 'rgba(var(--loss-rgb),0.08)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.2)' }}>
          Error: {error}
        </div>
      )}

      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-label)' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search orders…"
              className="pl-8 pr-3 h-8 rounded-lg text-xs w-48 outline-none"
              style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--panel-divider)', color: 'var(--text-secondary)' }} />
          </div>
          <span className="text-xs" style={{ color: 'var(--text-label)' }}>
            {isLive ? `${liveOrders.length} orders from AngelOne` : 'No live orders — connect AngelOne'}
          </span>
        </div>

        <Tabs tabs={ORDER_TABS} onChange={setTab}>
          {() => (
            tab === 'trades' ? (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
                    <tr>
                      {['Fill Time', 'Symbol', 'Side', 'Qty', 'Price', 'Exchange', 'Order ID'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap" style={{ color: 'var(--text-label)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {liveTrades.map((t, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]" style={{ borderBottom: '1px solid var(--row-border)' }}>
                        <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text-label)' }}>{t.filltime}</td>
                        <td className="px-3 py-2.5 font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>{t.tradingsymbol}</td>
                        <td className="px-3 py-2.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                            style={t.transactiontype === 'BUY'
                              ? { background: 'rgba(var(--gain-rgb),0.12)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.25)' }
                              : { background: 'rgba(var(--loss-rgb),0.12)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.25)' }}>
                            {t.transactiontype}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-accent)' }}>{t.quantity}</td>
                        <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-accent)' }}>₹{formatNumber(parseFloat(t.price))}</td>
                        <td className="px-3 py-2.5" style={{ color: 'var(--text-dim)' }}>{t.exchange}</td>
                        <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text-label)' }}>{t.orderid}</td>
                      </tr>
                    ))}
                    {liveTrades.length === 0 && <tr><td colSpan={7} className="px-3 py-12 text-center text-xs" style={{ color: 'var(--text-label)' }}>No trades today</td></tr>}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
                    <tr>
                      {['Order ID','Symbol','Side','Qty','Type','Product','Price','Status','Filled','Avg Price','Time','Actions'].map(h => (
                        <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap" style={{ color: 'var(--text-label)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order, i) => {
                      const status = (order.status || '').toLowerCase();
                      const variant = S_VARIANT[status] ?? 'neutral';
                      return (
                        <tr key={i} className="group transition-colors hover:bg-white/[0.02]" style={{ borderBottom: '1px solid var(--row-border)' }}>
                          <td className="px-3 py-3 font-mono text-[10px]" style={{ color: 'var(--text-label)' }}>{order.orderid?.slice(-8)}</td>
                          <td className="px-3 py-3">
                            <div className="font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>{order.tradingsymbol}</div>
                            <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{order.exchange}</div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                              style={order.transactiontype === 'BUY'
                                ? { background: 'rgba(var(--gain-rgb),0.12)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.25)' }
                                : { background: 'rgba(var(--loss-rgb),0.12)', color: 'var(--accent-red)',   border: '1px solid rgba(var(--loss-rgb),0.25)' }}>
                              {order.transactiontype}
                            </span>
                          </td>
                          <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>{order.quantity}</td>
                          <td className="px-3 py-3" style={{ color: 'var(--text-dim)' }}>{order.ordertype}</td>
                          <td className="px-3 py-3" style={{ color: 'var(--text-dim)' }}>{order.producttype}</td>
                          <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>
                            {parseFloat(order.price) > 0 ? `₹${formatNumber(parseFloat(order.price))}` : 'MKT'}
                          </td>
                          <td className="px-3 py-3">
                            <Badge variant={variant} size="sm">{order.status}</Badge>
                            {order.text && <div className="text-[11px] mt-0.5 max-w-[120px] truncate" style={{ color: 'var(--accent-red)' }}>{order.text}</div>}
                          </td>
                          <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-dim)' }}>{order.filledshares}/{order.quantity}</td>
                          <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>
                            {parseFloat(order.averageprice) > 0 ? `₹${formatNumber(parseFloat(order.averageprice))}` : '—'}
                          </td>
                          <td className="px-3 py-3 font-mono text-[10px]" style={{ color: 'var(--text-label)' }}>{order.exchtime}</td>
                          <td className="px-3 py-3">
                            <div className="hidden group-hover:flex items-center gap-1">
                              {['open', 'trigger pending'].includes(status) && (
                                <>
                                  <button className="px-2 py-1 rounded text-[10px] font-semibold" style={{ background: 'rgba(41,121,255,0.2)', color: 'var(--accent-blue)' }}>Modify</button>
                                  <button className="px-2 py-1 rounded text-[10px] font-semibold" style={{ background: 'rgba(var(--loss-rgb),0.15)', color: 'var(--accent-red)' }}>Cancel</button>
                                </>
                              )}
                              <button onClick={() => openOrderPanel(order.tradingsymbol, order.transactiontype as 'BUY'|'SELL')}
                                className="px-2 py-1 rounded text-[10px] font-semibold" style={{ background: 'var(--card-inner-border)', color: 'var(--text-accent)' }}>Reorder</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredOrders.length === 0 && (
                      <tr><td colSpan={12} className="px-3 py-12 text-center text-xs" style={{ color: 'var(--text-label)' }}>
                        {isLive ? 'No orders found' : 'Connect AngelOne in Live mode to see real orders'}
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </Tabs>
      </div>

      {/* Paper Trade History */}
      {paperActive && !isLive && paperTrades.length > 0 && (
        <div className="glass rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
            <FlaskConical size={13} style={{ color: 'rgb(245,158,11)' }} />
            <span className="text-xs font-bold" style={{ color: 'rgb(245,158,11)' }}>Paper Trade History</span>
            <span className="text-xs ml-1" style={{ color: 'var(--text-label)' }}>({paperTrades.length} trades)</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
                <tr>
                  {['Time', 'Symbol', 'Side', 'Qty', 'Price', 'Charges', 'Realised P&L'].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap" style={{ color: 'var(--text-label)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paperTrades.map(trade => (
                  <tr key={trade.id} className="hover:bg-white/[0.02]" style={{ borderBottom: '1px solid var(--row-border)' }}>
                    <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text-label)' }}>
                      {new Date(trade.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-3 py-2.5 font-bold" style={{ color: 'var(--text-secondary)' }}>{trade.symbol}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold"
                        style={trade.side === 'BUY'
                          ? { background: 'rgba(var(--gain-rgb),0.12)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.25)' }
                          : { background: 'rgba(var(--loss-rgb),0.12)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.25)' }}>
                        {trade.side}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-accent)' }}>{trade.quantity}</td>
                    <td className="px-3 py-2.5 font-mono" style={{ color: 'var(--text-accent)' }}>₹{formatNumber(trade.price)}</td>
                    <td className="px-3 py-2.5 font-mono text-[10px]" style={{ color: 'var(--text-label)' }}>₹{formatNumber(trade.charges)}</td>
                    <td className="px-3 py-2.5 font-mono font-bold" style={{ color: trade.realizedPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {trade.realizedPnl !== 0 ? `${trade.realizedPnl >= 0 ? '+' : ''}₹${formatNumber(Math.abs(trade.realizedPnl))}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
