'use client';

import { useEffect, useRef } from 'react';

interface Props {
  tvSymbol:  string;          // e.g. "NSE:RELIANCE", "NSE:NIFTY50", "BSE:SENSEX"
  interval?: string;          // "D" | "W" | "M" | "1" | "5" | "15" | "30" | "60"
  theme?:    'light' | 'dark';
}

const INTERVAL_MAP: Record<string, string> = {
  MIN: '1', '3MIN': '3', '5MIN': '5', '15MIN': '15', '30MIN': '30',
  '60MIN': '60', DAY: 'D', WEEK: 'W', MONTH: 'M',
};

// Converts exchange + symbol to TradingView symbol format
export function toTVSymbol(exchange: string, symbol: string): string {
  return `${(exchange ?? 'NSE').toUpperCase()}:${(symbol ?? '').toUpperCase()}`;
}

export function TradingViewChart({ tvSymbol, interval = 'D', theme = 'dark' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const resolvedInterval = INTERVAL_MAP[interval] ?? interval;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '<div class="tradingview-widget-container__widget" style="height:100%;width:100%"></div>';

    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize:           true,
      symbol:             tvSymbol,
      interval:           resolvedInterval,
      timezone:           'Asia/Kolkata',
      theme,
      style:              '1',
      locale:             'en',
      withdateranges:     true,
      hide_side_toolbar:  false,
      allow_symbol_change: true,
      calendar:           false,
      support_host:       'https://www.tradingview.com',
    });

    container.appendChild(script);

    return () => { if (container) container.innerHTML = ''; };
  }, [tvSymbol, resolvedInterval, theme]);

  return (
    <div
      ref={containerRef}
      className="tradingview-widget-container"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
