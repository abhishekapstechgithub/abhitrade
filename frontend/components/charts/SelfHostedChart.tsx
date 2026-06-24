'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { useDevToolsDetection } from '@/hooks/useDevToolsDetection';

const INTERVALS = [
  { label: '1m',  api: 'ONE_MINUTE'     },
  { label: '5m',  api: 'FIVE_MINUTE'    },
  { label: '15m', api: 'FIFTEEN_MINUTE' },
  { label: '30m', api: 'THIRTY_MINUTE'  },
  { label: '1h',  api: 'ONE_HOUR'       },
  { label: '1D',  api: 'ONE_DAY'        },
  { label: '1W',  api: 'ONE_WEEK'       },
];

interface Props {
  token:            string;
  exchange:         string;
  symbol:           string;
  instrumentType?:  string;
  underlying?:      string;
  theme?:           'light' | 'dark';
  defaultInterval?: string; // '1D' | '1h' | '5m' etc.
}

type RawCandle = [string | number, number, number, number, number, number];

function toUnixSec(ts: string | number): number {
  if (typeof ts === 'number') return ts > 1e10 ? Math.floor(ts / 1000) : ts;
  return Math.floor(new Date(ts).getTime() / 1000);
}

export function SelfHostedChart({
  token, exchange, symbol,
  instrumentType = 'EQ', underlying = '',
  theme = 'dark', defaultInterval = '1D',
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candleRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const volumeRef = useRef<any>(null);

  const [activeInterval, setActiveInterval] = useState(defaultInterval);
  const [loading,        setLoading]         = useState(false);
  const [error,          setError]           = useState<string | null>(null);
  const [updatedAt,      setUpdatedAt]       = useState<string>('');

  const devToolsOpen = useDevToolsDetection();
  const dark = theme === 'dark';

  if (devToolsOpen) return null;

  const fetchAndRender = useCallback(async (apiInterval: string) => {
    if (!candleRef.current || !volumeRef.current || !chartRef.current) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ token, exchange, symbol, instrumentType, underlying, interval: apiInterval });
      const res  = await fetch(`/api/chart-data?${qs}`, { cache: 'no-store' });
      const data = await res.json() as { candles?: RawCandle[]; error?: string };
      if (data.error) throw new Error(data.error);

      const raw = (data.candles ?? []).sort((a, b) => toUnixSec(a[0]) - toUnixSec(b[0]));

      const candleData = raw.map(([ts, o, h, l, c]) => ({
        time:  toUnixSec(ts),
        open:  o, high: h, low: l, close: c,
      }));
      const volumeData = raw.map(([ts, o, , , c, v]) => ({
        time:  toUnixSec(ts),
        value: v ?? 0,
        color: c >= o ? 'rgba(22,163,74,0.4)' : 'rgba(220,38,38,0.4)',
      }));

      candleRef.current.setData(candleData);
      volumeRef.current.setData(volumeData);
      chartRef.current.timeScale().fitContent();
      setUpdatedAt(new Date().toLocaleTimeString());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load chart data');
    } finally {
      setLoading(false);
    }
  }, [token, exchange, symbol, instrumentType, underlying]);

  // Create chart — recreate when token or theme changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let destroyed = false;

    (async () => {
      const {
        createChart, ColorType, CrosshairMode,
        CandlestickSeries, HistogramSeries,
      } = await import('lightweight-charts');

      if (destroyed) return;

      const bg     = dark ? '#0d1117' : '#ffffff';
      const text   = dark ? '#94a3b8' : '#334155';
      const grid   = dark ? 'rgba(255,255,255,0.05)'  : 'rgba(0,0,0,0.04)';
      const border = dark ? 'rgba(255,255,255,0.08)'  : 'rgba(0,0,0,0.08)';

      const chart = createChart(container, {
        layout: {
          background: { type: ColorType.Solid, color: bg },
          textColor: text,
        },
        grid: {
          vertLines: { color: grid },
          horzLines: { color: grid },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: border },
        timeScale: {
          borderColor: border,
          timeVisible: true,
          secondsVisible: false,
        },
        autoSize: true,
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor:         '#16a34a',
        downColor:       '#dc2626',
        borderUpColor:   '#16a34a',
        borderDownColor: '#dc2626',
        wickUpColor:     '#16a34a',
        wickDownColor:   '#dc2626',
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        priceFormat:  { type: 'volume' },
        priceScaleId: 'volume',
      });
      chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

      chartRef.current  = chart;
      candleRef.current = candleSeries;
      volumeRef.current = volumeSeries;

      // Load initial data
      const apiInterval = INTERVALS.find(i => i.label === activeInterval)?.api ?? 'ONE_DAY';
      await fetchAndRender(apiInterval);
    })();

    return () => {
      destroyed = true;
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current  = null;
        candleRef.current = null;
        volumeRef.current = null;
      }
    };
  // activeInterval intentionally excluded — interval changes handled separately below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dark, token, exchange, symbol]);

  // Reload data when interval changes (chart already alive)
  useEffect(() => {
    const apiInterval = INTERVALS.find(i => i.label === activeInterval)?.api ?? 'ONE_DAY';
    fetchAndRender(apiInterval);
  }, [activeInterval, fetchAndRender]);

  const retry = () => {
    const apiInterval = INTERVALS.find(i => i.label === activeInterval)?.api ?? 'ONE_DAY';
    fetchAndRender(apiInterval);
  };

  return (
    <div className="flex flex-col w-full h-full"
      style={{ background: dark ? '#0d1117' : '#ffffff' }}>

      {/* Toolbar */}
      <div className="flex items-center gap-1 px-3 py-1.5 shrink-0"
        style={{ borderBottom: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid #e2e8f0' }}>
        <span className="text-[11px] font-semibold mr-2"
          style={{ color: dark ? '#94a3b8' : '#475569' }}>
          {symbol}
        </span>
        <div className="flex items-center gap-0.5">
          {INTERVALS.map(tf => (
            <button
              key={tf.label}
              onClick={() => setActiveInterval(tf.label)}
              className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
              style={{
                background: activeInterval === tf.label
                  ? (dark ? 'rgba(59,130,246,0.2)' : '#eff6ff')
                  : 'transparent',
                color: activeInterval === tf.label
                  ? '#3b82f6'
                  : (dark ? '#64748b' : '#94a3b8'),
                border: activeInterval === tf.label
                  ? '1px solid rgba(59,130,246,0.3)'
                  : '1px solid transparent',
              }}>
              {tf.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {loading && <Loader2 size={12} className="animate-spin" style={{ color: '#3b82f6' }} />}
          {updatedAt && !loading && (
            <span className="text-[10px]" style={{ color: dark ? '#475569' : '#cbd5e1' }}>
              {updatedAt}
            </span>
          )}
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 min-h-0 relative">
        <div ref={containerRef} className="w-full h-full" />

        {/* Initial loading cover (before chart is ready) */}
        {loading && !chartRef.current && (
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: dark ? '#0d1117' : '#ffffff' }}>
            <Loader2 size={28} className="animate-spin" style={{ color: '#3b82f6' }} />
          </div>
        )}

        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: dark ? 'rgba(13,17,23,0.92)' : 'rgba(255,255,255,0.92)' }}>
            <AlertCircle size={24} style={{ color: '#ef4444' }} />
            <p className="text-xs text-center max-w-xs px-4"
              style={{ color: dark ? '#94a3b8' : '#64748b' }}>
              {error}
            </p>
            <button onClick={retry}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{
                background: 'rgba(59,130,246,0.15)',
                color: '#3b82f6',
                border: '1px solid rgba(59,130,246,0.3)',
              }}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
