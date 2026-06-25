// ── Option Chain Domain Types ─────────────────────────────────────────────────

export interface OptionQuote {
  token: number;
  tradingSymbol: string;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  oi: number;
  changeOi: number;
  volume: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  // Greeks (optional — available when Greeks feed is live)
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  rho?: number;
  updatedAt?: number; // unix ms
}

export interface StrikePair {
  strike: number;
  ceToken: number;
  peToken: number;
  ceSymbol: string;
  peSymbol: string;
  lotSize: number;
  exchange: string;
}

// Hierarchy: underlying → expiry → strike → StrikePair
export type SMHierarchy = Map<string, Map<string, Map<number, StrikePair>>>;

export interface OptionChainRow {
  strike: number;
  isAtm: boolean;
  isItm: boolean;       // relative to spot: CE-ITM / PE-ITM flag
  ce: OptionQuote | null;
  pe: OptionQuote | null;
}

export interface OIAnalytics {
  totalCallOI: number;
  totalPutOI: number;
  pcr: number;
  maxPain: number;
  highestCEOI: number;
  highestPEOI: number;
  highestCEOIStrike: number;
  highestPEOIStrike: number;
}

export interface OptionChainResponse {
  symbol: string;
  expiry: string;
  spot: number;
  spotChange: number;
  spotChangePct: number;
  atm: number;
  strikeInterval: number;
  rows: OptionChainRow[];
  analytics: OIAnalytics;
  timestamp: string;
  source: 'live' | 'mock';
}

export interface ExpiriesResponse {
  symbol: string;
  expiries: string[];
  nearest: string;
}

// Strike interval config per underlying
export const STRIKE_INTERVALS: Record<string, number> = {
  NIFTY:       50,
  BANKNIFTY:   100,
  FINNIFTY:    50,
  MIDCPNIFTY:  25,
  SENSEX:      100,
  BANKEX:      100,
  // Stocks default to 50; override here as needed
  RELIANCE:    50,
  TCS:         50,
  INFY:        50,
  HDFC:        100,
  HDFCBANK:    50,
  ICICIBANK:   50,
  SBIN:        10,
};

// Mock spot prices used in dev / no-feed mode
export const MOCK_SPOT: Record<string, { ltp: number; change: number; changePct: number }> = {
  NIFTY:       { ltp: 22456.80, change: 68.5,   changePct: 0.31 },
  BANKNIFTY:   { ltp: 48720.35, change: -125.6,  changePct: -0.26 },
  FINNIFTY:    { ltp: 23845.90, change: 42.3,   changePct: 0.18 },
  MIDCPNIFTY:  { ltp: 12340.00, change: 15.0,   changePct: 0.12 },
  SENSEX:      { ltp: 75527.95, change: 1695.4, changePct: 2.30 },
  BANKEX:      { ltp: 62000.00, change: 0,      changePct: 0    },
  RELIANCE:    { ltp: 1293.00,  change: 5.5,    changePct: 0.43 },
  TCS:         { ltp: 2161.40,  change: 12.2,   changePct: 0.57 },
  INFY:        { ltp: 1845.60,  change: -8.4,   changePct: -0.45 },
  HDFCBANK:    { ltp: 1920.80,  change: 22.1,   changePct: 1.16 },
  SBIN:        { ltp: 815.40,   change: 3.8,    changePct: 0.47 },
};
