'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, Minus, RefreshCw, Loader2, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import type { OptionChainResponse, OptionChainRow, OIAnalytics } from '@/lib/optionchain/types';

// ── Constants ──────────────────────────────────────────────────────────────────
const B = '41,121,255';
const C = '0,212,255';
const SYMBOLS = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'SBIN'];
const FILTERS  = ['All Strikes', 'Near ATM', 'Calls Only', 'Puts Only', 'High OI', 'IV Rank'] as const;
type Filter    = typeof FILTERS[number];

const glass = {
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-divider)',
  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
} as const;

const inputStyle = {
  background: 'var(--field-bg)',
  border: '1px solid var(--field-border)',
  color: 'var(--text-secondary)',
  outline: 'none',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null, digits = 0): string {
  if (n == null) return '-';
  return n.toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

function fmtK(n: number | undefined | null): string {
  if (n == null) return '-';
  if (Math.abs(n) >= 1_00_000) return (n / 1_00_000).toFixed(1) + 'L';
  if (Math.abs(n) >= 1000)     return (n / 1000).toFixed(0) + 'K';
  return String(n);
}

function fmtOIChange(n: number | undefined | null): string {
  if (n == null) return '-';
  const prefix = n > 0 ? '+' : '';
  return prefix + fmtK(n);
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function AnalyticsBar({ a, atm, spot }: { a: OIAnalytics; atm: number; spot: number }) {
  const totalOI = a.totalCallOI + a.totalPutOI;
  const pePct   = totalOI ? (a.totalPutOI  / totalOI) * 100 : 50;
  const cePct   = totalOI ? (a.totalCallOI / totalOI) * 100 : 50;

  return (
    <div className="rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-4 text-xs" style={glass}>
      {/* Spot */}
      <div className="flex items-center gap-2">
        <span className="font-bold text-sm" style={{ color: 'var(--text-bright)' }}>
          {fmt(spot, 2)}
        </span>
      </div>
      <div className="h-4 w-px" style={{ background: 'var(--panel-divider)' }} />
      {/* ATM */}
      <span style={{ color: 'var(--text-dim)' }}>
        ATM: <span style={{ color: `rgb(${C})` }}>{fmt(atm)}</span>
      </span>
      {/* PCR */}
      <span className="px-2 py-0.5 rounded text-xs font-semibold"
        style={{ background: `rgba(${B},0.15)`, color: `rgb(${C})` }}>
        PCR: {a.pcr.toFixed(3)}
      </span>
      {/* Max Pain */}
      <span style={{ color: 'var(--text-dim)' }}>
        Max Pain: <span style={{ color: 'var(--text-accent)' }}>{fmt(a.maxPain)}</span>
      </span>
      {/* OI Bar */}
      <div className="ml-auto flex items-center gap-2 min-w-[200px]">
        <span style={{ color: 'var(--accent-green)' }} className="text-[10px] font-semibold w-10 text-right">
          {cePct.toFixed(0)}% CE
        </span>
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--panel-divider)' }}>
          <div className="h-full flex">
            <div style={{ width: `${cePct}%`, background: 'var(--accent-green)' }} />
            <div style={{ width: `${pePct}%`, background: 'var(--accent-red)' }} />
          </div>
        </div>
        <span style={{ color: 'var(--accent-red)' }} className="text-[10px] font-semibold w-10">
          PE {pePct.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

function OIBarCell({ oi, max }: { oi: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (oi / max) * 100) : 0;
  return (
    <div className="flex items-center gap-1 justify-end">
      <div className="w-10 h-1 rounded-full overflow-hidden" style={{ background: 'var(--panel-divider)' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: `rgba(${B},0.5)` }} />
      </div>
      <span>{fmtK(oi)}</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function OptionChain() {
  const { openOrderPanel } = useUIStore();

  const [symbol,      setSymbolState] = useState('NIFTY');
  const [symbolInput, setSymbolInput] = useState('NIFTY');
  const [expiries,    setExpiries]    = useState<string[]>([]);
  const [expiry,      setExpiry]      = useState('');
  const [chain,       setChain]       = useState<OptionChainResponse | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [filter,      setFilter]      = useState<Filter>('All Strikes');
  const [strikeCount, setStrikeCount] = useState(15);
  const [live,        setLive]        = useState(false);
  const [lastTick,    setLastTick]    = useState<string>('');

  const esRef = useRef<EventSource | null>(null);

  // ── Expiry fetch ────────────────────────────────────────────────────────────

  const fetchExpiries = useCallback(async (sym: string) => {
    try {
      const r = await fetch(`/api/optionchain/expiries?symbol=${sym}`, { cache: 'no-store' });
      if (!r.ok) throw new Error('No expiries found');
      const d = await r.json() as { expiries: string[]; nearest: string };
      setExpiries(d.expiries);
      setExpiry(d.nearest);
    } catch {
      setExpiries([]);
      setExpiry('');
    }
  }, []);

  useEffect(() => { fetchExpiries(symbol); }, [symbol, fetchExpiries]);

  // ── Chain fetch ─────────────────────────────────────────────────────────────

  const fetchChain = useCallback(async (sym: string, exp: string) => {
    if (!sym || !exp) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/optionchain?symbol=${sym}&expiry=${exp}&strikeCount=${strikeCount}`,
        { cache: 'no-store' },
      );
      if (!r.ok) {
        const e = await r.json() as { error: string };
        throw new Error(e.error ?? 'Failed to load option chain');
      }
      const d = await r.json() as OptionChainResponse;
      setChain(d);
      setLastTick(new Date().toLocaleTimeString());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [strikeCount]);

  useEffect(() => {
    if (symbol && expiry) fetchChain(symbol, expiry);
  }, [symbol, expiry, fetchChain]);

  // ── SSE live stream ─────────────────────────────────────────────────────────

  const startLive = useCallback(() => {
    if (!symbol || !expiry) return;
    esRef.current?.close();

    const es = new EventSource(
      `/api/optionchain/stream?symbol=${symbol}&expiry=${expiry}&strikeCount=${strikeCount}`,
    );

    es.addEventListener('snapshot', (e) => {
      const d = JSON.parse(e.data) as OptionChainResponse;
      setChain(d);
      setLastTick(new Date().toLocaleTimeString());
    });

    es.addEventListener('delta', (e) => {
      const delta = JSON.parse(e.data) as Partial<OptionChainResponse> & { changedRows: number[] };
      setChain(prev => {
        if (!prev) return prev;
        const updatedRows = prev.rows.map(row => {
          const updated = delta.rows?.find(r => r.strike === row.strike);
          return updated ?? row;
        });
        return {
          ...prev,
          spot:      delta.spot      ?? prev.spot,
          atm:       delta.atm       ?? prev.atm,
          analytics: delta.analytics ?? prev.analytics,
          rows:      updatedRows,
          timestamp: delta.timestamp ?? prev.timestamp,
        };
      });
      setLastTick(new Date().toLocaleTimeString());
    });

    es.onerror = () => {
      setLive(false);
      es.close();
    };

    esRef.current = es;
    setLive(true);
  }, [symbol, expiry, strikeCount]);

  const stopLive = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    setLive(false);
  }, []);

  useEffect(() => () => { esRef.current?.close(); }, []);

  // ── Symbol submit ───────────────────────────────────────────────────────────

  const applySymbol = () => {
    const s = symbolInput.trim().toUpperCase();
    if (s) { stopLive(); setSymbolState(s); }
  };

  // ── Filtered rows ───────────────────────────────────────────────────────────

  const rows: OptionChainRow[] = React.useMemo(() => {
    if (!chain) return [];
    let r = chain.rows;
    if (filter === 'Near ATM')    r = r.filter(x => Math.abs(x.strike - chain.atm) <= chain.strikeInterval * 5);
    if (filter === 'Calls Only')  r = r.filter(x => x.ce != null);
    if (filter === 'Puts Only')   r = r.filter(x => x.pe != null);
    if (filter === 'High OI')     r = [...r].sort((a, b) => ((b.ce?.oi ?? 0) + (b.pe?.oi ?? 0)) - ((a.ce?.oi ?? 0) + (a.pe?.oi ?? 0)));
    if (filter === 'IV Rank')     r = [...r].sort((a, b) => ((b.ce?.iv ?? 0) + (b.pe?.iv ?? 0)) - ((a.ce?.iv ?? 0) + (a.pe?.iv ?? 0)));
    return r;
  }, [chain, filter]);

  const maxOI = React.useMemo(
    () => Math.max(...rows.flatMap(r => [r.ce?.oi ?? 0, r.pe?.oi ?? 0])),
    [rows],
  );

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">

      {/* Controls */}
      <div className="rounded-xl p-3 flex flex-wrap items-center gap-2" style={glass}>
        {/* Symbol input */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-label)' }} />
            <input
              value={symbolInput}
              onChange={e => setSymbolInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && applySymbol()}
              className="pl-8 pr-2 h-8 rounded-lg text-sm w-28 font-medium"
              style={inputStyle}
              placeholder="Symbol"
              list="oc-symbols"
            />
            <datalist id="oc-symbols">
              {SYMBOLS.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>
          <button onClick={applySymbol}
            className="h-8 px-2.5 rounded-lg text-xs font-semibold"
            style={{ background: `rgba(${B},0.2)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.3)` }}>
            Go
          </button>
        </div>

        {/* Expiry */}
        <select value={expiry} onChange={e => { stopLive(); setExpiry(e.target.value); }}
          className="h-8 px-2 rounded-lg text-sm"
          style={inputStyle}>
          {expiries.length === 0
            ? <option value="">Loading…</option>
            : expiries.map(e => <option key={e} value={e} style={{ background: 'var(--option-bg)' }}>{e}</option>)
          }
        </select>

        {/* Strike count */}
        <div className="flex items-center gap-1">
          <span className="text-xs" style={{ color: 'var(--text-label)' }}>Strikes:</span>
          <button onClick={() => setStrikeCount(c => Math.max(5, c - 5))}
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-accent)' }}>
            <Minus size={10} />
          </button>
          <span className="text-sm font-mono font-medium w-6 text-center" style={{ color: 'var(--text-bright)' }}>
            {strikeCount}
          </span>
          <button onClick={() => setStrikeCount(c => Math.min(50, c + 5))}
            className="w-6 h-6 rounded flex items-center justify-center"
            style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-accent)' }}>
            <Plus size={10} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-1 flex-wrap">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-2 py-1 text-xs rounded-full font-medium transition-all"
              style={filter === f
                ? { background: `rgba(${B},0.2)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.3)` }
                : { background: 'var(--card-inner-bg)', color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
              {f}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="ml-auto flex items-center gap-2">
          {lastTick && (
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{lastTick}</span>
          )}
          <button
            onClick={live ? stopLive : startLive}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all"
            style={live
              ? { background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }
              : { background: 'var(--field-bg)', color: 'var(--text-label)', border: '1px solid var(--field-border)' }}>
            {live ? <Wifi size={11} /> : <WifiOff size={11} />}
            {live ? 'Live' : 'Go Live'}
          </button>
          <button onClick={() => fetchChain(symbol, expiry)} disabled={loading}
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-accent)' }}>
            {loading
              ? <Loader2 size={13} className="animate-spin" />
              : <RefreshCw size={13} />}
          </button>
        </div>
      </div>

      {/* Analytics bar */}
      {chain && (
        <AnalyticsBar a={chain.analytics} atm={chain.atm} spot={chain.spot} />
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-xl p-6 flex flex-col items-center gap-3" style={glass}>
          <AlertCircle size={28} style={{ color: 'var(--accent-red)' }} />
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{error}</p>
          <button onClick={() => fetchChain(symbol, expiry)}
            className="px-4 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: `rgba(${B},0.2)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.3)` }}>
            Retry
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !chain && (
        <div className="rounded-xl overflow-hidden" style={glass}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 animate-pulse"
              style={{ borderBottom: '1px solid var(--row-border)', background: i % 2 === 0 ? 'var(--table-head-dim)' : 'transparent' }} />
          ))}
        </div>
      )}

      {/* Option Chain Table */}
      {!error && rows.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={glass}>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                  <th colSpan={7} className="py-2 text-center text-xs tracking-wide font-semibold"
                    style={{ color: 'var(--accent-green)', background: 'rgba(var(--gain-rgb),0.06)' }}>
                    CALLS
                  </th>
                  <th className="py-2 text-center font-bold text-xs"
                    style={{ color: `rgb(${C})`, borderLeft: '1px solid var(--panel-divider)', borderRight: '1px solid var(--panel-divider)', background: 'rgba(41,121,255,0.08)' }}>
                    STRIKE
                  </th>
                  <th colSpan={7} className="py-2 text-center text-xs tracking-wide font-semibold"
                    style={{ color: 'var(--accent-red)', background: 'rgba(var(--loss-rgb),0.06)' }}>
                    PUTS
                  </th>
                </tr>
                <tr style={{ background: 'var(--table-head-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
                  {['OI', 'Chg OI', 'Vol', 'IV', 'LTP', 'Bid', 'Ask'].map(h => (
                    <th key={`ce-${h}`} className="px-2 py-2 text-right font-medium" style={{ color: 'var(--text-label)' }}>{h}</th>
                  ))}
                  <th className="px-3 py-2 text-center font-bold"
                    style={{ color: `rgb(${C})`, borderLeft: '1px solid var(--panel-divider)', borderRight: '1px solid var(--panel-divider)' }}>
                    Strike
                  </th>
                  {['Bid', 'Ask', 'LTP', 'IV', 'Vol', 'Chg OI', 'OI'].map(h => (
                    <th key={`pe-${h}`} className="px-2 py-2 text-left font-medium" style={{ color: 'var(--text-label)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(row => {
                  const { strike, isAtm, ce, pe } = row;
                  const ceItm = (chain?.spot ?? 0) > strike;
                  const peItm = (chain?.spot ?? 0) < strike;
                  const rowBg = isAtm
                    ? { background: `rgba(${B},0.10)`, borderBottom: '1px solid var(--panel-divider)' }
                    : { borderBottom: '1px solid var(--row-border)' };
                  const ceBg = ceItm ? { background: 'rgba(var(--gain-rgb),0.05)' } : {};
                  const peBg = peItm ? { background: 'rgba(var(--loss-rgb),0.05)' } : {};

                  return (
                    <tr key={strike} className="group transition-colors hover:bg-white/[0.02]" style={rowBg}>
                      {/* CE side */}
                      <td className="px-2 py-2 text-right" style={ceBg}>
                        <OIBarCell oi={ce?.oi ?? 0} max={maxOI} />
                      </td>
                      <td className="px-2 py-2 text-right font-mono" style={ceBg}>
                        <span style={{ color: (ce?.changeOi ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {fmtOIChange(ce?.changeOi)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono" style={{ ...ceBg, color: 'var(--text-dim)' }}>
                        {fmtK(ce?.volume)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono" style={{ ...ceBg, color: 'var(--text-accent)' }}>
                        {ce?.iv?.toFixed(1) ?? '-'}
                      </td>
                      <td className="px-2 py-2 text-right font-semibold font-mono"
                        style={{ ...ceBg, color: ceItm ? 'var(--accent-green)' : 'var(--text-bright)' }}>
                        <div className="flex items-center justify-end gap-1">
                          <div className="hidden group-hover:flex gap-0.5">
                            <button
                              onClick={() => ce && openOrderPanel(ce.tradingSymbol, 'BUY')}
                              className="px-1 py-0.5 rounded text-[10px] font-bold text-white"
                              style={{ background: 'var(--accent-green)' }}>B</button>
                            <button
                              onClick={() => ce && openOrderPanel(ce.tradingSymbol, 'SELL')}
                              className="px-1 py-0.5 rounded text-[10px] font-bold text-white"
                              style={{ background: 'var(--accent-red)' }}>S</button>
                          </div>
                          {fmt(ce?.ltp, 2)}
                        </div>
                      </td>
                      <td className="px-2 py-2 text-right font-mono" style={{ ...ceBg, color: 'var(--text-label)' }}>
                        {fmt(ce?.bid, 2)}
                      </td>
                      <td className="px-2 py-2 text-right font-mono" style={{ ...ceBg, color: 'var(--text-label)' }}>
                        {fmt(ce?.ask, 2)}
                      </td>

                      {/* Strike */}
                      <td className="px-3 py-2 text-center font-bold"
                        style={{
                          color: isAtm ? `rgb(${C})` : 'var(--text-accent)',
                          borderLeft:  '1px solid var(--panel-divider)',
                          borderRight: '1px solid var(--panel-divider)',
                          background:  isAtm ? `rgba(${B},0.12)` : undefined,
                        }}>
                        {isAtm && (
                          <span className="block text-[10px] font-normal mb-0.5" style={{ color: `rgb(${C})` }}>ATM</span>
                        )}
                        {fmt(strike)}
                      </td>

                      {/* PE side */}
                      <td className="px-2 py-2 text-left font-mono" style={{ ...peBg, color: 'var(--text-label)' }}>
                        {fmt(pe?.bid, 2)}
                      </td>
                      <td className="px-2 py-2 text-left font-mono" style={{ ...peBg, color: 'var(--text-label)' }}>
                        {fmt(pe?.ask, 2)}
                      </td>
                      <td className="px-2 py-2 text-left font-semibold font-mono"
                        style={{ ...peBg, color: peItm ? 'var(--accent-red)' : 'var(--text-bright)' }}>
                        <div className="flex items-center gap-1">
                          {fmt(pe?.ltp, 2)}
                          <div className="hidden group-hover:flex gap-0.5">
                            <button
                              onClick={() => pe && openOrderPanel(pe.tradingSymbol, 'BUY')}
                              className="px-1 py-0.5 rounded text-[10px] font-bold text-white"
                              style={{ background: 'var(--accent-green)' }}>B</button>
                            <button
                              onClick={() => pe && openOrderPanel(pe.tradingSymbol, 'SELL')}
                              className="px-1 py-0.5 rounded text-[10px] font-bold text-white"
                              style={{ background: 'var(--accent-red)' }}>S</button>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-2 text-left font-mono" style={{ ...peBg, color: 'var(--text-accent)' }}>
                        {pe?.iv?.toFixed(1) ?? '-'}
                      </td>
                      <td className="px-2 py-2 text-left font-mono" style={{ ...peBg, color: 'var(--text-dim)' }}>
                        {fmtK(pe?.volume)}
                      </td>
                      <td className="px-2 py-2 text-left font-mono" style={peBg}>
                        <span style={{ color: (pe?.changeOi ?? 0) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                          {fmtOIChange(pe?.changeOi)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-left" style={peBg}>
                        <OIBarCell oi={pe?.oi ?? 0} max={maxOI} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 text-[10px]"
            style={{ borderTop: '1px solid var(--panel-divider)', color: 'var(--text-dim)' }}>
            <span>{rows.length} strikes · {chain?.source === 'mock' ? 'Mock data' : 'Live'}</span>
            <span>
              CE OI: <strong>{fmtK(chain?.analytics.totalCallOI)}</strong>
              {' · '}
              PE OI: <strong>{fmtK(chain?.analytics.totalPutOI)}</strong>
              {' · '}
              Highest CE OI @ <strong style={{ color: 'var(--accent-green)' }}>{fmt(chain?.analytics.highestCEOIStrike)}</strong>
              {' · '}
              Highest PE OI @ <strong style={{ color: 'var(--accent-red)' }}>{fmt(chain?.analytics.highestPEOIStrike)}</strong>
            </span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && rows.length === 0 && expiry && (
        <div className="rounded-xl p-10 flex flex-col items-center gap-2" style={glass}>
          <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>No data for {symbol} · {expiry}</p>
          <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Try a different symbol or expiry</p>
        </div>
      )}
    </div>
  );
}
