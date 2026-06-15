import { Strategy, StrategyLeg, PayoffPoint } from '../types/strategy.types';

export function calcNetPremium(legs: StrategyLeg[]): number {
  return legs.reduce((sum, leg) => {
    const sign = leg.action === 'SELL' ? 1 : -1;
    return sum + sign * leg.premium * leg.lots;
  }, 0);
}

export function calcPayoff(legs: StrategyLeg[], spotRange: [number, number], steps = 100): PayoffPoint[] {
  const [low, high] = spotRange;
  const step = (high - low) / steps;
  const points: PayoffPoint[] = [];

  for (let i = 0; i <= steps; i++) {
    const price = low + i * step;
    let pnl = calcNetPremium(legs) * 100; // convert to rupees

    for (const leg of legs) {
      const intrinsic =
        leg.optionType === 'CE'
          ? Math.max(0, price - leg.strike)
          : Math.max(0, leg.strike - price);
      const sign = leg.action === 'BUY' ? 1 : -1;
      pnl += sign * (intrinsic - leg.premium) * leg.lots * 100;
    }
    points.push({ price: parseFloat(price.toFixed(2)), pnl: parseFloat(pnl.toFixed(2)) });
  }
  return points;
}

export function calcMaxProfit(points: PayoffPoint[]): number | null {
  const max = Math.max(...points.map(p => p.pnl));
  return max > 1_000_000 ? null : max; // treat unreasonably large = unlimited
}

export function calcMaxLoss(points: PayoffPoint[]): number | null {
  const min = Math.min(...points.map(p => p.pnl));
  return min < -1_000_000 ? null : min;
}

export function calcBreakevens(points: PayoffPoint[]): [number | null, number | null] {
  const crossings: number[] = [];
  for (let i = 1; i < points.length; i++) {
    if ((points[i - 1].pnl < 0 && points[i].pnl >= 0) ||
        (points[i - 1].pnl >= 0 && points[i].pnl < 0)) {
      crossings.push((points[i - 1].price + points[i].price) / 2);
    }
  }
  return [crossings[0] ?? null, crossings[1] ?? null];
}

export function formatPnl(val: number | null): string {
  if (val === null) return 'Unlimited';
  const abs = Math.abs(val);
  if (abs >= 100_000) return `₹${(abs / 100_000).toFixed(2)}L`;
  if (abs >= 1_000)   return `₹${(abs / 1_000).toFixed(1)}K`;
  return `₹${abs.toFixed(0)}`;
}

export function strategyMatchesFilters(
  s: Strategy,
  filters: { category: string; status: string; symbol: string },
): boolean {
  if (filters.category !== 'all' && s.category !== filters.category) return false;
  if (filters.status   !== 'all' && s.status   !== filters.status)   return false;
  if (filters.symbol && !s.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) return false;
  return true;
}
