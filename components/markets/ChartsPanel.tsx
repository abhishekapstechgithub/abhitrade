'use client';
import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Search, ZoomIn, ZoomOut, RotateCcw, Save, RefreshCw, Loader2 } from 'lucide-react';
import { useAngelOneStore } from '@/store/useAngelOneStore';
import { lookupToken } from '@/lib/angelone/tokens';

const ReactApexChart = dynamic(() => import('react-apexcharts'), { ssr: false });

const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '1D', '1W', '1M'];
const CHART_TYPES = ['Candlestick', 'Line', 'Area', 'OHLC'];
const INDICATORS = ['VWAP', 'EMA 9', 'EMA 21', 'SMA 20', 'RSI', 'MACD', 'Bollinger Bands', 'Volume'];

const B = '41,121,255'; const C = '0,212,255';

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

interface Candle { x: Date; y: [number, number, number, number] }
interface SearchResult { exchange: string; tradingsymbol: string; symboltoken: string; name: string; instrumenttype: string }

export function ChartsPanel() {
  const { isConnected, mode, credentials, accessToken } = useAngelOneStore();
  const isLive = isConnected && mode === 'live';

  const [symbol, setSymbol] = useState('NIFTY 50');
  const [symbolInput, setSymbolInput] = useState('NIFTY 50');
  const [currentToken, setCurrentToken] = useState<{ exchange: string; token: string } | null>(
    { exchange: 'NSE', token: '99926000' }
  );
  const [timeframe, setTimeframe] = useState('1D');
  const [chartType, setChartType] = useState('Candlestick');
  const [activeIndicators, setActiveIndicators] = useState<string[]>(['EMA 9', 'EMA 21', 'Volume']);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [volumeData, setVolumeData] = useState<{ x: Date; y: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [ltp, setLtp] = useState<number | null>(null);
  const [ltpChange, setLtpChange] = useState<number>(0);
  const [ltpPct, setLtpPct] = useState<number>(0);

  const fetchCandles = useCallback(async (tkn: { exchange: string; token: string }, tf: string) => {
    if (!isLive) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/angel-one/candles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: credentials.apiKey,
          accessToken,
          exchange: tkn.exchange,
          symboltoken: tkn.token,
          timeframe: tf,
        }),
      });
      const json = await res.json();
      if (json.error) { setError(json.error); return; }
      const raw: [string, number, number, number, number, number][] = json.candles ?? [];
      setCandles(raw.map(([ts, o, h, l, c]) => ({ x: new Date(ts), y: [o, h, l, c] as [number,number,number,number] })));
      setVolumeData(raw.map(([ts,,,,, v]) => ({ x: new Date(ts), y: v })));
      if (raw.length > 0) {
        const last = raw[raw.length - 1];
        const prev = raw.length > 1 ? raw[raw.length - 2][4] : last[1];
        setLtp(last[4]);
        setLtpChange(last[4] - prev);
        setLtpPct(((last[4] - prev) / prev) * 100);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chart');
    } finally {
      setLoading(false);
    }
  }, [isLive, credentials.apiKey, accessToken]);

  useEffect(() => {
    if (currentToken && isLive) fetchCandles(currentToken, timeframe);
  }, [currentToken, timeframe, isLive, fetchCandles]);

  useEffect(() => {
    if (!isLive || symbolInput.length < 2) { setSearchResults([]); return; }
    const known = lookupToken(symbolInput);
    if (known) { setSearchResults([]); return; }
    const tid = setTimeout(async () => {
      try {
        const res = await fetch('/api/angel-one/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: credentials.apiKey, accessToken, exchange: 'ALL', query: symbolInput }),
        });
        const json = await res.json();
        setSearchResults((json.results ?? []).slice(0, 8));
      } catch { /* ignore */ }
    }, 350);
    return () => clearTimeout(tid);
  }, [symbolInput, isLive, credentials.apiKey, accessToken]);

  function selectSymbol(name: string, exchange: string, token: string) {
    setSymbol(name);
    setSymbolInput(name);
    setCurrentToken({ exchange, token });
    setSearchResults([]);
    setShowSearch(false);
  }

  function handleSymbolSubmit(e: React.KeyboardEvent) {
    if (e.key !== 'Enter') return;
    const known = lookupToken(symbolInput);
    if (known) selectSymbol(symbolInput.toUpperCase(), known.exchange, known.token);
  }

  const toggleIndicator = (ind: string) =>
    setActiveIndicators(prev => prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]);

  const chartOptions: ApexCharts.ApexOptions = {
    chart: {
      type: chartType === 'Line' ? 'line' : chartType === 'Area' ? 'area' : 'candlestick',
      background: 'transparent',
      foreColor: '#94a3b8',
      toolbar: { show: true, tools: { download: true, selection: true, zoom: true, zoomin: true, zoomout: true, pan: true } },
      zoom: { enabled: true },
      animations: { enabled: false },
    },
    grid: { borderColor: 'rgba(255,255,255,0.06)', strokeDashArray: 3 },
    xaxis: {
      type: 'datetime',
      labels: { style: { colors: '#64748b', fontSize: '11px' }, datetimeFormatter: { hour: 'HH:mm', day: 'dd MMM', month: 'MMM yy' } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: '#64748b', fontSize: '11px' },
        formatter: (v) => `₹${v >= 1000 ? (v/1000).toFixed(1)+'K' : v.toFixed(0)}`,
      },
      opposite: true,
    },
    plotOptions: { candlestick: { colors: { upward: '#22c55e', downward: '#ef4444' }, wick: { useFillColor: true } } },
    stroke: { width: [2], curve: 'straight', colors: ['#2979ff'] },
    fill: { opacity: [chartType === 'Area' ? 0.2 : 1] },
    tooltip: {
      theme: 'dark',
      x: { format: 'dd MMM HH:mm' },
      y: { formatter: (v) => `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 2 })}` },
    },
    dataLabels: { enabled: false },
  };

  const volumeOptions: ApexCharts.ApexOptions = {
    chart: { type: 'bar', background: 'transparent', foreColor: '#94a3b8', toolbar: { show: false }, animations: { enabled: false } },
    grid: { borderColor: 'rgba(255,255,255,0.04)' },
    xaxis: { type: 'datetime', labels: { show: false }, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: {
      labels: {
        style: { colors: '#64748b', fontSize: '10px' },
        formatter: (v) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : String(Math.round(v)),
      },
      opposite: true,
    },
    plotOptions: { bar: { colors: { ranges: [{ from: 0, to: Infinity, color: 'rgba(41,121,255,0.4)' }] } } },
    tooltip: { theme: 'dark', x: { format: 'dd MMM HH:mm' } },
    dataLabels: { enabled: false },
  };

  const isPos = ltpChange >= 0;
  const mainSeries = (chartType === 'Candlestick' || chartType === 'OHLC')
    ? [{ data: candles }]
    : [{ data: candles.map(c => ({ x: c.x, y: c.y[3] })) }];

  const showVolume = activeIndicators.includes('Volume') && volumeData.length > 0;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="rounded-xl p-3 flex flex-wrap items-center gap-2" style={glass}>
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-label)' }} />
          <input
            value={symbolInput}
            onChange={e => { setSymbolInput(e.target.value); setShowSearch(true); }}
            onKeyDown={handleSymbolSubmit}
            onFocus={() => setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 200)}
            className="pl-8 pr-3 h-8 rounded-lg text-sm w-44"
            style={inputStyle}
            placeholder="Search symbol…" />
          {showSearch && searchResults.length > 0 && (
            <div className="absolute top-full mt-1 left-0 w-80 rounded-xl z-50 shadow-2xl overflow-hidden"
              style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-divider)' }}>
              {searchResults.map(r => (
                <button key={r.symboltoken}
                  onMouseDown={() => selectSymbol(r.tradingsymbol, r.exchange, r.symboltoken)}
                  className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-white/5 transition-colors">
                  <div>
                    <span className="font-bold" style={{ color: 'var(--text-bright)' }}>{r.tradingsymbol}</span>
                    <span className="ml-2 text-[10px]" style={{ color: 'var(--text-label)' }}>{r.name}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(41,121,255,0.12)', color: 'rgb(0,212,255)' }}>{r.exchange}</span>
                    <span className="text-[10px]" style={{ color: 'var(--text-label)' }}>{r.instrumenttype}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center rounded-lg overflow-hidden" style={{ border: '1px solid var(--panel-divider)' }}>
          {TIMEFRAMES.map(tf => (
            <button key={tf} onClick={() => setTimeframe(tf)}
              className="px-2 py-1.5 text-xs font-medium transition-colors"
              style={timeframe === tf
                ? { background: `rgba(${B},0.3)`, color: `rgb(${C})` }
                : { color: 'var(--text-dim)' }}>
              {tf}
            </button>
          ))}
        </div>

        <select value={chartType} onChange={e => setChartType(e.target.value)}
          className="h-8 px-2 rounded-lg text-sm"
          style={inputStyle}>
          {CHART_TYPES.map(t => <option key={t} style={{ background: 'var(--option-bg)' }}>{t}</option>)}
        </select>

        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs mr-1" style={{ color: 'var(--text-label)' }}>Indicators:</span>
          {INDICATORS.map(ind => (
            <button key={ind} onClick={() => toggleIndicator(ind)}
              className="px-2 py-1 text-xs rounded font-medium transition-colors"
              style={activeIndicators.includes(ind)
                ? { background: `rgba(${B},0.2)`, color: `rgb(${C})`, border: `1px solid rgba(${C},0.25)` }
                : { background: 'var(--card-inner-bg)', color: 'var(--text-dim)', border: '1px solid var(--panel-divider)' }}>
              {ind}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => currentToken && fetchCandles(currentToken, timeframe)}
            className="p-1.5 rounded transition-colors"
            style={{ color: 'var(--text-dim)' }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
          {[ZoomIn, ZoomOut, RotateCcw, Save].map((Icon, i) => (
            <button key={i} className="p-1.5 rounded transition-colors" style={{ color: 'var(--text-dim)' }}>
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="rounded-xl overflow-hidden" style={glass}>
        <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: '1px solid var(--panel-divider)' }}>
          <div className="flex items-center gap-3">
            <span className="font-bold text-sm" style={{ color: 'var(--text-bright)' }}>{symbol}</span>
            {isLive && ltp !== null && (
              <>
                <span className="font-mono font-bold text-base" style={{ color: 'var(--text-bright)' }}>
                  ₹{ltp.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                </span>
                <span className="text-sm font-semibold" style={{ color: isPos ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                  {isPos ? '▲' : '▼'} {Math.abs(ltpChange).toFixed(2)} ({isPos ? '+' : ''}{ltpPct.toFixed(2)}%)
                </span>
              </>
            )}
            {!isLive && (
              <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.15)', color: 'rgb(245,158,11)', border: '1px solid rgba(245,158,11,0.3)' }}>
                Connect AngelOne for live chart
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-label)' }}>
            <span className="font-medium" style={{ color: 'var(--text-accent)' }}>{chartType}</span>
            <span>·</span>
            <span>{timeframe}</span>
            {isLive && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                style={{ background: 'rgba(var(--gain-rgb),0.12)', color: 'var(--accent-green)', border: '1px solid rgba(var(--gain-rgb),0.25)' }}>
                LIVE
              </span>
            )}
          </div>
        </div>

        <div style={{ background: '#0d1117', minHeight: '480px', position: 'relative' }}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin" style={{ color: 'rgb(0,212,255)' }} />
                <span className="text-sm" style={{ color: 'var(--text-label)' }}>Loading chart data…</span>
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center p-6">
                <div className="text-sm mb-2" style={{ color: 'var(--accent-red)' }}>Chart Error</div>
                <div className="text-xs mb-3 max-w-xs" style={{ color: 'var(--text-label)' }}>{error}</div>
                <button onClick={() => currentToken && fetchCandles(currentToken, timeframe)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: 'rgba(41,121,255,0.2)', color: 'rgb(0,212,255)', border: '1px solid rgba(41,121,255,0.3)' }}>
                  Retry
                </button>
              </div>
            </div>
          )}

          {!isLive && !loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center p-8">
                <div className="text-2xl mb-2">📈</div>
                <div className="text-lg font-bold mb-2" style={{ color: 'var(--text-accent)' }}>Live Charts via AngelOne</div>
                <div className="text-sm mb-4 max-w-xs" style={{ color: 'var(--text-label)' }}>
                  Connect your AngelOne API in Profile settings to view real-time OHLCV charts
                </div>
                <a href="/profile" className="px-4 py-2 rounded-xl text-sm font-semibold inline-block"
                  style={{ background: 'linear-gradient(135deg,#2979ff,#00d4ff)', color: '#fff' }}>
                  Connect AngelOne →
                </a>
              </div>
            </div>
          )}

          {isLive && candles.length > 0 && !loading && (
            <div>
              <ReactApexChart
                key={`${symbol}-${timeframe}-${chartType}`}
                options={chartOptions}
                series={mainSeries as ApexCharts.ApexOptions["series"]}
                type={chartType === 'Line' ? 'line' : chartType === 'Area' ? 'area' : 'candlestick'}
                height={showVolume ? 360 : 480}
              />
              {showVolume && (
                <ReactApexChart
                  key={`vol-${symbol}-${timeframe}`}
                  options={volumeOptions}
                  series={[{ name: 'Volume', data: volumeData }]}
                  type="bar"
                  height={120}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
