// ─── Enumerations ─────────────────────────────────────────────────────────────

export type TradeSide    = 'LONG' | 'SHORT';
export type ExitReason   = 'TARGET' | 'STOPLOSS' | 'TRAILING' | 'TIME_EXIT' | 'EOD' | 'SIGNAL';
export type BacktestStatus = 'idle' | 'running' | 'completed' | 'failed';
export type Timeframe    = '1m' | '5m' | '15m' | '30m' | '1h' | '1D' | '1W';

// ─── Per-trade record ────────────────────────────────────────────────────────

export interface TradeRecord {
  id:           number;
  entryDate:    string;       // "YYYY-MM-DD"
  exitDate:     string;
  entryTime:    string;       // "HH:MM"
  exitTime:     string;
  symbol:       string;
  side:         TradeSide;
  entryLevel:   number;       // underlying index level at entry
  exitLevel:    number;       // underlying index level at exit
  qty:          number;       // lots
  grossPnl:     number;       // before brokerage (₹)
  brokerage:    number;       // (₹)
  netPnl:       number;       // after brokerage (₹)
  pnlPct:       number;       // % of initial capital
  exitReason:   ExitReason;
  holdingMins:  number;       // minutes in trade
  mfe:          number;       // max favourable excursion (₹)
  mae:          number;       // max adverse excursion (₹, negative)
}

// ─── Time-series equity curve ─────────────────────────────────────────────────

export interface EquityPoint {
  date:      string;   // "YYYY-MM-DD"
  equity:    number;   // cumulative net P&L from inception (₹)
  drawdown:  number;   // current drawdown from peak (≤ 0, ₹)
  tradeExit: boolean;  // true if a trade closed on this day
}

// ─── Monthly breakdown ────────────────────────────────────────────────────────

export interface MonthlyReturn {
  year:    number;
  month:   number;   // 1–12
  label:   string;   // "Jan 25"
  netPnl:  number;
  pnlPct:  number;   // % of initial capital
  trades:  number;
  wins:    number;
}

// ─── Aggregate metrics ────────────────────────────────────────────────────────

export interface BacktestMetrics {
  // P&L
  grossPnl:          number;
  totalBrokerage:    number;
  netPnl:            number;
  absoluteReturnPct: number;    // % of initial capital
  annualizedRetPct:  number;

  // Trades
  totalTrades:    number;
  winningTrades:  number;
  losingTrades:   number;
  breakEven:      number;
  winRate:        number;       // 0–100

  // Risk / reward
  profitFactor:   number;       // gross wins / gross losses
  avgTrade:       number;       // avg net P&L
  avgWin:         number;
  avgLoss:        number;       // negative
  expectancy:     number;       // winRate*avgWin + lossRate*avgLoss

  // Drawdown
  maxDrawdown:     number;      // peak-to-trough ₹ (negative)
  maxDrawdownPct:  number;      // % of initial capital (negative)
  recoveryDays:    number;

  // Risk-adjusted
  sharpeRatio:  number;
  sortinoRatio: number;
  calmarRatio:  number;

  // Streaks
  maxConsecWins:   number;
  maxConsecLosses: number;
  avgHoldingMins:  number;

  // Capital
  initialCapital: number;
  peakCapital:    number;
  finalCapital:   number;       // initialCapital + netPnl
}

// ─── Configuration the backtest was run with ─────────────────────────────────

export interface BacktestConfig {
  strategyId:       string;
  strategyName:     string;
  symbol:           string;
  exchange:         'NSE' | 'BSE';
  fromDate:         string;
  toDate:           string;
  timeframe:        Timeframe;
  initialCapital:   number;
  slippagePct:      number;
  brokeragePerLot:  number;
  category:         string;
}

// ─── Full backtest result ─────────────────────────────────────────────────────

export interface BacktestResult {
  id:             string;
  config:         BacktestConfig;
  metrics:        BacktestMetrics;
  equityCurve:    EquityPoint[];
  monthlyReturns: MonthlyReturn[];
  trades:         TradeRecord[];
  runAt:          string;       // ISO datetime
  status:         BacktestStatus;
  errorMsg?:      string;
  durationMs?:    number;       // how long the backtest took to run
}

// ─── Dashboard component props ────────────────────────────────────────────────

export interface BacktestDashboardProps {
  result?:   BacktestResult;
  loading?:  boolean;
  error?:    string | null;
  onRerun?:  () => void;
  onExport?: (format: 'csv' | 'json') => void;
}
