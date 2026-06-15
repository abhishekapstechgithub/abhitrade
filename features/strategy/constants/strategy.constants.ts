import { StrategyCategory } from '../types/strategy.types';

export const CATEGORY_LABELS: Record<StrategyCategory, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  neutral: 'Neutral',
  hedged:  'Hedged',
  income:  'Income',
};

export const CATEGORY_COLORS: Record<StrategyCategory, { bg: string; text: string; border: string }> = {
  bullish: { bg: 'rgba(22,163,74,0.12)',   text: '#16a34a', border: 'rgba(22,163,74,0.3)'   },
  bearish: { bg: 'rgba(220,38,38,0.12)',   text: '#dc2626', border: 'rgba(220,38,38,0.3)'   },
  neutral: { bg: 'rgba(41,121,255,0.12)',  text: '#2979ff', border: 'rgba(41,121,255,0.3)'  },
  hedged:  { bg: 'rgba(170,0,255,0.12)',   text: '#aa00ff', border: 'rgba(170,0,255,0.3)'   },
  income:  { bg: 'rgba(245,158,11,0.12)',  text: '#f59e0b', border: 'rgba(245,158,11,0.3)'  },
};

export const PRESET_STRATEGIES = [
  { name: 'Bull Call Spread',  category: 'bullish' as StrategyCategory, legsCount: 2 },
  { name: 'Bear Put Spread',   category: 'bearish' as StrategyCategory, legsCount: 2 },
  { name: 'Iron Condor',       category: 'neutral' as StrategyCategory, legsCount: 4 },
  { name: 'Iron Butterfly',    category: 'neutral' as StrategyCategory, legsCount: 4 },
  { name: 'Straddle',          category: 'neutral' as StrategyCategory, legsCount: 2 },
  { name: 'Strangle',          category: 'neutral' as StrategyCategory, legsCount: 2 },
  { name: 'Covered Call',      category: 'income'  as StrategyCategory, legsCount: 2 },
  { name: 'Protective Put',    category: 'hedged'  as StrategyCategory, legsCount: 2 },
  { name: 'Bull Put Spread',   category: 'income'  as StrategyCategory, legsCount: 2 },
  { name: 'Calendar Spread',   category: 'neutral' as StrategyCategory, legsCount: 2 },
];

export const FO_SYMBOLS = [
  'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY',
  'RELIANCE', 'TCS', 'INFY', 'HDFCBANK', 'ICICIBANK',
  'SBIN', 'WIPRO', 'LTIM', 'AXISBANK', 'BAJFINANCE',
];
