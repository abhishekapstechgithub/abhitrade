'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Plus, Search, Settings, BarChart2, RefreshCw, X,
  TrendingUp, TrendingDown, Star, MoreVertical, ChevronDown,
} from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { useRealScrips } from '@/lib/hooks/useRealScrips';
import { formatNumber, formatPercent } from '@/lib/utils/format';
import type { WatchlistItem } from '@/types';

const CYAN  = '0,212,255';
const BLUE  = '41,121,255';

const WATCHLIST_NAMES = ['Watchlist1', 'Watchlist2', 'F&O Watch', 'Intraday'];
const SORT_OPTIONS    = ['Default', 'Change %', 'LTP', 'Volume'];

interface SearchResult {
  token: string; exchange: string; symbol: string;
  tradingSymbol: string; name: string; instrumentType: string;
  underlying: string; expiry?: string; strike?: string; optionType?: string;
}

// ── Instrument type badge styles ──────────────────────────────────────────────
function typeStyles(t: string): { color: string; bg: string; border: string } {
  if (t === 'CE')  return { color: 'var(--accent-green)', bg: 'rgba(var(--gain-rgb),0.1)', border: '1px solid rgba(var(--gain-rgb),0.2)' };
  if (t === 'PE')  return { color: 'var(--accent-red)',   bg: 'rgba(var(--loss-rgb),0.1)', border: '1px solid rgba(var(--loss-rgb),0.2)' };
  if (t === 'FUT') return { color: 'rgb(255,215,64)', bg: 'rgba(255,215,64,0.1)', border: '1px solid rgba(255,215,64,0.2)' };
  return { color: `rgb(${CYAN})`, bg: `rgba(${CYAN},0.1)`, border: `1px solid rgba(${CYAN},0.2)` };
}

