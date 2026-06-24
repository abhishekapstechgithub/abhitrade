export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar?: string;
  kycStatus: 'pending' | 'verified' | 'rejected';
  accountId: string;
  segments: string[];
}

export interface MarketIndex {
  symbol: string;
  name: string;
  ltp: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
}

export interface WatchlistItem {
  id: string;
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  instrumentType: 'EQ' | 'FUT' | 'CE' | 'PE' | 'ETF' | 'INDEX';
  ltp: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  oi?: number;
  iv?: number;
  pinned?: boolean;
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistItem[];
  createdAt: string;
}

export interface Holding {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  currentValue: number;
  investedValue: number;
  pnl: number;
  pnlPercent: number;
  sector: string;
  portfolioShare: number;
  holdingPeriod: string;
  group?: string;
}

export interface GroupHolding {
  id: string;
  name: string;
  category: string;
  holdings: Holding[];
  totalValue: number;
  totalInvested: number;
  pnl: number;
  pnlPercent: number;
  allocationPercent: number;
}

export interface Portfolio {
  totalInvested: number;
  currentValue: number;
  todayPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  overallReturn: number;
  availableCash: number;
  marginUsed: number;
  marginAvailable: number;
  holdings: Holding[];
  groups: GroupHolding[];
}

export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M' | 'BO' | 'CO';
export type OrderSide = 'BUY' | 'SELL';
export type OrderStatus = 'OPEN' | 'COMPLETE' | 'CANCELLED' | 'REJECTED' | 'PENDING';
export type ProductType = 'MIS' | 'CNC' | 'NRML';

export interface Order {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  side: OrderSide;
  quantity: number;
  orderType: OrderType;
  productType: ProductType;
  price: number;
  triggerPrice?: number;
  status: OrderStatus;
  filledQty: number;
  pendingQty: number;
  avgFillPrice: number;
  placedAt: string;
  updatedAt: string;
  rejectionReason?: string;
}

export interface Position {
  id: string;
  symbol: string;
  name: string;
  exchange: string;
  qty: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  pnlPercent: number;
  productType: ProductType;
  realizedPnl: number;
  unrealizedPnl: number;
  mtm: number;
  tag: 'intraday' | 'delivery';
  instrumentType: string;
}

export interface OptionContract {
  symbol: string;
  underlying: string;
  expiry: string;
  strike: number;
  optionType: 'CE' | 'PE';
  ltp: number;
  bid: number;
  ask: number;
  iv: number;
  oi: number;
  changeOi: number;
  volume: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  isAtm?: boolean;
  isItm?: boolean;
}

export interface SecurityMasterRecord {
  token: string;
  symbol: string;
  tradingSymbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  segment: string;
  instrumentType: string;
  expiry?: string;
  strike?: number;
  optionType?: 'CE' | 'PE';
  lotSize: number;
  tickSize: number;
  isin?: string;
  underlying?: string;
  series?: string;
  freezeQty?: number;
}

export interface UploadJob {
  id: string;
  filename: string;
  exchange: 'NSE' | 'BSE' | 'AUTO';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  totalRows: number;
  validRows: number;
  invalidRows: number;
  duplicates: number;
  importedCount: number;
  expiriesFound: number;
  symbolsFound: number;
  uploadedAt: string;
  completedAt?: string;
  error?: string;
}

export interface SavedStrategy {
  id: string;
  name: string;
  symbol: string;
  expiry: string;
  category: 'bullish' | 'bearish' | 'neutral' | 'hedged' | 'income';
  legs: StrategyLeg[];
  maxProfit: number | 'unlimited';
  maxLoss: number | 'unlimited';
  breakevenPoints: number[];
  pnlSnapshot: number;
  createdAt: string;
}

export interface StrategyLeg {
  symbol: string;
  optionType: 'CE' | 'PE';
  strike: number;
  expiry: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  premium: number;
}

export interface Alert {
  id: string;
  symbol: string;
  condition: string;
  value: number;
  status: 'active' | 'triggered' | 'expired';
  createdAt: string;
}

export interface Notification {
  id: string;
  type: 'order' | 'alert' | 'system' | 'news';
  title: string;
  message: string;
  read: boolean;
  createdAt: string;
}

export interface SearchResult {
  token: string;
  symbol: string;
  name: string;
  exchange: string;
  instrumentType: string;
  expiry?: string;
  strike?: number;
  optionType?: string;
}
