'use client';
import { useState, useRef, useEffect } from 'react';
import { Search, SlidersHorizontal, X, ChevronUp, ChevronDown, Plus, RefreshCw } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useAngelOneOrders } from '@/hooks/useAngelOneData';
import { useAngelOneStore } from '@/store/useAngelOneStore';
import { usePaperTradingStore } from '@/store/usePaperTradingStore';
import { formatNumber } from '@/lib/utils/format';

// ── Tab IDs (no Stock SIP) ────────────────────────────────────────────────────
type TabId = 'open' | 'history' | 'gtt' | 'basket' | 'alerts';

// ── Empty-state illustration (floating order form) ───────────────────────────
function EmptyIllustration() {
  return (
    <svg width="120" height="100" viewBox="0 0 120 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* floating dots */}
      <circle cx="20" cy="18" r="3" fill="#c7d2fe" opacity=".5"/>
      <circle cx="100" cy="12" r="4" fill="#e0e7ff" opacity=".6"/>
      <circle cx="108" cy="42" r="2.5" fill="#c7d2fe" opacity=".4"/>
      <circle cx="14" cy="58" r="2" fill="#e0e7ff" opacity=".5"/>
      {/* arrow */}
      <path d="M58 8 L64 2 L70 8" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="64" y1="2" x2="64" y2="16" stroke="#6366f1" strokeWidth="2" strokeLinecap="round"/>
      {/* document */}
      <rect x="30" y="28" width="60" height="56" rx="4" fill="white" stroke="#e2e8f0" strokeWidth="1.5"/>
      {/* green dot */}
      <circle cx="40" cy="42" r="5" fill="#22c55e"/>
      {/* text lines */}
      <rect x="50" y="39" width="28" height="3" rx="1.5" fill="#cbd5e1"/>
      <rect x="50" y="45" width="20" height="2.5" rx="1.25" fill="#e2e8f0"/>
      {/* button area */}
      <rect x="42" y="62" width="36" height="10" rx="2" fill="#e0e7ff"/>
      <rect x="48" y="65" width="24" height="4" rx="1" fill="#a5b4fc"/>
    </svg>
  );
}

// ── GTT / Basket / Alert illustration (smaller) ───────────────────────────────
function SmallIllustration() {
  return (
    <svg width="96" height="80" viewBox="0 0 96 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="14" r="2.5" fill="#c7d2fe" opacity=".5"/>
      <circle cx="80" cy="10" r="3" fill="#e0e7ff" opacity=".6"/>
      <circle cx="86" cy="34" r="2" fill="#c7d2fe" opacity=".4"/>
      <path d="M46 6 L50 2 L54 6" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      <line x1="50" y1="2" x2="50" y2="13" stroke="#6366f1" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="22" y="20" width="52" height="48" rx="4" fill="white" stroke="#e2e8f0" strokeWidth="1.5"/>
      <circle cx="32" cy="32" r="4.5" fill="#22c55e"/>
      <rect x="40" y="30" width="22" height="2.5" rx="1.25" fill="#cbd5e1"/>
      <rect x="40" y="35" width="16" height="2" rx="1" fill="#e2e8f0"/>
      <rect x="32" y="50" width="32" height="9" rx="2" fill="#e0e7ff"/>
      <rect x="37" y="53" width="22" height="3" rx="1" fill="#a5b4fc"/>
    </svg>
  );
}

// ── Product type badge (BUY/SELL + product) ───────────────────────────────────
function OrderBadges({ side, product }: { side: string; product: string }) {
  const isBuy = side === 'BUY';
  return (
    <div className="flex items-center gap-1">
      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
        style={isBuy
          ? { background: 'rgba(34,197,94,0.12)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }
          : { background: 'rgba(239,68,68,0.1)', color: '#dc2626', border: '1px solid rgba(239,68,68,0.2)' }}>
        {side}
      </span>
      {product && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(99,102,241,0.1)', color: '#6366f1', border: '1px solid rgba(99,102,241,0.2)' }}>
          {product === 'DELIVERY' ? 'DL' : product === 'INTRADAY' ? 'MIS' : product.slice(0, 4)}
        </span>
      )}
    </div>
  );
}

