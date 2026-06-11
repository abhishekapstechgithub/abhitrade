'use client';
import { useEffect, useRef, useCallback, useState } from 'react';
import {
  createChart, ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, LineSeries, AreaSeries, BarSeries, HistogramSeries,
  IChartApi, ISeriesApi, UTCTimestamp,
} from 'lightweight-charts';
import {
  Loader2, Search, Moon, Trash2, Eye, Lock, Unlock,
  Type, MousePointer2, Camera, Settings, ChevronDown,
  RotateCcw, RotateCw, HelpCircle, Bell, Maximize2,
  Minus, TrendingUp, ZoomIn, Layers, Plus, X, RefreshCw,
} from 'lucide-react';

// ─── Types & constants ───────────────────────────────────────────────────────

type ChartType = 'candlestick' | 'line' | 'area' | 'bars';
type DrawTool  = 'cursor' | 'crosshair' | 'trendline' | 'horzline' | 'fib' | 'channel' | 'rect' | 'text' | 'zoom' | 'magnet';

const INTERVALS = [
  { label: '1m',  value: 'ONE_MINUTE'     },
  { label: '3m',  value: 'THREE_MINUTE'   },
  { label: '5m',  value: 'FIVE_MINUTE'    },
  { label: '10m', value: 'TEN_MINUTE'     },
  { label: '15m', value: 'FIFTEEN_MINUTE' },
  { label: '30m', value: 'THIRTY_MINUTE'  },
  { label: '1h',  value: 'ONE_HOUR'       },
  { label: '4h',  value: 'FOUR_HOUR'      },
  { label: '1D',  value: 'ONE_DAY'        },
  { label: '1W',  value: 'ONE_WEEK'       },
  { label: '1M',  value: 'ONE_MONTH'      },
];

const CHART_TYPES: { label: string; value: ChartType; svg: string }[] = [
  { label: 'Candlestick', value: 'candlestick', svg: 'M3 2v10M3 6h4v4H3M9 0v14M9 4h4v6H9' },
  { label: 'OHLC Bars',   value: 'bars',        svg: 'M3 2v10M3 7H1M3 7h2M9 0v14M9 5H7M9 5h2' },
  { label: 'Line',        value: 'line',        svg: 'M1 11 L4 6 L7 9 L10 3 L13 6'            },
  { label: 'Area',        value: 'area',        svg: 'M1 11 L4 6 L7 9 L10 3 L13 6 L13 13 L1 13 Z' },
];

