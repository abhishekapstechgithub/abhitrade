'use client';
import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, Plus, FlaskConical, AlertCircle } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { formatNumber } from '@/lib/utils/format';

const API_BASE = process.env.NEXT_PUBLIC_STRATEGY_API_URL ?? '';

function authHeaders() {
  if (typeof window === 'undefined') return {};
  const t = sessionStorage.getItem('tk_access_token') ?? localStorage.getItem('tk_access_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

type PaperStatus = 'PENDING' | 'EXECUTED' | 'REJECTED' | 'CANCELLED';

interface PaperOrder {
  order_id:         string;
  symbol:           string;
  exch_seg:         string;
  transaction_type: 'BUY' | 'SELL';
  order_type:       'MARKET' | 'LIMIT';
  price:            number;
  quantity:         number;
  status:           PaperStatus;
  rejection_reason: string | null;
  created_at:       string;
}

const STATUS_STYLE: Record<PaperStatus, { color: string; bg: string; border: string }> = {
  EXECUTED:  { color: '#16a34a', bg: 'rgba(34,197,94,0.1)',   border: 'rgba(34,197,94,0.25)' },
  PENDING:   { color: '#d97706', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.3)' },
  CANCELLED: { color: '#64748b', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' },
  REJECTED:  { color: '#dc2626', bg: 'rgba(239,68,68,0.1)',   border: 'rgba(239,68,68,0.25)' },
};

type TabId = 'open' | 'history';

export default function OrdersPage() {
  const { openOrderPanel } = useUIStore();
  const [tab, setTab]         = useState<TabId>('open');
  const [orders, setOrders]   = useState<PaperOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [search, setSearch]   = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/paper/portfolio/orders`, { headers: authHeaders() });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setOrders(data.orders ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const cancelOrder = async (orderId: string) => {
    setCancelling(orderId);
    try {
      await fetch(`${API_BASE}/api/paper/orders/cancel`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body:    JSON.stringify({ order_id: orderId }),
      });
      fetchOrders();
    } finally {
      setCancelling(null);
    }
  };

  const filtered = orders.filter(o => {
    if (search && !o.symbol.toLowerCase().includes(search.toLowerCase())) return false;
    if (tab === 'open') return o.status === 'PENDING';
    return true;
  });

  const openCount = orders.filter(o => o.status === 'PENDING').length;
  const totalBuy  = orders.filter(o => o.transaction_type === 'BUY'  && o.status === 'EXECUTED').reduce((s, o) => s + o.price * o.quantity, 0);
  const totalSell = orders.filter(o => o.transaction_type === 'SELL' && o.status === 'EXECUTED').reduce((s, o) => s + o.price * o.quantity, 0);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">

      {/* Tab header */}
      <div className="flex items-center gap-0" style={{ borderBottom: '2px solid var(--panel-divider)' }}>
        {([
          { id: 'open'    as TabId, label: 'Open Orders',   count: openCount || undefined },
          { id: 'history' as TabId, label: 'Order History', count: orders.length || undefined },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors relative"
            style={{ color: tab === t.id ? '#4f46e5' : 'var(--text-label)' }}>
            {t.label}
            {t.count != null && <span className="text-xs font-bold">({t.count})</span>}
            {tab === t.id && (
              <span className="absolute bottom-[-2px] left-0 right-0 h-[2px] rounded-full" style={{ background: '#4f46e5' }} />
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 pb-1">
          <span className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-bold"
            style={{ background: 'rgba(41,121,255,0.08)', color: 'var(--accent-cyan)', border: '1px solid rgba(41,121,255,0.2)' }}>
            <FlaskConical size={10} /> PAPER TRADING
          </span>
          <button onClick={fetchOrders}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => openOrderPanel('NIFTY', 'BUY')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)' }}>
            <Plus size={12} /> New Order
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
            style={{ background: 'rgba(var(--loss-rgb),0.08)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.2)' }}>
            <AlertCircle size={14} /> {error}
          </div>
        )}

        {/* Search */}
        {tab === 'history' && (
          <div className="flex items-center gap-3">
            {/* Summary cards */}
            <div className="flex gap-3 flex-1">
              {[
                { label: 'Total Bought',  value: totalBuy,  color: '#16a34a' },
                { label: 'Total Sold',    value: totalSell, color: '#dc2626' },
                { label: 'Total Orders',  value: orders.length, color: 'var(--accent-blue)', raw: true },
              ].map(s => (
                <div key={s.label} className="glass rounded-xl px-4 py-2.5 text-sm">
                  <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-label)' }}>{s.label}</div>
                  <div className="font-bold font-mono" style={{ color: s.color }}>
                    {s.raw ? s.value : `₹${formatNumber(s.value as number)}`}
                  </div>
                </div>
              ))}
            </div>
            <div className="relative">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-label)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search symbol…"
                className="pl-8 pr-3 h-9 rounded-xl text-xs outline-none w-48"
                style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--panel-divider)', color: 'var(--text-secondary)' }} />
            </div>
          </div>
        )}

        {/* Table */}
        {loading ? (
          <div className="py-12 text-center text-sm" style={{ color: 'var(--text-label)' }}>Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
              {tab === 'open' ? 'No pending orders' : 'No orders yet'}
            </div>
            <div className="text-xs mb-4" style={{ color: 'var(--text-label)' }}>
              {tab === 'open' ? 'Pending limit orders will appear here' : 'Your paper trade history will appear here'}
            </div>
            <button onClick={() => openOrderPanel('RELIANCE-EQ', 'BUY')}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)' }}>
              Place Paper Order
            </button>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--panel-divider)' }}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: 'var(--table-head-bg)', borderBottom: '1px solid var(--panel-divider)' }}>
                  {['Symbol', 'Side', 'Type', 'Qty', 'Price', 'Total', 'Status', 'Time', ''].map(h => (
                    <th key={h} className={`px-4 py-3 font-semibold uppercase tracking-wide ${h === 'Symbol' ? 'text-left' : 'text-right'}`}
                      style={{ color: 'var(--text-label)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(o => {
                  const st = STATUS_STYLE[o.status];
                  const total = o.price * o.quantity;
                  return (
                    <tr key={o.order_id} style={{ borderBottom: '1px solid var(--row-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td className="px-4 py-3">
                        <div className="font-bold" style={{ color: 'var(--text-bright)' }}>{o.symbol}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{o.exch_seg}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-bold text-[11px]"
                          style={{ color: o.transaction_type === 'BUY' ? '#16a34a' : '#dc2626' }}>
                          {o.transaction_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right" style={{ color: 'var(--text-dim)' }}>{o.order_type}</td>
                      <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>{o.quantity}</td>
                      <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {o.order_type === 'MARKET' ? 'MKT' : `₹${formatNumber(o.price)}`}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold" style={{ color: 'var(--text-accent)' }}>
                        ₹{formatNumber(total)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}>
                          {o.status}
                        </span>
                        {o.rejection_reason && (
                          <div className="text-[10px] mt-0.5" style={{ color: '#dc2626', opacity: 0.8 }}>{o.rejection_reason}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[11px]" style={{ color: 'var(--text-label)' }}>
                        {new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {o.status === 'PENDING' && (
                          <button
                            onClick={() => cancelOrder(o.order_id)}
                            disabled={cancelling === o.order_id}
                            className="text-[10px] px-2 py-0.5 rounded border font-semibold transition-opacity hover:opacity-75 disabled:opacity-40"
                            style={{ color: '#dc2626', borderColor: 'rgba(239,68,68,0.35)' }}>
                            {cancelling === o.order_id ? '…' : 'Cancel'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
