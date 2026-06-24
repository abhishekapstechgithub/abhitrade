'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDevToolsDetection } from '@/hooks/useDevToolsDetection';
import {
  Plus, Search, Settings, X, RefreshCw,
  List, TrendingUp, FileText, BarChart2, Link2,
  MoreVertical, Maximize2, Minus,
  ArrowDownToLine, LayoutGrid, Table as TableIcon,
  Filter, Columns, ChevronsUpDown,
  Zap, ExternalLink,
} from 'lucide-react';
import { useTheme } from '@/components/theme/ThemeProvider';
import { useUIStore } from '@/store/useUIStore';
import { formatNumber, formatPercent, formatVolume } from '@/lib/utils/format';
import type { WatchlistItem, OptionContract } from '@/types';
import type { OptionChainResponse } from '@/lib/optionchain/types';
import { useAngelOnePrices } from '@/hooks/useAngelOneWs';

const STORAGE_KEY = 'tk:watchlists';

function loadFromStorage(wlName: string): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const all = JSON.parse(raw) as Record<string, WatchlistItem[]>;
    return Array.isArray(all[wlName]) ? all[wlName] : [];
  } catch { return []; }
}

function saveToStorage(wlName: string, items: WatchlistItem[]) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const all = raw ? JSON.parse(raw) as Record<string, WatchlistItem[]> : {};
    all[wlName] = items;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch { /* ignore */ }
}

