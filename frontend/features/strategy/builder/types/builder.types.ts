// ─── Block taxonomy ───────────────────────────────────────────────────────────

export type BlockType =
  | 'indicator'
  | 'condition'
  | 'entry_rule'
  | 'exit_rule'
  | 'option_leg'
  | 'filter';

export type IndicatorSubtype =
  | 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'BOLLINGER' | 'VWAP' | 'ATR' | 'SUPERTREND';

export type ConditionSubtype =
  | 'crossover' | 'crossunder' | 'above' | 'below'
  | 'between' | 'and_gate' | 'or_gate';

export type EntrySubtype =
  | 'buy_market' | 'sell_market' | 'buy_limit' | 'sell_limit';

export type ExitSubtype =
  | 'stop_loss_pct' | 'stop_loss_pts'
  | 'target_pct'    | 'target_pts'
  | 'trailing_stop' | 'time_exit' | 'eod';

export type OptionLegSubtype =
  | 'long_ce' | 'long_pe' | 'short_ce' | 'short_pe'
  | 'long_future' | 'short_future';

export type FilterSubtype =
  | 'time_window' | 'vix_range' | 'volume_min';

export type BlockSubtype =
  | IndicatorSubtype | ConditionSubtype | EntrySubtype
  | ExitSubtype      | OptionLegSubtype | FilterSubtype;

// ─── Parameter definitions ────────────────────────────────────────────────────

export interface ParamDef {
  key:          string;
  label:        string;
  type:         'number' | 'select' | 'text' | 'boolean';
  defaultValue: string | number | boolean;
  options?:     { label: string; value: string | number }[];
  min?:         number;
  max?:         number;
  step?:        number;
  placeholder?: string;
  unit?:        string;
}

// ─── Block definition (library catalogue entry) ───────────────────────────────

export interface BlockDef {
  type:        BlockType;
  subtype:     BlockSubtype;
  label:       string;
  icon:        string;
  description: string;
  paramDefs:   ParamDef[];
  inputCount:  number;   // number of input ports (left side)
  outputCount: number;   // number of output ports (right side)
  color:       string;   // hex accent — header bg tint + port colour
}

// ─── Runtime block instance on the canvas ────────────────────────────────────

export interface CanvasBlock {
  id:           string;
  type:         BlockType;
  subtype:      BlockSubtype;
  label:        string;          // from BlockDef
  customLabel:  string;          // user-editable display name
  params:       Record<string, string | number | boolean>;
  position:     { x: number; y: number };
  inputCount:   number;
  outputCount:  number;
  color:        string;
}

// ─── Wire between two blocks ──────────────────────────────────────────────────

export interface BlockConnection {
  id:       string;
  fromId:   string;
  fromPort: number;
  toId:     string;
  toPort:   number;
}

// Null when idle; set when user has clicked an output port and is routing a wire
export type PendingConnection =
  | null
  | { fromId: string; fromPort: number };

// ─── Mouse-drag state (for repositioning blocks) ──────────────────────────────

export interface DragState {
  blockId:      string;
  startMouseX:  number;
  startMouseY:  number;
  startBlockX:  number;
  startBlockY:  number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationError {
  blockId?:  string;
  message:   string;
  severity:  'error' | 'warning';
}

export interface ValidationResult {
  valid:  boolean;
  errors: ValidationError[];
}

// ─── Final exported strategy JSON ────────────────────────────────────────────

export interface StrategyBuilderJSON {
  id:          string;
  name:        string;
  version:     '2.0';
  symbol:      string;
  exchange:    'NSE' | 'BSE';
  category:    'bullish' | 'bearish' | 'neutral' | 'income' | 'hedged';
  description: string;
  blocks: Array<{
    id:       string;
    type:     BlockType;
    subtype:  BlockSubtype;
    label:    string;
    params:   Record<string, string | number | boolean>;
    position: { x: number; y: number };
  }>;
  connections: Array<{
    id:       string;
    fromId:   string;
    fromPort: number;
    toId:     string;
    toPort:   number;
  }>;
  derivedLogic: {
    indicators:      string[];
    entryConditions: string[];
    exitConditions:  string[];
    optionLegs:      string[];
    filters:         string[];
  };
  metadata: {
    createdAt:       string;
    updatedAt:       string;
    tags:            string[];
    blockCount:      number;
    connectionCount: number;
  };
}

// ─── Canvas meta (toolbar form fields) ───────────────────────────────────────

export interface CanvasMeta {
  name:        string;
  symbol:      string;
  exchange:    'NSE' | 'BSE';
  category:    StrategyBuilderJSON['category'];
  description: string;
  tags:        string[];
}
