// Client-facing types from the market-sync service.
// Server-side sync logic lives in backend/api/lib/market-sync.ts.

export interface IndexPrice {
  symbol:        string;
  ltp:           number;
  change:        number;
  changePercent: number;
  open:          number;
  high:          number;
  low:           number;
  close:         number;
  updatedAt:     number;
}

export interface CachedQuote {
  symbol:        string;
  exchange:      string;
  tradingSymbol: string;
  token:         string;
  ltp:           number;
  open:          number;
  high:          number;
  low:           number;
  close:         number;
  netChange:     number;
  percentChange: number;
  volume:        number;
  avgPrice:      number;
  openInterest:  number;
  week52High:    number;
  week52Low:     number;
  totBuyQty:     number;
  totSellQty:    number;
  bid:           number;
  ask:           number;
  upperCircuit:  number;
  lowerCircuit:  number;
  updatedAt:     number;
}

export interface SyncStatus {
  status: 'ok' | 'error' | 'never';
  lastSync: string | null;
  tokenCount: number;
  error?: string;
}
