/**
 * ATM (At-The-Money) strike calculation utilities.
 */

import { STRIKE_INTERVALS } from './types';

/**
 * Round a price to the nearest strike interval.
 *
 * ATM = Round(spot / interval) × interval
 *
 * Examples:
 *   spot=25087, interval=50  → 25100
 *   spot=48650, interval=100 → 48700
 *   spot=22456, interval=50  → 22450
 */
export function calcAtm(spot: number, interval: number): number {
  return Math.round(spot / interval) * interval;
}

export function getStrikeInterval(symbol: string): number {
  return STRIKE_INTERVALS[symbol.toUpperCase()] ?? 50;
}

/**
 * Build a sorted list of strikes centered around ATM.
 * strikeCount strikes above ATM + strikeCount below ATM (inclusive of ATM).
 */
export function buildStrikeRange(
  atm:         number,
  interval:    number,
  strikeCount: number,   // strikes on each side
  fromStrike?: number,
  toStrike?:   number,
): number[] {
  const strikes: number[] = [];

  if (fromStrike !== undefined && toStrike !== undefined) {
    // Custom range
    let s = Math.ceil(fromStrike / interval) * interval;
    while (s <= toStrike) {
      strikes.push(s);
      s += interval;
    }
  } else {
    const half = Math.max(1, strikeCount);
    const lo   = atm - half * interval;
    const hi   = atm + half * interval;
    for (let s = lo; s <= hi; s += interval) {
      if (s > 0) strikes.push(s);
    }
  }

  return strikes.sort((a, b) => a - b);
}

/**
 * Classify ITM/OTM/ATM for display.
 * CE is ITM when strike < spot; PE is ITM when strike > spot.
 */
export function getStrikeClass(
  strike: number,
  spot:   number,
  atm:    number,
  interval: number,
): { isAtm: boolean; ceItm: boolean; peItm: boolean } {
  const half = interval / 2;
  return {
    isAtm: Math.abs(strike - atm) < half,
    ceItm: strike < spot,
    peItm: strike > spot,
  };
}
