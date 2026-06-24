'use client';

import { useState, useMemo } from 'react';
import {
  ChevronUp, ChevronDown, ChevronsUpDown,
  Download, Search, Filter, X,
} from 'lucide-react';
import type { TradeRecord, TradeSide, ExitReason } from '../types/backtest.types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const REASON_LABEL: Record<ExitReason, string> = {
  TARGET:    'Target',
  STOPLOSS:  'Stop Loss',
  TRAILING:  'Trailing',
  TIME_EXIT: 'Time Exit',
  EOD:       'End of Day',
  SIGNAL:    'Signal',
};
const REASON_COLOR: Record<ExitReason, string> = {
  TARGET:    'rgba(0,230,118,0.15)',
  STOPLOSS:  'rgba(255,23,68,0.15)',
  TRAILING:  'rgba(0,212,255,0.15)',
  TIME_EXIT: 'rgba(245,158,11,0.15)',
  EOD:       'rgba(170,0,255,0.15)',
  SIGNAL:    'rgba(41,121,255,0.15)',
};
const REASON_TEXT: Record<ExitReason, string> = {
  TARGET:    '#00e676', STOPLOSS: '#ff1744', TRAILING: '#00d4ff',
  TIME_EXIT: '#f59e0b', EOD:      '#aa00ff', SIGNAL:   '#2979ff',
};

type SortKey = 'id' | 'entryDate' | 'exitDate' | 'grossPnl' | 'netPnl' | 'pnlPct' | 'holdingMins' | 'mfe' | 'mae';
type SortDir = 'asc' | 'desc';

const PAGE_SIZE = 12;

