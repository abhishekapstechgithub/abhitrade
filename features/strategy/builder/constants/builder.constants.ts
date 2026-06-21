import type { BlockDef } from '../types/builder.types';

// ─── Canvas geometry ──────────────────────────────────────────────────────────
export const BLOCK_W   = 192;   // px — fixed block width
export const BLOCK_H   = 80;    // px — fixed block height
export const PORT_R    = 6;     // px — port circle radius
export const SNAP      = 16;    // px — snap-to-grid increment
export const CANVAS_W  = 2800;  // px — virtual canvas width
export const CANVAS_H  = 1800;  // px — virtual canvas height

// ─── Type accent colours ──────────────────────────────────────────────────────
export const TYPE_COLOR: Record<string, string> = {
  indicator:  '#2979ff',
  condition:  '#aa00ff',
  entry_rule: '#10b981',
  exit_rule:  '#ef4444',
  option_leg: '#00d4ff',
  filter:     '#f97316',
};

export const TYPE_BG: Record<string, string> = {
  indicator:  'rgba(41,121,255,0.14)',
  condition:  'rgba(170,0,255,0.14)',
  entry_rule: 'rgba(16,185,129,0.14)',
  exit_rule:  'rgba(239,68,68,0.14)',
  option_leg: 'rgba(0,212,255,0.14)',
  filter:     'rgba(249,115,22,0.14)',
};

// ─── Shared param option sets ─────────────────────────────────────────────────
const SRC = [
  { label: 'Close', value: 'close' },
  { label: 'Open',  value: 'open'  },
  { label: 'High',  value: 'high'  },
  { label: 'Low',   value: 'low'   },
  { label: 'HL/2',  value: 'hl2'   },
];
const PRODUCT = [
  { label: 'MIS — Intraday', value: 'MIS'  },
  { label: 'NRML — F&O',     value: 'NRML' },
  { label: 'CNC — Equity',   value: 'CNC'  },
];
const EXPIRY  = [
  { label: 'Weekly',  value: 'weekly'  },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Next Monthly', value: 'next_monthly' },
];

