import { Portfolio, Holding, GroupHolding, Order, Position } from '@/types';

export const holdings: Holding[] = [
  { id: '1', symbol: 'RELIANCE', name: 'Reliance Industries Ltd', exchange: 'NSE', quantity: 50, avgPrice: 2780.00, ltp: 2945.60, currentValue: 147280, investedValue: 139000, pnl: 8280, pnlPercent: 5.96, sector: 'Energy', portfolioShare: 18.2, holdingPeriod: '8 months', group: 'Long Term' },
  { id: '2', symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', quantity: 20, avgPrice: 4050.00, ltp: 4156.80, currentValue: 83136, investedValue: 81000, pnl: 2136, pnlPercent: 2.64, sector: 'IT', portfolioShare: 10.3, holdingPeriod: '1 year 2 months', group: 'Long Term' },
  { id: '3', symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', quantity: 40, avgPrice: 1920.00, ltp: 1842.35, currentValue: 73694, investedValue: 76800, pnl: -3106, pnlPercent: -4.04, sector: 'IT', portfolioShare: 9.1, holdingPeriod: '6 months', group: 'Swing' },
  { id: '4', symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', exchange: 'NSE', quantity: 60, avgPrice: 1650.00, ltp: 1678.90, currentValue: 100734, investedValue: 99000, pnl: 1734, pnlPercent: 1.75, sector: 'Banking', portfolioShare: 12.4, holdingPeriod: '1 year 5 months', group: 'Long Term' },
  { id: '5', symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', exchange: 'NSE', quantity: 80, avgPrice: 1150.00, ltp: 1234.50, currentValue: 98760, investedValue: 92000, pnl: 6760, pnlPercent: 7.35, sector: 'Banking', portfolioShare: 12.2, holdingPeriod: '10 months', group: 'High Conviction' },
  { id: '6', symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', exchange: 'NSE', quantity: 100, avgPrice: 890.00, ltp: 942.30, currentValue: 94230, investedValue: 89000, pnl: 5230, pnlPercent: 5.87, sector: 'Auto', portfolioShare: 11.6, holdingPeriod: '4 months', group: 'Swing' },
  { id: '7', symbol: 'WIPRO', name: 'Wipro Ltd', exchange: 'NSE', quantity: 150, avgPrice: 545.00, ltp: 567.80, currentValue: 85170, investedValue: 81750, pnl: 3420, pnlPercent: 4.18, sector: 'IT', portfolioShare: 10.5, holdingPeriod: '3 months', group: 'Own Research' },
  { id: '8', symbol: 'SBIN', name: 'State Bank of India', exchange: 'NSE', quantity: 120, avgPrice: 850.00, ltp: 823.45, currentValue: 98814, investedValue: 102000, pnl: -3186, pnlPercent: -3.12, sector: 'Banking', portfolioShare: 12.2, holdingPeriod: '2 months', group: 'Hedge' },
];

export const mockPortfolio: Portfolio = {
  totalInvested: 760550,
  currentValue: 781818,
  todayPnl: 4823,
  realizedPnl: 28450,
  unrealizedPnl: 21268,
  overallReturn: 2.80,
  availableCash: 124500,
  marginUsed: 45000,
  marginAvailable: 280000,
  holdings,
  groups: [],
};

export const mockOrders: Order[] = [
  { id: 'ORD001', symbol: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE', side: 'BUY', quantity: 10, orderType: 'LIMIT', productType: 'CNC', price: 2940.00, status: 'COMPLETE', filledQty: 10, pendingQty: 0, avgFillPrice: 2940.00, placedAt: '2024-12-10T09:15:23', updatedAt: '2024-12-10T09:15:45' },
  { id: 'ORD002', symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', side: 'SELL', quantity: 5, orderType: 'MARKET', productType: 'CNC', price: 0, status: 'COMPLETE', filledQty: 5, pendingQty: 0, avgFillPrice: 4158.50, placedAt: '2024-12-10T10:23:45', updatedAt: '2024-12-10T10:23:47' },
  { id: 'ORD003', symbol: 'NIFTY24DEC25000CE', name: 'NIFTY DEC 25000 CE', exchange: 'NSE', side: 'BUY', quantity: 50, orderType: 'LIMIT', productType: 'NRML', price: 130.00, triggerPrice: 0, status: 'OPEN', filledQty: 0, pendingQty: 50, avgFillPrice: 0, placedAt: '2024-12-10T11:05:12', updatedAt: '2024-12-10T11:05:12' },
  { id: 'ORD004', symbol: 'INFY', name: 'Infosys Ltd', exchange: 'NSE', side: 'BUY', quantity: 20, orderType: 'SL', productType: 'MIS', price: 1850.00, triggerPrice: 1848.00, status: 'PENDING', filledQty: 0, pendingQty: 20, avgFillPrice: 0, placedAt: '2024-12-10T11:30:00', updatedAt: '2024-12-10T11:30:00' },
  { id: 'ORD005', symbol: 'HDFCBANK', name: 'HDFC Bank', exchange: 'NSE', side: 'SELL', quantity: 15, orderType: 'LIMIT', productType: 'CNC', price: 1695.00, status: 'REJECTED', filledQty: 0, pendingQty: 0, avgFillPrice: 0, placedAt: '2024-12-10T12:45:33', updatedAt: '2024-12-10T12:45:35', rejectionReason: 'Insufficient holdings' },
];

export const mockPositions: Position[] = [
  { id: 'POS001', symbol: 'NIFTY24DEC25000CE', name: 'NIFTY DEC 25000 CE', exchange: 'NSE', qty: 50, avgPrice: 128.00, ltp: 132.80, pnl: 240, pnlPercent: 3.75, productType: 'NRML', realizedPnl: 0, unrealizedPnl: 240, mtm: 240, tag: 'delivery', instrumentType: 'CE' },
  { id: 'POS002', symbol: 'BANKNIFTY24DEC52000PE', name: 'BANKNIFTY DEC 52000 PE', exchange: 'NSE', qty: -25, avgPrice: 180.00, ltp: 165.40, pnl: 365, pnlPercent: 8.11, productType: 'NRML', realizedPnl: 0, unrealizedPnl: 365, mtm: 365, tag: 'delivery', instrumentType: 'PE' },
  { id: 'POS003', symbol: 'RELIANCE', name: 'Reliance Industries', exchange: 'NSE', qty: 20, avgPrice: 2935.00, ltp: 2945.60, pnl: 212, pnlPercent: 0.36, productType: 'MIS', realizedPnl: 0, unrealizedPnl: 212, mtm: 212, tag: 'intraday', instrumentType: 'EQ' },
  { id: 'POS004', symbol: 'TCS', name: 'Tata Consultancy Services', exchange: 'NSE', qty: -10, avgPrice: 4175.00, ltp: 4156.80, pnl: 182, pnlPercent: 0.44, productType: 'MIS', realizedPnl: 0, unrealizedPnl: 182, mtm: 182, tag: 'intraday', instrumentType: 'EQ' },
];
