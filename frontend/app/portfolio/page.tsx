'use client';
import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown, RefreshCw, FlaskConical, AlertCircle } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { formatCurrency, formatNumber } from '@/lib/utils/format';

const API_BASE = process.env.NEXT_PUBLIC_STRATEGY_API_URL ?? '';

function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const t = sessionStorage.getItem('tk_access_token') ?? localStorage.getItem('tk_access_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

interface Balance  { total: number; available: number; locked_balance: number; }
interface Position {
  position_id: string; token: string; symbol: string; exch_seg: string;
  quantity: number; average_price: number;
  ltp: number; high: number | null; low: number | null; prev_close: number | null;
  pnl: number; pnl_pct: number;
}

function c(v: number) { return v >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'; }

export default function PortfolioPage() {
  const { openOrderPanel } = useUIStore();
  const [balance,   setBalance]   = useState<Balance   | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [balRes, posRes] = await Promise.all([
        fetch(`${API_BASE}/api/paper/user/balance`,        { headers: authHeaders() }),
        fetch(`${API_BASE}/api/paper/portfolio/positions`, { headers: authHeaders() }),
      ]);
      if (balRes.ok) setBalance(await balRes.json());
      if (posRes.ok) {
        const data = await posRes.json();
        setPositions(data.positions ?? []);
      }
      if (!balRes.ok || !posRes.ok) setError('Could not load portfolio — is strategy-api running?');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const totalInvested = positions.reduce((s, p) => s + p.average_price * Math.abs(p.quantity), 0);
  const totalCurrent  = positions.reduce((s, p) => s + p.ltp          * Math.abs(p.quantity), 0);
  const totalPnl      = positions.reduce((s, p) => s + p.pnl, 0);
  const lockedBalance = balance?.locked_balance ?? 0;

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4 space-y-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-bright)' }}>Portfolio</h1>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: 'rgba(41,121,255,0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(41,121,255,0.25)' }}>
            <FlaskConical size={9} /> PAPER TRADING
          </span>
        </div>
        <button onClick={fetchAll}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
          style={{ color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl text-sm"
          style={{ background: 'rgba(var(--loss-rgb),0.08)', color: 'var(--accent-red)', border: '1px solid rgba(var(--loss-rgb),0.2)' }}>
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Balance stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
        {[
          { label: 'Total Portfolio',  value: balance ? formatCurrency(balance.total,     true) : '—', pnl: null,     col: '41,121,255' },
          { label: 'Available Cash',   value: balance ? formatCurrency(balance.available,  true) : '—', pnl: null,     col: '0,212,255'  },
          { label: 'Margin Blocked',   value: balance ? formatCurrency(lockedBalance,      true) : '—', pnl: null,     col: '245,158,11' },
          { label: 'Invested',         value: totalInvested > 0 ? formatCurrency(totalInvested, true) : '—', pnl: null, col: '41,121,255' },
          { label: 'Current Value',    value: totalCurrent  > 0 ? formatCurrency(totalCurrent,  true) : '—', pnl: null, col: '0,212,255'  },
          { label: 'Unrealised P&L',   value: positions.length > 0 ? formatCurrency(Math.abs(totalPnl), true) : '—', pnl: positions.length > 0 ? totalPnl : null, col: '' },
        ].map(s => (
          <div key={s.label} className="glass rounded-xl p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--text-label)' }}>{s.label}</div>
            <div className="text-sm font-bold font-mono"
              style={{ color: s.pnl !== null ? c(s.pnl) : s.col ? `rgb(${s.col})` : 'var(--text-bright)' }}>
              {s.pnl !== null && s.pnl >= 0 ? '+' : ''}{s.value}
            </div>
            {s.pnl !== null && (
              <div className="flex items-center gap-0.5 mt-0.5">
                {s.pnl >= 0
                  ? <TrendingUp  size={9} style={{ color: 'var(--accent-green)' }} />
                  : <TrendingDown size={9} style={{ color: 'var(--accent-red)'   }} />}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Positions table */}
      <div className="glass rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-bright)' }}>
            Holdings ({positions.length})
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs" style={{ color: 'var(--text-label)' }}>Loading…</div>
        ) : positions.length === 0 ? (
          <div className="py-16 text-center">
            <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>No positions yet</div>
            <div className="text-xs mb-4" style={{ color: 'var(--text-label)' }}>Place a paper trade to see your portfolio here</div>
            <button onClick={() => openOrderPanel('RELIANCE-EQ', 'BUY')}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white"
              style={{ background: 'linear-gradient(135deg,#16a34a,#22c55e)' }}>
              Buy Your First Paper Stock
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
                <tr>
                  {['Symbol', 'Qty', 'Avg Price', 'LTP', 'H', 'L', 'Invested', 'Current', 'P&L', 'P&L %', ''].map(h => (
                    <th key={h} className="text-left px-3 py-2.5 font-semibold uppercase tracking-wider text-[11px] whitespace-nowrap"
                      style={{ color: 'var(--text-label)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {positions.map(p => {
                  const invested = p.average_price * Math.abs(p.quantity);
                  const current  = p.ltp           * Math.abs(p.quantity);
                  return (
                    <tr key={p.position_id} className="group transition-colors hover:bg-white/[0.02]"
                      style={{ borderBottom: '1px solid var(--row-border)' }}>
                      <td className="px-3 py-3">
                        <div className="font-bold text-xs" style={{ color: 'var(--text-secondary)' }}>{p.symbol}</div>
                        <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{p.exch_seg}</div>
                      </td>
                      <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>{p.quantity}</td>
                      <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-dim)' }}>₹{formatNumber(p.average_price)}</td>
                      <td className="px-3 py-3 font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                        <span className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-green)' }} />
                          ₹{formatNumber(p.ltp)}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px]" style={{ color: 'var(--accent-green)' }}>
                        {p.high ? formatNumber(p.high) : '—'}
                      </td>
                      <td className="px-3 py-3 font-mono text-[11px]" style={{ color: 'var(--accent-red)' }}>
                        {p.low ? formatNumber(p.low) : '—'}
                      </td>
                      <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-dim)' }}>{formatCurrency(invested, true)}</td>
                      <td className="px-3 py-3 font-mono" style={{ color: 'var(--text-accent)' }}>{formatCurrency(current, true)}</td>
                      <td className="px-3 py-3 font-mono font-bold" style={{ color: c(p.pnl) }}>
                        {p.pnl >= 0 ? '+' : ''}₹{formatNumber(Math.abs(p.pnl))}
                      </td>
                      <td className="px-3 py-3">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                          style={{
                            color: c(p.pnl_pct),
                            background: p.pnl_pct >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${p.pnl_pct >= 0 ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
                          }}>
                          {p.pnl_pct >= 0 ? '+' : ''}{p.pnl_pct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="hidden group-hover:flex items-center gap-1">
                          <button onClick={() => openOrderPanel(p.symbol, 'BUY',  p.token)}
                            className="px-2 py-1 rounded text-[10px] font-semibold"
                            style={{ background: 'rgba(var(--gain-rgb),0.15)', color: 'var(--accent-green)' }}>Buy+</button>
                          <button onClick={() => openOrderPanel(p.symbol, 'SELL', p.token)}
                            className="px-2 py-1 rounded text-[10px] font-semibold"
                            style={{ background: 'rgba(var(--loss-rgb),0.15)', color: 'var(--accent-red)' }}>Sell</button>
                        </div>
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