const STATUS_COLOR: Record<string, string> = {
  rejected:  '#dc2626',
  cancelled: '#dc2626',
  complete:  '#16a34a',
  open:      '#2563eb',
  pending:   '#d97706',
  modified:  '#7c3aed',
};

// ── Filter panel ──────────────────────────────────────────────────────────────
interface FilterState {
  exchanges: string[];
  actions:   string[];
  statuses:  string[];
  products:  string[];
}
const FILTER_DEFAULTS: FilterState = { exchanges: [], actions: [], statuses: [], products: [] };

function FilterDropdown({ active, onClose, onApply, allExchanges, allStatuses, allProducts }:
  { active: FilterState; onClose: () => void; onApply: (f: FilterState) => void;
    allExchanges: string[]; allStatuses: string[]; allProducts: string[] }) {
  const [f, setF] = useState<FilterState>(active);

  function toggle(key: keyof FilterState, val: string) {
    setF(prev => ({
      ...prev,
      [key]: prev[key].includes(val) ? prev[key].filter(v => v !== val) : [...prev[key], val],
    }));
  }
  const totalActive = f.exchanges.length + f.actions.length + f.statuses.length + f.products.length;

  return (
    <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl shadow-2xl min-w-[260px] overflow-hidden"
      style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-divider)' }}>
      <div className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Filter by</span>
          {totalActive > 0 && (
            <span className="text-xs font-bold px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(99,102,241,0.12)', color: '#6366f1' }}>
              {totalActive} {totalActive === 1 ? 'filter' : 'filters'}
            </span>
          )}
        </div>
        <button className="text-xs font-semibold" style={{ color: '#6366f1' }}
          onClick={() => { setF(FILTER_DEFAULTS); onApply(FILTER_DEFAULTS); }}>
          CLEAR ALL
        </button>
      </div>

      <div className="px-4 py-3 space-y-4 max-h-[360px] overflow-y-auto">
        {[
          { label: 'Exchanges',    key: 'exchanges' as const, items: allExchanges },
          { label: 'Action',       key: 'actions'   as const, items: ['Buy', 'Sell'] },
          { label: 'Status',       key: 'statuses'  as const, items: allStatuses },
          { label: 'Product Type', key: 'products'  as const, items: allProducts },
        ].map(({ label, key, items }) => items.length > 0 && (
          <div key={key}>
            <div className="text-xs font-bold mb-2" style={{ color: 'var(--text-secondary)' }}>{label}</div>
            <div className="space-y-1.5">
              {items.map(item => (
                <label key={item} className="flex items-center gap-2 cursor-pointer group">
                  <input type="checkbox" checked={f[key].includes(item)}
                    onChange={() => toggle(key, item)}
                    className="rounded accent-indigo-500 cursor-pointer" />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{item}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="px-4 py-3 flex gap-2" style={{ borderTop: '1px solid var(--panel-divider)' }}>
        <button onClick={onClose} className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: 'var(--card-inner-bg)', color: 'var(--text-secondary)', border: '1px solid var(--panel-divider)' }}>
          Cancel
        </button>
        <button onClick={() => { onApply(f); onClose(); }}
          className="flex-1 py-2 rounded-xl text-sm font-bold text-white transition-colors"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)' }}>
          Apply
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OrdersPage() {
  const { openOrderPanel }     = useUIStore();
  const { isConnected, mode }  = useAngelOneStore();
  const { trades: paperTrades, active: paperActive } = usePaperTradingStore();
  const isLive = isConnected && mode === 'live';
  const { data, loading, refetch } = useAngelOneOrders();

  const liveOrders = data?.orders ?? [];
  const liveTrades = data?.trades ?? [];

  const [tab, setTab]          = useState<TabId>('open');
  const [search, setSearch]    = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [filters, setFilters]  = useState<FilterState>(FILTER_DEFAULTS);
  const [sortField, setSortField] = useState<'symbol' | 'status' | null>(null);
  const [sortDir, setSortDir]  = useState<'asc' | 'desc'>('asc');
  const filterRef = useRef<HTMLDivElement>(null);

  // Build unique filter options from order data
  const allOrders = isLive ? liveOrders : (paperActive ? paperTrades.map(t => ({
    tradingsymbol: t.symbol, exchange: 'NSE', transactiontype: t.side,
    status: 'complete', producttype: 'DELIVERY', quantity: String(t.quantity),
    price: String(t.price), filledshares: String(t.quantity), averageprice: String(t.price),
    exchtime: new Date(t.timestamp).toLocaleString('en-IN'), orderid: t.id,
    ordertype: 'MARKET', text: '',
  })) : []);

  const allExchanges = Array.from(new Set(allOrders.map((o: any) => o.exchange).filter(Boolean)));
  const allStatuses  = Array.from(new Set(allOrders.map((o: any) => {
    const s = (o.status || '').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }).filter(Boolean)));
  const allProducts  = Array.from(new Set(allOrders.map((o: any) => {
    const p = (o.producttype || '').toLowerCase();
    if (p.includes('deliver')) return 'Delivery';
    if (p.includes('intraday') || p.includes('mis')) return 'Intraday';
    if (p.includes('margin')) return 'Margin';
    return o.producttype;
  }).filter(Boolean)));

  // Close filter on outside click
  useEffect(() => {
    if (!showFilter) return;
    function handler(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showFilter]);

  function sortOrders(orders: any[]) {
    if (!sortField) return orders;
    return [...orders].sort((a, b) => {
      const va = sortField === 'symbol' ? (a.tradingsymbol || '') : (a.status || '');
      const vb = sortField === 'symbol' ? (b.tradingsymbol || '') : (b.status || '');
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  function toggleSort(field: 'symbol' | 'status') {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  function SortIcon({ field }: { field: 'symbol' | 'status' }) {
    if (sortField !== field) return <span className="inline-flex flex-col" style={{ gap: 1 }}><ChevronUp size={9} style={{ opacity: 0.35 }}/><ChevronDown size={9} style={{ opacity: 0.35 }}/></span>;
    return sortDir === 'asc' ? <ChevronUp size={11} style={{ color: '#6366f1' }}/> : <ChevronDown size={11} style={{ color: '#6366f1' }}/>;
  }

  function filterOrders(orders: any[]) {
    return orders.filter(o => {
      const sym = (o.tradingsymbol || '').toLowerCase();
      if (search && !sym.includes(search.toLowerCase())) return false;
      if (filters.exchanges.length && !filters.exchanges.includes(o.exchange)) return false;
      if (filters.actions.length) {
        const side = (o.transactiontype || '').toLowerCase();
        const matchBuy  = filters.actions.includes('Buy')  && side === 'buy';
        const matchSell = filters.actions.includes('Sell') && side === 'sell';
        if (!matchBuy && !matchSell) return false;
      }
      if (filters.statuses.length) {
        const s = (o.status || '').toLowerCase();
        const matches = filters.statuses.some(f => s.includes(f.toLowerCase()));
        if (!matches) return false;
      }
      if (filters.products.length) {
        const p = (o.producttype || '').toLowerCase();
        const matches = filters.products.some(f => {
          if (f === 'Delivery') return p.includes('deliver');
          if (f === 'Intraday') return p.includes('intraday') || p.includes('mis');
          return p.includes(f.toLowerCase());
        });
        if (!matches) return false;
      }
      return true;
    });
  }

  const openOrders    = allOrders.filter((o: any) => ['open', 'trigger pending', 'modified'].includes((o.status || '').toLowerCase()));
  const historyOrders = sortOrders(filterOrders(allOrders));

  const totalBuyAmt   = allOrders.filter((o: any) => (o.transactiontype || '').toLowerCase() === 'buy' && (o.status || '').toLowerCase() === 'complete')
    .reduce((s: number, o: any) => s + (parseFloat(o.averageprice) * parseFloat(o.filledshares || '0') || 0), 0);
  const totalSellAmt  = allOrders.filter((o: any) => (o.transactiontype || '').toLowerCase() === 'sell' && (o.status || '').toLowerCase() === 'complete')
    .reduce((s: number, o: any) => s + (parseFloat(o.averageprice) * parseFloat(o.filledshares || '0') || 0), 0);
  const buyTxns       = allOrders.filter((o: any) => (o.transactiontype || '').toLowerCase() === 'buy').length;
  const sellTxns      = allOrders.filter((o: any) => (o.transactiontype || '').toLowerCase() === 'sell').length;

  const activeFilterCount = filters.exchanges.length + filters.actions.length + filters.statuses.length + filters.products.length;

  const TABS: { id: TabId; label: string; count?: number }[] = [
    { id: 'open',    label: 'Open Orders',    count: openOrders.length || undefined },
    { id: 'history', label: 'Order History',  count: allOrders.length || undefined },
    { id: 'gtt',     label: 'GTT' },
    { id: 'basket',  label: 'Basket Orders' },
    { id: 'alerts',  label: 'Alerts' },
  ];

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      {/* ── Tab header ── */}
      <div className="flex items-center gap-0" style={{ borderBottom: '2px solid var(--panel-divider)' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-5 py-3 text-sm font-medium transition-colors relative"
            style={{ color: tab === t.id ? '#4f46e5' : 'var(--text-label)' }}>
            {t.label}
            {t.count != null && t.count > 0 && (
              <span className="text-xs font-bold">({t.count})</span>
            )}
            {tab === t.id && (
              <span className="absolute bottom-[-2px] left-0 right-0 h-[2px] rounded-full"
                style={{ background: '#4f46e5' }} />
            )}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2 pb-1">
          <button onClick={refetch}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{ color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
          <button onClick={() => openOrderPanel('NIFTY', 'BUY')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
            style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)' }}>
            <Plus size={12} /> New Order
          </button>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="mt-4">

        {/* ── OPEN ORDERS ── */}
        {tab === 'open' && (
          openOrders.length > 0 ? (
            <OrderTable orders={openOrders} onReorder={openOrderPanel} showActions />
          ) : (
            <EmptyState
              illustration={<EmptyIllustration />}
              title="You don't have any open orders"
              subtitle="Your active orders will appear here once placed"
              action={{ label: 'NEW ORDER', onClick: () => openOrderPanel('NIFTY', 'BUY') }}
            />
          )
        )}

        {/* ── ORDER HISTORY ── */}
        {tab === 'history' && (
          <div className="space-y-0">
            {/* Search + filter bar */}
            <div className="flex items-center gap-3 pb-4">
              <div className="relative flex-1 max-w-sm">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: 'var(--text-label)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search"
                  className="w-full pl-9 pr-3 h-9 rounded-xl text-sm outline-none"
                  style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--panel-divider)', color: 'var(--text-secondary)' }} />
              </div>
              <div className="relative" ref={filterRef}>
                <button onClick={() => setShowFilter(v => !v)}
                  className="flex items-center justify-center w-9 h-9 rounded-xl transition-colors"
                  style={{
                    border: `1px solid ${showFilter || activeFilterCount > 0 ? '#6366f1' : 'var(--panel-divider)'}`,
                    color: showFilter || activeFilterCount > 0 ? '#6366f1' : 'var(--text-label)',
                    background: showFilter || activeFilterCount > 0 ? 'rgba(99,102,241,0.08)' : 'var(--card-inner-bg)',
                  }}>
                  <SlidersHorizontal size={15} />
                </button>
                {activeFilterCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full text-[9px] font-bold text-white flex items-center justify-center"
                    style={{ background: '#6366f1' }}>
                    {activeFilterCount}
                  </span>
                )}
                {showFilter && (
                  <FilterDropdown
                    active={filters}
                    onClose={() => setShowFilter(false)}
                    onApply={setFilters}
                    allExchanges={allExchanges}
                    allStatuses={allStatuses}
                    allProducts={allProducts}
                  />
                )}
              </div>
            </div>

            {/* Summary row */}
            <div className="grid grid-cols-3 gap-0 mb-4 rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--panel-divider)' }}>
              {[
                { label: 'Total Buy',     value: totalBuyAmt,  count: buyTxns,  color: '#16a34a' },
                { label: 'Total Sell',    value: totalSellAmt, count: sellTxns, color: '#dc2626' },
                { label: "Today's Charges", value: 0,          count: 0,        color: 'var(--text-secondary)' },
              ].map((s, i) => (
                <div key={s.label} className="px-5 py-4"
                  style={{ borderRight: i < 2 ? '1px solid var(--panel-divider)' : 'none' }}>
                  <div className="text-xs font-semibold mb-1" style={{ color: s.color }}>{s.label}</div>
                  <div className="text-base font-bold font-mono" style={{ color: 'var(--text-bright)' }}>
                    ₹{formatNumber(s.value)}
                  </div>
                  <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-label)' }}>
                    {s.count} Transaction{s.count !== 1 ? 's' : ''}
                  </div>
                </div>
              ))}
            </div>

            {/* Table */}
            {historyOrders.length === 0 ? (
              <EmptyState
                illustration={<EmptyIllustration />}
                title="No orders found"
                subtitle={search || activeFilterCount > 0 ? 'Try clearing your search or filters' : 'Orders placed today will appear here'}
              />
            ) : (
              <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--panel-divider)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: 'var(--table-head-bg)', borderBottom: '1px solid var(--panel-divider)' }}>
                      <th className="text-left px-4 py-3 text-xs font-semibold cursor-pointer select-none"
                        style={{ color: 'var(--text-label)' }} onClick={() => toggleSort('symbol')}>
                        <span className="flex items-center gap-1">Stock Name <SortIcon field="symbol" /></span>
                      </th>
                      <th className="text-left px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-label)' }}>Product Type</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-label)' }}>Qty.</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-label)' }}>Placed Price</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-label)' }}>Executed Price</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold" style={{ color: 'var(--text-label)' }}>LTP</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold cursor-pointer select-none"
                        style={{ color: 'var(--text-label)' }} onClick={() => toggleSort('status')}>
                        <span className="flex items-center justify-end gap-1">Status <SortIcon field="status" /></span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyOrders.map((o: any, i: number) => {
                      const status = (o.status || '').toLowerCase();
                      const statusColor = STATUS_COLOR[status] ?? 'var(--text-secondary)';
                      const filled = parseInt(o.filledshares || '0');
                      const total  = parseInt(o.quantity || '0');
                      const execPrice = parseFloat(o.averageprice || '0');
                      return (
                        <tr key={i} className="group"
                          style={{ borderBottom: '1px solid var(--row-border)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                          onMouseLeave={e => (e.currentTarget.style.background = '')}>
                          {/* Stock Name */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-sm" style={{ color: 'var(--text-bright)' }}>{o.tradingsymbol}</span>
                              <span className="text-[10px] font-semibold px-1 py-0.5 rounded"
                                style={{ background: 'rgba(100,116,139,0.1)', color: 'var(--text-label)' }}>
                                {o.exchange}
                              </span>
                            </div>
                          </td>
                          {/* Product Type */}
                          <td className="px-4 py-3">
                            <OrderBadges side={o.transactiontype || ''} product={o.producttype || ''} />
                          </td>
                          {/* Qty */}
                          <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {filled}/{total} Share{total !== 1 ? 's' : ''}
                          </td>
                          {/* Placed Price */}
                          <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                            {parseFloat(o.price || '0') > 0 ? `₹${formatNumber(parseFloat(o.price))}` : 'MKT'}
                          </td>
                          {/* Executed Price */}
                          <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: 'var(--text-label)' }}>
                            {execPrice > 0 ? `₹${formatNumber(execPrice)}` : '—'}
                          </td>
                          {/* LTP — placeholder */}
                          <td className="px-4 py-3 text-right font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                            —
                          </td>
                          {/* Status */}
                          <td className="px-4 py-3 text-right">
                            <div className="text-xs font-bold uppercase" style={{ color: statusColor }}>
                              {o.status?.toUpperCase()}
                            </div>
                            {o.exchtime && (
                              <div className="text-[10px] font-mono mt-0.5" style={{ color: 'var(--text-label)' }}>
                                {o.exchtime}
                              </div>
                            )}
                            {o.text && status === 'rejected' && (
                              <div className="text-[10px] mt-0.5 max-w-[180px] truncate text-right" style={{ color: '#dc2626', opacity: 0.75 }}>
                                {o.text}
                              </div>
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
        )}

        {/* ── GTT ── */}
        {tab === 'gtt' && (
          <EmptyState
            illustration={<SmallIllustration />}
            title="Oops!"
            subtitle="No Pending GTTs"
            action={{ label: 'CREATE GTT ORDER', onClick: () => {} }}
          />
        )}

        {/* ── BASKET ORDERS ── */}
        {tab === 'basket' && (
          <EmptyState
            illustration={<SmallIllustration />}
            title="Oops!"
            subtitle="No baskets. Create a basket by clicking the button below."
            action={{ label: 'CREATE BASKET', onClick: () => {} }}
          />
        )}

        {/* ── ALERTS ── */}
        {tab === 'alerts' && (
          <EmptyState
            illustration={<SmallIllustration />}
            title="Oops!"
            subtitle="No alerts created. Create an alert by clicking the button below"
            action={{ label: 'CREATE ALERT', onClick: () => {} }}
          />
        )}
      </div>
    </div>
  );
}

// ── Reusable empty state ──────────────────────────────────────────────────────
function EmptyState({ illustration, title, subtitle, action }:
  { illustration: React.ReactNode; title: string; subtitle?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3">
      {illustration}
      <div className="text-base font-semibold mt-2" style={{ color: 'var(--text-secondary)' }}>{title}</div>
      {subtitle && <div className="text-sm text-center max-w-xs" style={{ color: 'var(--text-label)' }}>{subtitle}</div>}
      {action && (
        <button onClick={action.onClick}
          className="mt-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg,#4f46e5,#6366f1)' }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

// ── Simple order table for open orders ───────────────────────────────────────
function OrderTable({ orders, onReorder, showActions }:
  { orders: any[]; onReorder: (sym: string, side: 'BUY'|'SELL') => void; showActions?: boolean }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--panel-divider)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--table-head-bg)', borderBottom: '1px solid var(--panel-divider)' }}>
            {['Stock Name', 'Product Type', 'Qty.', 'Placed Price', 'Executed Price', 'LTP', 'Status'].map(h => (
              <th key={h} className={`px-4 py-3 text-xs font-semibold ${h === 'Stock Name' ? 'text-left' : 'text-right'}`}
                style={{ color: 'var(--text-label)' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orders.map((o: any, i: number) => {
            const status = (o.status || '').toLowerCase();
            const statusColor = STATUS_COLOR[status] ?? 'var(--text-secondary)';
            const filled = parseInt(o.filledshares || '0');
            const total  = parseInt(o.quantity || '0');
            return (
              <tr key={i} style={{ borderBottom: '1px solid var(--row-border)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = '')}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold" style={{ color: 'var(--text-bright)' }}>{o.tradingsymbol}</span>
                    <span className="text-[10px] px-1 py-0.5 rounded"
                      style={{ background: 'rgba(100,116,139,0.1)', color: 'var(--text-label)' }}>{o.exchange}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <OrderBadges side={o.transactiontype || ''} product={o.producttype || ''} />
                </td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {filled}/{total}
                </td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {parseFloat(o.price || '0') > 0 ? `₹${formatNumber(parseFloat(o.price))}` : 'MKT'}
                </td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-label)' }}>
                  {parseFloat(o.averageprice || '0') > 0 ? `₹${formatNumber(parseFloat(o.averageprice))}` : '—'}
                </td>
                <td className="px-4 py-3 text-right font-mono" style={{ color: 'var(--text-secondary)' }}>—</td>
                <td className="px-4 py-3 text-right">
                  <div className="text-xs font-bold uppercase" style={{ color: statusColor }}>{o.status?.toUpperCase()}</div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