// ─── Block library ────────────────────────────────────────────────────────────
export const BLOCK_LIBRARY: BlockDef[] = [

  // ── Indicators ──────────────────────────────────────────────────────────────
  {
    type: 'indicator', subtype: 'EMA',
    label: 'EMA', icon: '〜', color: TYPE_COLOR.indicator,
    description: 'Exponential Moving Average',
    inputCount: 0, outputCount: 1,
    paramDefs: [
      { key: 'period', label: 'Period', type: 'number', defaultValue: 20, min: 1, max: 500 },
      { key: 'source', label: 'Source', type: 'select', defaultValue: 'close', options: SRC },
    ],
  },
  {
    type: 'indicator', subtype: 'SMA',
    label: 'SMA', icon: '—', color: TYPE_COLOR.indicator,
    description: 'Simple Moving Average',
    inputCount: 0, outputCount: 1,
    paramDefs: [
      { key: 'period', label: 'Period', type: 'number', defaultValue: 50, min: 1, max: 500 },
      { key: 'source', label: 'Source', type: 'select', defaultValue: 'close', options: SRC },
    ],
  },
  {
    type: 'indicator', subtype: 'RSI',
    label: 'RSI', icon: '⤨', color: TYPE_COLOR.indicator,
    description: 'Relative Strength Index (0–100)',
    inputCount: 0, outputCount: 1,
    paramDefs: [
      { key: 'period', label: 'Period',     type: 'number', defaultValue: 14, min: 2,  max: 100 },
      { key: 'ob',     label: 'Overbought', type: 'number', defaultValue: 70, min: 50, max: 100 },
      { key: 'os',     label: 'Oversold',   type: 'number', defaultValue: 30, min: 0,  max: 50  },
    ],
  },
  {
    type: 'indicator', subtype: 'MACD',
    label: 'MACD', icon: '≋', color: TYPE_COLOR.indicator,
    description: 'MACD — outputs line & signal',
    inputCount: 0, outputCount: 2,
    paramDefs: [
      { key: 'fast',   label: 'Fast',   type: 'number', defaultValue: 12, min: 1, max: 100 },
      { key: 'slow',   label: 'Slow',   type: 'number', defaultValue: 26, min: 1, max: 200 },
      { key: 'signal', label: 'Signal', type: 'number', defaultValue: 9,  min: 1, max: 50  },
    ],
  },
  {
    type: 'indicator', subtype: 'BOLLINGER',
    label: 'Bollinger Bands', icon: '⌇', color: TYPE_COLOR.indicator,
    description: 'Bollinger — upper, middle, lower bands',
    inputCount: 0, outputCount: 3,
    paramDefs: [
      { key: 'period', label: 'Period', type: 'number', defaultValue: 20,  min: 2,   max: 200 },
      { key: 'stddev', label: 'StdDev', type: 'number', defaultValue: 2.0, min: 0.5, max: 5, step: 0.5 },
    ],
  },
  {
    type: 'indicator', subtype: 'VWAP',
    label: 'VWAP', icon: '◈', color: TYPE_COLOR.indicator,
    description: 'Volume-Weighted Average Price (intraday)',
    inputCount: 0, outputCount: 1,
    paramDefs: [],
  },
  {
    type: 'indicator', subtype: 'ATR',
    label: 'ATR', icon: '↕', color: TYPE_COLOR.indicator,
    description: 'Average True Range — volatility',
    inputCount: 0, outputCount: 1,
    paramDefs: [
      { key: 'period', label: 'Period', type: 'number', defaultValue: 14, min: 1, max: 200 },
    ],
  },
  {
    type: 'indicator', subtype: 'SUPERTREND',
    label: 'Supertrend', icon: '↗', color: TYPE_COLOR.indicator,
    description: 'Supertrend trend-direction signal',
    inputCount: 0, outputCount: 1,
    paramDefs: [
      { key: 'period',     label: 'Period',     type: 'number', defaultValue: 7,   min: 1,   max: 100      },
      { key: 'multiplier', label: 'Multiplier', type: 'number', defaultValue: 3.0, min: 0.5, max: 10, step: 0.5 },
    ],
  },

  // ── Conditions ───────────────────────────────────────────────────────────────
  {
    type: 'condition', subtype: 'crossover',
    label: 'Crossover', icon: '✕', color: TYPE_COLOR.condition,
    description: 'Signal A crosses above Signal B',
    inputCount: 2, outputCount: 1,
    paramDefs: [],
  },
  {
    type: 'condition', subtype: 'crossunder',
    label: 'Crossunder', icon: '✕', color: TYPE_COLOR.condition,
    description: 'Signal A crosses below Signal B',
    inputCount: 2, outputCount: 1,
    paramDefs: [],
  },
  {
    type: 'condition', subtype: 'above',
    label: 'Above', icon: '>', color: TYPE_COLOR.condition,
    description: 'Signal A is above threshold / Signal B',
    inputCount: 2, outputCount: 1,
    paramDefs: [
      { key: 'threshold', label: 'Fixed threshold', type: 'number', defaultValue: 0, placeholder: '0 = use port B' },
    ],
  },
  {
    type: 'condition', subtype: 'below',
    label: 'Below', icon: '<', color: TYPE_COLOR.condition,
    description: 'Signal A is below threshold / Signal B',
    inputCount: 2, outputCount: 1,
    paramDefs: [
      { key: 'threshold', label: 'Fixed threshold', type: 'number', defaultValue: 0, placeholder: '0 = use port B' },
    ],
  },
  {
    type: 'condition', subtype: 'between',
    label: 'Between', icon: '⇔', color: TYPE_COLOR.condition,
    description: 'Signal is within a numeric range',
    inputCount: 1, outputCount: 1,
    paramDefs: [
      { key: 'lower', label: 'Lower bound', type: 'number', defaultValue: 30 },
      { key: 'upper', label: 'Upper bound', type: 'number', defaultValue: 70 },
    ],
  },
  {
    type: 'condition', subtype: 'and_gate',
    label: 'AND Gate', icon: '∧', color: TYPE_COLOR.condition,
    description: 'Output true only when all inputs are true',
    inputCount: 2, outputCount: 1,
    paramDefs: [],
  },
  {
    type: 'condition', subtype: 'or_gate',
    label: 'OR Gate', icon: '∨', color: TYPE_COLOR.condition,
    description: 'Output true when any input is true',
    inputCount: 2, outputCount: 1,
    paramDefs: [],
  },

  // ── Entry Rules ───────────────────────────────────────────────────────────────
  {
    type: 'entry_rule', subtype: 'buy_market',
    label: 'Buy Market', icon: '▲', color: TYPE_COLOR.entry_rule,
    description: 'Market buy order on trigger',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'qty',     label: 'Quantity', type: 'number', defaultValue: 1,     min: 1 },
      { key: 'product', label: 'Product',  type: 'select', defaultValue: 'MIS', options: PRODUCT },
    ],
  },
  {
    type: 'entry_rule', subtype: 'sell_market',
    label: 'Sell Market', icon: '▼', color: TYPE_COLOR.entry_rule,
    description: 'Market sell/short order on trigger',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'qty',     label: 'Quantity', type: 'number', defaultValue: 1,      min: 1 },
      { key: 'product', label: 'Product',  type: 'select', defaultValue: 'NRML', options: PRODUCT },
    ],
  },
  {
    type: 'entry_rule', subtype: 'buy_limit',
    label: 'Buy Limit', icon: '▲', color: TYPE_COLOR.entry_rule,
    description: 'Limit buy at a price offset from trigger',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'qty',        label: 'Quantity',  type: 'number', defaultValue: 1,     min: 1                 },
      { key: 'offset_pct', label: 'Offset %',  type: 'number', defaultValue: 0.5,   min: 0, step: 0.1, unit: '%' },
      { key: 'product',    label: 'Product',   type: 'select', defaultValue: 'MIS', options: PRODUCT       },
    ],
  },
  {
    type: 'entry_rule', subtype: 'sell_limit',
    label: 'Sell Limit', icon: '▼', color: TYPE_COLOR.entry_rule,
    description: 'Limit short at a price offset from trigger',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'qty',        label: 'Quantity', type: 'number', defaultValue: 1,      min: 1                 },
      { key: 'offset_pct', label: 'Offset %', type: 'number', defaultValue: 0.5,    min: 0, step: 0.1, unit: '%' },
      { key: 'product',    label: 'Product',  type: 'select', defaultValue: 'NRML', options: PRODUCT       },
    ],
  },

  // ── Exit Rules ────────────────────────────────────────────────────────────────
  {
    type: 'exit_rule', subtype: 'stop_loss_pct',
    label: 'Stop Loss %', icon: '⛔', color: TYPE_COLOR.exit_rule,
    description: 'Exit if loss exceeds % of entry',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'pct', label: 'Loss %', type: 'number', defaultValue: 2, min: 0.1, max: 100, step: 0.1, unit: '%' },
    ],
  },
  {
    type: 'exit_rule', subtype: 'stop_loss_pts',
    label: 'Stop Loss Pts', icon: '⛔', color: TYPE_COLOR.exit_rule,
    description: 'Exit if loss exceeds fixed points',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'pts', label: 'Points', type: 'number', defaultValue: 50, min: 1 },
    ],
  },
  {
    type: 'exit_rule', subtype: 'target_pct',
    label: 'Target %', icon: '🎯', color: TYPE_COLOR.exit_rule,
    description: 'Take profit at % gain from entry',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'pct', label: 'Target %', type: 'number', defaultValue: 4, min: 0.1, max: 500, step: 0.1, unit: '%' },
    ],
  },
  {
    type: 'exit_rule', subtype: 'target_pts',
    label: 'Target Pts', icon: '🎯', color: TYPE_COLOR.exit_rule,
    description: 'Take profit at fixed points gain',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'pts', label: 'Points', type: 'number', defaultValue: 100, min: 1 },
    ],
  },
  {
    type: 'exit_rule', subtype: 'trailing_stop',
    label: 'Trailing Stop', icon: '↩', color: TYPE_COLOR.exit_rule,
    description: 'Trail stop by % behind peak price',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'trail_pct', label: 'Trail %', type: 'number', defaultValue: 1.5, min: 0.1, max: 20, step: 0.1, unit: '%' },
    ],
  },
  {
    type: 'exit_rule', subtype: 'time_exit',
    label: 'Time Exit', icon: '⏱', color: TYPE_COLOR.exit_rule,
    description: 'Market exit at a specific IST time',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'time', label: 'Exit time (IST)', type: 'text', defaultValue: '15:15', placeholder: 'HH:MM' },
    ],
  },
  {
    type: 'exit_rule', subtype: 'eod',
    label: 'End of Day', icon: '🌙', color: TYPE_COLOR.exit_rule,
    description: 'Square off all positions at market close',
    inputCount: 1, outputCount: 0,
    paramDefs: [],
  },

  // ── Option Legs ───────────────────────────────────────────────────────────────
  {
    type: 'option_leg', subtype: 'long_ce',
    label: 'Long CE', icon: 'C↑', color: TYPE_COLOR.option_leg,
    description: 'Buy a Call option leg',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'symbol',  label: 'Symbol',        type: 'text',   defaultValue: 'NIFTY'    },
      { key: 'offset',  label: 'Strike offset',  type: 'number', defaultValue: 0, min: -20, max: 20 },
      { key: 'expiry',  label: 'Expiry',         type: 'select', defaultValue: 'weekly', options: EXPIRY },
      { key: 'lots',    label: 'Lots',           type: 'number', defaultValue: 1, min: 1, max: 500 },
    ],
  },
  {
    type: 'option_leg', subtype: 'long_pe',
    label: 'Long PE', icon: 'P↑', color: TYPE_COLOR.option_leg,
    description: 'Buy a Put option leg',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'symbol',  label: 'Symbol',        type: 'text',   defaultValue: 'NIFTY'    },
      { key: 'offset',  label: 'Strike offset',  type: 'number', defaultValue: 0, min: -20, max: 20 },
      { key: 'expiry',  label: 'Expiry',         type: 'select', defaultValue: 'weekly', options: EXPIRY },
      { key: 'lots',    label: 'Lots',           type: 'number', defaultValue: 1, min: 1, max: 500 },
    ],
  },
  {
    type: 'option_leg', subtype: 'short_ce',
    label: 'Short CE', icon: 'C↓', color: TYPE_COLOR.option_leg,
    description: 'Sell a Call option leg',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'symbol',  label: 'Symbol',        type: 'text',   defaultValue: 'NIFTY'    },
      { key: 'offset',  label: 'Strike offset',  type: 'number', defaultValue: 0, min: -20, max: 20 },
      { key: 'expiry',  label: 'Expiry',         type: 'select', defaultValue: 'weekly', options: EXPIRY },
      { key: 'lots',    label: 'Lots',           type: 'number', defaultValue: 1, min: 1, max: 500 },
    ],
  },
  {
    type: 'option_leg', subtype: 'short_pe',
    label: 'Short PE', icon: 'P↓', color: TYPE_COLOR.option_leg,
    description: 'Sell a Put option leg',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'symbol',  label: 'Symbol',        type: 'text',   defaultValue: 'NIFTY'    },
      { key: 'offset',  label: 'Strike offset',  type: 'number', defaultValue: 0, min: -20, max: 20 },
      { key: 'expiry',  label: 'Expiry',         type: 'select', defaultValue: 'weekly', options: EXPIRY },
      { key: 'lots',    label: 'Lots',           type: 'number', defaultValue: 1, min: 1, max: 500 },
    ],
  },
  {
    type: 'option_leg', subtype: 'long_future',
    label: 'Long Future', icon: 'F↑', color: TYPE_COLOR.option_leg,
    description: 'Long futures contract',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'symbol', label: 'Symbol', type: 'text',   defaultValue: 'NIFTY'    },
      { key: 'expiry', label: 'Expiry', type: 'select', defaultValue: 'monthly', options: EXPIRY },
      { key: 'lots',   label: 'Lots',   type: 'number', defaultValue: 1, min: 1  },
    ],
  },
  {
    type: 'option_leg', subtype: 'short_future',
    label: 'Short Future', icon: 'F↓', color: TYPE_COLOR.option_leg,
    description: 'Short futures contract',
    inputCount: 1, outputCount: 0,
    paramDefs: [
      { key: 'symbol', label: 'Symbol', type: 'text',   defaultValue: 'NIFTY'    },
      { key: 'expiry', label: 'Expiry', type: 'select', defaultValue: 'monthly', options: EXPIRY },
      { key: 'lots',   label: 'Lots',   type: 'number', defaultValue: 1, min: 1  },
    ],
  },

  // ── Filters ───────────────────────────────────────────────────────────────────
  {
    type: 'filter', subtype: 'time_window',
    label: 'Time Window', icon: '⏰', color: TYPE_COLOR.filter,
    description: 'Allow signals only during this IST window',
    inputCount: 0, outputCount: 1,
    paramDefs: [
      { key: 'from', label: 'From (IST)', type: 'text', defaultValue: '09:30', placeholder: 'HH:MM' },
      { key: 'to',   label: 'To (IST)',   type: 'text', defaultValue: '14:30', placeholder: 'HH:MM' },
    ],
  },
  {
    type: 'filter', subtype: 'vix_range',
    label: 'VIX Filter', icon: '〜', color: TYPE_COLOR.filter,
    description: 'Trade only when India VIX is in range',
    inputCount: 0, outputCount: 1,
    paramDefs: [
      { key: 'min_vix', label: 'Min VIX', type: 'number', defaultValue: 10, min: 0, max: 100 },
      { key: 'max_vix', label: 'Max VIX', type: 'number', defaultValue: 20, min: 0, max: 100 },
    ],
  },
  {
    type: 'filter', subtype: 'volume_min',
    label: 'Volume Filter', icon: '▐', color: TYPE_COLOR.filter,
    description: 'Block signals unless volume exceeds floor',
    inputCount: 0, outputCount: 1,
    paramDefs: [
      { key: 'min_volume', label: 'Min volume', type: 'number', defaultValue: 100000, min: 0 },
    ],
  },
];

// ─── Grouped for the library panel ───────────────────────────────────────────
export const BLOCK_GROUPS: Array<{ type: string; label: string; color: string }> = [
  { type: 'indicator',  label: 'Indicators',   color: TYPE_COLOR.indicator  },
  { type: 'condition',  label: 'Conditions',    color: TYPE_COLOR.condition  },
  { type: 'entry_rule', label: 'Entry Rules',   color: TYPE_COLOR.entry_rule },
  { type: 'exit_rule',  label: 'Exit Rules',    color: TYPE_COLOR.exit_rule  },
  { type: 'option_leg', label: 'Option Legs',   color: TYPE_COLOR.option_leg },
  { type: 'filter',     label: 'Filters',       color: TYPE_COLOR.filter     },
];
