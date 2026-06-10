'use client';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { calcChargeBreakdown, Segment } from '@/lib/brokerage';

export type { Segment };

export interface PaperTrade {
  id:          string;
  symbol:      string;
  side:        'BUY' | 'SELL';
  quantity:    number;
  price:       number;
  orderType:   'MARKET' | 'LIMIT';
  productType: string;
  segment:     Segment;
  timestamp:   string;
  charges:     number;
  realizedPnl: number;
}

export interface PaperPosition {
  symbol:      string;
  quantity:    number;
  avgPrice:    number;
  ltp:         number;
  pnl:         number;
  pnlPercent:  number;
  exchange:    string;
  productType: string;
  segment:     Segment;
}

interface PaperStore {
  active:         boolean;
  virtualBalance: number;
  usedFunds:      number;
  unrealizedPnl:  number;
  realizedPnl:    number;
  totalPnl:       number;
  trades:         PaperTrade[];
  positions:      PaperPosition[];
  toggle:         () => void;
  placeOrder: (
    symbol:      string,
    side:        'BUY' | 'SELL',
    qty:         number,
    price:       number,
    orderType?:  'MARKET' | 'LIMIT',
    productType?: string,
    segment?:    Segment,
  ) => void;
  syncPrices: (priceMap: Record<string, number>) => void;
  reset: () => void;
}

const INITIAL_BALANCE = 1_000_000;

export const usePaperTradingStore = create<PaperStore>()(
  persist(
    (set, get) => ({
      active:         false,
      virtualBalance: INITIAL_BALANCE,
      usedFunds:      0,
      unrealizedPnl:  0,
      realizedPnl:    0,
      totalPnl:       0,
      trades:         [],
      positions:      [],

      toggle: () => set(s => ({ active: !s.active })),

      placeOrder: (symbol, side, qty, price, orderType = 'MARKET', productType = 'CNC', segment = 'EQUITY_DELIVERY') => {
        const state = get();
        const value  = qty * price;
        const breakdown = calcChargeBreakdown(segment, side, value);
        const charges   = breakdown.total;
        let orderRealizedPnl = 0;

        const positions = [...state.positions];
        const existingIdx = positions.findIndex(p => p.symbol === symbol);

        if (side === 'BUY') {
          if (existingIdx >= 0) {
            const ex     = positions[existingIdx];
            const newQty = ex.quantity + qty;
            const newAvg = parseFloat(((ex.avgPrice * ex.quantity + price * qty) / newQty).toFixed(2));
            const pnl    = parseFloat(((price - newAvg) * newQty).toFixed(2));
            const pnlPct = parseFloat(((price - newAvg) / newAvg * 100).toFixed(2));
            positions[existingIdx] = { ...ex, quantity: newQty, avgPrice: newAvg, ltp: price, pnl, pnlPercent: pnlPct };
          } else {
            positions.push({ symbol, quantity: qty, avgPrice: price, ltp: price, pnl: 0, pnlPercent: 0, exchange: 'NSE', productType, segment });
          }
        } else {
          if (existingIdx >= 0) {
            const ex      = positions[existingIdx];
            const sellQty = Math.min(qty, ex.quantity);
            orderRealizedPnl = parseFloat(((price - ex.avgPrice) * sellQty).toFixed(2));
            const newQty = ex.quantity - sellQty;
            if (newQty <= 0) {
              positions.splice(existingIdx, 1);
            } else {
              const pnl    = parseFloat(((price - ex.avgPrice) * newQty).toFixed(2));
              const pnlPct = parseFloat(((price - ex.avgPrice) / ex.avgPrice * 100).toFixed(2));
              positions[existingIdx] = { ...ex, quantity: newQty, ltp: price, pnl, pnlPercent: pnlPct };
            }
          }
        }

        const trade: PaperTrade = {
          id:          String(Date.now()),
          symbol,
          side,
          quantity:    qty,
          price,
          orderType,
          productType,
          segment,
          timestamp:   new Date().toISOString(),
          charges,
          realizedPnl: orderRealizedPnl,
        };

        const usedFunds      = parseFloat(positions.reduce((s, p) => s + p.avgPrice * p.quantity, 0).toFixed(2));
        const unrealizedPnl  = parseFloat(positions.reduce((s, p) => s + p.pnl, 0).toFixed(2));
        const realizedPnl    = parseFloat((state.realizedPnl + orderRealizedPnl).toFixed(2));
        const totalPnl       = parseFloat((unrealizedPnl + realizedPnl).toFixed(2));
        const balanceDelta   = side === 'BUY' ? -(value + charges) : value - charges;

        set({
          active: true,
          trades: [trade, ...state.trades],
          positions,
          usedFunds,
          unrealizedPnl,
          realizedPnl,
          totalPnl,
          virtualBalance: parseFloat(Math.max(0, state.virtualBalance + balanceDelta).toFixed(2)),
        });
      },

      syncPrices: (priceMap) => {
        const state = get();
        if (state.positions.length === 0) return;
        const positions = state.positions.map(pos => {
          const ltp    = priceMap[pos.symbol.toUpperCase()] ?? pos.ltp;
          const pnl    = parseFloat(((ltp - pos.avgPrice) * pos.quantity).toFixed(2));
          const pnlPct = parseFloat(((ltp - pos.avgPrice) / pos.avgPrice * 100).toFixed(2));
          return { ...pos, ltp, pnl, pnlPercent: pnlPct };
        });
        const unrealizedPnl = parseFloat(positions.reduce((s, p) => s + p.pnl, 0).toFixed(2));
        const totalPnl      = parseFloat((unrealizedPnl + state.realizedPnl).toFixed(2));
        set({ positions, unrealizedPnl, totalPnl });
      },

      reset: () => set({
        virtualBalance: INITIAL_BALANCE,
        usedFunds:      0,
        unrealizedPnl:  0,
        realizedPnl:    0,
        totalPnl:       0,
        trades:         [],
        positions:      [],
      }),
    }),
    { name: 'paper-trading' },
  ),
);
