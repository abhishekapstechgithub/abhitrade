import { MarketIndex, WatchlistItem, OptionContract } from '@/types';

// Index structure — prices come from AngelOne sync; no dummy values here.
export const marketIndices: MarketIndex[] = [
  { symbol: 'NIFTY 50',   name: 'NIFTY 50',           ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
  { symbol: 'SENSEX',     name: 'BSE SENSEX',          ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
  { symbol: 'BANKNIFTY',  name: 'BANK NIFTY',          ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
  { symbol: 'BANKEX',     name: 'BSE BANKEX',          ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
  { symbol: 'MIDCPNIFTY', name: 'NIFTY MIDCAP SELECT', ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
  { symbol: 'FINNIFTY',   name: 'NIFTY FIN SERVICE',   ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
  { symbol: 'NIFTYNXT50', name: 'NIFTY NEXT 50',       ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
  { symbol: 'INDIA VIX',  name: 'INDIA VIX',           ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
  { symbol: 'NIFTY IT',   name: 'NIFTY IT',            ltp: 0, change: 0, changePercent: 0, open: 0, high: 0, low: 0, prevClose: 0 },
];

// No pre-loaded scrips — user adds via search from uploaded security master.
export const watchlistItems: WatchlistItem[] = [];

// No pre-loaded option chain — built from security master search.
export const optionChainData: OptionContract[] = [];
