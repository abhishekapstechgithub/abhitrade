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
export function candleDateRange(interval: string): { from: string; to: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const from = new Date(now);
  switch (interval) {
    case 'ONE_MINUTE':     from.setDate(now.getDate() - 1); break;
    case 'THREE_MINUTE':   from.setDate(now.getDate() - 2); break;
    case 'FIVE_MINUTE':    from.setDate(now.getDate() - 3); break;
    case 'TEN_MINUTE':     from.setDate(now.getDate() - 5); break;
    case 'FIFTEEN_MINUTE': from.setDate(now.getDate() - 7); break;
    case 'THIRTY_MINUTE':  from.setDate(now.getDate() - 14); break;
    case 'ONE_HOUR':       from.setMonth(now.getMonth() - 1); break;
    case 'ONE_DAY':
    default:               from.setFullYear(now.getFullYear() - 1); break;
  }

  return { from: fmt(from), to: fmt(now) };
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
