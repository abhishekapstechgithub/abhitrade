// Known AngelOne instrument tokens (from NSE/BSE scrip master)
// Exchange: NSE_CM = equities/indices, NSE_FO = F&O, BSE_CM = BSE equities

export interface TokenInfo {
  exchange: string;
  token: string;
  tradingSymbol: string;
  name: string;
}

// Major index tokens — these are the NSE/BSE cash segment index tokens
export const INDEX_TOKENS: Record<string, TokenInfo> = {
  'NIFTY 50':   { exchange: 'NSE', token: '99926000', tradingSymbol: 'Nifty 50',    name: 'NIFTY 50'   },
  'NIFTY':      { exchange: 'NSE', token: '99926000', tradingSymbol: 'Nifty 50',    name: 'NIFTY 50'   },
  'BANKNIFTY':  { exchange: 'NSE', token: '99926009', tradingSymbol: 'Nifty Bank',  name: 'BANK NIFTY' },
  'NIFTY BANK': { exchange: 'NSE', token: '99926009', tradingSymbol: 'Nifty Bank',  name: 'BANK NIFTY' },
  'SENSEX':     { exchange: 'BSE', token: '99919000', tradingSymbol: 'SENSEX',      name: 'SENSEX'     },
  'NIFTY IT':   { exchange: 'NSE', token: '99926006', tradingSymbol: 'Nifty IT',    name: 'NIFTY IT'   },
  'NIFTY MIDCAP 100': { exchange: 'NSE', token: '99926003', tradingSymbol: 'NIFTY Midcap 100', name: 'NIFTY MIDCAP' },
};

// Commonly traded equities
export const EQUITY_TOKENS: Record<string, TokenInfo> = {
  'RELIANCE':  { exchange: 'NSE', token: '2885',  tradingSymbol: 'RELIANCE-EQ',  name: 'Reliance Industries' },
  'TCS':       { exchange: 'NSE', token: '11536', tradingSymbol: 'TCS-EQ',       name: 'Tata Consultancy Services' },
  'HDFCBANK':  { exchange: 'NSE', token: '1333',  tradingSymbol: 'HDFCBANK-EQ',  name: 'HDFC Bank' },
  'INFY':      { exchange: 'NSE', token: '1594',  tradingSymbol: 'INFY-EQ',      name: 'Infosys' },
  'ICICIBANK': { exchange: 'NSE', token: '4963',  tradingSymbol: 'ICICIBANK-EQ', name: 'ICICI Bank' },
  'SBIN':      { exchange: 'NSE', token: '3045',  tradingSymbol: 'SBIN-EQ',      name: 'State Bank of India' },
  'AXISBANK':  { exchange: 'NSE', token: '5900',  tradingSymbol: 'AXISBANK-EQ',  name: 'Axis Bank' },
  'BAJFINANCE':{ exchange: 'NSE', token: '317',   tradingSymbol: 'BAJFINANCE-EQ',name: 'Bajaj Finance' },
  'WIPRO':     { exchange: 'NSE', token: '3787',  tradingSymbol: 'WIPRO-EQ',     name: 'Wipro' },
  'TATASTEEL': { exchange: 'NSE', token: '3499',  tradingSymbol: 'TATASTEEL-EQ', name: 'Tata Steel' },
  'LT':        { exchange: 'NSE', token: '11483', tradingSymbol: 'LT-EQ',        name: 'Larsen & Toubro' },
  'MARUTI':    { exchange: 'NSE', token: '10999', tradingSymbol: 'MARUTI-EQ',    name: 'Maruti Suzuki' },
};

export function lookupToken(symbol: string): TokenInfo | null {
  const key = symbol.toUpperCase().trim();
  return INDEX_TOKENS[key] ?? EQUITY_TOKENS[key] ?? null;
}

// Date helpers for candle API
// Max days the AngelOne API allows per interval — use the full window to maximise data
const INTERVAL_MAX_DAYS: Record<string, number> = {
  ONE_MINUTE:     30,
  THREE_MINUTE:   60,
  FIVE_MINUTE:    100,
  TEN_MINUTE:     100,
  FIFTEEN_MINUTE: 200,
  THIRTY_MINUTE:  200,
  ONE_HOUR:       400,
  ONE_DAY:        2000,
};

export function candleDateRange(interval: string): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  // AngelOne requires "yyyy-MM-dd HH:mm" (24-hour, IST)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  // Map any non-native intervals to the nearest supported one for the API fetch
  const apiInterval = toApiInterval(interval);
  const days = INTERVAL_MAX_DAYS[apiInterval] ?? 365;

  const from = new Date(now);
  from.setDate(now.getDate() - days);

  return { from: fmt(from), to: fmt(now) };
}

// ── Map UI/internal intervals → valid AngelOne API intervals ─────────────────
// AngelOne only supports the 8 intervals below; weekly/monthly/4h are fetched
// as hourly/daily and aggregated by the mongo-chart bucketing layer.
export function toApiInterval(interval: string): string {
  const map: Record<string, string> = {
    ONE_MINUTE:     'ONE_MINUTE',
    THREE_MINUTE:   'THREE_MINUTE',
    FIVE_MINUTE:    'FIVE_MINUTE',
    TEN_MINUTE:     'TEN_MINUTE',
    FIFTEEN_MINUTE: 'FIFTEEN_MINUTE',
    THIRTY_MINUTE:  'THIRTY_MINUTE',
    ONE_HOUR:       'ONE_HOUR',
    TWO_HOUR:       'ONE_HOUR',   // aggregate in mongo-chart
    FOUR_HOUR:      'ONE_HOUR',   // aggregate in mongo-chart
    ONE_DAY:        'ONE_DAY',
    ONE_WEEK:       'ONE_DAY',    // aggregate in mongo-chart
    ONE_MONTH:      'ONE_DAY',    // aggregate in mongo-chart
  };
  return map[interval] ?? 'ONE_DAY';
}

