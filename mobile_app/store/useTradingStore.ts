import { create } from 'zustand';

export type TradingMode = 'live' | 'paper';

export interface Order {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  orderType: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  productType: 'CNC' | 'MIS' | 'NRML';
  status: 'OPEN' | 'COMPLETE' | 'REJECTED' | 'CANCELLED' | 'PENDING';
  exchange: 'NSE' | 'BSE';
  timestamp: string;
  filledQty: number;
  avgFillPrice?: number;
  rejectionReason?: string;
}

const mockOrders: Order[] = [
  {
    id: 'ORD001',
    symbol: 'RELIANCE',
    side: 'BUY',
    quantity: 10,
    price: 2847.35,
    orderType: 'LIMIT',
    productType: 'CNC',
    status: 'COMPLETE',
    exchange: 'NSE',
    timestamp: '2024-06-27T09:32:14',
    filledQty: 10,
    avgFillPrice: 2846.80,
  },
  {
    id: 'ORD002',
    symbol: 'TCS',
    side: 'SELL',
    quantity: 5,
    price: 4120.00,
    orderType: 'LIMIT',
    productType: 'CNC',
    status: 'OPEN',
    exchange: 'NSE',
    timestamp: '2024-06-27T10:15:42',
    filledQty: 0,
  },
  {
    id: 'ORD003',
    symbol: 'NIFTY 27JUN CE 23600',
    side: 'BUY',
    quantity: 50,
    price: 145.50,
    orderType: 'MARKET',
    productType: 'MIS',
    status: 'COMPLETE',
    exchange: 'NSE',
    timestamp: '2024-06-27T11:02:08',
    filledQty: 50,
    avgFillPrice: 146.20,
  },
  {
    id: 'ORD004',
    symbol: 'HDFCBANK',
    side: 'BUY',
    quantity: 20,
    price: 1760.00,
    orderType: 'LIMIT',
    productType: 'CNC',
    status: 'PENDING',
    exchange: 'NSE',
    timestamp: '2024-06-27T13:45:22',
    filledQty: 0,
  },
  {
    id: 'ORD005',
    symbol: 'INFY',
    side: 'SELL',
    quantity: 15,
    price: 1830.00,
    orderType: 'SL',
    productType: 'MIS',
    status: 'REJECTED',
    exchange: 'NSE',
    timestamp: '2024-06-27T09:18:55',
    filledQty: 0,
    rejectionReason: 'Insufficient margin',
  },
];

interface TradingState {
  mode: TradingMode;
  orders: Order[];
  paperBalance: number;
  paperPnl: number;
  setMode: (mode: TradingMode) => void;
  cancelOrder: (orderId: string) => void;
  placeOrder: (order: Omit<Order, 'id' | 'timestamp' | 'filledQty'>) => void;
}

export const useTradingStore = create<TradingState>((set) => ({
  mode: 'paper',
  orders: mockOrders,
  paperBalance: 500000,
  paperPnl: 3247.80,

  setMode: (mode: TradingMode) => set({ mode }),

  cancelOrder: (orderId: string) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId && o.status === 'OPEN'
          ? { ...o, status: 'CANCELLED' as const }
          : o
      ),
    })),

  placeOrder: (orderData) =>
    set((state) => ({
      orders: [
        {
          ...orderData,
          id: `ORD${Date.now()}`,
          timestamp: new Date().toISOString(),
          filledQty: 0,
          status: state.mode === 'paper' ? ('COMPLETE' as const) : ('OPEN' as const),
          avgFillPrice: state.mode === 'paper' ? orderData.price : undefined,
        },
        ...state.orders,
      ],
    })),
}));