// ── Format expiry string ──────────────────────────────────────────────────────
function fmtExpiry(expiry?: string) {
  if (!expiry) return '';
  const d = new Date(expiry);
  if (isNaN(d.getTime())) return expiry;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function WatchlistPage() {
  const { openOrderPanel } = useUIStore();
  const { items: baseItems, loading } = useRealScrips();
  const [items, setItems]             = useState<WatchlistItem[]>([]);
  const [activeWL, setActiveWL]       = useState(0);
  const [search, setSearch]           = useState('');
  const [sortBy, setSortBy]           = useState('Default');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showDropdown, setShowDropdown]   = useState(false);
  const searchRef  = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { if (!loading) setItems(baseItems); }, [loading, baseItems]);

  // Redis autocomplete
  useEffect(() => {
    if (search.length < 2) { setSearchResults([]); setShowDropdown(false); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(search)}&limit=12`);
        const data = await res.json();
        if (data.results?.length) { setSearchResults(data.results); setShowDropdown(true); }
        else { setSearchResults([]); setShowDropdown(false); }
      } catch { setSearchResults([]); }
      finally { setSearchLoading(false); }
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [search]);

  // Close dropdown on outside click
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const addFromSearch = useCallback((r: SearchResult) => {
    const already = items.some(i => i.id === r.token || i.symbol === r.symbol);
    if (!already) {
      const newItem: WatchlistItem = {
        id: r.token, symbol: r.symbol, name: r.name,
        exchange: r.exchange as 'NSE' | 'BSE',
        instrumentType: r.instrumentType as WatchlistItem['instrumentType'],
        ltp: 0, change: 0, changePercent: 0,
        bid: 0, ask: 0, volume: 0, high: 0, low: 0, open: 0, prevClose: 0,
      };
      setItems(prev => [newItem, ...prev]);
    }
    setSearch(''); setShowDropdown(false);
  }, [items]);

  const removeItem = (id: string) => setItems(prev => prev.filter(i => i.id !== id));

  const sorted = [...items].sort((a, b) => {
    if (sortBy === 'Change %') return Math.abs(b.changePercent) - Math.abs(a.changePercent);
    if (sortBy === 'LTP')      return b.ltp - a.ltp;
    if (sortBy === 'Volume')   return b.volume - a.volume;
    return 0;
  });

  const topGainers = [...items].filter(i => i.changePercent > 0).sort((a,b) => b.changePercent - a.changePercent).slice(0,5);
  const topLosers  = [...items].filter(i => i.changePercent < 0).sort((a,b) => a.changePercent - b.changePercent).slice(0,5);

  return (
    <div className="max-w-[1600px] mx-auto px-4 py-4">
      <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">

        {/* ── LEFT: Compact broker-style watchlist panel ──────────────────── */}
        <div className="flex flex-col" style={{ height: 'calc(100vh - 90px)', minHeight: 500 }}>
          <div className="flex flex-col h-full rounded-2xl overflow-hidden border"
            style={{ background: 'var(--panel-bg)', borderColor: 'var(--panel-divider)' }}>

            {/* Watchlist tab selector */}
            <div className="flex items-center justify-between px-3 py-2"
              style={{ borderBottom: '1px solid var(--panel-divider)' }}>
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {WATCHLIST_NAMES.map((name, i) => (
                  <button key={i} onClick={() => setActiveWL(i)}
                    className="shrink-0 px-3 py-1 text-xs font-semibold rounded-md transition-all"
                    style={activeWL === i
                      ? { background: `rgba(${BLUE},0.12)`, color: `rgb(${CYAN})`, borderBottom: `2px solid rgb(${CYAN})` }
                      : { color: 'var(--text-dim)' }}>
                    {name}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button className="p-1 rounded hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-label)' }}>
                  <Plus size={14} />
                </button>
                <button className="p-1 rounded hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--text-label)' }}>
                  <Settings size={13} />
                </button>
              </div>
            </div>

            {/* Search bar */}
            <div className="px-3 py-2" style={{ borderBottom: '1px solid var(--panel-divider)' }}
              ref={searchRef}>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2"
                  style={{ color: 'var(--text-label)' }} />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  placeholder="Search"
                  className="w-full h-7 pl-8 pr-7 rounded-lg text-xs outline-none"
                  style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)' }} />
                {search && (
                  <button onClick={() => { setSearch(''); setShowDropdown(false); }}
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    style={{ color: 'var(--text-label)' }}>
                    <X size={10} />
                  </button>
                )}
                {searchLoading && (
                  <RefreshCw size={10} className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin"
                    style={{ color: `rgb(${CYAN})` }} />
                )}

                {/* Dropdown */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 shadow-xl"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-med)' }}>
                    <div className="px-3 py-1.5 flex items-center justify-between"
                      style={{ borderBottom: '1px solid var(--panel-divider)' }}>
                      <span className="text-[10px] font-semibold" style={{ color: `rgb(${CYAN})` }}>
                        {searchResults.length} results
                      </span>
                      <span className="text-[11px]" style={{ color: 'var(--text-label)' }}>Tap to add</span>
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {searchResults.map(r => {
                        const inList = items.some(i => i.id === r.token);
                        const ts = typeStyles(r.instrumentType);
                        return (
                          <button key={`${r.exchange}-${r.token}`}
                            onClick={() => !inList && addFromSearch(r)}
                            disabled={inList}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left transition-colors"
                            style={{ borderBottom: '1px solid var(--row-border)' }}
                            onMouseEnter={e => !inList && (e.currentTarget.style.background = 'var(--row-hover-bg)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            <span className="text-[11px] px-1 py-0.5 rounded font-bold shrink-0"
                              style={{ background: ts.bg, color: ts.color, border: ts.border }}>
                              {r.instrumentType}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold truncate"
                                style={{ color: inList ? 'var(--text-label)' : 'var(--text-bright)' }}>
                                {r.symbol}
                              </div>
                              <div className="text-[10px] truncate" style={{ color: 'var(--text-label)' }}>{r.name}</div>
                            </div>
                            <span className="text-[11px] shrink-0" style={{ color: 'var(--text-label)' }}>{r.exchange}</span>
                            {inList
                              ? <span className="text-[11px]" style={{ color: 'var(--accent-green)' }}>✓</span>
                              : <span className="text-[11px] px-1 py-0.5 rounded"
                                  style={{ background: `rgba(${CYAN},0.1)`, color: `rgb(${CYAN})` }}>+</span>
                            }
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Sort bar */}
            <div className="flex items-center justify-between px-3 py-1.5"
              style={{ borderBottom: '1px solid var(--panel-divider)' }}>
              {loading && (
                <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--accent-cyan)' }}>
                  <RefreshCw size={9} className="animate-spin" /> Loading…
                </span>
              )}
              {!loading && (
                <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>
                  {sorted.length} instruments
                </span>
              )}
              <div className="flex items-center gap-1">
                <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>Sort:</span>
                <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                  className="h-6 px-1.5 rounded text-[10px] outline-none"
                  style={{ background: 'var(--field-bg)', border: '1px solid var(--field-border)', color: 'var(--text-secondary)' }}>
                  {SORT_OPTIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
            </div>

            {/* Instrument list */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
              {sorted.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full gap-2 py-16">
                  <Search size={28} style={{ color: 'var(--text-label)', opacity: 0.4 }} />
                  <p className="text-xs" style={{ color: 'var(--text-label)' }}>No instruments added yet</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-dim)' }}>Search above to add scrips</p>
                </div>
              )}
              {sorted.map(item => (
                <WatchlistRow key={item.id} item={item}
                  onBuy={() => openOrderPanel(item.symbol, 'BUY')}
                  onSell={() => openOrderPanel(item.symbol, 'SELL')}
                  onRemove={() => removeItem(item.id)} />
              ))}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Stats panels ──────────────────────────────────────────── */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MoverCard title="Top Gainers" items={topGainers} positive />
            <MoverCard title="Top Losers"  items={topLosers}  positive={false} />
          </div>
          <SummaryCard items={items} />
        </div>
      </div>
    </div>
  );
}

// ── Compact broker-style row ──────────────────────────────────────────────────
function WatchlistRow({
  item, onBuy, onSell, onRemove,
}: { item: WatchlistItem; onBuy: () => void; onSell: () => void; onRemove: () => void }) {
  const pos   = item.changePercent >= 0;
  const priceColor = pos ? 'var(--accent-green)' : 'var(--accent-red)';
  const isDeriv = ['CE','PE','FUT'].includes(item.instrumentType);
  const ts    = typeStyles(item.instrumentType);

  // Mock expiry/strike for display when real data exists
  const expiry = (item as WatchlistItem & { expiry?: string; strike?: number; optionType?: string }).expiry;
  const strike = (item as WatchlistItem & { expiry?: string; strike?: number; optionType?: string }).strike;
  const optType = item.instrumentType === 'CE' ? 'CE' : item.instrumentType === 'PE' ? 'PE' : '';

  return (
    <div className="group relative flex items-center px-3 py-0 transition-colors cursor-pointer"
      style={{ borderBottom: '1px solid var(--row-border)', minHeight: 54 }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
      onMouseLeave={e => (e.currentTarget.style.background = '')}>

      {/* Left: symbol info */}
      <div className="flex-1 min-w-0 py-2">
        {/* Line 1: symbol + exchange + type badges */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-bold leading-none" style={{ color: 'var(--text-bright)' }}>
            {item.symbol}
          </span>
          <span className="text-[11px] font-semibold px-1 rounded"
            style={{ background: 'var(--card-inner-bg)', color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
            {item.exchange}
          </span>
          {isDeriv && (
            <span className="text-[11px] font-bold px-1 rounded"
              style={{ background: ts.bg, color: ts.color, border: ts.border }}>
              {item.instrumentType === 'CE' || item.instrumentType === 'PE' ? 'OPT' : item.instrumentType}
            </span>
          )}
        </div>

        {/* Line 2: expiry / strike / type for derivatives | name for equity */}
        <div className="mt-0.5 text-[10px] leading-none truncate" style={{ color: 'var(--text-label)' }}>
          {isDeriv && expiry
            ? `${fmtExpiry(expiry)}${strike ? ` ${strike.toLocaleString('en-IN')}` : ''} ${optType}`
            : item.name}
        </div>
      </div>

      {/* Right: LTP + change — hidden when actions show */}
      <div className="text-right shrink-0 group-hover:hidden">
        <div className="text-sm font-bold font-mono leading-none"
          style={{ color: item.ltp > 0 ? priceColor : 'var(--text-dim)' }}>
          {item.ltp > 0 ? formatNumber(item.ltp) : '—'}
        </div>
        {item.ltp > 0 && (
          <div className="mt-0.5 text-[10px] font-semibold leading-none"
            style={{ color: priceColor }}>
            {pos ? '+' : ''}{formatNumber(Math.abs(item.change))} ({formatPercent(item.changePercent)})
          </div>
        )}
      </div>

      {/* Hover action buttons */}
      <div className="hidden group-hover:flex items-center gap-1 shrink-0">
        <button onClick={e => { e.stopPropagation(); onBuy(); }}
          className="h-6 px-2 rounded text-[10px] font-bold text-white transition-opacity hover:opacity-80"
          style={{ background: 'var(--accent-green)' }}>B</button>
        <button onClick={e => { e.stopPropagation(); onSell(); }}
          className="h-6 px-2 rounded text-[10px] font-bold text-white transition-opacity hover:opacity-80"
          style={{ background: 'var(--accent-red)' }}>S</button>
        <button
          className="h-6 px-1.5 rounded text-[10px] font-medium transition-opacity hover:opacity-80"
          style={{ background: 'var(--field-bg)', color: 'var(--text-accent)', border: '1px solid var(--field-border)' }}>
          <BarChart2 size={11} />
        </button>
        <button onClick={e => { e.stopPropagation(); onRemove(); }}
          className="h-6 w-5 rounded flex items-center justify-center transition-opacity hover:opacity-70"
          style={{ color: 'var(--accent-red)' }}>
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Mover card (right panel) ──────────────────────────────────────────────────
function MoverCard({ title, items, positive }: { title: string; items: WatchlistItem[]; positive: boolean }) {
  const accentColor = positive ? 'var(--accent-green)' : 'var(--accent-red)';
  const Icon = positive ? TrendingUp : TrendingDown;
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-divider)' }}>
      <div className="flex items-center gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
        <Icon size={13} style={{ color: accentColor }} />
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>{title}</span>
      </div>
      <div>
        {items.length === 0 && (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text-label)' }}>No data</p>
        )}
        {items.map(item => (
          <div key={item.id} className="flex items-center justify-between px-4 py-2.5 transition-colors"
            style={{ borderBottom: '1px solid var(--row-border)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--row-hover-bg)')}
            onMouseLeave={e => (e.currentTarget.style.background = '')}>
            <div>
              <div className="text-xs font-bold" style={{ color: 'var(--text-bright)' }}>{item.symbol}</div>
              <div className="text-[10px]" style={{ color: 'var(--text-label)' }}>{item.exchange}</div>
            </div>
            <div className="text-right">
              <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-bright)' }}>
                {item.ltp > 0 ? `₹${formatNumber(item.ltp)}` : '—'}
              </div>
              <div className="text-[10px] font-semibold" style={{ color: accentColor }}>
                {item.ltp > 0 ? formatPercent(item.changePercent) : '—'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Summary stats card ────────────────────────────────────────────────────────
function SummaryCard({ items }: { items: WatchlistItem[] }) {
  const gainers = items.filter(i => i.changePercent > 0).length;
  const losers  = items.filter(i => i.changePercent < 0).length;
  const flat    = items.filter(i => i.changePercent === 0).length;
  return (
    <div className="rounded-2xl p-4" style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-divider)' }}>
      <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>Watchlist Summary</h3>
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Gainers', value: gainers, color: 'var(--accent-green)', bg: 'rgba(var(--gain-rgb),0.07)', border: 'rgba(var(--gain-rgb),0.18)' },
          { label: 'Losers',  value: losers,  color: 'var(--accent-red)',   bg: 'rgba(var(--loss-rgb),0.07)', border: 'rgba(var(--loss-rgb),0.18)' },
          { label: 'Flat',    value: flat,    color: 'var(--text-dim)',      bg: 'rgba(139,164,204,0.07)',     border: 'rgba(139,164,204,0.18)' },
        ].map(({ label, value, color, bg, border }) => (
          <div key={label} className="rounded-xl p-3 text-center"
            style={{ background: bg, border: `1px solid ${border}` }}>
            <div className="text-lg font-bold font-mono" style={{ color }}>{value}</div>
            <div className="text-[10px] font-medium" style={{ color: 'var(--text-label)' }}>{label}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--progress-track)' }}>
          {items.length > 0 && (
            <div className="h-full rounded-full transition-all"
              style={{ width: `${(gainers / items.length) * 100}%`, background: 'var(--accent-green)' }} />
          )}
        </div>
        <span className="text-[10px] shrink-0" style={{ color: 'var(--text-label)' }}>
          {items.length} total
        </span>
      </div>
    </div>
  );
}