const RANGES = ['1D', '5D', '1M', '3M', '6M', '1Y', '5Y'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtNum(n: number | undefined) {
  if (n == null) return '—';
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtVol(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(3) + 'K';
  return n.toString();
}
function getIST() {
  const now = new Date();
  const ist = new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + 5.5 * 3_600_000);
  return ist.toTimeString().slice(0, 8);
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface Props {
  symbol:   string;
  exchange: string;
  token:    string;
  name?:    string;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LightweightChartView({ symbol: initSymbol, exchange: initExchange, token: initToken, name: initName }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef     = useRef<IChartApi | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mainRef      = useRef<ISeriesApi<any> | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeRef    = useRef<ISeriesApi<any> | null>(null);
  const rawRef       = useRef<[string, number, number, number, number, number][]>([]);

  // Symbol target
  const [symbol,   setSymbol]   = useState(initSymbol);
  const [exchange, setExchange] = useState(initExchange);
  const [token,    setToken]    = useState(initToken);
  const [_name,    setName]     = useState(initName ?? initSymbol); // eslint-disable-line @typescript-eslint/no-unused-vars

  // UI state
  const [tf,           setTf]           = useState('ONE_DAY');
  const [chartType,    setChartType]    = useState<ChartType>('candlestick');
  const [drawTool,     setDrawTool]     = useState<DrawTool>('cursor');
  const [showTfMenu,   setShowTfMenu]   = useState(false);
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [instantOrders, setInstantOrders] = useState(false);
  const [istTime,      setIstTime]      = useState(getIST());
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchResults, setSearchResults] = useState<{ token: string; exchange: string; symbol: string; name: string; instrumentType: string }[]>([]);
  const [showSearch,   setShowSearch]   = useState(false);
  const [searching,    setSearching]    = useState(false);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Data / loading state
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [_bars,     setBars]      = useState(0); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [ltp,       setLtp]       = useState<number | null>(null);
  const [chg,       setChg]       = useState(0);
  const [chgPct,    setChgPct]    = useState(0);
  const [resolvedToken,    setResolvedToken]    = useState(initToken);
  const [resolvedExchange, setResolvedExchange] = useState(initExchange);
  const [resolving, setResolving] = useState(false);

  // Crosshair OHLC overlay
  const [ohlc, setOhlc] = useState<{ o: number; h: number; l: number; c: number; v: number } | null>(null);

  // IST clock
  useEffect(() => {
    const id = setInterval(() => setIstTime(getIST()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Token resolution
  useEffect(() => {
    setResolvedToken(token);
    setResolvedExchange(exchange);
    setError(''); setBars(0); setLtp(null);
    if (token) return;
    setResolving(true);
    fetch(`/api/search?q=${encodeURIComponent(symbol)}&limit=1`, { cache: 'no-store' })
      .then(r => r.json())
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then((d: any) => {
        const first = d.results?.[0];
        if (first?.token && !['1','2','3','4','5','6','7','8','9','10','11','12'].includes(first.token)) {
          setResolvedToken(first.token);
          setResolvedExchange(first.exchange ?? exchange);
        } else {
          setError(`No token for ${symbol}. Upload the NSE security master to enable charts.`);
        }
      })
      .catch(() => setError(`Could not resolve token for ${symbol}`))
      .finally(() => setResolving(false));
  }, [symbol, token, exchange]);

  // Symbol live search
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res  = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=8`, { cache: 'no-store' });
        const data = await res.json() as { results: typeof searchResults };
        setSearchResults(data.results ?? []);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 220);
  }, [searchQuery]);

  // Init chart (once)
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#334155',
        fontSize: 11,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(0,0,0,0.04)', style: LineStyle.Solid },
        horzLines: { color: 'rgba(0,0,0,0.04)', style: LineStyle.Solid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(0,0,0,0.25)', style: LineStyle.Dashed, width: 1, labelBackgroundColor: '#334155' },
        horzLine: { color: 'rgba(0,0,0,0.25)', style: LineStyle.Dashed, width: 1, labelBackgroundColor: '#334155' },
      },
      rightPriceScale: { borderColor: '#e2e8f0', scaleMargins: { top: 0.05, bottom: 0.25 } },
      timeScale: { borderColor: '#e2e8f0', timeVisible: true, secondsVisible: false },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a', downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a', wickDownColor: '#ef5350',
    });
    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // Crosshair subscription
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chart.subscribeCrosshairMove((param: any) => {
      if (!param.time || !param.seriesData) { setOhlc(null); return; }
      const cd = param.seriesData.get(candleSeries);
      const vd = param.seriesData.get(volSeries);
      if (cd) {
        setOhlc({
          o: cd.open  ?? cd.value ?? 0,
          h: cd.high  ?? cd.value ?? 0,
          l: cd.low   ?? cd.value ?? 0,
          c: cd.close ?? cd.value ?? 0,
          v: vd?.value ?? 0,
        });
      } else { setOhlc(null); }
    });

    chartRef.current  = chart;
    mainRef.current   = candleSeries;
    volumeRef.current = volSeries;

    return () => { chart.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild series when chart type changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (mainRef.current) {
      try { chart.removeSeries(mainRef.current); } catch { /* ignore */ }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let newSeries: ISeriesApi<any>;
    if (chartType === 'candlestick') {
      newSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#26a69a', downColor: '#ef5350',
        borderVisible: false,
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
    } else if (chartType === 'bars') {
      newSeries = chart.addSeries(BarSeries, {
        upColor: '#26a69a', downColor: '#ef5350',
      });
    } else if (chartType === 'line') {
      newSeries = chart.addSeries(LineSeries, {
        color: '#2563eb', lineWidth: 2,
      });
    } else {
      newSeries = chart.addSeries(AreaSeries, {
        topColor: 'rgba(37,99,235,0.28)',
        bottomColor: 'rgba(37,99,235,0.02)',
        lineColor: '#2563eb', lineWidth: 2,
      });
    }
    mainRef.current = newSeries;

    // Re-populate if we have raw data
    if (rawRef.current.length > 0) {
      populateSeries(newSeries, chartType, rawRef.current);
      chart.timeScale().fitContent();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  function populateSeries(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    series: ISeriesApi<any>,
    type: ChartType,
    raw: [string, number, number, number, number, number][],
  ) {
    if (type === 'candlestick' || type === 'bars') {
      series.setData(raw.map(([ts, o, h, l, c]) => ({
        time: (Math.floor(new Date(ts).getTime() / 1000)) as UTCTimestamp,
        open: o, high: h, low: l, close: c,
      })));
    } else {
      series.setData(raw.map(([ts,,,,c]) => ({
        time:  (Math.floor(new Date(ts).getTime() / 1000)) as UTCTimestamp,
        value: c,
      })));
    }
  }

  const fetchData = useCallback(async (interval: string, tkn: string, exch: string) => {
    if (!tkn) return;
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/chart-data?exchange=${exch}&token=${tkn}&interval=${interval}`, { cache: 'no-store' });
      const json = await res.json() as { candles?: [string,number,number,number,number,number][]; error?: string };
      if (json.error) throw new Error(json.error);
      const raw = json.candles ?? [];
      if (!raw.length) { setError('No candle data — market may be closed or no history available'); return; }

      rawRef.current = raw;
      if (mainRef.current) populateSeries(mainRef.current, chartType, raw);

      if (volumeRef.current) {
        volumeRef.current.setData(raw.map(([ts, o,,, c, v]) => ({
          time:  (Math.floor(new Date(ts).getTime() / 1000)) as UTCTimestamp,
          value: v,
          color: c >= o ? 'rgba(38,166,154,0.45)' : 'rgba(239,83,80,0.45)',
        })));
      }
      chartRef.current?.timeScale().fitContent();
      setBars(raw.length);

      const candles = raw.map(([, o, h, l, c]) => ({ o, h, l, c }));
      const last = candles[candles.length - 1];
      const prev = candles.length > 1 ? candles[candles.length - 2].c : last.o;
      setLtp(last.c);
      setChg(parseFloat((last.c - prev).toFixed(2)));
      setChgPct(parseFloat(((last.c - prev) / prev * 100).toFixed(2)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load candles');
    } finally { setLoading(false); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartType]);

  useEffect(() => {
    if (resolvedToken && !resolving) fetchData(tf, resolvedToken, resolvedExchange);
  }, [tf, resolvedToken, resolvedExchange, resolving, fetchData]);

  function applyRange(range: string) {
    if (!chartRef.current) return;
    const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
    const d = 86_400;
    const map: Record<string, number> = { '1D': d, '5D': 5*d, '1M': 30*d, '3M': 90*d, '6M': 180*d, '1Y': 365*d, '5Y': 5*365*d };
    if (map[range]) chartRef.current.timeScale().setVisibleRange({ from: (now - map[range]) as UTCTimestamp, to: now });
  }

  function selectSearchResult(r: typeof searchResults[0]) {
    setSymbol(r.symbol);
    setExchange(r.exchange);
    setToken(r.token);
    setName(r.name || r.symbol);
    setResolvedToken(r.token);
    setResolvedExchange(r.exchange);
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  }

  const currentTf  = INTERVALS.find(i => i.value === tf);
  const pos        = chg >= 0;
  const displayOhlc = ohlc ?? (ltp != null ? { o: ltp, h: ltp, l: ltp, c: ltp, v: 0 } : null);

  return (
    <div
      className="flex flex-col w-full h-full"
      style={{ background: '#fff', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", userSelect: 'none' }}
      onClick={() => { setShowTfMenu(false); setShowTypeMenu(false); }}
    >
      {/* ── Top Toolbar ─────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-2 shrink-0"
        style={{ height: 44, borderBottom: '1px solid #e2e8f0' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Left controls */}
        <div className="flex items-center gap-0.5">
          <ToolBtn title="Toggle dark/light">
            <Moon size={13} strokeWidth={1.8} />
          </ToolBtn>

          {/* Interval picker */}
          <div className="relative">
            <button
              onClick={() => { setShowTfMenu(v => !v); setShowTypeMenu(false); }}
              className="flex items-center gap-1 px-2 h-7 rounded text-xs font-semibold transition-colors hover:bg-gray-100"
              style={{ color: '#0f172a', border: '1px solid #e2e8f0', minWidth: 42 }}>
              {currentTf?.label ?? '1D'}
              <ChevronDown size={10} />
            </button>
            {showTfMenu && (
              <div className="absolute top-full left-0 mt-1 rounded-lg shadow-xl z-50 overflow-hidden" style={{ background: '#fff', border: '1px solid #e2e8f0', width: 110 }}>
                {INTERVALS.map(i => (
                  <button key={i.value}
                    onClick={() => { setTf(i.value); setShowTfMenu(false); }}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-xs hover:bg-blue-50 text-left"
                    style={{ color: tf === i.value ? '#2563eb' : '#334155', fontWeight: tf === i.value ? 600 : 400 }}>
                    {i.label}
                    {tf === i.value && <span style={{ color: '#2563eb' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chart type picker */}
          <div className="relative">
            <ToolBtn title="Chart type" onClick={() => { setShowTypeMenu(v => !v); setShowTfMenu(false); }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="4" width="3" height="6" fill="currentColor" rx="0.5" />
                <line x1="2.5" y1="2" x2="2.5" y2="4" stroke="currentColor" strokeWidth="1.5" />
                <line x1="2.5" y1="10" x2="2.5" y2="12" stroke="currentColor" strokeWidth="1.5" />
                <rect x="5.5" y="2" width="3" height="8" fill="currentColor" rx="0.5" opacity="0.7" />
                <line x1="7" y1="0.5" x2="7" y2="2" stroke="currentColor" strokeWidth="1.5" />
                <line x1="7" y1="10" x2="7" y2="13.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </ToolBtn>
            {showTypeMenu && (
              <div className="absolute top-full left-0 mt-1 rounded-lg shadow-xl z-50 overflow-hidden" style={{ background: '#fff', border: '1px solid #e2e8f0', width: 148 }}>
                {CHART_TYPES.map(t => (
                  <button key={t.value}
                    onClick={() => { setChartType(t.value); setShowTypeMenu(false); }}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs hover:bg-blue-50 text-left"
                    style={{ color: chartType === t.value ? '#2563eb' : '#334155', fontWeight: chartType === t.value ? 600 : 400 }}>
                    <svg width="14" height="12" viewBox="0 0 14 14" fill="none">
                      {t.value === 'line' || t.value === 'area'
                        ? <polyline points={t.svg.replace(/[ML]/g,' ').split(' ').filter(Boolean).join(' ')}
                            stroke="currentColor" strokeWidth="1.5" fill={t.value === 'area' ? 'rgba(37,99,235,0.15)' : 'none'} strokeLinejoin="round" />
                        : <path d={t.svg} stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                      }
                    </svg>
                    {t.label}
                    {chartType === t.value && <span className="ml-auto" style={{ color: '#2563eb' }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Indicators */}
          <button
            className="flex items-center gap-1 px-2 h-7 rounded text-xs font-medium hover:bg-gray-100 transition-colors"
            style={{ color: '#334155' }}>
            <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
              <polyline points="1,9 3.5,5 6,7 8.5,2 11,4" stroke="#2563eb" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </svg>
            <span style={{ fontStyle: 'italic', fontFamily: 'Georgia, serif', marginRight: -1 }}>f</span>
            <span>x</span>
            <span className="ml-0.5">Indicators</span>
          </button>

          {/* Layout */}
          <ToolBtn title="Chart layout">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="12" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
              <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" />
            </svg>
          </ToolBtn>

          <div className="shrink-0" style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 2px' }} />

          {/* Instant Orders toggle */}
          <div className="flex items-center gap-1.5 px-1.5">
            <span className="text-xs whitespace-nowrap" style={{ color: '#334155' }}>Instant Orders</span>
            <button
              onClick={() => setInstantOrders(v => !v)}
              className="relative inline-flex rounded-full transition-colors shrink-0"
              style={{ width: 32, height: 18, background: instantOrders ? '#2563eb' : '#d1d5db' }}>
              <span
                className="absolute rounded-full bg-white shadow-sm transition-transform"
                style={{
                  top: 2, width: 14, height: 14,
                  transform: instantOrders ? 'translateX(16px)' : 'translateX(2px)',
                }} />
            </button>
          </div>

          {/* AI sparkle */}
          <ToolBtn title="AI Analysis">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1L8 5.2L12 7L8 8.8L7 13L6 8.8L2 7L6 5.2Z" stroke="#7c3aed" strokeWidth="1.2" fill="rgba(124,58,237,0.12)" strokeLinejoin="round" />
            </svg>
          </ToolBtn>
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-0.5">
          <ToolBtn title="Undo (Ctrl+Z)"><RotateCcw size={13} strokeWidth={1.8} /></ToolBtn>
          <ToolBtn title="Redo (Ctrl+Y)"><RotateCw  size={13} strokeWidth={1.8} /></ToolBtn>
          <ToolBtn title="Help"><HelpCircle size={13} strokeWidth={1.8} /></ToolBtn>
          <ToolBtn title="Set Alert"><Bell size={13} strokeWidth={1.8} /></ToolBtn>

          <div className="shrink-0" style={{ width: 1, height: 20, background: '#e2e8f0', margin: '0 2px' }} />

          <ToolBtn title="Fullscreen"><Maximize2 size={13} strokeWidth={1.8} /></ToolBtn>

          {/* Save */}
          <div className="flex rounded overflow-hidden" style={{ border: '1px solid #e2e8f0' }}>
            <button className="px-2.5 h-7 text-xs font-semibold hover:bg-gray-50 transition-colors" style={{ color: '#0f172a' }}>
              Save
            </button>
            <div style={{ width: 1, background: '#e2e8f0' }} />
            <button className="px-1.5 h-7 hover:bg-gray-50 transition-colors" style={{ color: '#94a3b8', fontSize: 9 }}>▾</button>
          </div>

          <ToolBtn title="Chart Settings"><Settings size={13} strokeWidth={1.8} /></ToolBtn>
          <ToolBtn title="Take Screenshot"><Camera size={13} strokeWidth={1.8} /></ToolBtn>
        </div>
      </div>

      {/* ── Middle: sidebar + chart ──────────────────────── */}
      <div className="flex flex-row flex-1 min-h-0">

        {/* Left drawing tools sidebar */}
        <div
          className="flex flex-col items-center py-2 gap-0.5 shrink-0"
          style={{ width: 40, borderRight: '1px solid #e2e8f0' }}
          onClick={e => e.stopPropagation()}>
          <SideBtn title="Add indicator"><Plus size={14} strokeWidth={1.8} /></SideBtn>
          <div style={{ width: 24, height: 1, background: '#e2e8f0', margin: '2px 0' }} />

          {/* Cursor */}
          <DrawBtn id="cursor" active={drawTool} onClick={setDrawTool} title="Cursor">
            <MousePointer2 size={13} strokeWidth={1.8} />
          </DrawBtn>
          {/* Crosshair */}
          <DrawBtn id="crosshair" active={drawTool} onClick={setDrawTool} title="Crosshair">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <line x1="6.5" y1="0" x2="6.5" y2="13" stroke="currentColor" strokeWidth="1.5" />
              <line x1="0" y1="6.5" x2="13" y2="6.5" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.5" fill="none" />
            </svg>
          </DrawBtn>
          {/* Trend line */}
          <DrawBtn id="trendline" active={drawTool} onClick={setDrawTool} title="Trend Line">
            <TrendingUp size={13} strokeWidth={1.8} />
          </DrawBtn>
          {/* Horizontal line */}
          <DrawBtn id="horzline" active={drawTool} onClick={setDrawTool} title="Horizontal Line">
            <Minus size={13} strokeWidth={1.8} />
          </DrawBtn>
          {/* Fibonacci */}
          <DrawBtn id="fib" active={drawTool} onClick={setDrawTool} title="Fibonacci Retracement">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <line x1="1" y1="2.5" x2="12" y2="2.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="1" y1="10.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="1" y1="2.5" x2="1" y2="10.5" stroke="currentColor" strokeWidth="1.3" />
              <line x1="12" y1="2.5" x2="12" y2="10.5" stroke="currentColor" strokeWidth="1.3" />
            </svg>
          </DrawBtn>
          {/* Channel */}
          <DrawBtn id="channel" active={drawTool} onClick={setDrawTool} title="Channel">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <line x1="1" y1="3" x2="12" y2="9" stroke="currentColor" strokeWidth="1.4" />
              <line x1="1" y1="7" x2="12" y2="13" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2 1.5" />
            </svg>
          </DrawBtn>
          {/* Rectangle */}
          <DrawBtn id="rect" active={drawTool} onClick={setDrawTool} title="Rectangle">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="3" width="11" height="7" stroke="currentColor" strokeWidth="1.4" fill="none" />
            </svg>
          </DrawBtn>
          {/* Text */}
          <DrawBtn id="text" active={drawTool} onClick={setDrawTool} title="Text Label">
            <Type size={13} strokeWidth={1.8} />
          </DrawBtn>
          {/* Zoom */}
          <DrawBtn id="zoom" active={drawTool} onClick={setDrawTool} title="Zoom In">
            <ZoomIn size={13} strokeWidth={1.8} />
          </DrawBtn>
          {/* Magnet */}
          <DrawBtn id="magnet" active={drawTool} onClick={setDrawTool} title="Magnet Snap">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 3 L2 8 A4 4 0 0 0 11 8 L11 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" />
              <line x1="2" y1="3" x2="2" y2="1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <line x1="11" y1="3" x2="11" y2="1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </DrawBtn>

          <div style={{ width: 24, height: 1, background: '#e2e8f0', margin: '4px 0' }} />

          <SideBtn title="Lock drawings"><Lock   size={11} strokeWidth={1.8} /></SideBtn>
          <SideBtn title="Unlock drawings"><Unlock size={11} strokeWidth={1.8} /></SideBtn>
          <SideBtn title="Show/Hide drawings"><Eye    size={11} strokeWidth={1.8} /></SideBtn>
          <SideBtn title="Remove all drawings"><Trash2 size={11} strokeWidth={1.8} /></SideBtn>

          <div style={{ flex: 1 }} />
          <SideBtn title="Object tree"><Layers size={11} strokeWidth={1.8} /></SideBtn>
        </div>

        {/* Chart canvas area */}
        <div className="relative flex-1 min-w-0 min-h-0">

          {/* OHLC info overlay — top left */}
          {displayOhlc && !loading && (
            <div className="absolute top-2 left-3 z-10 pointer-events-none" style={{ maxWidth: 'calc(100% - 80px)' }}>
              {/* Clickable symbol → opens search */}
              <div className="flex flex-wrap items-baseline gap-x-1" style={{ lineHeight: 1.6 }}>
                <button
                  className="text-xs font-bold hover:underline pointer-events-auto"
                  style={{ color: '#0f172a', cursor: 'pointer' }}
                  onClick={() => { setShowSearch(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}>
                  {symbol}
                </button>
                <span className="text-xs" style={{ color: '#94a3b8' }}>·</span>
                <span className="text-xs font-medium" style={{ color: '#64748b' }}>{currentTf?.label}</span>
                <span className="text-xs" style={{ color: '#94a3b8' }}>·</span>
                <span className="text-xs font-medium" style={{ color: '#64748b' }}>{resolvedExchange}</span>
                <span className="text-xs mx-1" style={{ color: '#cbd5e1' }}>▬</span>
                <span className="text-xs" style={{ color: '#64748b' }}>O</span>
                <span className="text-xs font-medium" style={{ color: '#0f172a' }}>&nbsp;{fmtNum(displayOhlc.o)}</span>
                <span className="text-xs ml-1" style={{ color: '#64748b' }}>H</span>
                <span className="text-xs font-medium" style={{ color: '#26a69a' }}>&nbsp;{fmtNum(displayOhlc.h)}</span>
                <span className="text-xs ml-1" style={{ color: '#64748b' }}>L</span>
                <span className="text-xs font-medium" style={{ color: '#ef5350' }}>&nbsp;{fmtNum(displayOhlc.l)}</span>
                <span className="text-xs ml-1" style={{ color: '#64748b' }}>C</span>
                <span className="text-xs font-medium" style={{ color: '#0f172a' }}>&nbsp;{fmtNum(displayOhlc.c)}</span>
                {ltp != null && (
                  <span className="text-xs font-medium ml-1" style={{ color: pos ? '#26a69a' : '#ef5350' }}>
                    {pos ? '+' : ''}{chg} ({pos ? '+' : ''}{chgPct}%)
                  </span>
                )}
              </div>
              {displayOhlc.v > 0 && (
                <div className="text-xs" style={{ color: '#94a3b8', lineHeight: 1.5 }}>
                  Volume&nbsp;
                  <span style={{ color: displayOhlc.c >= displayOhlc.o ? '#26a69a' : '#ef5350' }}>
                    {fmtVol(displayOhlc.v)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Symbol search overlay */}
          {showSearch && (
            <div
              className="absolute inset-0 z-30 flex items-start justify-center pt-10"
              style={{ background: 'rgba(255,255,255,0.92)' }}
              onClick={() => setShowSearch(false)}>
              <div
                className="w-[420px] rounded-xl shadow-2xl overflow-hidden"
                style={{ background: '#fff', border: '1px solid #e2e8f0' }}
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center px-3 py-2 gap-2" style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <Search size={14} style={{ color: '#94a3b8' }} />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search symbol, company, index…"
                    className="flex-1 text-sm outline-none bg-transparent"
                    style={{ color: '#0f172a' }} />
                  {searching && <Loader2 size={13} className="animate-spin shrink-0" style={{ color: '#94a3b8' }} />}
                  <button onClick={() => setShowSearch(false)}>
                    <X size={14} style={{ color: '#94a3b8' }} />
                  </button>
                </div>
                {searchResults.length > 0 ? (
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    {searchResults.map(r => (
                      <button key={`${r.exchange}-${r.token}`}
                        onClick={() => selectSearchResult(r)}
                        className="w-full flex items-center justify-between px-3 py-2.5 text-xs hover:bg-blue-50 transition-colors text-left">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold" style={{ color: '#0f172a' }}>{r.symbol}</span>
                            <span className="px-1 py-0.5 rounded text-[10px] font-bold" style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb' }}>{r.exchange}</span>
                            <span className="px-1 py-0.5 rounded text-[10px]" style={{ background: '#f1f5f9', color: '#64748b' }}>{r.instrumentType}</span>
                          </div>
                          <div className="text-[11px] mt-0.5" style={{ color: '#64748b' }}>{r.name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : searchQuery.length > 1 && !searching ? (
                  <div className="px-3 py-4 text-xs text-center" style={{ color: '#94a3b8' }}>
                    No results for &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Chart canvas */}
          <div ref={containerRef} className="w-full h-full" />

          {/* Loading overlay */}
          {(loading || resolving) && (
            <div className="absolute inset-0 flex items-center justify-center z-20" style={{ background: 'rgba(255,255,255,0.82)' }}>
              <div className="flex flex-col items-center gap-2">
                <Loader2 size={24} className="animate-spin" style={{ color: '#2563eb' }} />
                <span className="text-xs" style={{ color: '#64748b' }}>
                  {resolving ? `Resolving ${symbol}…` : 'Loading candles…'}
                </span>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && !loading && !resolving && (
            <div className="absolute inset-0 flex items-center justify-center z-20">
              <div className="text-center p-6 max-w-xs">
                <Search size={24} className="mx-auto mb-3" style={{ color: '#cbd5e1' }} />
                <div className="text-sm font-medium mb-1" style={{ color: '#ef4444' }}>Chart Unavailable</div>
                <div className="text-xs leading-relaxed mb-4" style={{ color: '#94a3b8' }}>{error}</div>
                {resolvedToken && (
                  <button
                    onClick={() => fetchData(tf, resolvedToken, resolvedExchange)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: 'rgba(37,99,235,0.1)', color: '#2563eb', border: '1px solid rgba(37,99,235,0.3)' }}>
                    <RefreshCw size={11} className="inline mr-1" />Retry
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Range & Time Bar ──────────────────────── */}
      <div
        className="flex items-center justify-between px-3 shrink-0"
        style={{ height: 36, borderTop: '1px solid #e2e8f0' }}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-0.5">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => applyRange(r)}
              className="px-2 h-6 rounded text-xs font-medium transition-colors hover:bg-blue-50 hover:text-blue-600"
              style={{ color: '#334155' }}>
              {r}
            </button>
          ))}
          {/* Calendar icon */}
          <button className="ml-1 w-6 h-6 rounded flex items-center justify-center hover:bg-gray-100" style={{ color: '#64748b' }} title="Custom date range">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="1" y="2" width="10" height="9" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" />
              <line x1="4" y1="1" x2="4" y2="3" stroke="currentColor" strokeWidth="1.2" />
              <line x1="8" y1="1" x2="8" y2="3" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: '#64748b' }}>
          <span className="font-mono tabular-nums">{istTime} (UTC+5:30)</span>
          <button className="px-1.5 py-0.5 rounded hover:bg-gray-100 font-medium" style={{ color: '#334155' }}>%</button>
          <button className="px-1.5 py-0.5 rounded hover:bg-gray-100" style={{ color: '#334155' }}>log</button>
          <button className="px-1.5 py-0.5 rounded hover:bg-gray-100" style={{ color: '#334155' }}>auto</button>
        </div>
      </div>
    </div>
  );
}

// ─── Mini sub-components ─────────────────────────────────────────────────────

function ToolBtn({ children, title, onClick }: { children: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-gray-100 shrink-0"
      style={{ color: '#64748b' }}>
      {children}
    </button>
  );
}

function SideBtn({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <button
      title={title}
      className="w-7 h-7 rounded flex items-center justify-center transition-colors hover:bg-gray-100"
      style={{ color: '#64748b' }}>
      {children}
    </button>
  );
}

function DrawBtn({
  id, active, onClick, title, children,
}: {
  id: DrawTool; active: DrawTool; onClick: (id: DrawTool) => void; title?: string; children: React.ReactNode;
}) {
  const isActive = id === active;
  return (
    <button
      title={title}
      onClick={() => onClick(id)}
      className="w-7 h-7 rounded flex items-center justify-center transition-colors"
      style={{
        color: isActive ? '#2563eb' : '#64748b',
        background: isActive ? 'rgba(37,99,235,0.1)' : 'transparent',
      }}>
      {children}
    </button>
  );
}