// ─── Export CSV ───────────────────────────────────────────────────────────────
function exportCSV(trades: TradeRecord[]) {
  const headers = ['#','Entry','Exit','Symbol','Side','Lots','Entry Level','Exit Level','Gross P&L','Brokerage','Net P&L','P&L %','Exit Reason','Hold (min)','MFE','MAE'];
  const rows = trades.map(t => [
    t.id, t.entryDate, t.exitDate, t.symbol, t.side, t.qty,
    t.entryLevel, t.exitLevel,
    t.grossPnl, t.brokerage, t.netPnl, t.pnlPct,
    REASON_LABEL[t.exitReason], t.holdingMins, t.mfe, t.mae,
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a'); a.href = url; a.download = 'trade_log.csv'; a.click();
  URL.revokeObjectURL(url);
}

// ─── Column header with sort indicator ───────────────────────────────────────
function ColHeader({
  label, sortKey, current, dir, onSort, align = 'left',
}: {
  label:   string;
  sortKey: SortKey;
  current: SortKey;
  dir:     SortDir;
  onSort:  (k: SortKey) => void;
  align?:  'left' | 'right' | 'center';
}) {
  const active = current === sortKey;
  const Icon   = active ? (dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th
      className={`px-3 py-2 text-[10px] uppercase tracking-wide font-medium cursor-pointer select-none whitespace-nowrap text-${align}`}
      style={{ color: active ? '#2979ff' : 'var(--text-label)', userSelect: 'none' }}
      onClick={() => onSort(sortKey)}
    >
      <span className="flex items-center gap-0.5">
        {align === 'right' && <span className="flex-1" />}
        {label}
        <Icon size={10} style={{ opacity: active ? 1 : 0.4, flexShrink: 0 }} />
      </span>
    </th>
  );
}

// ─── Main TradeLog component ──────────────────────────────────────────────────

interface Props {
  trades:   TradeRecord[];
  loading?: boolean;
}

export function TradeLog({ trades, loading }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page,    setPage]    = useState(1);
  const [query,   setQuery]   = useState('');
  const [filterSide, setFilterSide]     = useState<TradeSide | 'ALL'>('ALL');
  const [filterReason, setFilterReason] = useState<ExitReason | 'ALL'>('ALL');
  const [filterResult, setFilterResult] = useState<'ALL' | 'WIN' | 'LOSS'>('ALL');
  const [showFilters, setShowFilters]   = useState(false);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
    setPage(1);
  };

  const filtered = useMemo(() => {
    let list = [...trades];
    if (query.trim())      list = list.filter(t => t.symbol.toLowerCase().includes(query.toLowerCase()));
    if (filterSide !== 'ALL')   list = list.filter(t => t.side === filterSide);
    if (filterReason !== 'ALL') list = list.filter(t => t.exitReason === filterReason);
    if (filterResult === 'WIN')  list = list.filter(t => t.netPnl > 0);
    if (filterResult === 'LOSS') list = list.filter(t => t.netPnl < 0);
    list.sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      const cmp = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [trades, query, filterSide, filterReason, filterResult, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSlice  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const summaryPnl  = filtered.reduce((s, t) => s + t.netPnl, 0);
  const summaryWins = filtered.filter(t => t.netPnl > 0).length;

  if (loading) return <TableSkeleton />;

  const selectStyle: React.CSSProperties = {
    height: 28, padding: '0 8px', borderRadius: 8, fontSize: 11, outline: 'none',
    background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)',
    color: 'var(--text-secondary)',
  };

  return (
    <div className="flex flex-col">
      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-4 py-2 flex-wrap"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}
      >
        {/* Search */}
        <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg"
          style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', minWidth: 150 }}>
          <Search size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
          <input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }}
            placeholder="Symbol…" className="w-full bg-transparent outline-none text-[11px]"
            style={{ color: 'var(--text-secondary)' }} />
          {query && (
            <button onClick={() => setQuery('')}><X size={10} style={{ color: 'var(--text-dim)' }} /></button>
          )}
        </div>

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(v => !v)}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] transition-all"
          style={{
            background: showFilters ? 'rgba(41,121,255,0.12)' : 'var(--card-inner-bg)',
            border: `1px solid ${showFilters ? 'rgba(41,121,255,0.35)' : 'var(--card-inner-border)'}`,
            color: showFilters ? '#2979ff' : 'var(--text-dim)',
          }}>
          <Filter size={11} /> Filters
        </button>

        {/* Inline selects when open */}
        {showFilters && (
          <>
            <select value={filterResult} onChange={e => { setFilterResult(e.target.value as 'ALL'|'WIN'|'LOSS'); setPage(1); }} style={selectStyle}>
              <option value="ALL">All trades</option>
              <option value="WIN">Winners</option>
              <option value="LOSS">Losers</option>
            </select>
            <select value={filterSide} onChange={e => { setFilterSide(e.target.value as TradeSide|'ALL'); setPage(1); }} style={selectStyle}>
              <option value="ALL">All sides</option>
              <option value="LONG">Long</option>
              <option value="SHORT">Short</option>
            </select>
            <select value={filterReason} onChange={e => { setFilterReason(e.target.value as ExitReason|'ALL'); setPage(1); }} style={selectStyle}>
              <option value="ALL">All exits</option>
              {(Object.keys(REASON_LABEL) as ExitReason[]).map(r => (
                <option key={r} value={r}>{REASON_LABEL[r]}</option>
              ))}
            </select>
          </>
        )}

        {/* Spacer + count badge */}
        <div className="flex-1" />
        <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
          {filtered.length} trade{filtered.length !== 1 ? 's' : ''}
        </span>
        <span className="text-[11px] font-mono font-semibold"
          style={{ color: summaryPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {summaryPnl >= 0 ? '+' : '−'}₹{(Math.abs(summaryPnl) / 1000).toFixed(1)}K
        </span>

        {/* Export */}
        <button
          onClick={() => exportCSV(filtered)}
          className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-[11px] transition-all"
          style={{ background: 'var(--card-inner-bg)', border: '1px solid var(--card-inner-border)', color: 'var(--text-dim)' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#2979ff'; e.currentTarget.style.borderColor = 'rgba(41,121,255,0.4)'; }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim)'; e.currentTarget.style.borderColor = 'var(--card-inner-border)'; }}>
          <Download size={11} /> CSV
        </button>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="overflow-x-auto no-scrollbar">
        <table className="w-full" style={{ minWidth: 860, borderCollapse: 'collapse' }}>
          <thead style={{ background: 'var(--card-inner-bg)' }}>
            <tr>
              <ColHeader label="#"       sortKey="id"          current={sortKey} dir={sortDir} onSort={handleSort} align="center" />
              <ColHeader label="Entry"   sortKey="entryDate"   current={sortKey} dir={sortDir} onSort={handleSort} />
              <ColHeader label="Exit"    sortKey="exitDate"    current={sortKey} dir={sortDir} onSort={handleSort} />
              <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-left font-medium" style={{ color: 'var(--text-label)' }}>Side</th>
              <ColHeader label="Entry Lvl" sortKey="id"        current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <ColHeader label="Exit Lvl"  sortKey="id"        current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <ColHeader label="Gross P&L" sortKey="grossPnl"  current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <ColHeader label="Net P&L"   sortKey="netPnl"    current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <ColHeader label="P&L %"     sortKey="pnlPct"    current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <th className="px-3 py-2 text-[10px] uppercase tracking-wide text-center font-medium" style={{ color: 'var(--text-label)' }}>Exit</th>
              <ColHeader label="Hold"      sortKey="holdingMins" current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <ColHeader label="MFE"       sortKey="mfe"         current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
              <ColHeader label="MAE"       sortKey="mae"         current={sortKey} dir={sortDir} onSort={handleSort} align="right" />
            </tr>
          </thead>
          <tbody>
            {pageSlice.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-12 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
                  No trades match the current filters
                </td>
              </tr>
            ) : (
              pageSlice.map(t => {
                const win   = t.netPnl > 0;
                const rowBg = win ? 'rgba(0,230,118,0.02)' : t.netPnl < 0 ? 'rgba(255,23,68,0.02)' : 'transparent';
                return (
                  <tr
                    key={t.id}
                    style={{ borderBottom: '1px solid var(--row-border)', background: rowBg }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                    onMouseLeave={e => (e.currentTarget.style.background = rowBg)}
                  >
                    <td className="px-3 py-2 text-center text-[10px] font-mono" style={{ color: 'var(--text-dim)' }}>
                      {t.id}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>{t.entryDate}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{t.entryTime}</div>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div className="text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>{t.exitDate}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-dim)' }}>{t.exitTime}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="text-[10px] px-1.5 py-px rounded font-bold"
                        style={{
                          background: t.side === 'SHORT' ? 'rgba(255,23,68,0.12)' : 'rgba(0,230,118,0.12)',
                          color:      t.side === 'SHORT' ? '#ff1744' : '#00e676',
                        }}>
                        {t.side}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                      {t.entryLevel.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                      {t.exitLevel.toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] font-semibold"
                      style={{ color: t.grossPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {t.grossPnl >= 0 ? '+' : '−'}₹{Math.abs(t.grossPnl).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px] font-bold"
                      style={{ color: t.netPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {t.netPnl >= 0 ? '+' : '−'}₹{Math.abs(t.netPnl).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px]"
                      style={{ color: t.pnlPct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct.toFixed(3)}%
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className="text-[10px] px-1.5 py-px rounded-full whitespace-nowrap"
                        style={{
                          background: REASON_COLOR[t.exitReason],
                          color:      REASON_TEXT[t.exitReason],
                        }}>
                        {REASON_LABEL[t.exitReason]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px]" style={{ color: 'var(--text-dim)' }}>
                      {t.holdingMins >= 1440
                        ? `${Math.round(t.holdingMins / 1440)}d`
                        : t.holdingMins >= 60
                          ? `${Math.round(t.holdingMins / 60)}h`
                          : `${t.holdingMins}m`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px]" style={{ color: '#00b64e' }}>
                      +₹{Math.abs(t.mfe).toLocaleString('en-IN')}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[11px]" style={{ color: '#ff5a79' }}>
                      −₹{Math.abs(t.mae).toLocaleString('en-IN')}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ───────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ borderTop: '1px solid var(--panel-divider)' }}
      >
        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
          Page {page} of {totalPages} · Showing {pageSlice.length} of {filtered.length}
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className="w-6 h-6 rounded text-[10px] font-bold transition-all"
              style={{
                background: p === page ? 'rgba(41,121,255,0.15)' : 'transparent',
                color:      p === page ? '#2979ff' : 'var(--text-dim)',
                border:     `1px solid ${p === page ? 'rgba(41,121,255,0.35)' : 'transparent'}`,
              }}>
              {p}
            </button>
          ))}
        </div>
        <span className="text-[11px] font-mono"
          style={{ color: summaryWins >= filtered.length / 2 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {summaryWins}W / {filtered.length - summaryWins}L
        </span>
      </div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TableSkeleton() {
  return (
    <div className="animate-pulse px-4 py-3 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="h-9 rounded-lg" style={{ background: 'var(--card-inner-bg)', opacity: 1 - i * 0.08 }} />
      ))}
    </div>
  );
}
