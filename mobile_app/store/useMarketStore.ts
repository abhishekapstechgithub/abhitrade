import { create } from 'zustand';

export interface MarketIndex {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePct: number;
  prevClose: number;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  company: string;
  ltp: number;
  change: number;
  changePct: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  exchange: 'NSE' | 'BSE';
  segment: 'EQ' | 'FO' | 'IDX';
}

export interface OptionContract {
  strike: number;
  expiry: string;
  ceLtp: number;
  ceOi: number;
  ceChgOi: number;
  ceVol: number;
  ceIv: number;
  peLtp: number;
  peOi: number;
  peChgOi: number;
  peVol: number;
  peIv: number;
  isAtm: boolean;
  isItm: boolean;
}

const NIFTY_BASE = 23547.25;
const SENSEX_BASE = 77234.50;
const BANKNIFTY_BASE = 49823.75;

const initialIndices: MarketIndex[] = [
  {
    symbol: 'NIFTY 50',
    name: 'NIFTY 50',
    ltp: NIFTY_BASE,
    change: 124.35,
    changePct: 0.53,
    prevClose: 23422.9,
  },
  {
    symbol: 'SENSEX',
    name: 'S&P BSE SENSEX',
    ltp: SENSEX_BASE,
    change: -89.25,
    changePct: -0.12,
    prevClose: 77323.75,
  },
  {
    symbol: 'BANKNIFTY',
    name: 'NIFTY BANK',
    ltp: BANKNIFTY_BASE,
    change: 312.40,
    changePct: 0.63,
    prevClose: 49511.35,
  },
];

const initialWatchlist: WatchlistItem[] = [
  {
    id: '1',
    symbol: 'RELIANCE',
    company: 'Reliance Industries Ltd',
    ltp: 2847.35,
    change: 34.20,
    changePct: 1.22,
    volume: 4823617,
    high: 2862.00,
    low: 2810.50,
    open: 2820.00,
    prevClose: 2813.15,
    exchange: 'NSE',
    segment: 'EQ',
  },
  {
    id: '2',
    symbol: 'TCS',
    company: 'Tata Consultancy Services',
    ltp: 4123.50,
    change: -28.75,
    changePct: -0.69,
    volume: 1245890,
    high: 4165.00,
    low: 4110.25,
    open: 4155.00,
    prevClose: 4152.25,
    exchange: 'NSE',
    segment: 'EQ',
  },
  {
    id: '3',
    symbol: 'HDFCBANK',
    company: 'HDFC Bank Ltd',
    ltp: 1754.80,
    change: 12.45,
    changePct: 0.71,
    volume: 7234521,
    high: 1768.00,
    low: 1742.30,
    open: 1745.00,
    prevClose: 1742.35,
    exchange: 'NSE',
    segment: 'EQ',
  },
  {
    id: '4',
    symbol: 'INFY',
    company: 'Infosys Ltd',
    ltp: 1845.20,
    change: -15.60,
    changePct: -0.84,
    volume: 3421876,
    high: 1870.00,
    low: 1838.00,
    open: 1862.00,
    prevClose: 1860.80,
    exchange: 'NSE',
    segment: 'EQ',
  },
  {
    id: '5',
    symbol: 'ICICIBANK',
    company: 'ICICI Bank Ltd',
    ltp: 1234.65,
    change: 8.90,
    changePct: 0.73,
    volume: 5678923,
    high: 1245.00,
    low: 1220.10,
    open: 1228.00,
    prevClose: 1225.75,
    exchange: 'NSE',
    segment: 'EQ',
  },
  {
    id: '6',
    symbol: 'AXISBANK',
    company: 'Axis Bank Ltd',
    ltp: 1089.40,
    change: -5.25,
    changePct: -0.48,
    volume: 4123654,
    high: 1098.00,
    low: 1082.00,
    open: 1094.00,
    prevClose: 1094.65,
    exchange: 'NSE',
    segment: 'EQ',
  },
  {
    id: '7',
    symbol: 'WIPRO',
    company: 'Wipro Ltd',
    ltp: 542.30,
    change: 4.15,
    changePct: 0.77,
    volume: 2345678,
    high: 548.00,
    low: 536.50,
    open: 538.00,
    prevClose: 538.15,
    exchange: 'NSE',
    segment: 'EQ',
  },
  {
    id: '8',
    symbol: 'BHARTIARTL',
    company: 'Bharti Airtel Ltd',
    ltp: 1623.75,
    change: 22.80,
    changePct: 1.42,
    volume: 3654789,
    high: 1635.00,
    low: 1598.00,
    open: 1605.00,
    prevClose: 1600.95,
    exchange: 'NSE',
    segment: 'EQ',
  },
];

