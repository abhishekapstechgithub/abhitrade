'use client';
import dynamic from 'next/dynamic';
import { X, ExternalLink, Search, Loader2 } from 'lucide-react';
import { useChartStore } from '@/store/useChartStore';
import { useEffect, useState, useRef, useCallback } from 'react';

const LightweightChartView = dynamic(
  () => import('./LightweightChart').then(m => ({ default: m.LightweightChartView })),
  { ssr: false, loading: () => (
    <div className="flex items-center justify-center h-full" style={{ background: '#0d1117' }}>
      <span className="text-xs text-slate-400">Loading chart…</span>
    </div>
  )},
);

interface SearchResult {
  token: string; exchange: string; symbol: string;
  tradingSymbol: string; name: string; instrumentType: string;
}

export function ChartModal() {
  const { isOpen, target, openChart, closeChart } = useChartStore();

  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<SearchResult[]>([]);
  const [searching, setSearching]   = useState(false);
  const [showDrop, setShowDrop]     = useState(false);
  const [activeIdx, setActiveIdx]   = useState(-1);
  const inputRef  = useRef<HTMLInputElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close on Escape — close dropdown first, then modal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDrop) { setShowDrop(false); setQuery(''); }
        else closeChart();
      }
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
      if (e.key === 'Enter' && activeIdx >= 0 && results[activeIdx]) {
        selectResult(results[activeIdx]);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, showDrop, closeChart, results, activeIdx]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  // Reset search state when modal opens with new symbol
  useEffect(() => {
    setQuery('');
    setShowDrop(false);
    setResults([]);
    setActiveIdx(-1);
  }, [target?.symbol]);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setShowDrop(false); return; }
    setSearching(true);
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=8`, { cache: 'no-store' });
      const data = await res.json() as { results: SearchResult[] };
      setResults(data.results ?? []);
      setShowDrop(true);
      setActiveIdx(-1);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => doSearch(val), 250);
  }

  function selectResult(r: SearchResult) {
    openChart({ symbol: r.symbol, exchange: r.exchange, token: r.token, name: r.name, instrumentType: r.instrumentType });
    setQuery('');
    setShowDrop(false);
    setResults([]);
    setActiveIdx(-1);
    inputRef.current?.blur();
  }

  function handleClickOutside(e: React.MouseEvent) {
    if (!dropRef.current?.contains(e.target as Node)) {
      setShowDrop(false);
      setQuery('');
    }
  }

  if (!isOpen || !target) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[999]"
        style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}
        onClick={closeChart} />

      {/* Modal panel */}
      <div className="fixed z-[1000] rounded-2xl overflow-hidden flex flex-col"
        style={{
          top: '4vh', left: '50%', transform: 'translateX(-50%)',
          width: 'min(1040px, 96vw)', height: '88vh',
          background: '#0d1117',
          border: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.7)',
        }}
        onClick={handleClickOutside}>

        {/* ── Modal header ── */}
        <div className="flex items-center gap-3 px-4 py-2.5 shrink-0"
          style={{ background: '#111827', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>

          {/* Left: symbol label */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-bold text-slate-400">Chart</span>
            <span className="text-slate-600">·</span>
            <span className="text-xs font-bold text-white">{target.name || target.symbol}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: 'rgba(41,121,255,0.15)', color: 'rgb(0,212,255)', border: '1px solid rgba(41,121,255,0.3)' }}>
              {target.exchange}
            </span>
          </div>

          {/* Centre: symbol search */}
          <div className="flex-1 relative" ref={dropRef} onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              {searching
                ? <Loader2 size={12} className="animate-spin text-slate-500 shrink-0" />
                : <Search size={12} className="text-slate-500 shrink-0" />}
              <input
                ref={inputRef}
                value={query}
                onChange={e => handleInput(e.target.value)}
                onFocus={() => query && setShowDrop(true)}
                placeholder="Search any symbol…"
                className="flex-1 bg-transparent text-xs text-slate-300 placeholder-slate-600 outline-none min-w-0"
                style={{ minWidth: 0 }}
              />
            </div>

            {/* Dropdown */}
            {showDrop && results.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50"
                style={{
                  background: '#1a2332',
                  border: '1px solid rgba(255,255,255,0.12)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
                  maxHeight: 280,
                  overflowY: 'auto',
                }}>
                {results.map((r, idx) => (
                  <button key={`${r.exchange}-${r.token}`}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
                    style={{ background: idx === activeIdx ? 'rgba(41,121,255,0.2)' : 'transparent' }}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={() => selectResult(r)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{r.symbol}</span>
                        <span className="text-[9px] px-1 py-0.5 rounded font-bold"
                          style={{ background: 'rgba(41,121,255,0.2)', color: 'rgb(0,212,255)' }}>
                          {r.exchange}
                        </span>
                        <span className="text-[9px] px-1 py-0.5 rounded"
                          style={{ background: 'rgba(255,255,255,0.07)', color: '#94a3b8' }}>
                          {r.instrumentType}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{r.name}</div>
                    </div>
                    <span className="text-[10px] text-slate-500 shrink-0">Open Chart →</span>
                  </button>
                ))}
              </div>
            )}

            {showDrop && results.length === 0 && !searching && query.length > 1 && (
              <div className="absolute top-full left-0 right-0 mt-1 rounded-xl px-4 py-3 text-xs text-slate-500"
                style={{ background: '#1a2332', border: '1px solid rgba(255,255,255,0.1)' }}>
                No symbols found for &ldquo;{query}&rdquo;
              </div>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-1 shrink-0">
            <a href={`/markets?tab=charts&symbol=${target.symbol}`}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}
              title="Open in full charts page">
              <ExternalLink size={13} />
            </a>
            <button onClick={closeChart}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Chart fills remaining space */}
        <div className="flex-1 min-h-0">
          <LightweightChartView
            symbol={target.symbol}
            exchange={target.exchange}
            token={target.token}
            name={target.name}
            instrumentType={target.instrumentType}
            underlying={target.underlying}
          />
        </div>
      </div>
    </>
  );
}
