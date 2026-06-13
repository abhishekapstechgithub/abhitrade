'use client';
import { useState, useRef, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { ReligareChart, toMktSegId } from '@/components/charts/ReligareChart';

interface Instrument {
  token: string;
  exchange: string;
  symbol: string;
  name: string;
  instrumentType: string;
  segment?: string;
}

const DEFAULT: Instrument = {
  token: '99926000', exchange: 'NSE', symbol: 'NIFTY 50',
  name: 'NIFTY 50', instrumentType: 'IDX', segment: 'CM',
};

export function ChartsPanel() {
  const [selected, setSelected] = useState<Instrument>(DEFAULT);
  const [query,    setQuery]    = useState('');
  const [results,  setResults]  = useState<Instrument[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [showDrop, setShowDrop] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setShowDrop(false); return; }
    setLoading(true);
    try {
      const res  = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=10`, { cache: 'no-store' });
      const data = await res.json() as { results: Instrument[] };
      setResults(data.results ?? []);
      setShowDrop(true);
    } catch { setResults([]); }
    finally { setLoading(false); }
  }, []);

  function handleInput(val: string) {
    setQuery(val);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => doSearch(val), 250);
  }

  function select(r: Instrument) {
    setSelected(r);
    setQuery('');
    setShowDrop(false);
    setResults([]);
  }

  const mktsegid = toMktSegId(selected.exchange, selected.instrumentType, selected.segment);

  return (
    <div className="rounded-xl overflow-hidden w-full flex flex-col"
      style={{ height: 'calc(100vh - 160px)', minHeight: 560, border: '1px solid #e2e8f0', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>

      {/* Symbol search bar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200 shrink-0">
        <div className="relative flex-1 max-w-xs" ref={dropRef}>
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200">
            {loading
              ? <Loader2 size={13} className="animate-spin text-slate-400 shrink-0" />
              : <Search size={13} className="text-slate-400 shrink-0" />}
            <input
              value={query}
              onChange={e => handleInput(e.target.value)}
              onFocus={() => query && setShowDrop(true)}
              placeholder="Search symbol…"
              className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 outline-none"
            />
          </div>

          {showDrop && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl overflow-hidden z-50 bg-white shadow-xl border border-slate-200"
              style={{ maxHeight: 260, overflowY: 'auto' }}>
              {results.map(r => (
                <button key={`${r.exchange}-${r.token}`}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors"
                  onClick={() => select(r)}>
                  <span className="text-xs font-bold text-slate-800">{r.symbol}</span>
                  <span className="text-[10px] px-1 py-0.5 rounded bg-blue-50 text-blue-600 font-semibold">{r.exchange}</span>
                  <span className="text-[10px] px-1 py-0.5 rounded bg-slate-100 text-slate-500">{r.instrumentType}</span>
                  <span className="text-[10px] text-slate-400 truncate ml-auto">{r.name}</span>
                </button>
              ))}
            </div>
          )}

          {showDrop && results.length === 0 && !loading && query.length > 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 rounded-xl px-4 py-3 text-xs text-slate-400 bg-white border border-slate-200 shadow">
              No results for &ldquo;{query}&rdquo;
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
          <span>{selected.symbol}</span>
          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-bold text-[10px]">{selected.exchange}</span>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ReligareChart
          key={`${selected.token}-${selected.exchange}`}
          token={selected.token}
          mktsegid={mktsegid}
          theme="light"
          interval="DAY"
        />
      </div>
    </div>
  );
}
