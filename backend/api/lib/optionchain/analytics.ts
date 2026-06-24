/**
 * Option Chain Analytics.
 *
 * - PCR (Put-Call Ratio)
 * - Max Pain
 * - OI aggregates (highest OI strike, totals)
 * - Greeks summary
 */

import { OptionChainRow, OIAnalytics } from './types';

/**
 * Calculate all OI analytics from the assembled chain rows.
 */
export function calcAnalytics(rows: OptionChainRow[]): OIAnalytics {
  let totalCallOI      = 0;
  let totalPutOI       = 0;
  let highestCEOI      = 0;
  let highestPEOI      = 0;
  let highestCEOIStrike = 0;
  let highestPEOIStrike = 0;

  for (const row of rows) {
    const ceOI = row.ce?.oi ?? 0;
    const peOI = row.pe?.oi ?? 0;

    totalCallOI += ceOI;
    totalPutOI  += peOI;

    if (ceOI > highestCEOI) {
      highestCEOI       = ceOI;
      highestCEOIStrike = row.strike;
    }
    if (peOI > highestPEOI) {
      highestPEOI       = peOI;
      highestPEOIStrike = row.strike;
    }
  }

  const pcr = totalCallOI > 0
    ? Math.round((totalPutOI / totalCallOI) * 1000) / 1000
    : 0;

  const maxPain = calcMaxPain(rows);

  return {
    totalCallOI,
    totalPutOI,
    pcr,
    maxPain,
    highestCEOI,
    highestPEOI,
    highestCEOIStrike,
    highestPEOIStrike,
  };
}

/**
 * Max Pain calculation.
 *
 * For each potential expiry price (= each strike in chain):
 *   Total pain = Σ (for all CE writers) max(0, strike_price - expiry_price) × OI_CE
 *              + Σ (for all PE writers) max(0, expiry_price - strike_price) × OI_PE
 *
 * Max Pain = the expiry price (strike) that causes maximum total pain to option buyers
 * (i.e. minimum total value payout — the point at which most options expire worthless).
 */
export function calcMaxPain(rows: OptionChainRow[]): number {
  if (rows.length === 0) return 0;

  const strikes = rows.map(r => r.strike);
  let minPain   = Infinity;
  let maxPainStrike = strikes[Math.floor(strikes.length / 2)];

  for (const expiryPrice of strikes) {
    let pain = 0;
    for (const row of rows) {
      const ceOI = row.ce?.oi ?? 0;
      const peOI = row.pe?.oi ?? 0;
      // CE writer pain: if expiryPrice > strike (CE is ITM at expiry), writer pays
      pain += Math.max(0, expiryPrice - row.strike) * ceOI;
      // PE writer pain: if expiryPrice < strike (PE is ITM at expiry), writer pays
      pain += Math.max(0, row.strike - expiryPrice) * peOI;
    }
    if (pain < minPain) {
      minPain        = pain;
      maxPainStrike  = expiryPrice;
    }
  }

  return maxPainStrike;
}

/**
 * Identify support and resistance from OI buildup.
 *
 * - High PE OI strikes → strong support (put writers defend that level)
 * - High CE OI strikes → strong resistance (call writers defend that level)
 *
 * Returns top 3 of each.
 */
export function calcSupportResistance(rows: OptionChainRow[]): {
  supports:    { strike: number; oi: number }[];
  resistances: { strike: number; oi: number }[];
} {
  const peRows = rows
    .filter(r => (r.pe?.oi ?? 0) > 0)
    .map(r    => ({ strike: r.strike, oi: r.pe!.oi }))
    .sort((a, b) => b.oi - a.oi)
    .slice(0, 3);

  const ceRows = rows
    .filter(r => (r.ce?.oi ?? 0) > 0)
    .map(r    => ({ strike: r.strike, oi: r.ce!.oi }))
    .sort((a, b) => b.oi - a.oi)
    .slice(0, 3);

  return { supports: peRows, resistances: ceRows };
}

/**
 * IV (Implied Volatility) skew — difference between OTM PE IV and OTM CE IV.
 * Positive skew means bearish hedging demand.
 */
export function calcIVSkew(rows: OptionChainRow[], atm: number): {
  skew: number;
  atmIV: number;
} {
  const atmRow = rows.find(r => r.strike === atm);
  const ceIV   = atmRow?.ce?.iv ?? 0;
  const peIV   = atmRow?.pe?.iv ?? 0;
  const atmIV  = (ceIV + peIV) / 2;

  // Skew: avg of OTM PE IVs minus avg of OTM CE IVs (1 strike away from ATM)
  const otmCEs = rows.filter(r => r.strike > atm).slice(0, 3);
  const otmPEs = rows.filter(r => r.strike < atm).slice(-3);

  const avgCEIV = otmCEs.reduce((s, r) => s + (r.ce?.iv ?? 0), 0) / (otmCEs.length || 1);
  const avgPEIV = otmPEs.reduce((s, r) => s + (r.pe?.iv ?? 0), 0) / (otmPEs.length || 1);

  return {
    skew:  Math.round((avgPEIV - avgCEIV) * 100) / 100,
    atmIV: Math.round(atmIV * 100) / 100,
  };
}
