'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, Search, X, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { formatNumber } from '@/lib/utils/format';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Balance {
  total: number;
  available: number;
  locked_balance: number;
}

interface Position {
  position_id: string;
  token: string;
  symbol: string;
  exch_seg: string;
  quantity: number;
  average_price: number;
  ltp: number;
  high: number | null;
  low: number | null;
  prev_close: number | null;
  pnl: number;
  pnl_pct: number;
}

interface Order {
  order_id: string;
  symbol: string;
  exch_seg: string;
  transaction_type: 'BUY' | 'SELL';
  order_type: 'MARKET' | 'LIMIT';
  price: number;
  quantity: number;
  status: 'PENDING' | 'EXECUTED' | 'REJECTED' | 'CANCELLED';
  rejection_reason: string | null;
  created_at: string;
}

interface ScripResult {
  token: string;
  symbol: string;
  name: string;
  exch_seg: string;
  instrumenttype: string;
  lotsize: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_STRATEGY_API_URL ?? '';

function authHeaders(token: string | null): HeadersInit {
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useApiToken(): string | null {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('tk_access_token') ?? localStorage.getItem('tk_access_token');
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BalanceCard({ balance, onRefresh }: { balance: Balance | null; onRefresh: () => void }) {
  return (
    <div className="grid grid-cols-3 gap-3 mb-4">
      {[
        { label: 'Total Portfolio', value: balance?.total, accent: 'var(--accent-cyan)' },
        { label: 'Available Cash', value: balance?.available, accent: 'var(--accent-green)' },
        { label: 'Margin Blocked', value: balance?.locked_balance, accent: 'var(--accent-yellow, #fbbf24)' },
      ].map(({ label, value, accent }) => (
        <div key={label} className="rounded-xl p-3 border"
          style={{ background: 'var(--card-inner-bg)', borderColor: 'var(--card-inner-border)' }}>
          <div className="text-[10px] font-semibold uppercase tracking-wide mb-1" style={{ color: 'var(--text-label)' }}>
            {label}
          </div>
          <div className="font-mono font-bold text-base" style={{ color: accent }}>
            {value !== undefined ? `₹${formatNumber(value)}` : '—'}
          </div>
        </div>
      ))}
      <button onClick={onRefresh} className="absolute top-3 right-3 p-1 rounded opacity-60 hover:opacity-100 transition-opacity"
        style={{ color: 'var(--text-dim)' }}>
        <RefreshCw size={12} />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: Order['status'] }) {
  const map: Record<Order['status'], { color: string; bg: string; Icon: typeof CheckCircle }> = {
    EXECUTED:  { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   Icon: CheckCircle  },
    PENDING:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  Icon: Clock        },
    CANCELLED: { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', Icon: X            },
    REJECTED:  { color: '#ef4444', bg: 'rgba(239,68,68,0.12)',   Icon: AlertCircle  },
  };
  const { color, bg, Icon } = map[status];
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
      style={{ color, background: bg }}>
      <Icon size={9} />
      {status}
    </span>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function PaperTradingPanel() {
  const token = useApiToken();
  const [tab, setTab]               = useState<'positions' | 'orders' | 'place'>('positions');
  const [balance, setBalance]       = useState<Balance | null>(null);
  const [positions, setPositions]   = useState<Position[]>([]);
  const [orders, setOrders]         = useState<Order[]>([]);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // Order form state
  const [scripQuery, setScripQuery] = useState('');
  const [scripResults, setScripResults] = useState<ScripResult[]>([]);
  const [selectedScrip, setSelectedScrip] = useState<ScripResult | null>(null);
  const [txType, setTxType]         = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType]   = useState<'MARKET' | 'LIMIT'>('MARKET');
  const [qty, setQty]               = useState('1');
  const [limitPrice, setLimitPrice] = useState('');
  const [placing, setPlacing]       = useState(false);
  const [placeResult, setPlaceResult] = useState<{ status: string; message: string } | null>(null);

  const headers = authHeaders(token);

  const fetchBalance = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/paper/user/balance`, { headers });
      if (r.ok) setBalance(await r.json());
    } catch { /* non-fatal */ }
  }, [token]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/paper/portfolio/positions`, { headers });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setPositions(data.positions ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);  // eslint-disable-line react-hooks/exhaustive-deps

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API_BASE}/api/paper/portfolio/orders`, { headers });
      if (!r.ok) throw new Error(await r.text());
      const data = await r.json();
      setOrders(data.orders ?? []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  useEffect(() => {
    if (tab === 'positions') fetchPositions();
    else if (tab === 'orders') fetchOrders();
  }, [tab, fetchPositions, fetchOrders]);

  // Scrip search with debounce
  useEffect(() => {
    if (scripQuery.length < 2) { setScripResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`${API_BASE}/api/scrip/search?q=${encodeURIComponent(scripQuery)}`, { headers });
        if (r.ok) {
          const d = await r.json();
          setScripResults(d.results ?? []);
        }
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [scripQuery]);  // eslint-disable-line react-hooks/exhaustive-deps

  const cancelOrder = async (orderId: string) => {
    try {
      const r = await fetch(`${API_BASE}/api/paper/orders/cancel`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ order_id: orderId }),
      });
      if (r.ok) fetchOrders();
    } catch { /* ignore */ }
  };

  const placeOrder = async () => {
    if (!selectedScrip || !qty) return;
    setPlacing(true);
    setPlaceResult(null);
    try {
      const body: Record<string, unknown> = {
        token: selectedScrip.token,
        transaction_type: txType,
        order_type: orderType,
        quantity: parseInt(qty, 10),
      };
      if (orderType === 'LIMIT') body.price = parseFloat(limitPrice);

      const r = await fetch(`${API_BASE}/api/paper/orders/place`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data = await r.json();
      if (r.ok) {
        setPlaceResult({ status: data.status, message: data.status === 'EXECUTED' ? `Executed @ ₹${formatNumber(data.price)}` : data.reason ?? data.status });
        fetchBalance();
      } else {
        setPlaceResult({ status: 'ERROR', message: data.error ?? 'Failed to place order' });
      }
    } catch (e) {
      setPlaceResult({ status: 'ERROR', message: (e as Error).message });
    } finally {
      setPlacing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" style={{ color: 'var(--text-secondary)' }}>

      {/* Balance cards */}
      <div className="relative px-4 pt-4">
        <BalanceCard balance={balance} onRefresh={fetchBalance} />
      </div>

      {/* Tabs */}
      <div className="flex border-b px-4" style={{ borderColor: 'var(--panel-divider)' }}>
        {(['positions', 'orders', 'place'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide border-b-2 transition-colors"
            style={tab === t
              ? { borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)' }
              : { borderColor: 'transparent', color: 'var(--text-dim)' }}>
            {t === 'place' ? 'Place Order' : t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto px-4 py-3">
        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg text-xs flex items-center gap-2"
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
            <AlertCircle size={12} /> {error}
          </div>
        )}

        {/* ── Positions tab ── */}
        {tab === 'positions' && (
          loading ? <div className="text-center py-8 text-xs" style={{ color: 'var(--text-label)' }}>Loading…</div>
          : positions.length === 0 ? (
            <div className="text-center py-12 text-xs" style={{ color: 'var(--text-label)' }}>
              No open positions. Place a paper trade to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                    {['Symbol', 'Qty', 'Avg', 'LTP', 'H', 'L', 'P&L', '%'].map(h => (
                      <th key={h} className="py-2 px-2 text-left font-semibold text-[10px] uppercase tracking-wide"
                        style={{ color: 'var(--text-label)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {positions.map(p => (
                    <tr key={p.position_id} style={{ borderBottom: '1px solid var(--row-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td className="py-2 px-2">
                        <div className="font-bold" style={{ color: 'var(--text-bright)' }}>{p.symbol}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{p.exch_seg}</div>
                      </td>
                      <td className="py-2 px-2 font-mono">{p.quantity}</td>
                      <td className="py-2 px-2 font-mono">{formatNumber(p.average_price)}</td>
                      <td className="py-2 px-2 font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                        {formatNumber(p.ltp)}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px]" style={{ color: 'var(--accent-green)' }}>
                        {p.high ? formatNumber(p.high) : '—'}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px]" style={{ color: 'var(--accent-red)' }}>
                        {p.low ? formatNumber(p.low) : '—'}
                      </td>
                      <td className="py-2 px-2 font-mono font-semibold"
                        style={{ color: p.pnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {p.pnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(p.pnl))}
                      </td>
                      <td className="py-2 px-2 font-mono text-[11px]"
                        style={{ color: p.pnl_pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {p.pnl_pct >= 0 ? '+' : ''}{p.pnl_pct.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Orders tab ── */}
        {tab === 'orders' && (
          loading ? <div className="text-center py-8 text-xs" style={{ color: 'var(--text-label)' }}>Loading…</div>
          : orders.length === 0 ? (
            <div className="text-center py-12 text-xs" style={{ color: 'var(--text-label)' }}>No order history yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                    {['Symbol', 'Side', 'Type', 'Qty', 'Price', 'Status', 'Time', ''].map(h => (
                      <th key={h} className="py-2 px-2 text-left font-semibold text-[10px] uppercase tracking-wide"
                        style={{ color: 'var(--text-label)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map(o => (
                    <tr key={o.order_id} style={{ borderBottom: '1px solid var(--row-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <td className="py-2 px-2 font-bold" style={{ color: 'var(--text-bright)' }}>{o.symbol}</td>
                      <td className="py-2 px-2">
                        <span className="font-bold text-[10px]"
                          style={{ color: o.transaction_type === 'BUY' ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {o.transaction_type}
                        </span>
                      </td>
                      <td className="py-2 px-2 text-[10px]" style={{ color: 'var(--text-dim)' }}>{o.order_type}</td>
                      <td className="py-2 px-2 font-mono">{o.quantity}</td>
                      <td className="py-2 px-2 font-mono">₹{formatNumber(o.price)}</td>
                      <td className="py-2 px-2"><StatusBadge status={o.status} /></td>
                      <td className="py-2 px-2 text-[10px]" style={{ color: 'var(--text-label)' }}>
                        {new Date(o.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-2 px-2">
                        {o.status === 'PENDING' && (
                          <button onClick={() => cancelOrder(o.order_id)}
                            className="text-[10px] px-2 py-0.5 rounded border transition-colors hover:opacity-75"
                            style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.35)' }}>
                            Cancel
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {/* ── Place order tab ── */}
        {tab === 'place' && (
          <div className="max-w-sm mx-auto space-y-4">

            {/* Scrip search */}
            <div>
              <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1.5"
                style={{ color: 'var(--text-label)' }}>Search Instrument</label>
              <div className="relative">
                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-dim)' }} />
                <input
                  value={scripQuery}
                  onChange={e => { setScripQuery(e.target.value); setSelectedScrip(null); }}
                  placeholder="Symbol or company name…"
                  className="w-full pl-8 pr-3 py-2 rounded-lg text-xs outline-none"
                  style={{
                    background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)',
                    color: 'var(--text-secondary)',
                  }}
                />
              </div>
              {scripResults.length > 0 && !selectedScrip && (
                <div className="mt-1 rounded-lg overflow-hidden border shadow-lg"
                  style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-med)' }}>
                  {scripResults.map(r => (
                    <button key={r.token} onClick={() => { setSelectedScrip(r); setScripQuery(r.symbol); setScripResults([]); }}
                      className="w-full flex items-center gap-3 px-3 py-2 text-left text-xs transition-colors"
                      style={{ borderBottom: '1px solid var(--row-border)' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <div>
                        <div className="font-bold" style={{ color: 'var(--text-bright)' }}>{r.symbol}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{r.name} · {r.exch_seg} · {r.instrumenttype}</div>
                      </div>
                      <span className="ml-auto text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>Lot: {r.lotsize}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {selectedScrip && (
              <>
                {/* BUY / SELL toggle */}
                <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--card-inner-border)' }}>
                  {(['BUY', 'SELL'] as const).map(side => (
                    <button key={side} onClick={() => setTxType(side)}
                      className="flex-1 py-2 text-xs font-bold transition-colors"
                      style={txType === side
                        ? { background: side === 'BUY' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: side === 'BUY' ? '#22c55e' : '#ef4444' }
                        : { color: 'var(--text-dim)' }}>
                      {side}
                    </button>
                  ))}
                </div>

                {/* MARKET / LIMIT toggle */}
                <div className="flex gap-2">
                  {(['MARKET', 'LIMIT'] as const).map(ot => (
                    <button key={ot} onClick={() => setOrderType(ot)}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors"
                      style={orderType === ot
                        ? { background: 'rgba(41,121,255,0.12)', borderColor: 'rgba(41,121,255,0.4)', color: 'var(--accent-cyan)' }
                        : { borderColor: 'var(--card-inner-border)', color: 'var(--text-dim)' }}>
                      {ot}
                    </button>
                  ))}
                </div>

                {/* Quantity */}
                <div>
                  <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                    style={{ color: 'var(--text-label)' }}>Quantity</label>
                  <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none"
                    style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                  />
                  <div className="text-[10px] mt-1" style={{ color: 'var(--text-label)' }}>
                    Lot size: {selectedScrip.lotsize}
                  </div>
                </div>

                {/* Limit price (only for LIMIT orders) */}
                {orderType === 'LIMIT' && (
                  <div>
                    <label className="text-[10px] font-semibold uppercase tracking-wide block mb-1"
                      style={{ color: 'var(--text-label)' }}>Limit Price (₹)</label>
                    <input type="number" step="0.05" value={limitPrice} onChange={e => setLimitPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none"
                      style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-secondary)' }}
                    />
                  </div>
                )}

                {/* Result */}
                {placeResult && (
                  <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                    style={{
                      background: placeResult.status === 'EXECUTED' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                      border: `1px solid ${placeResult.status === 'EXECUTED' ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                      color: placeResult.status === 'EXECUTED' ? '#22c55e' : '#ef4444',
                    }}>
                    {placeResult.status === 'EXECUTED' ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                    {placeResult.message}
                  </div>
                )}

                {/* Place button */}
                <button onClick={placeOrder} disabled={placing}
                  className="w-full py-2.5 rounded-lg text-sm font-bold transition-all disabled:opacity-50"
                  style={{
                    background: txType === 'BUY'
                      ? 'linear-gradient(135deg, #16a34a, #22c55e)'
                      : 'linear-gradient(135deg, #dc2626, #ef4444)',
                    color: '#fff',
                  }}>
                  {placing ? 'Placing…' : `${txType} ${orderType}`}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
