'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, X, Clock, BarChart2 } from 'lucide-react';
import { useUIStore } from '@/store/useUIStore';
import { cn } from '@/lib/utils/format';
import Link from 'next/link';

const RECENT_SEARCHES = ['SUZLON', 'RELIANCE', 'NIFTY', 'BANKNIFTY'];

const TYPE_COLORS: Record<string, string> = {
  EQ: 'bg-blue-100 text-blue-700',
  FUT: 'bg-orange-100 text-orange-700',
  CE: 'bg-green-100 text-green-700',
  PE: 'bg-red-100 text-red-700',
  INDEX: 'bg-purple-100 text-purple-700',
  ETF: 'bg-teal-100 text-teal-700',
};

const FILTERS = ['All', 'Equity', 'F&O', 'Options', 'Futures', 'NSE', 'BSE'];

interface SearchResult {
  token: string;
  symbol: string;
  tradingSymbol: string;
  name: string;
  exchange: string;
  instrumentType: string;
  expiry?: string;
  strike?: number;
  optionType?: string;
}

function filterToParams(filter: string): { exchange?: string; type?: string } {
  switch (filter) {
    case 'Equity': return { type: 'EQ' };
    case 'F&O': return { type: 'FO' };
    case 'Options': return { type: 'OPTIONS' };
    case 'Futures': return { type: 'FUTURES' };
    case 'NSE': return { exchange: 'NSE' };
    case 'BSE': return { exchange: 'BSE' };
    default: return {};
  }
}

export function GlobalSearch() {
  const { searchOpen, setSearchOpen, openOrderPanel } = useUIStore();
  const [query, setQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Ctrl+S to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [setSearchOpen]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
    else { setQuery(''); setResults([]); }
  }, [searchOpen]);

  // Fetch from real API with debounce
  const fetchResults = useCallback(async (q: string, filter: string) => {
    if (q.length < 1) { setResults([]); return; }
    setLoading(true);
    try {
      const params = filterToParams(filter);
      const qs = new URLSearchParams({ q, limit: '20', ...params }).toString();
      const res = await fetch(`/api/search?${qs}`);
      if (res.ok) {
        const data = await res.json();
        setResults(data.results ?? []);
      }
    } catch {
      // keep previous results on error
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.length < 1) { setResults([]); return; }
    debounceRef.current = setTimeout(() => fetchResults(query, activeFilter), 150);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, activeFilter, fetchResults]);

  if (!searchOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSearchOpen(false)} />
      <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden">

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          {loading
            ? <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0" />
            : <Search size={18} className="text-gray-400 shrink-0" />
          }
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol, company, contract, expiry, strike…"
            className="flex-1 text-sm text-gray-900 placeholder-gray-400 outline-none bg-transparent"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
              <X size={16} />
            </button>
          )}
          <kbd className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">ESC</kbd>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto no-scrollbar border-b border-gray-100">
          {FILTERS.map((f) => (
            <button key={f} onClick={() => setActiveFilter(f)}
              className={cn('shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                activeFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}>
              {f}
            </button>
          ))}
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {query.length === 0 ? (
            <div className="p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase mb-2">Recent Searches</p>
              {RECENT_SEARCHES.map((s) => (
                <button key={s} onClick={() => setQuery(s)}
                  className="flex items-center gap-3 w-full px-2 py-2 rounded-lg hover:bg-gray-50 text-sm text-gray-700 transition-colors">
                  <Clock size={14} className="text-gray-400" />
                  {s}
                </button>
              ))}
            </div>
          ) : results.length === 0 && !loading ? (
            <div className="px-4 py-8 text-center text-sm text-gray-500">
              No results for &quot;{query}&quot;
            </div>
          ) : (
            <div className="p-2">
              {results.map((r) => (
                <div key={`${r.exchange}:${r.token}`}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 group transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900">{r.tradingSymbol || r.symbol}</span>
                      <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', TYPE_COLORS[r.instrumentType] ?? 'bg-gray-100 text-gray-600')}>
                        {r.instrumentType}
                      </span>
                      <span className="text-xs text-gray-400">{r.exchange}</span>
                      {r.expiry && <span className="text-xs text-gray-400">{r.expiry}</span>}
                      {r.strike && <span className="text-xs text-gray-500 font-medium">₹{r.strike.toLocaleString('en-IN')}</span>}
                    </div>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{r.name}</p>
                  </div>
                  <div className="hidden group-hover:flex items-center gap-1">
                    <button
                      onClick={() => { openOrderPanel(r.symbol, 'BUY'); setSearchOpen(false); }}
                      className="px-2 py-1 text-xs bg-green-600 text-white rounded-md hover:bg-green-700">B</button>
                    <button
                      onClick={() => { openOrderPanel(r.symbol, 'SELL'); setSearchOpen(false); }}
                      className="px-2 py-1 text-xs bg-red-600 text-white rounded-md hover:bg-red-700">S</button>
                    <Link href="/?tab=charts" onClick={() => setSearchOpen(false)}
                      className="p-1 text-gray-500 hover:text-blue-600 rounded-md hover:bg-blue-50">
                      <BarChart2 size={14} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