// ─── Live prices via WebSocket ────────────────────────────────────────────────
// WatchlistItem.id is the AngelOne instrument token.
// useAngelOnePrices subscribes to all items via the singleton WebSocket and
// calls the setter on every tick — latency ~100 ms vs the old 5-second polling.
function useWatchlistPrices(items: WatchlistItem[], setItems: React.Dispatch<React.SetStateAction<WatchlistItem[]>>) {
  const wsTokens = useMemo(() =>
    items.map(i => ({ token: i.id, exchange: i.exchange, instrumentType: i.instrumentType })),
    // Recompute only when the set of item IDs changes, not on every LTP update
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items.map(i => i.id).join(',')]
  );

  useAngelOnePrices(wsTokens, useCallback((tick) => {
    setItems(prev => prev.map(item => {
      if (item.id !== tick.token) return item;
      const prevClose     = (tick.close && tick.close > 0) ? tick.close : (item.prevClose || tick.ltp);
      const change        = parseFloat((tick.ltp - prevClose).toFixed(2));
      const changePercent = prevClose > 0 ? parseFloat(((change / prevClose) * 100).toFixed(2)) : item.changePercent;
      return {
        ...item,
        ltp:          tick.ltp,
        change,
        changePercent,
        open:         tick.open   ?? item.open,
        high:         tick.high   ?? item.high,
        low:          tick.low    ?? item.low,
        volume:       tick.volume ?? item.volume,
        prevClose:    (tick.close && tick.close > 0) ? tick.close : item.prevClose,
      };
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []));
}

import { ReligareChart, toMktSegId } from '@/components/charts/ReligareChart';

// ─── Constants ────────────────────────────────────────────────────────────────
const WATCHLIST_NAMES = ['Watchlist1', 'Watchlist2', 'F&O Watch', 'Intraday'];
const EXPIRIES        = ['16 Jun 2026', '26 Jun 2026', '03 Jul 2026', '31 Jul 2026', '28 Aug 2026'];
const OC_SYMBOLS      = ['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'];
const ATM_PRICE       = 24850;

const TABLE_COLUMNS = [
  { key: 'symbol',    label: 'Scrip Name',     sortable: true,  width: 180 },
  { key: 'ltp',       label: 'LTP',            sortable: true,  width: 90  },
  { key: 'change',    label: 'Chng',           sortable: true,  width: 90  },
  { key: 'changePct', label: '%Chng',          sortable: true,  width: 80  },
  { key: 'bid',       label: 'Bid',            sortable: false, width: 80  },
  { key: 'ask',       label: 'Ask',            sortable: false, width: 80  },
  { key: 'volume',    label: 'Volume',         sortable: true,  width: 100 },
  { key: 'oi',        label: 'OI',             sortable: true,  width: 100 },
  { key: 'open',      label: 'Open',           sortable: true,  width: 80  },
  { key: 'prevClose', label: 'Previous Close', sortable: true,  width: 110 },
  { key: 'high',      label: 'High',           sortable: true,  width: 80  },
  { key: 'low',       label: 'Low',            sortable: true,  width: 80  },
  { key: 'ucl',       label: 'UCL',            sortable: false, width: 80  },
  { key: 'lcl',       label: 'LCL',            sortable: false, width: 80  },
  { key: 'w52h',      label: '52 Wk High',     sortable: false, width: 90  },
  { key: 'w52l',      label: '52 Wk Low',      sortable: false, width: 90  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function typeColor(t: string): { color: string; bg: string } {
  if (t === 'CE')    return { color: '#22c55e', bg: 'rgba(34,197,94,0.12)'    };
  if (t === 'PE')    return { color: '#ef4444', bg: 'rgba(239,68,68,0.12)'    };
  if (t === 'FUT')   return { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)'   };
  if (t === 'INDEX') return { color: '#a78bfa', bg: 'rgba(167,139,250,0.12)'  };
  return                    { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)'   };
}

function fmtExpiry(expiry?: string) {
  if (!expiry) return '';
  const d = new Date(expiry);
  if (isNaN(d.getTime())) return expiry;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

function sortItems(items: WatchlistItem[], col: string, dir: 'asc' | 'desc'): WatchlistItem[] {
  return [...items].sort((a, b) => {
    if (col === 'symbol') return dir === 'asc' ? a.symbol.localeCompare(b.symbol) : b.symbol.localeCompare(a.symbol);
    let va = 0, vb = 0;
    if (col === 'ltp')       { va = a.ltp;          vb = b.ltp;          }
    if (col === 'change')    { va = a.change;        vb = b.change;       }
    if (col === 'changePct') { va = a.changePercent; vb = b.changePercent;}
    if (col === 'volume')    { va = a.volume;        vb = b.volume;       }
    if (col === 'oi')        { va = a.oi ?? 0;       vb = b.oi ?? 0;      }
    if (col === 'open')      { va = a.open;          vb = b.open;         }
    if (col === 'prevClose') { va = a.prevClose;     vb = b.prevClose;    }
    if (col === 'high')      { va = a.high;          vb = b.high;         }
    if (col === 'low')       { va = a.low;           vb = b.low;          }
    return dir === 'asc' ? va - vb : vb - va;
  });
}

// ─── Micro shared components ──────────────────────────────────────────────────

function ChartSkeleton() {
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: '#0d1117' }}>
      <div className="flex flex-col items-center gap-3">
        <RefreshCw size={22} className="animate-spin" style={{ color: 'rgba(0,212,255,0.5)' }} />
        <span className="text-xs" style={{ color: '#64748b' }}>Loading chart…</span>
      </div>
    </div>
  );
}

function ExBadge({ exchange }: { exchange: string }) {
  return (
    <span className="text-[10px] font-semibold px-1 py-0.5 rounded"
      style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
      {exchange}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  const { color, bg } = typeColor(type);
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color, background: bg }}>
      {type}
    </span>
  );
}

// ─── TABLE VIEW ───────────────────────────────────────────────────────────────

interface TableViewProps {
  items:           WatchlistItem[];
  activeWL:        number;
  setActiveWL:     (i: number) => void;
  onSwitchToChart: () => void;
  onSelectSymbol:  (item: WatchlistItem) => void;
}

function TableView({ items, activeWL, setActiveWL, onSwitchToChart, onSelectSymbol }: TableViewProps) {
  const { openOrderPanel } = useUIStore();
  const [search, setSearch]         = useState('');
  const [sortCol, setSortCol]       = useState('symbol');
  const [sortDir, setSortDir]       = useState<'asc' | 'desc'>('asc');
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  const filtered = items.filter(i =>
    !search ||
    i.symbol.toLowerCase().includes(search.toLowerCase()) ||
    i.name.toLowerCase().includes(search.toLowerCase())
  );
  const sorted = sortItems(filtered, sortCol, sortDir);

  function handleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--panel-bg)' }}>
      {/* Header: tabs + tools */}
      <div className="flex items-center gap-2 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {WATCHLIST_NAMES.map((name, i) => (
            <button key={i} onClick={() => setActiveWL(i)}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded transition-all whitespace-nowrap"
              style={activeWL === i
                ? { color: '#4f46e5', borderBottom: '2px solid #4f46e5', background: 'rgba(79,70,229,0.08)' }
                : { color: 'var(--text-dim)', borderBottom: '2px solid transparent' }}>
              {name}
            </button>
          ))}
          <button className="shrink-0 p-1.5 rounded hover:opacity-70" style={{ color: 'var(--text-label)' }}>
            <Plus size={14} />
          </button>
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2"
            style={{ color: 'var(--text-label)' }} />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search scrip…"
            className="h-7 pl-7 pr-2 rounded-lg text-xs outline-none w-36"
            style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)' }} />
        </div>
        <button title="Filter" className="p-1.5 rounded hover:opacity-70"
          style={{ color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
          <Filter size={12} />
        </button>
        <button title="Columns" className="p-1.5 rounded hover:opacity-70"
          style={{ color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
          <Columns size={12} />
        </button>
        <button title="Switch to chart mode" onClick={onSwitchToChart}
          className="p-1.5 rounded hover:opacity-70"
          style={{ color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
          <LayoutGrid size={12} />
        </button>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto no-scrollbar">
        <table className="w-full border-collapse" style={{ minWidth: 1200 }}>
          <thead className="sticky top-0 z-10" style={{ background: 'var(--table-head-bg)' }}>
            <tr>
              {TABLE_COLUMNS.map(col => (
                <th key={col.key}
                  className="text-left px-3 py-2 whitespace-nowrap"
                  style={{
                    minWidth: col.width,
                    borderBottom: '1px solid var(--panel-divider)',
                    color: 'var(--text-dim)',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: col.sortable ? 'pointer' : 'default',
                  }}
                  onClick={() => col.sortable && handleSort(col.key)}>
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <ChevronsUpDown size={10}
                        style={{ color: sortCol === col.key ? '#4f46e5' : 'var(--text-label)', opacity: sortCol === col.key ? 1 : 0.5 }} />
                    )}
                  </div>
                </th>
              ))}
              <th style={{ width: 80, borderBottom: '1px solid var(--panel-divider)' }} />
            </tr>
          </thead>
          <tbody>
            {sorted.map(item => {
              const pos     = item.changePercent >= 0;
              const clr     = pos ? '#22c55e' : '#ef4444';
              const isDeriv = ['CE','PE','FUT'].includes(item.instrumentType);
              const ucl = item.ltp * 1.2, lcl = item.ltp * 0.8;
              const w52h = item.high * 1.15, w52l = item.low * 0.85;
              const hovered = hoveredRow === item.id;

              return (
                <tr key={item.id}
                  onMouseEnter={() => setHoveredRow(item.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => onSelectSymbol(item)}
                  style={{
                    borderBottom: '1px solid var(--row-border)',
                    background: hovered ? 'var(--row-hover-bg)' : 'transparent',
                    cursor: 'pointer',
                  }}>
                  <td className="px-3 py-2.5" style={{ minWidth: 180 }}>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>{item.symbol}</span>
                        <ExBadge exchange={item.exchange + (isDeriv ? ' FO' : '')} />
                        {isDeriv && <TypeBadge type={item.instrumentType} />}
                      </div>
                      {isDeriv ? (
                        <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>
                          {fmtExpiry((item as WatchlistItem & { expiry?: string }).expiry)}
                          {(item as WatchlistItem & { strike?: number }).strike
                            ? ` · ${(item as WatchlistItem & { strike?: number }).strike?.toLocaleString('en-IN')}`
                            : ''}
                        </span>
                      ) : (
                        <span className="text-[10px] truncate" style={{ color: 'var(--text-label)', maxWidth: 160 }}>
                          {item.name}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-bold font-mono" style={{ color: clr }}>
                    {item.ltp > 0 ? formatNumber(item.ltp) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: clr }}>
                    {item.ltp > 0 ? `${pos ? '+' : ''}${formatNumber(Math.abs(item.change))}` : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-semibold" style={{ color: clr }}>
                    {item.ltp > 0 ? formatPercent(item.changePercent) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {item.bid > 0 ? formatNumber(item.bid) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {item.ask > 0 ? formatNumber(item.ask) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-accent)' }}>
                    {formatVolume(item.volume)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-accent)' }}>
                    {item.oi ? formatVolume(item.oi) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {formatNumber(item.open)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {formatNumber(item.prevClose)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: '#22c55e' }}>
                    {formatNumber(item.high)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: '#ef4444' }}>
                    {formatNumber(item.low)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                    {formatNumber(ucl)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: 'var(--text-dim)' }}>
                    {formatNumber(lcl)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: '#22c55e' }}>
                    {formatNumber(w52h)}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono" style={{ color: '#ef4444' }}>
                    {formatNumber(w52l)}
                  </td>
                  <td className="px-2 py-2.5">
                    {hovered && (
                      <div className="flex items-center gap-1">
                        <button onClick={e => { e.stopPropagation(); openOrderPanel(item.symbol, 'BUY'); }}
                          className="h-6 px-2 rounded text-[10px] font-bold text-white"
                          style={{ background: '#22c55e' }}>B</button>
                        <button onClick={e => { e.stopPropagation(); openOrderPanel(item.symbol, 'SELL'); }}
                          className="h-6 px-2 rounded text-[10px] font-bold text-white"
                          style={{ background: '#ef4444' }}>S</button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 gap-2">
            <Search size={24} style={{ color: 'var(--text-label)', opacity: 0.4 }} />
            <p className="text-sm" style={{ color: 'var(--text-label)' }}>No instruments found</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── COMPACT ROW (chart-mode left panel) ──────────────────────────────────────

function CompactRow({
  item, isActive, onSelect, onBuy, onSell, onRemove,
}: {
  item:     WatchlistItem;
  isActive: boolean;
  onSelect: () => void;
  onBuy:    () => void;
  onSell:   () => void;
  onRemove: () => void;
}) {
  const pos     = item.changePercent >= 0;
  const clr     = pos ? '#22c55e' : '#ef4444';
  const isDeriv = ['CE','PE','FUT'].includes(item.instrumentType);

  return (
    <div className="group relative flex items-center px-2 py-2 cursor-pointer transition-colors"
      style={{
        borderBottom: '1px solid var(--row-border)',
        background:   isActive ? 'rgba(79,70,229,0.1)' : 'transparent',
        borderLeft:   isActive ? '2px solid #4f46e5'   : '2px solid transparent',
      }}
      onMouseEnter={e => !isActive && (e.currentTarget.style.background = 'var(--row-hover-bg)')}
      onMouseLeave={e => !isActive && (e.currentTarget.style.background = 'transparent')}
      onClick={onSelect}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold leading-none" style={{ color: 'var(--text-bright)' }}>
            {item.symbol}
          </span>
          <ExBadge exchange={item.exchange} />
          {isDeriv && <TypeBadge type={item.instrumentType} />}
        </div>
        <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-label)' }}>
          {isDeriv
            ? fmtExpiry((item as WatchlistItem & { expiry?: string }).expiry) || item.name
            : item.name}
        </div>
      </div>
      {/* Price (hidden on hover) */}
      <div className="text-right shrink-0 group-hover:hidden">
        <div className="text-[11px] font-bold font-mono leading-none"
          style={{ color: item.ltp > 0 ? clr : 'var(--text-dim)' }}>
          {item.ltp > 0 ? formatNumber(item.ltp) : '—'}
        </div>
        {item.ltp > 0 && (
          <div className="text-[10px] font-semibold mt-0.5 leading-none" style={{ color: clr }}>
            {formatPercent(item.changePercent)}
          </div>
        )}
      </div>
      {/* Hover actions: B / S / delete */}
      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
        <button onClick={e => { e.stopPropagation(); onBuy(); }}
          className="h-5 px-1.5 rounded text-[9px] font-bold text-white"
          style={{ background: '#22c55e' }}>B</button>
        <button onClick={e => { e.stopPropagation(); onSell(); }}
          className="h-5 px-1.5 rounded text-[9px] font-bold text-white"
          style={{ background: '#ef4444' }}>S</button>
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title="Remove from watchlist"
          className="h-5 w-5 flex items-center justify-center rounded text-[9px] font-bold transition-colors"
          style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
          <X size={9} />
        </button>
      </div>
    </div>
  );
}

// ─── LEFT PANEL (Watchlist | Docked OC) ──────────────────────────────────────

interface LeftPanelProps {
  items:           WatchlistItem[];
  activeWL:        number;
  setActiveWL:     (i: number) => void;
  selectedId:      string | null;
  onSelect:        (item: WatchlistItem) => void;
  onAdd:           (item: WatchlistItem) => void;
  onRemove:        (id: string) => void;
  docked:          boolean;
  onUndock:        () => void;
  ocSymbol:        string;
  setOcSymbol:     (s: string) => void;
  ocExpiry:        string;
  setOcExpiry:     (e: string) => void;
  onHide?:         () => void;
  onSwitchToTable?:() => void;
}

function LeftPanel({
  items, activeWL, setActiveWL, selectedId, onSelect,
  onAdd, onRemove,
  docked, onUndock, ocSymbol, setOcSymbol, ocExpiry, setOcExpiry, onHide,
  onSwitchToTable,
}: LeftPanelProps) {
  const { openOrderPanel } = useUIStore();
  const [search, setSearch]             = useState('');
  const [showDrop, setShowDrop]         = useState(false);
  const [dropResults, setDropResults]   = useState<Array<{
    token: string; exchange: string; symbol: string; name: string; instrumentType: string;
    ltp?: number; open?: number; high?: number; low?: number; prevClose?: number;
    netChange?: number; changePct?: number; volume?: number;
  }>>([]);
  const [dropLoading, setDropLoading]   = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const debRef    = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (search.length < 2) { setDropResults([]); setShowDrop(false); return; }
    clearTimeout(debRef.current);
    debRef.current = setTimeout(async () => {
      setDropLoading(true);
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(search)}&limit=10`);
        const d = await r.json();
        if (d.results?.length) { setDropResults(d.results); setShowDrop(true); }
        else { setDropResults([]); setShowDrop(false); }
      } catch { setDropResults([]); }
      finally { setDropLoading(false); }
    }, 280);
    return () => clearTimeout(debRef.current);
  }, [search]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDrop(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  function addItem(r: typeof dropResults[0]) {
    if (!items.some(i => i.id === r.token || i.symbol === r.symbol)) {
      const ltp       = r.ltp       ?? 0;
      const prevClose = r.prevClose ?? 0;
      const change    = r.netChange ?? (ltp && prevClose ? parseFloat((ltp - prevClose).toFixed(2)) : 0);
      const changePct = r.changePct ?? (prevClose > 0 ? parseFloat(((change / prevClose) * 100).toFixed(2)) : 0);
      onAdd({
        id: r.token, symbol: r.symbol, name: r.name,
        exchange: r.exchange as 'NSE' | 'BSE',
        instrumentType: r.instrumentType as WatchlistItem['instrumentType'],
        ltp, change, changePercent: changePct,
        bid: 0, ask: 0,
        volume:   r.volume   ?? 0,
        high:     r.high     ?? 0,
        low:      r.low      ?? 0,
        open:     r.open     ?? 0,
        prevClose,
      });
    }
    setSearch(''); setShowDrop(false);
  }

  const filtered = items.filter(i =>
    !search ||
    i.symbol.toLowerCase().includes(search.toLowerCase()) ||
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const strikes: number[] = [];
  const calls = new Map<number, OptionContract>();
  const puts  = new Map<number, OptionContract>();
  const atmStrike: number | undefined = undefined;

  return (
    <div className="flex flex-col h-full"
      style={{ background: 'var(--panel-bg)', borderRight: '1px solid var(--panel-divider)' }}>

      {/* Header — height matches tab bar so they align on the same row */}
      <div className="flex items-center justify-between px-3 shrink-0"
        style={{ height: 40, borderBottom: '1px solid var(--panel-divider)' }}>
        {docked ? (
          <div className="flex items-center gap-1">
            <button className="text-[11px] font-semibold px-2 py-1 rounded"
              style={{ color: '#4f46e5', background: 'rgba(79,70,229,0.1)', borderBottom: '2px solid #4f46e5' }}>
              Option Chain
            </button>
            <button onClick={onUndock}
              className="text-[11px] px-2 py-1 rounded transition-colors"
              style={{ color: 'var(--text-dim)' }}>
              Watchlist
            </button>
          </div>
        ) : (
          <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Watchlist</span>
        )}
        <div className="flex items-center gap-1">
          {docked && (
            <button title="Undock" onClick={onUndock}
              className="p-1 rounded hover:opacity-70" style={{ color: 'var(--text-label)' }}>
              <ArrowDownToLine size={12} />
            </button>
          )}
          {onSwitchToTable && (
            <button title="Table mode" onClick={onSwitchToTable}
              className="p-1 rounded hover:opacity-70 transition-colors"
              style={{ color: 'var(--text-label)' }}>
              <TableIcon size={13} />
            </button>
          )}
          <button className="p-1 rounded hover:opacity-70" style={{ color: 'var(--text-label)' }}>
            <Settings size={12} />
          </button>
          {onHide && (
            <button onClick={onHide} title="Hide watchlist"
              className="p-1 rounded hover:opacity-70" style={{ color: 'var(--text-label)' }}>
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* ── Docked Option Chain ── */}
      {docked ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="px-2 py-2 flex gap-2 shrink-0"
            style={{ borderBottom: '1px solid var(--panel-divider)' }}>
            <select value={ocSymbol} onChange={e => setOcSymbol(e.target.value)}
              className="flex-1 h-7 px-2 rounded text-xs outline-none"
              style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)' }}>
              {OC_SYMBOLS.map(s => <option key={s} style={{ background: 'var(--option-bg)' }}>{s}</option>)}
            </select>
            <select value={ocExpiry} onChange={e => setOcExpiry(e.target.value)}
              className="flex-1 h-7 px-2 rounded text-xs outline-none"
              style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)' }}>
              {EXPIRIES.map(e => <option key={e} style={{ background: 'var(--option-bg)' }}>{e}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-3 px-2 py-1 text-[9px] font-bold shrink-0"
            style={{ borderBottom: '1px solid var(--panel-divider)', color: 'var(--text-dim)' }}>
            <span style={{ color: '#22c55e' }}>CALL</span>
            <span className="text-center">STRIKE</span>
            <span className="text-right" style={{ color: '#ef4444' }}>PUT</span>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar">
            {strikes.map(strike => {
              const call  = calls.get(strike);
              const put   = puts.get(strike);
              const isAtm = strike === atmStrike;
              return (
                <div key={strike}
                  className="group grid grid-cols-3 items-center px-2 py-1.5 text-[10px] cursor-pointer transition-colors"
                  style={{
                    borderBottom: '1px solid var(--row-border)',
                    background: isAtm ? 'rgba(79,70,229,0.12)' : call?.isItm ? 'rgba(251,191,36,0.05)' : 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                  onMouseLeave={e => (e.currentTarget.style.background =
                    isAtm ? 'rgba(79,70,229,0.12)' : call?.isItm ? 'rgba(251,191,36,0.05)' : 'transparent')}>
                  <div>
                    {call ? (
                      <>
                        <div className="font-bold font-mono" style={{ color: '#22c55e' }}>
                          {formatNumber(call.ltp)}
                        </div>
                        <div className="hidden group-hover:flex gap-0.5 mt-0.5">
                          <button onClick={() => openOrderPanel(`${ocSymbol}${strike}CE`, 'BUY')}
                            className="text-[9px] px-1 py-0.5 rounded font-bold text-white"
                            style={{ background: '#22c55e' }}>B</button>
                          <button onClick={() => openOrderPanel(`${ocSymbol}${strike}CE`, 'SELL')}
                            className="text-[9px] px-1 py-0.5 rounded font-bold text-white"
                            style={{ background: '#ef4444' }}>S</button>
                        </div>
                      </>
                    ) : <span style={{ color: 'var(--text-label)' }}>—</span>}
                  </div>
                  <div className="text-center">
                    <span className="font-bold"
                      style={{ color: isAtm ? '#4f46e5' : 'var(--text-secondary)', fontSize: isAtm ? 11 : 10 }}>
                      {strike.toLocaleString('en-IN')}
                    </span>
                    {isAtm && <div className="text-[8px] text-indigo-400 font-bold leading-tight">ATM</div>}
                  </div>
                  <div className="text-right">
                    {put ? (
                      <>
                        <div className="font-bold font-mono" style={{ color: '#ef4444' }}>
                          {formatNumber(put.ltp)}
                        </div>
                        <div className="hidden group-hover:flex justify-end gap-0.5 mt-0.5">
                          <button onClick={() => openOrderPanel(`${ocSymbol}${strike}PE`, 'BUY')}
                            className="text-[9px] px-1 py-0.5 rounded font-bold text-white"
                            style={{ background: '#22c55e' }}>B</button>
                          <button onClick={() => openOrderPanel(`${ocSymbol}${strike}PE`, 'SELL')}
                            className="text-[9px] px-1 py-0.5 rounded font-bold text-white"
                            style={{ background: '#ef4444' }}>S</button>
                        </div>
                      </>
                    ) : <span style={{ color: 'var(--text-label)' }}>—</span>}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 py-2 shrink-0" style={{ borderTop: '1px solid var(--panel-divider)' }}>
            <button className="w-full py-1.5 rounded-lg text-xs font-bold transition-opacity hover:opacity-80"
              style={{ background: 'rgba(79,70,229,0.15)', color: '#4f46e5', border: '1px solid rgba(79,70,229,0.3)' }}>
              + CREATE STRATEGY
            </button>
          </div>
        </div>
      ) : (
        /* ── Normal Watchlist ── */
        <>
          <div className="flex items-center gap-0.5 px-2 py-1.5 overflow-x-auto no-scrollbar shrink-0"
            style={{ borderBottom: '1px solid var(--panel-divider)' }}>
            {WATCHLIST_NAMES.map((name, i) => (
              <button key={i} onClick={() => setActiveWL(i)}
                className="shrink-0 px-2 py-1 text-[11px] font-medium rounded transition-all whitespace-nowrap"
                style={activeWL === i
                  ? { color: '#4f46e5', borderBottom: '2px solid #4f46e5', background: 'rgba(79,70,229,0.08)' }
                  : { color: 'var(--text-dim)', borderBottom: '2px solid transparent' }}>
                {name}
              </button>
            ))}
            <button className="shrink-0 p-1 rounded hover:opacity-70" style={{ color: 'var(--text-label)' }}>
              <Plus size={12} />
            </button>
          </div>

          <div className="px-2 py-2 shrink-0 relative" ref={searchRef}
            style={{ borderBottom: '1px solid var(--panel-divider)' }}>
            <div className="relative">
              <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-label)' }} />
              <input value={search} onChange={e => setSearch(e.target.value)}
                onFocus={() => dropResults.length > 0 && setShowDrop(true)}
                placeholder="Search symbol / add to watchlist"
                className="w-full h-7 pl-7 pr-8 rounded-lg text-[11px] outline-none"
                style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)' }} />
              <button className="absolute right-2 top-1/2 -translate-y-1/2 hover:opacity-70"
                style={{ color: 'var(--text-label)' }}>
                <Filter size={11} />
              </button>
              {dropLoading && (
                <RefreshCw size={10} className="absolute right-7 top-1/2 -translate-y-1/2 animate-spin"
                  style={{ color: 'rgba(0,212,255,0.6)' }} />
              )}
            </div>
            {showDrop && dropResults.length > 0 && (
              <div className="absolute left-2 right-2 top-full mt-1 rounded-xl overflow-hidden z-50 shadow-xl"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-med)' }}>
                <div className="max-h-52 overflow-y-auto">
                  {dropResults.map(r => {
                    const inList = items.some(i => i.id === r.token);
                    const { color, bg } = typeColor(r.instrumentType);
                    const hasPrice  = r.ltp != null && r.ltp > 0;
                    const chgPct    = r.changePct ?? 0;
                    const pos       = chgPct >= 0;
                    return (
                      <button key={`${r.exchange}-${r.token}`}
                        onClick={() => addItem(r)}
                        disabled={inList}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                        style={{ borderBottom: '1px solid var(--row-border)' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                        <span className="text-[10px] px-1 py-0.5 rounded font-bold shrink-0"
                          style={{ color, background: bg }}>
                          {r.instrumentType}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate"
                            style={{ color: inList ? 'var(--text-label)' : 'var(--text-bright)' }}>
                            {r.symbol}
                          </div>
                          <div className="text-[10px] truncate" style={{ color: 'var(--text-label)' }}>{r.name}</div>
                        </div>
                        {hasPrice && (
                          <div className="text-right shrink-0">
                            <div className="text-xs font-semibold" style={{ color: 'var(--text-bright)' }}>
                              ₹{r.ltp!.toFixed(2)}
                            </div>
                            <div className="text-[10px] font-medium"
                              style={{ color: pos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {pos ? '+' : ''}{chgPct.toFixed(2)}%
                            </div>
                          </div>
                        )}
                        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-label)' }}>{r.exchange}</span>
                        {inList
                          ? <span className="text-[10px]" style={{ color: '#22c55e' }}>✓</span>
                          : <span className="text-[10px] px-1 py-0.5 rounded"
                              style={{ background: 'rgba(79,70,229,0.15)', color: '#4f46e5' }}>+</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 gap-2">
                <Search size={22} style={{ color: 'var(--text-label)', opacity: 0.35 }} />
                <p className="text-xs" style={{ color: 'var(--text-label)' }}>No instruments added</p>
              </div>
            )}
            {filtered.map(item => (
              <CompactRow key={item.id} item={item}
                isActive={item.id === selectedId}
                onSelect={() => onSelect(item)}
                onBuy={() => openOrderPanel(item.symbol, 'BUY')}
                onSell={() => openOrderPanel(item.symbol, 'SELL')}
                onRemove={() => onRemove(item.id)} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── OPTION CHAIN FLOATING OVERLAY ───────────────────────────────────────────

interface OcOverlayProps {
  ocSymbol:    string;
  setOcSymbol: (s: string) => void;
  ocExpiry:    string;
  setOcExpiry: (e: string) => void;
  onClose:     () => void;
  onDock:      () => void;
}

function OcOverlay({ ocSymbol, setOcSymbol, ocExpiry, setOcExpiry, onClose, onDock }: OcOverlayProps) {
  const { openOrderPanel } = useUIStore();

  const strikes: number[] = [];
  const calls = new Map<number, OptionContract>();
  const puts  = new Map<number, OptionContract>();
  const atmStrike: number | undefined = undefined;

  return (
    <div className="absolute inset-4 rounded-2xl z-40 flex flex-col overflow-hidden shadow-2xl"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-med)' }}>
      <div className="flex items-center gap-3 px-4 py-2.5 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <span className="text-sm font-bold" style={{ color: 'var(--text-bright)' }}>Option Chain</span>
        <div className="flex-1" />
        <select value={ocSymbol} onChange={e => setOcSymbol(e.target.value)}
          className="h-7 px-2 rounded-lg text-xs outline-none"
          style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)' }}>
          {OC_SYMBOLS.map(s => <option key={s} style={{ background: 'var(--option-bg)' }}>{s}</option>)}
        </select>
        <select value={ocExpiry} onChange={e => setOcExpiry(e.target.value)}
          className="h-7 px-2 rounded-lg text-xs outline-none"
          style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)' }}>
          {EXPIRIES.map(e => <option key={e} style={{ background: 'var(--option-bg)' }}>{e}</option>)}
        </select>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
          style={{ background: 'rgba(34,197,94,0.12)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}>W</span>
        <button title="Dock to left panel" onClick={onDock}
          className="p-1.5 rounded-lg hover:opacity-70"
          style={{ color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
          <ArrowDownToLine size={13} />
        </button>
        <button onClick={onClose}
          className="p-1.5 rounded-lg hover:opacity-70"
          style={{ color: 'var(--text-label)', border: '1px solid var(--panel-divider)' }}>
          <X size={13} />
        </button>
      </div>

      <div className="px-4 py-2 shrink-0 flex items-center gap-3"
        style={{ borderBottom: '1px solid var(--panel-divider)', background: 'rgba(79,70,229,0.06)' }}>
        <span className="text-xs font-bold" style={{ color: '#4f46e5' }}>{ocSymbol}</span>
        <span className="font-mono text-lg font-bold" style={{ color: 'var(--text-bright)' }}>
          {ATM_PRICE.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
        <span className="text-xs font-semibold" style={{ color: '#22c55e' }}>+0.50%</span>
        <div className="flex-1" />
        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Expiry: {ocExpiry}</span>
      </div>

      <div className="grid px-4 py-1.5 text-[11px] font-bold shrink-0"
        style={{
          gridTemplateColumns: '1fr 80px 80px 100px 80px 80px 1fr',
          borderBottom: '1px solid var(--panel-divider)',
          color: 'var(--text-dim)',
          background: 'var(--table-head-bg)',
        }}>
        <span style={{ color: '#22c55e' }}>— CALL</span>
        <span>Chng%</span>
        <span>LTP</span>
        <span className="text-center">Strike</span>
        <span>LTP</span>
        <span>Chng%</span>
        <span className="text-right" style={{ color: '#ef4444' }}>PUT —</span>
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar">
        {strikes.map(strike => {
          const call  = calls.get(strike);
          const put   = puts.get(strike);
          const isAtm = strike === atmStrike;
          return (
            <div key={strike}
              className="group grid items-center px-4 py-2 cursor-pointer transition-colors"
              style={{
                gridTemplateColumns: '1fr 80px 80px 100px 80px 80px 1fr',
                borderBottom: '1px solid var(--row-border)',
                background: isAtm
                  ? 'rgba(79,70,229,0.1)'
                  : call?.isItm ? 'rgba(251,191,36,0.04)' : put?.isItm ? 'rgba(96,165,250,0.04)' : 'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.025)')}
              onMouseLeave={e => (e.currentTarget.style.background = isAtm
                ? 'rgba(79,70,229,0.1)' : call?.isItm ? 'rgba(251,191,36,0.04)' : put?.isItm ? 'rgba(96,165,250,0.04)' : 'transparent')}>
              <div />
              <div className="text-xs font-mono" style={{ color: '#22c55e' }}>
                {call ? `+${((call.ltp / (call.ltp - call.delta * 10)) * 100 - 100).toFixed(1)}%` : '—'}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold font-mono" style={{ color: '#22c55e' }}>
                  {call ? formatNumber(call.ltp) : '—'}
                </span>
                {isAtm && (
                  <div className="hidden group-hover:flex gap-1 mt-0.5">
                    <button onClick={() => openOrderPanel(`${ocSymbol}${strike}CE`, 'BUY')}
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold text-white"
                      style={{ background: '#22c55e' }}>B</button>
                    <button onClick={() => openOrderPanel(`${ocSymbol}${strike}CE`, 'SELL')}
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold text-white"
                      style={{ background: '#ef4444' }}>S</button>
                  </div>
                )}
              </div>
              <div className="text-center">
                <span className="text-xs font-bold"
                  style={{ color: isAtm ? '#4f46e5' : 'var(--text-secondary)', fontSize: isAtm ? 13 : 11 }}>
                  {strike.toLocaleString('en-IN')}
                </span>
                {isAtm && <div className="text-[9px] font-bold text-indigo-400 leading-tight">ATM</div>}
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-bold font-mono" style={{ color: '#ef4444' }}>
                  {put ? formatNumber(put.ltp) : '—'}
                </span>
                {isAtm && (
                  <div className="hidden group-hover:flex gap-1 mt-0.5">
                    <button onClick={() => openOrderPanel(`${ocSymbol}${strike}PE`, 'BUY')}
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold text-white"
                      style={{ background: '#22c55e' }}>B</button>
                    <button onClick={() => openOrderPanel(`${ocSymbol}${strike}PE`, 'SELL')}
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold text-white"
                      style={{ background: '#ef4444' }}>S</button>
                  </div>
                )}
              </div>
              <div className="text-xs font-mono" style={{ color: '#ef4444' }}>
                {put ? `-${((put.ltp / (put.ltp + put.delta * 10)) * 100 - 100).toFixed(1)}%` : '—'}
              </div>
              <div />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RIGHT DOCK PANELS ────────────────────────────────────────────────────────

type DockPanel = 'positions' | 'orders' | 'depth' | null;

function PositionsPanel({ onClose }: { onClose: () => void }) {
  return (
    <div className="flex flex-col h-full"
      style={{ background: 'var(--panel-bg)', borderLeft: '1px solid var(--panel-divider)' }}>
      <div className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Positions</span>
        <div className="flex gap-1">
          <button className="p-1 hover:opacity-70" style={{ color: 'var(--text-label)' }}><Minus size={12} /></button>
          <button onClick={onClose} className="p-1 hover:opacity-70" style={{ color: 'var(--text-label)' }}><X size={12} /></button>
        </div>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3">
        <TrendingUp size={32} style={{ color: 'var(--text-label)', opacity: 0.3 }} />
        <p className="text-xs text-center font-semibold" style={{ color: 'var(--text-dim)' }}>
          You do not have any positions
        </p>
        <p className="text-[11px] text-center" style={{ color: 'var(--text-label)' }}>
          List of all your positions for today will appear here.
        </p>
        <button className="mt-2 px-4 py-2 rounded-lg text-[11px] font-bold transition-opacity hover:opacity-80"
          style={{ background: 'rgba(79,70,229,0.15)', color: '#4f46e5', border: '1px solid rgba(79,70,229,0.3)' }}>
          VIEW TRADING IDEAS
        </button>
      </div>
    </div>
  );
}

function OrdersPanel({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<'open' | 'history'>('open');
  return (
    <div className="flex flex-col h-full"
      style={{ background: 'var(--panel-bg)', borderLeft: '1px solid var(--panel-divider)' }}>
      <div className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Orders</span>
        <div className="flex gap-1">
          <button className="p-1 hover:opacity-70" style={{ color: 'var(--text-label)' }}><Minus size={12} /></button>
          <button onClick={onClose} className="p-1 hover:opacity-70" style={{ color: 'var(--text-label)' }}><X size={12} /></button>
        </div>
      </div>
      <div className="flex items-center px-2 py-1 shrink-0 overflow-x-auto no-scrollbar"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        {(['open','history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className="shrink-0 px-2 py-1 text-[10px] font-medium whitespace-nowrap"
            style={tab === t
              ? { color: '#4f46e5', borderBottom: '2px solid #4f46e5' }
              : { color: 'var(--text-dim)', borderBottom: '2px solid transparent' }}>
            {t === 'open' ? 'Open Orders' : 'Order History (1)'}
          </button>
        ))}
        <button className="shrink-0 px-1 text-[10px]" style={{ color: 'var(--text-label)' }}>›</button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-4 gap-3">
        <FileText size={32} style={{ color: 'var(--text-label)', opacity: 0.3 }} />
        <p className="text-xs font-semibold text-center" style={{ color: 'var(--text-dim)' }}>
          You don&apos;t have any open orders
        </p>
        <button className="mt-2 px-4 py-2 rounded-lg text-[11px] font-bold transition-opacity hover:opacity-80"
          style={{ background: 'rgba(79,70,229,0.15)', color: '#4f46e5', border: '1px solid rgba(79,70,229,0.3)' }}>
          CHECK TRADING IDEAS
        </button>
      </div>
    </div>
  );
}

function MarketDepthPanel({ onClose }: { onClose: () => void }) {
  const bids = [
    { qty: 2500, price: 24848.50, orders: 12 },
    { qty: 1875, price: 24847.00, orders: 8  },
    { qty: 3200, price: 24845.50, orders: 15 },
    { qty: 1650, price: 24844.00, orders: 7  },
    { qty: 4100, price: 24842.50, orders: 20 },
  ];
  const asks = [
    { qty: 1900, price: 24850.00, orders: 9  },
    { qty: 2800, price: 24851.50, orders: 13 },
    { qty: 1450, price: 24853.00, orders: 6  },
    { qty: 3600, price: 24854.50, orders: 17 },
    { qty: 2100, price: 24856.00, orders: 11 },
  ];
  const maxQty = Math.max(...bids.map(b => b.qty), ...asks.map(a => a.qty));

  return (
    <div className="flex flex-col h-full"
      style={{ background: 'var(--panel-bg)', borderLeft: '1px solid var(--panel-divider)' }}>
      <div className="flex items-center justify-between px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Market Depth</span>
        <button onClick={onClose} className="p-1 hover:opacity-70" style={{ color: 'var(--text-label)' }}><X size={12} /></button>
      </div>
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 py-1">
        <div className="grid grid-cols-3 text-[10px] font-bold px-1 py-1"
          style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--panel-divider)' }}>
          <span>Qty</span><span className="text-center">Price</span><span className="text-right">Orders</span>
        </div>
        {[...asks].reverse().map((row, i) => (
          <div key={i} className="relative grid grid-cols-3 px-1 py-1 text-[11px] font-mono overflow-hidden"
            style={{ borderBottom: '1px solid var(--row-border)' }}>
            <div className="absolute left-0 top-0 bottom-0 rounded opacity-10"
              style={{ width: `${(row.qty / maxQty) * 100}%`, background: '#ef4444' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{row.qty.toLocaleString('en-IN')}</span>
            <span className="text-center font-bold" style={{ color: '#ef4444' }}>{formatNumber(row.price)}</span>
            <span className="text-right" style={{ color: 'var(--text-dim)' }}>{row.orders}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 px-1 py-1.5"
          style={{ borderBottom: '1px solid var(--panel-divider)', borderTop: '1px solid var(--panel-divider)', background: 'rgba(255,255,255,0.02)' }}>
          <span className="text-xs font-bold font-mono" style={{ color: 'var(--text-bright)' }}>
            {ATM_PRICE.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[10px] font-semibold" style={{ color: '#22c55e' }}>+0.50%</span>
        </div>
        {bids.map((row, i) => (
          <div key={i} className="relative grid grid-cols-3 px-1 py-1 text-[11px] font-mono overflow-hidden"
            style={{ borderBottom: '1px solid var(--row-border)' }}>
            <div className="absolute left-0 top-0 bottom-0 rounded opacity-10"
              style={{ width: `${(row.qty / maxQty) * 100}%`, background: '#22c55e' }} />
            <span style={{ color: 'var(--text-secondary)' }}>{row.qty.toLocaleString('en-IN')}</span>
            <span className="text-center font-bold" style={{ color: '#22c55e' }}>{formatNumber(row.price)}</span>
            <span className="text-right" style={{ color: 'var(--text-dim)' }}>{row.orders}</span>
          </div>
        ))}
        <div className="grid grid-cols-2 gap-1 mt-3 px-1">
          {[
            { label: 'Total Sell Qty', qty: asks.reduce((s, r) => s + r.qty, 0), color: '#ef4444' },
            { label: 'Total Buy Qty',  qty: bids.reduce((s, r) => s + r.qty, 0), color: '#22c55e' },
          ].map(({ label, qty, color }) => (
            <div key={label} className="rounded-lg p-2 text-center"
              style={{ background: `${color}14`, border: `1px solid ${color}26` }}>
              <div className="text-[10px]" style={{ color }}>{label}</div>
              <div className="text-xs font-bold font-mono" style={{ color }}>
                {qty.toLocaleString('en-IN')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── OPTION CHAIN PANEL (Univest) ─────────────────────────────────────────────

// Univest OptChainGeeks response types
interface UnivestOpt {
  Stk: string;        // "24000.0000"
  Ltp: number;
  Vol: number;
  OI: number;
  OIChng: number;
  OIPerChng: number;
  IV: number;
  OptGeek: { Delta: number; Theta: number; Gamma: number; Rho: number; Vega: number };
  ask: number;
  bid: number;
  lot: number;
  SN: string;         // "NIFTY-JUN2026-24000-CE"
  SId: number;
  OPFlg: string;      // "I" = ITM, "O" = OTM
}
interface UnivestData {
  CE: UnivestOpt[];
  PE: UnivestOpt[];
  SpotP: number;
  SChng: number;
  SPerChng: number;
  OIC: number;
  OIP: number;
  Rto: number;
}
interface OCRow {
  strike: number;
  isAtm: boolean;
  ceItm: boolean;
  ce: UnivestOpt | null;
  pe: UnivestOpt | null;
}

// Generate upcoming NIFTY expiry Tuesdays (NIFTY expires on Tuesday)
function getNiftyExpiries(count = 10): Array<{ label: string; value: string }> {
  const MO = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  const out: Array<{ label: string; value: string }> = [];
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  // Advance to the next Tuesday (day=2); if today is Tuesday, skip to next week
  const diff = (2 - d.getUTCDay() + 7) % 7 || 7;
  d.setUTCDate(d.getUTCDate() + diff);
  for (let i = 0; i < count; i++) {
    const y = d.getUTCFullYear(), m = d.getUTCMonth(), day = d.getUTCDate();
    out.push({
      label: `${day}${MO[m]}${String(y).slice(2)}`,
      value: `${y}-${String(m + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    });
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

function OptionChainPanel() {
  const { openOrderPanel } = useUIStore();
  const EXPIRIES = useMemo(() => getNiftyExpiries(10), []);
  const [expiry, setExpiry]   = useState(EXPIRIES[0].value);
  const [raw, setRaw]         = useState<UnivestData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const fetchChain = useCallback((exp: string, silent = false) => {
    if (!exp) return;
    if (!silent) setLoading(true);
    fetch(`/api/optionchain/univest?expiry=${encodeURIComponent(exp)}`)
      .then(r => r.json())
      .then((d: { code: number; remarks: string; data: UnivestData }) => {
        if (d.remarks !== 'Success' || !d.data?.CE) {
          setError(d.remarks ?? 'No data');
          setRaw(null);
        } else {
          setRaw(d.data);
          setError('');
        }
        setLoading(false);
      })
      .catch(() => { setError('Network error'); setLoading(false); });
  }, []);

  useEffect(() => {
    fetchChain(expiry);
    const iv = setInterval(() => fetchChain(expiry, true), 8000);
    return () => clearInterval(iv);
  }, [expiry, fetchChain]);

  // Build paired rows sorted by strike
  const { rows, atm } = useMemo(() => {
    if (!raw) return { rows: [] as OCRow[], atm: 0 };
    const spot = raw.SpotP;
    const map = new Map<number, { ce: UnivestOpt | null; pe: UnivestOpt | null }>();
    for (const o of raw.CE) {
      const k = parseFloat(o.Stk);
      if (!map.has(k)) map.set(k, { ce: null, pe: null });
      map.get(k)!.ce = o;
    }
    for (const o of raw.PE) {
      const k = parseFloat(o.Stk);
      if (!map.has(k)) map.set(k, { ce: null, pe: null });
      map.get(k)!.pe = o;
    }
    const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
    // ATM = strike closest to spot
    const atmStrike = sorted.reduce((best, [s]) =>
      Math.abs(s - spot) < Math.abs(best - spot) ? s : best, sorted[0]?.[0] ?? spot);

    const atmIdx = sorted.findIndex(([s]) => s === atmStrike);
    // Show 7 ITM + ATM + 7 OTM = 15 strikes
    const start = Math.max(0, atmIdx - 7);
    const end   = Math.min(sorted.length, atmIdx + 8);
    const visible = sorted.slice(start, end);

    return {
      atm: atmStrike,
      rows: visible.map(([strike, { ce, pe }]) => ({
        strike,
        isAtm: strike === atmStrike,
        ceItm: strike < spot,
        ce, pe,
      })),
    };
  }, [raw]);

  const isUp  = (raw?.SPerChng ?? 0) >= 0;
  const fmtN  = (n: number) => n >= 1e7 ? `${(n/1e7).toFixed(2)}Cr` : n >= 1e5 ? `${(n/1e5).toFixed(1)}L` : n > 0 ? n.toLocaleString('en-IN') : '—';
  const fmtOI = (n: number) => n >= 1e7 ? `${(n/1e7).toFixed(2)}Cr` : n >= 1e5 ? `${(n/1e5).toFixed(1)}L` : n > 0 ? n.toLocaleString('en-IN') : '—';
  const fmtDOI = (n: number) => {
    if (!n) return '—';
    const a = Math.abs(n), s = a >= 1e5 ? `${(a/1e5).toFixed(1)}L` : a.toLocaleString('en-IN');
    return (n > 0 ? '+' : '−') + s;
  };

  return (
    <div className="flex flex-col h-full relative" style={{ background: 'var(--panel-bg)' }}>

      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-3 py-2 shrink-0"
        style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <span className="text-xs font-bold" style={{ color: '#4f46e5' }}>NIFTY</span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: 'rgba(79,70,229,0.1)', color: '#4f46e5' }}>Option Chain</span>
        <select value={expiry} onChange={e => setExpiry(e.target.value)}
          className="h-7 px-2 rounded-lg text-xs outline-none ml-1"
          style={{ background: 'var(--field-bg, #f1f5f9)', border: '1px solid var(--field-border, #e2e8f0)', color: 'var(--text-secondary)' }}>
          {EXPIRIES.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
        </select>
        <div className="flex-1" />
        {loading
          ? <RefreshCw size={12} className="animate-spin" style={{ color: '#4f46e5' }} />
          : <button onClick={() => fetchChain(expiry)} className="p-1 rounded hover:opacity-70" style={{ color: 'var(--text-dim)' }}>
              <RefreshCw size={12} />
            </button>
        }
      </div>

      {/* ── Spot strip ── */}
      {raw && (
        <div className="flex items-center gap-3 px-3 py-1.5 shrink-0"
          style={{ borderBottom: '1px solid var(--panel-divider)', background: 'rgba(79,70,229,0.04)' }}>
          <span className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
            {raw.SpotP.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] font-semibold" style={{ color: isUp ? '#16a34a' : '#dc2626' }}>
            {isUp ? '+' : ''}{raw.SChng.toFixed(2)} ({isUp ? '+' : ''}{raw.SPerChng.toFixed(2)}%)
          </span>
          <div className="flex-1" />
          {raw.Rto > 0 && (
            <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
              PCR: <b>{raw.Rto.toFixed(2)}</b>
            </span>
          )}
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
            ATM: <b>{atm.toLocaleString('en-IN')}</b>
          </span>
        </div>
      )}

      {/* ── Column headers ── */}
      <div className="flex items-center shrink-0 text-[9px] font-bold px-1"
        style={{ borderBottom: '1px solid var(--panel-divider)', background: 'var(--table-head-bg, #f8fafc)', height: 24 }}>
        {/* CE side */}
        <div className="flex flex-1 items-center gap-0" style={{ color: '#16a34a' }}>
          <span className="w-14 pl-1">OI</span>
          <span className="w-14">Chng OI</span>
          <span className="w-14">Vol</span>
          <span className="w-10">IV</span>
          <span className="w-14 text-right">LTP</span>
        </div>
        {/* Strike */}
        <div className="w-20 text-center" style={{ color: 'var(--text-dim)', flexShrink: 0 }}>Strike</div>
        {/* PE side */}
        <div className="flex flex-1 items-center justify-end gap-0" style={{ color: '#dc2626' }}>
          <span className="w-14">LTP</span>
          <span className="w-10 text-right">IV</span>
          <span className="w-14 text-right">Vol</span>
          <span className="w-14 text-right">Chng OI</span>
          <span className="w-14 text-right pr-1">OI</span>
        </div>
      </div>

      {/* ── Rows ── */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="flex flex-col items-center justify-center h-32 gap-2">
            <p className="text-xs" style={{ color: '#dc2626' }}>{error}</p>
            <button onClick={() => fetchChain(expiry)}
              className="text-xs px-3 py-1 rounded-lg"
              style={{ background: 'rgba(79,70,229,0.1)', color: '#4f46e5' }}>Retry</button>
          </div>
        )}
        {!error && !raw && !loading && (
          <div className="flex items-center justify-center h-32">
            <p className="text-xs" style={{ color: 'var(--text-dim)' }}>Loading option chain…</p>
          </div>
        )}
        {rows.map(({ strike, isAtm, ceItm, ce, pe }) => {
          const atmBg  = isAtm  ? 'rgba(79,70,229,0.1)'  : 'transparent';
          const ceBg   = !isAtm && ceItm  ? 'rgba(34,197,94,0.04)' : atmBg;
          const peBg   = !isAtm && !ceItm ? 'rgba(96,165,250,0.04)' : atmBg;

          return (
            <div key={strike} className="group flex items-stretch text-[10px] tabular-nums font-mono"
              style={{ borderBottom: '1px solid var(--row-border, #f1f5f9)', minHeight: 30 }}>

              {/* CE side */}
              <div className="flex flex-1 items-center px-1 gap-0" style={{ background: ceBg }}>
                <span className="w-14 truncate" style={{ color: '#16a34a' }}>{ce ? fmtOI(ce.OI) : '—'}</span>
                <span className="w-14 truncate"
                  style={{ color: ce && ce.OIChng > 0 ? '#16a34a' : ce && ce.OIChng < 0 ? '#dc2626' : 'var(--text-dim)' }}>
                  {ce ? fmtDOI(ce.OIChng) : '—'}
                </span>
                <span className="w-14 truncate" style={{ color: 'var(--text-dim)' }}>{ce ? fmtN(ce.Vol) : '—'}</span>
                <span className="w-10 truncate" style={{ color: '#16a34a' }}>{ce ? `${ce.IV.toFixed(1)}%` : '—'}</span>
                <div className="w-14 text-right flex flex-col items-end">
                  <span className="font-semibold" style={{ color: '#16a34a' }}>{ce ? ce.Ltp.toFixed(2) : '—'}</span>
                  <div className="hidden group-hover:flex gap-0.5">
                    <button onClick={() => ce && openOrderPanel(ce.SN, 'BUY')}
                      className="text-[8px] px-1 rounded font-bold text-white" style={{ background: '#16a34a' }}>B</button>
                    <button onClick={() => ce && openOrderPanel(ce.SN, 'SELL')}
                      className="text-[8px] px-1 rounded font-bold text-white" style={{ background: '#dc2626' }}>S</button>
                  </div>
                </div>
              </div>

              {/* Strike */}
              <div className="flex flex-col items-center justify-center shrink-0"
                style={{ width: 80, background: isAtm ? 'rgba(79,70,229,0.15)' : 'transparent' }}>
                <span className={`font-bold ${isAtm ? 'text-[12px]' : 'text-[11px]'}`}
                  style={{ color: isAtm ? '#4f46e5' : 'var(--text-secondary)' }}>
                  {strike.toLocaleString('en-IN')}
                </span>
                {isAtm && <span className="text-[8px] font-bold" style={{ color: '#4f46e5' }}>ATM</span>}
              </div>

              {/* PE side */}
              <div className="flex flex-1 items-center justify-end px-1 gap-0" style={{ background: peBg }}>
                <div className="w-14 flex flex-col items-start">
                  <span className="font-semibold" style={{ color: '#dc2626' }}>{pe ? pe.Ltp.toFixed(2) : '—'}</span>
                  <div className="hidden group-hover:flex gap-0.5">
                    <button onClick={() => pe && openOrderPanel(pe.SN, 'BUY')}
                      className="text-[8px] px-1 rounded font-bold text-white" style={{ background: '#16a34a' }}>B</button>
                    <button onClick={() => pe && openOrderPanel(pe.SN, 'SELL')}
                      className="text-[8px] px-1 rounded font-bold text-white" style={{ background: '#dc2626' }}>S</button>
                  </div>
                </div>
                <span className="w-10 text-right" style={{ color: '#dc2626' }}>{pe ? `${pe.IV.toFixed(1)}%` : '—'}</span>
                <span className="w-14 text-right" style={{ color: 'var(--text-dim)' }}>{pe ? fmtN(pe.Vol) : '—'}</span>
                <span className="w-14 text-right"
                  style={{ color: pe && pe.OIChng > 0 ? '#16a34a' : pe && pe.OIChng < 0 ? '#dc2626' : 'var(--text-dim)' }}>
                  {pe ? fmtDOI(pe.OIChng) : '—'}
                </span>
                <span className="w-14 text-right pr-1" style={{ color: '#dc2626' }}>{pe ? fmtOI(pe.OI) : '—'}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── OVERVIEW PANEL ───────────────────────────────────────────────────────────

interface QuoteDetail {
  ltp: number; open: number; high: number; low: number; close: number;
  netChange: number; percentChange: number; volume: number;
  avgPrice: number; bid: number; ask: number; oi: number;
  upperCircuit: number; lowerCircuit: number;
  week52High: number; week52Low: number;
}

function RangeBar({ min, max, current, lowLabel, highLabel }: {
  min: number; max: number; current: number;
  lowLabel: string; highLabel: string;
}) {
  const pct = max > min ? Math.max(0, Math.min(100, ((current - min) / (max - min)) * 100)) : 50;
  const fmt = (n: number) => n > 0 ? n.toLocaleString('en-IN', { maximumFractionDigits: 2 }) : '—';
  return (
    <div className="flex flex-col gap-2">
      <div className="relative h-2 rounded-full"
        style={{ background: 'linear-gradient(to right, #dc2626, #16a34a)' }}>
        <div className="absolute top-1/2 -translate-x-1/2"
          style={{
            left: `${pct}%`, top: '50%', transform: 'translateX(-50%) translateY(-30%)',
            width: 0, height: 0,
            borderLeft: '5px solid transparent', borderRight: '5px solid transparent',
            borderTop: '8px solid #1e293b',
          }} />
      </div>
      <div className="flex justify-between text-[10px]" style={{ color: 'var(--text-dim)' }}>
        <span>{lowLabel}: {fmt(min)}</span>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>{fmt(current)}</span>
        <span>{highLabel}: {fmt(max)}</span>
      </div>
    </div>
  );
}

function OverviewPanel({ selectedItem }: { selectedItem: WatchlistItem }) {
  const [data, setData] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/quote?symbol=${encodeURIComponent(selectedItem.symbol)}&exchange=${encodeURIComponent(selectedItem.exchange)}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d as QuoteDetail); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedItem.symbol, selectedItem.exchange]);

  const ltp        = data?.ltp        ?? selectedItem.ltp         ?? 0;
  const open       = data?.open       ?? selectedItem.open        ?? 0;
  const high       = data?.high       ?? selectedItem.high        ?? 0;
  const low        = data?.low        ?? selectedItem.low         ?? 0;
  const close      = data?.close      ?? selectedItem.prevClose   ?? 0;
  const netChange  = data?.netChange  ?? selectedItem.change      ?? 0;
  const pctChange  = data?.percentChange ?? selectedItem.changePercent ?? 0;
  const volume     = data?.volume     ?? selectedItem.volume      ?? 0;
  const avgPrice   = data?.avgPrice   ?? 0;
  const bid        = data?.bid        ?? selectedItem.bid         ?? 0;
  const ask        = data?.ask        ?? selectedItem.ask         ?? 0;
  const oi         = data?.oi         ?? selectedItem.oi          ?? 0;
  const upper      = data?.upperCircuit  ?? 0;
  const lower      = data?.lowerCircuit  ?? 0;
  const w52High    = data?.week52High    ?? 0;
  const w52Low     = data?.week52Low     ?? 0;

  const isUp       = netChange >= 0;
  const changeClr  = isUp ? '#16a34a' : '#dc2626';

  const fmtPrice = (n: number) => n > 0
    ? n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—';
  const fmtVol = (n: number) => {
    if (n >= 1e7) return `${(n / 1e7).toFixed(2)}Cr`;
    if (n >= 1e5) return `${(n / 1e5).toFixed(2)}L`;
    return n > 0 ? n.toLocaleString('en-IN') : '—';
  };

  return (
    <div className="flex flex-col overflow-y-auto p-4 gap-5 relative"
      style={{ background: 'var(--panel-bg)', height: '100%' }}>

      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold truncate" style={{ color: 'var(--text-primary)' }}>
              {selectedItem.name || selectedItem.symbol}
            </span>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0"
              style={{ background: 'rgba(79,70,229,0.1)', color: '#4f46e5' }}>
              {selectedItem.exchange}
            </span>
          </div>
          <span className="text-[11px]" style={{ color: 'var(--text-dim)' }}>
            {selectedItem.symbol}
          </span>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="text-xl font-bold tabular-nums" style={{ color: 'var(--text-primary)' }}>
            ₹{fmtPrice(ltp)}
          </span>
          <span className="text-[11px] font-medium tabular-nums" style={{ color: changeClr }}>
            {isUp ? '+' : ''}{fmtPrice(netChange)} ({isUp ? '+' : ''}{pctChange.toFixed(2)}%)
          </span>
        </div>
      </div>

      {/* ── Activity ── */}
      <div>
        <p className="text-[10px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
          Activity
        </p>
        <div className="grid grid-cols-4 gap-2">
          {([
            { label: 'Open',  value: fmtPrice(open),  color: 'var(--text-primary)' },
            { label: 'High',  value: fmtPrice(high),  color: '#16a34a' },
            { label: 'Low',   value: fmtPrice(low),   color: '#dc2626' },
            { label: 'Close', value: fmtPrice(close), color: 'var(--text-primary)' },
          ] as const).map(({ label, value, color }) => (
            <div key={label} className="flex flex-col gap-1 rounded-lg p-2.5"
              style={{ background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--panel-divider)' }}>
              <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                {label}
              </span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Price Details ── */}
      <div>
        <p className="text-[10px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
          Price Details
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Avg Price',     value: fmtPrice(avgPrice) },
            { label: 'Volume',        value: fmtVol(volume) },
            { label: 'Open Interest', value: oi > 0 ? fmtVol(oi) : '—' },
            { label: 'Bid / Ask',     value: (bid > 0 || ask > 0) ? `${fmtPrice(bid)} / ${fmtPrice(ask)}` : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="flex flex-col gap-1 rounded-lg p-2.5"
              style={{ background: 'var(--surface-2, #f8fafc)', border: '1px solid var(--panel-divider)' }}>
              <span className="text-[9px] uppercase tracking-wide" style={{ color: 'var(--text-dim)' }}>
                {label}
              </span>
              <span className="text-[11px] font-semibold tabular-nums" style={{ color: 'var(--text-primary)' }}>
                {value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Circuit Limits ── */}
      {(upper > 0 || lower > 0) && (
        <div>
          <p className="text-[10px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
            Circuit Limits
          </p>
          <RangeBar min={lower} max={upper} current={ltp} lowLabel="Lower" highLabel="Upper" />
        </div>
      )}

      {/* ── 52 Week Range ── */}
      {(w52High > 0 || w52Low > 0) && (
        <div>
          <p className="text-[10px] font-semibold mb-2 uppercase tracking-wider" style={{ color: 'var(--text-dim)' }}>
            52 Week Range
          </p>
          <RangeBar min={w52Low} max={w52High} current={ltp} lowLabel="52W Low" highLabel="52W High" />
        </div>
      )}

      {/* ── Loading overlay ── */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.65)', zIndex: 10 }}>
          <RefreshCw size={18} className="animate-spin" style={{ color: '#4f46e5' }} />
        </div>
      )}
    </div>
  );
}

// ─── CENTER CHART PANEL ───────────────────────────────────────────────────────

type CenterTab = 'chart' | 'overview' | 'optionchain';

interface CenterPanelProps {
  selectedItem:      WatchlistItem | null;
  showOcOverlay:     boolean;
  onToggleOcOverlay: () => void;
  ocSymbol:          string;
  setOcSymbol:       (s: string) => void;
  ocExpiry:          string;
  setOcExpiry:       (e: string) => void;
  onDockOc:          () => void;
  chartTheme:        'light' | 'dark';
  activeTab:         CenterTab;
}

function CenterPanel({
  selectedItem, showOcOverlay, onToggleOcOverlay,
  ocSymbol, setOcSymbol, ocExpiry, setOcExpiry, onDockOc,
  chartTheme, activeTab,
}: CenterPanelProps) {
  const isDark = chartTheme === 'dark';

  const exchange = selectedItem?.exchange ?? 'NSE'; // kept for OC overlay

  return (
    <div className="flex flex-col h-full relative"
      style={{ background: isDark ? '#0d1117' : '#ffffff' }}>

      {/* Chart */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {!selectedItem ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: isDark ? '#0d1117' : '#f8fafc' }}>
            <List size={36} style={{ color: isDark ? '#1e293b' : '#cbd5e1' }} />
            <p className="text-sm font-medium" style={{ color: isDark ? '#475569' : '#94a3b8' }}>
              Select a symbol from the watchlist
            </p>
            <p className="text-xs" style={{ color: isDark ? '#334155' : '#cbd5e1' }}>
              Click any row on the right to open its chart
            </p>
          </div>
        ) : activeTab === 'chart' ? (
          <ReligareChart
            key={`${selectedItem.id}-${selectedItem.exchange}-${chartTheme}`}
            token={selectedItem.id}
            mktsegid={toMktSegId(selectedItem.exchange, selectedItem.instrumentType, (selectedItem as any).segment)}
            theme={chartTheme}
            interval="DAY"
          />
        ) : activeTab === 'overview' ? (
          <OverviewPanel key={`${selectedItem.symbol}-${selectedItem.exchange}`} selectedItem={selectedItem} />
        ) : activeTab === 'optionchain' ? (
          <OptionChainPanel />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: isDark ? '#0d1117' : '#f8fafc' }}>
            <BarChart2 size={36} style={{ color: isDark ? '#1e293b' : '#cbd5e1' }} />
            <p className="text-sm font-medium capitalize" style={{ color: isDark ? '#475569' : '#94a3b8' }}>
              {activeTab} — coming soon
            </p>
          </div>
        )}

        {showOcOverlay && (
          <OcOverlay
            ocSymbol={ocSymbol} setOcSymbol={setOcSymbol}
            ocExpiry={ocExpiry} setOcExpiry={setOcExpiry}
            onClose={onToggleOcOverlay}
            onDock={() => { onDockOc(); onToggleOcOverlay(); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── RIGHT ICON DOCK ──────────────────────────────────────────────────────────

interface RightDockProps {
  activePanel:      DockPanel;
  onToggle:         (panel: DockPanel) => void;
  onToggleOc:       () => void;
  watchlistVisible: boolean;
  onToggleWatchlist:() => void;
}

function RightDock({ activePanel, onToggle, onToggleOc, watchlistVisible, onToggleWatchlist }: RightDockProps) {
  const sidePanels: Array<{ panel: 'positions' | 'orders' | 'depth'; icon: React.ReactNode; label: string }> = [
    { panel: 'positions', icon: <TrendingUp size={15} />, label: 'Positions'    },
    { panel: 'orders',    icon: <FileText size={15} />,   label: 'Orders'       },
    { panel: 'depth',     icon: <BarChart2 size={15} />,  label: 'Market Depth' },
  ];

  const btnBase: React.CSSProperties = {
    width: 36, height: 36,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
    border: 'none',
  };
  const btnIdle: React.CSSProperties = {
    ...btnBase,
    background: 'transparent',
    color: 'var(--text-dim)',
  };
  const btnActive: React.CSSProperties = {
    ...btnBase,
    background: 'rgba(79,70,229,0.15)',
    color: '#4f46e5',
    boxShadow: '0 0 0 1px rgba(79,70,229,0.3)',
  };

  return (
    <div className="flex flex-col items-center shrink-0"
      style={{
        width: 48,
        paddingTop: 10,
        paddingBottom: 10,
        gap: 4,
        background: 'var(--panel-bg)',
        borderLeft: '1px solid var(--panel-divider)',
      }}>

      {/* ── Watchlist toggle ── */}
      <button title={watchlistVisible ? 'Hide Watchlist' : 'Show Watchlist'}
        onClick={onToggleWatchlist}
        style={watchlistVisible ? btnActive : btnIdle}>
        <List size={15} />
      </button>

      {/* divider */}
      <div style={{ width: 24, height: 1, background: 'var(--panel-divider)', margin: '4px 0' }} />

      {/* ── Side panels ── */}
      {sidePanels.map(({ panel, icon, label }) => (
        <button key={panel} title={label}
          onClick={() => onToggle(panel)}
          style={activePanel === panel ? btnActive : btnIdle}>
          {icon}
        </button>
      ))}

      {/* divider */}
      <div style={{ width: 24, height: 1, background: 'var(--panel-divider)', margin: '4px 0' }} />

      {/* ── Option chain ── */}
      <button title="Option Chain" onClick={onToggleOc} style={btnIdle}>
        <Link2 size={15} />
      </button>

      <div style={{ flex: 1 }} />

      {/* ── More (bottom) ── */}
      <button title="More" style={btnIdle}>
        <MoreVertical size={15} />
      </button>
    </div>
  );
}

// ─── CHART MODE ROOT ──────────────────────────────────────────────────────────

interface ChartModeProps {
  items:           WatchlistItem[];
  activeWL:        number;
  setActiveWL:     (i: number) => void;
  onSwitchToTable: () => void;
  onAdd:           (item: WatchlistItem) => void;
  onRemove:        (id: string) => void;
  initialSymbol?:  WatchlistItem | null;
}

function ChartMode({ items, activeWL, setActiveWL, onAdd, onRemove, onSwitchToTable, initialSymbol }: ChartModeProps) {
  const initItem = initialSymbol ?? items[0] ?? null;
  const [selectedItem, setSelectedItem]   = useState<WatchlistItem | null>(initItem);
  const [dockOc, setDockOc]               = useState(false);
  const [showOcOverlay, setShowOcOverlay] = useState(false);
  const [activePanel, setActivePanel]     = useState<DockPanel>(null);
  const [ocSymbol, setOcSymbol]           = useState('NIFTY');
  const [ocExpiry, setOcExpiry]           = useState(EXPIRIES[0]);
  const [showWatchlist, setShowWatchlist] = useState(true);
  const [activeTab, setActiveTab]         = useState<CenterTab>('chart');

  // Sync chart theme with global app theme automatically
  const { theme: globalTheme } = useTheme();
  const chartTheme = (globalTheme === 'dark' || (globalTheme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)) ? 'dark' : 'light';

  const CENTER_TABS: Array<{ key: CenterTab; label: string }> = [
    { key: 'chart',       label: 'Chart'             },
    { key: 'optionchain', label: 'Option Chain'      },
    { key: 'overview',    label: 'Overview'           },
  ];

  useEffect(() => {
    if (!selectedItem && items.length > 0) setSelectedItem(items[0]);
  }, [items, selectedItem]);

  function togglePanel(panel: DockPanel) {
    setActivePanel(prev => prev === panel ? null : panel);
  }

  return (
    <div className="flex h-full">

      {/* ── LEFT: tab bar + chart (column) ── */}
      <div className="flex-1 min-w-0 flex flex-col">

        {/* Tab bar — spans chart width only */}
        <div className="flex items-center shrink-0"
          style={{ height: 40, borderBottom: '1px solid var(--panel-divider)', background: 'var(--panel-bg)', paddingLeft: 8, paddingRight: 8 }}>

          {/* Tabs */}
          {CENTER_TABS.map(t => (
            <button key={t.key}
              onClick={() => setActiveTab(t.key)}
              className="px-3 h-10 text-[11px] font-medium transition-all relative whitespace-nowrap"
              style={activeTab === t.key
                ? { color: '#4f46e5', borderBottom: '2px solid #4f46e5' }
                : { color: 'var(--text-label)', borderBottom: '2px solid transparent' }}>
              {t.label}
            </button>
          ))}

          <div className="flex-1" />

          {/* SCALPER MODE — styled like Image #27 */}
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg mr-1.5 text-[11px] font-bold transition-all hover:opacity-90 shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(79,70,229,0.18) 0%, rgba(124,58,237,0.18) 100%)',
              color: '#4f46e5',
              border: '1px solid rgba(79,70,229,0.35)',
              boxShadow: '0 1px 4px rgba(79,70,229,0.15)',
            }}>
            <Zap size={11} strokeWidth={2.5} />
            SCALPER MODE
            <ExternalLink size={10} strokeWidth={2} style={{ opacity: 0.7 }} />
          </button>

          {/* Maximize */}
          <button className="flex items-center justify-center rounded-lg transition-all hover:opacity-80 shrink-0"
            style={{ width: 28, height: 28, color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
            <Maximize2 size={13} />
          </button>
        </div>

        {/* Chart content */}
        <div className="flex-1 min-h-0">
          <CenterPanel
            selectedItem={selectedItem}
            showOcOverlay={showOcOverlay}
            onToggleOcOverlay={() => setShowOcOverlay(p => !p)}
            ocSymbol={ocSymbol} setOcSymbol={setOcSymbol}
            ocExpiry={ocExpiry} setOcExpiry={setOcExpiry}
            onDockOc={() => setDockOc(true)}
            chartTheme={chartTheme}
            activeTab={activeTab}
          />
        </div>
      </div>

      {/* Optional side panels */}
      {activePanel && (
        <div style={{ width: 300, flexShrink: 0, overflow: 'hidden', borderLeft: '1px solid var(--panel-divider)' }}>
          {activePanel === 'positions' && <PositionsPanel onClose={() => setActivePanel(null)} />}
          {activePanel === 'orders'    && <OrdersPanel    onClose={() => setActivePanel(null)} />}
          {activePanel === 'depth'     && <MarketDepthPanel onClose={() => setActivePanel(null)} />}
        </div>
      )}

      {/* Right dock icon bar */}
      <RightDock
        activePanel={activePanel}
        onToggle={togglePanel}
        onToggleOc={() => setShowOcOverlay(p => !p)}
        watchlistVisible={showWatchlist}
        onToggleWatchlist={() => setShowWatchlist(p => !p)}
      />

      {/* ── RIGHT: Watchlist (header aligns with tab bar row) ── */}
      {showWatchlist && (
        <div style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--panel-divider)' }}>
          <LeftPanel
            items={items}
            activeWL={activeWL}
            setActiveWL={setActiveWL}
            selectedId={selectedItem?.id ?? null}
            onSelect={item => { setSelectedItem(item); setDockOc(false); }}
            onAdd={onAdd}
            onRemove={(id) => { onRemove(id); if (selectedItem?.id === id) setSelectedItem(items.find(i => i.id !== id) ?? null); }}
            docked={dockOc}
            onUndock={() => setDockOc(false)}
            ocSymbol={ocSymbol} setOcSymbol={setOcSymbol}
            ocExpiry={ocExpiry} setOcExpiry={setOcExpiry}
            onHide={() => setShowWatchlist(false)}
            onSwitchToTable={onSwitchToTable}
          />
        </div>
      )}
    </div>
  );
}

// ─── PAGE ROOT ────────────────────────────────────────────────────────────────

// Guard: if DevTools are open, render nothing at all — no hooks run, no API
// calls fire, no chart iframes load. Close DevTools to access the watchlist.
export default function WatchlistPage() {
  const devToolsOpen = useDevToolsDetection();
  if (devToolsOpen) return null;
  return <WatchlistContent />;
}

function WatchlistContent() {
  const [items, setItems]         = useState<WatchlistItem[]>([]);
  const [activeWL, setActiveWL]   = useState(0);
  const [viewMode, setViewMode]   = useState<'chart' | 'table'>('chart');
  const [initialSymbol, setInitialSymbol] = useState<WatchlistItem | null>(null);
  const [loaded, setLoaded]       = useState(false);

  const wlName = WATCHLIST_NAMES[activeWL] ?? 'Watchlist1';

  // Read URL params on mount (e.g. /watchlist?sym=RELIANCE&exch=NSE&token=2885&name=Reliance&type=EQ)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const sym   = sp.get('sym');
    const exch  = (sp.get('exch') ?? 'NSE') as 'NSE' | 'BSE';
    const token = sp.get('token') ?? '';
    const name  = sp.get('name')  ?? sym ?? '';
    const type  = (sp.get('type') ?? 'EQ') as WatchlistItem['instrumentType'];
    if (sym) {
      setInitialSymbol({
        id: token || sym, symbol: sym, name, exchange: exch, instrumentType: type,
        ltp: 0, change: 0, changePercent: 0,
        bid: 0, ask: 0, volume: 0, high: 0, low: 0, open: 0, prevClose: 0,
      });
    }
  }, []);

  // Load from localStorage on mount and when switching tabs
  useEffect(() => {
    setItems(loadFromStorage(wlName));
    setLoaded(true);
  }, [wlName]);

  // Persist to localStorage whenever items change — only after initial load
  useEffect(() => {
    if (loaded) saveToStorage(wlName, items);
  }, [items, wlName, loaded]);

  function handleAdd(item: WatchlistItem) {
    setItems(prev => prev.some(i => i.id === item.id) ? prev : [item, ...prev]);
  }

  function handleRemove(id: string) {
    setItems(prev => prev.filter(i => i.id !== id));
  }

  // Live prices via WebSocket (replaces REST polling)
  useWatchlistPrices(items, setItems);

  return (
    <div style={{
      height:        'calc(100vh - 64px)',
      display:       'flex',
      flexDirection: 'column',
      overflow:      'hidden',
    }}>
      <div className="flex-1 min-h-0 overflow-hidden">
        {viewMode === 'table' ? (
          <TableView
            items={items}
            activeWL={activeWL}
            setActiveWL={setActiveWL}
            onSwitchToChart={() => setViewMode('chart')}
            onSelectSymbol={() => setViewMode('chart')}
          />
        ) : (
          <ChartMode
            items={items}
            activeWL={activeWL}
            setActiveWL={setActiveWL}
            onSwitchToTable={() => setViewMode('table')}
            onAdd={handleAdd}
            onRemove={handleRemove}
            initialSymbol={initialSymbol}
          />
        )}
      </div>
    </div>
  );
}
