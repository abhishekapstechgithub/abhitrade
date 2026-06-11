'use client';
import { useEffect, useRef } from 'react';

interface Props {
  symbol:   string;
  exchange: string;
  theme?:   'light' | 'dark';
}

// TradingView free-embed symbol map for Indian indices
const SYMBOL_MAP: Record<string, string> = {
  'NIFTY 50':          'NSE:NIFTY50',
  'NIFTY50':           'NSE:NIFTY50',
  'NIFTY':             'NSE:NIFTY50',
  'BANKNIFTY':         'NSE:BANKNIFTY',
  'NIFTY BANK':        'NSE:BANKNIFTY',
  'SENSEX':            'BSE:SENSEX',
  'FINNIFTY':          'NSE:FINNIFTY',
  'NIFTY FIN SERVICE': 'NSE:FINNIFTY',
  'MIDCPNIFTY':        'NSE:MIDCPNIFTY',
  'NIFTYIT':           'NSE:CNXIT',
};

function toTvSymbol(symbol: string, exchange: string): string {
  const upper = symbol.toUpperCase().trim();
  if (SYMBOL_MAP[upper]) return SYMBOL_MAP[upper];
  const clean = upper.replace(/[\s&]/g, '').replace(/[-]/g, '');
  if (exchange === 'BSE') return `BSE:${clean}`;
  return `NSE:${clean}`;
}

let tvScriptLoaded = false;
let tvScriptLoading = false;
const tvReadyCallbacks: (() => void)[] = [];

function loadTvScript(cb: () => void) {
  if (tvScriptLoaded) { cb(); return; }
  tvReadyCallbacks.push(cb);
  if (tvScriptLoading) return;
  tvScriptLoading = true;
  const s = document.createElement('script');
  s.src = 'https://s3.tradingview.com/tv.js';
  s.async = true;
  s.onload = () => {
    tvScriptLoaded  = true;
    tvScriptLoading = false;
    tvReadyCallbacks.forEach(fn => fn());
    tvReadyCallbacks.length = 0;
  };
  document.head.appendChild(s);
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    TradingView: any;
  }
}

let widgetSeq = 0;

export function TradingViewAdvancedChart({ symbol, exchange, theme = 'light' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // stable ID across re-renders
  const idRef = useRef(`tv_wl_${++widgetSeq}`);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Wipe previous widget
    container.innerHTML = '';
    const id = `tv_wl_${++widgetSeq}`;
    idRef.current = id;

    const targetDiv = document.createElement('div');
    targetDiv.id = id;
    targetDiv.style.width  = '100%';
    targetDiv.style.height = '100%';
    container.appendChild(targetDiv);

    loadTvScript(() => {
      if (!window.TradingView || !document.getElementById(id)) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      new (window.TradingView as any).widget({
        container_id:        id,
        autosize:            true,
        symbol:              toTvSymbol(symbol, exchange),
        interval:            '15',
        timezone:            'Asia/Kolkata',
        theme,
        style:               '1',         // candlestick
        locale:              'en',
        enable_publishing:   false,
        allow_symbol_change: true,
        save_image:          true,
        withdateranges:      true,
        hide_side_toolbar:   false,
        toolbar_bg:          theme === 'dark' ? '#131722' : '#f1f3f6',
        studies:             ['Volume@tv-basicstudies'],
      });
    });

    return () => {
      if (container) container.innerHTML = '';
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, exchange, theme]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
  );
}