const generateOptionChain = (atm: number): OptionContract[] => {
  const strikes = [-200, -150, -100, -50, 0, 50, 100, 150, 200].map(
    (offset) => Math.round((atm + offset) / 50) * 50
  );

  return strikes.map((strike) => {
    const diff = atm - strike;
    const isAtm = Math.abs(diff) < 30;
    const isItm = diff > 30;

    const ceLtp = isAtm
      ? 145 + Math.random() * 20
      : isItm
      ? 200 + diff * 0.8 + Math.random() * 30
      : Math.max(5, 100 - Math.abs(diff) * 0.5 + Math.random() * 15);

    const peLtp = isAtm
      ? 140 + Math.random() * 20
      : isItm
      ? Math.max(5, 100 - Math.abs(diff) * 0.5 + Math.random() * 15)
      : 200 + Math.abs(diff) * 0.8 + Math.random() * 30;

    return {
      strike,
      expiry: '27-Jun-2024',
      ceLtp: parseFloat(ceLtp.toFixed(2)),
      ceOi: Math.round((500000 + Math.random() * 2000000) / 1000) * 1000,
      ceChgOi: Math.round((Math.random() - 0.5) * 200000 / 1000) * 1000,
      ceVol: Math.round(Math.random() * 500000),
      ceIv: parseFloat((15 + Math.random() * 20).toFixed(2)),
      peLtp: parseFloat(peLtp.toFixed(2)),
      peOi: Math.round((500000 + Math.random() * 2000000) / 1000) * 1000,
      peChgOi: Math.round((Math.random() - 0.5) * 200000 / 1000) * 1000,
      peVol: Math.round(Math.random() * 500000),
      peIv: parseFloat((15 + Math.random() * 20).toFixed(2)),
      isAtm,
      isItm,
    };
  });
};

interface MarketState {
  indices: MarketIndex[];
  watchlist: WatchlistItem[];
  optionChain: OptionContract[];
  tickInterval: ReturnType<typeof setInterval> | null;
  tickPrices: () => void;
  stopTicking: () => void;
  updateOptionChain: (atm: number) => void;
}

export const useMarketStore = create<MarketState>((set, get) => ({
  indices: initialIndices,
  watchlist: initialWatchlist,
  optionChain: generateOptionChain(NIFTY_BASE),
  tickInterval: null,

  tickPrices: () => {
    const existing = get().tickInterval;
    if (existing) clearInterval(existing);

    const interval = setInterval(() => {
      set((state) => ({
        indices: state.indices.map((idx) => {
          const delta = (Math.random() - 0.48) * idx.ltp * 0.0008;
          const newLtp = parseFloat((idx.ltp + delta).toFixed(2));
          const change = parseFloat((newLtp - idx.prevClose).toFixed(2));
          const changePct = parseFloat(((change / idx.prevClose) * 100).toFixed(2));
          return { ...idx, ltp: newLtp, change, changePct };
        }),
        watchlist: state.watchlist.map((item) => {
          const delta = (Math.random() - 0.48) * item.ltp * 0.001;
          const newLtp = parseFloat((item.ltp + delta).toFixed(2));
          const change = parseFloat((newLtp - item.prevClose).toFixed(2));
          const changePct = parseFloat(((change / item.prevClose) * 100).toFixed(2));
          return { ...item, ltp: newLtp, change, changePct };
        }),
      }));
    }, 400);

    set({ tickInterval: interval });
  },

  stopTicking: () => {
    const interval = get().tickInterval;
    if (interval) {
      clearInterval(interval);
      set({ tickInterval: null });
    }
  },

  updateOptionChain: (atm: number) => {
    set({ optionChain: generateOptionChain(atm) });
  },
}));