// ── Correct AngelOne exchange segment for each instrument class ───────────────
// AngelOne uses NSE/BSE only for cash equities/indices;
// derivatives go through NFO (NSE F&O) or BFO (BSE F&O).
export function toApiExchange(exchange: string, instrumentType: string): string {
  const ex = exchange.toUpperCase();
  const it = (instrumentType ?? '').toUpperCase();
  const isFO = ['FUTIDX','FUTSTK','OPTIDX','OPTSTK','CE','PE','FUT'].includes(it);
  if (isFO) return ex === 'BSE' ? 'BFO' : 'NFO';
  return ex; // NSE / BSE / MCX as-is
}

// ── MongoDB collection routing ────────────────────────────────────────────────
// Determines which MongoDB collection to store/read chart data for a scrip.
const INDEX_UNDERLYINGS = new Set([
  'NIFTY','NIFTY50','NIFTY 50','BANKNIFTY','NIFTY BANK',
  'FINNIFTY','MIDCPNIFTY','SENSEX','BANKEX','NIFTYNXT50','INDIA VIX',
]);

// NSE_CM series that map to the equity collection
const CM_SERIES = new Set(['EQ','BE','BL','SM','ST','N1','N2','N3','N4','GC','IL','INDEX','IDX','ETF','']);

export function getChartCollection(
  exchange: string,
  instrumentType: string,
  underlying?: string,
): string {
  const ex = exchange.toUpperCase();
  const it = (instrumentType ?? '').toUpperCase();

  // ── Cash market (NSE_CM / BSE_CM) ────────────────────────────────────────
  if (CM_SERIES.has(it)) {
    return ex === 'BSE' ? 'BSE_E_EQUITY' : 'NSE_E_EQUITY';
  }

  // ── Futures (NSE_FO / BSE_FO) ─────────────────────────────────────────────
  if (it === 'FUTIDX') return ex === 'BSE' ? 'BSE_D_FUTIDX' : 'NSE_D_FUTIDX';
  if (it === 'FUTSTK') return ex === 'BSE' ? 'BSE_D_FUTSTK' : 'NSE_D_FUTSTK';
  // Generic FUT — classify by underlying
  if (it === 'FUT') {
    const isIdx = underlying ? INDEX_UNDERLYINGS.has(underlying.toUpperCase()) : false;
    if (isIdx) return ex === 'BSE' ? 'BSE_D_FUTIDX' : 'NSE_D_FUTIDX';
    return ex === 'BSE' ? 'BSE_D_FUTSTK' : 'NSE_D_FUTSTK';
  }

  // ── Options — full type known ─────────────────────────────────────────────
  if (it === 'OPTIDX') return ex === 'BSE' ? 'BSE_D_OPTIDX' : 'NSE_D_OPTIDX';
  if (it === 'OPTSTK') return ex === 'BSE' ? 'BSE_D_OPTSTK' : 'NSE_D_OPTSTK';

  // ── Options — only CE/PE known; classify by underlying ───────────────────
  if (it === 'CE' || it === 'PE') {
    const isIdx = underlying ? INDEX_UNDERLYINGS.has(underlying.toUpperCase()) : false;
    if (isIdx) return ex === 'BSE' ? 'BSE_D_OPTIDX' : 'NSE_D_OPTIDX';
    return ex === 'BSE' ? 'BSE_D_OPTSTK' : 'NSE_D_OPTSTK';
  }

  // Default → equity collection
  return ex === 'BSE' ? 'BSE_E_EQUITY' : 'NSE_E_EQUITY';
}

// ── WebSocket exchange type mapping ──────────────────────────────────────────
// AngelOne WebSocket Streaming 2.0 exchange types:
//   1 = nse_cm  (NSE cash/equity/index)
//   2 = nse_fo  (NSE F&O)
//   3 = bse_cm  (BSE cash/equity/index)
//   4 = bse_fo  (BSE F&O)
//   5 = mcx_fo  (MCX)
export function toWsExchangeType(exchange: string, instrumentType: string): number {
  const ex = exchange.toUpperCase();
  const it = (instrumentType ?? '').toUpperCase();
  const isFO = ['FUTIDX','FUTSTK','OPTIDX','OPTSTK','CE','PE','FUT'].includes(it);
  if (ex === 'NSE') return isFO ? 2 : 1;
  if (ex === 'BSE') return isFO ? 4 : 3;
  if (ex === 'MCX') return 5;
  return 1;
}

// Map UI timeframe labels to AngelOne intervals
export const TF_TO_INTERVAL: Record<string, string> = {
  '1m':  'ONE_MINUTE',
  '3m':  'THREE_MINUTE',
  '5m':  'FIVE_MINUTE',
  '10m': 'TEN_MINUTE',
  '15m': 'FIFTEEN_MINUTE',
  '30m': 'THIRTY_MINUTE',
  '1h':  'ONE_HOUR',
  '1D':  'ONE_DAY',
  '1W':  'ONE_DAY',
  '1M':  'ONE_DAY',
};
