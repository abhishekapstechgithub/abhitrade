/**
 * Indian stock market brokerage & statutory charge calculator.
 * Rates based on NSE/MCX schedule and standard discount broker tariff (2024).
 */

export type Segment =
  | 'EQUITY_DELIVERY'
  | 'EQUITY_INTRADAY'
  | 'FUTURES'
  | 'OPTIONS'
  | 'COMMODITY'
  | 'CURRENCY';

export type TradeSide = 'BUY' | 'SELL';

export interface ChargeBreakdown {
  brokerage:       number;
  stt:             number;
  ctt:             number;
  exchangeCharges: number;
  sebiCharges:     number;
  gst:             number;
  stampDuty:       number;
  dpCharges:       number;
  total:           number;
}

export const SEGMENT_LABELS: Record<Segment, string> = {
  EQUITY_DELIVERY: 'Equity Delivery',
  EQUITY_INTRADAY: 'Equity Intraday',
  FUTURES:         'Futures (F&O)',
  OPTIONS:         'Options (F&O)',
  COMMODITY:       'Commodity',
  CURRENCY:        'Currency',
};

export const SEGMENTS: Segment[] = [
  'EQUITY_DELIVERY', 'EQUITY_INTRADAY', 'FUTURES', 'OPTIONS', 'COMMODITY', 'CURRENCY',
];

// ── Exchange transaction charge rates (fraction of turnover) ─────────────────
const EXCHANGE_RATES: Record<Segment, number> = {
  EQUITY_DELIVERY: 0.0000345,   // NSE 0.00345%
  EQUITY_INTRADAY: 0.0000345,
  FUTURES:         0.0000173,   // NSE 0.00173%
  OPTIONS:         0.0005188,   // NSE 0.05188% on premium
  COMMODITY:       0.000026,    // MCX ~0.0026%
  CURRENCY:        0.0000009,   // NSE 0.00009%
};

export const EXCHANGE_RATE_LABELS: Record<Segment, string> = {
  EQUITY_DELIVERY: '0.00345% (NSE)',
  EQUITY_INTRADAY: '0.00345% (NSE)',
  FUTURES:         '0.00173% (NSE)',
  OPTIONS:         '0.05188% on premium',
  COMMODITY:       '0.0026% (MCX)',
  CURRENCY:        '0.00009% (NSE)',
};

// ── Stamp duty rates (buy side only) ─────────────────────────────────────────
const STAMP_RATES: Record<Segment, number> = {
  EQUITY_DELIVERY: 0.00015,   // 0.015%
  EQUITY_INTRADAY: 0.00003,   // 0.003%
  FUTURES:         0.00002,   // 0.002%
  OPTIONS:         0.00003,   // 0.003% on premium
  COMMODITY:       0.00002,   // 0.002%
  CURRENCY:        0.00001,   // 0.001%
};

export const STAMP_RATE_LABELS: Record<Segment, string> = {
  EQUITY_DELIVERY: '0.015% (buy)',
  EQUITY_INTRADAY: '0.003% (buy)',
  FUTURES:         '0.002% (buy)',
  OPTIONS:         '0.003% on premium',
  COMMODITY:       '0.002% (buy)',
  CURRENCY:        '0.001% (buy)',
};

// SEBI turnover charge: ₹10 per crore = 0.000001 of turnover
const SEBI_RATE = 0.000001;

function r2(n: number) { return Math.round(n * 100) / 100; }

// ── Main calculator ───────────────────────────────────────────────────────────

/**
 * Calculate all charges for a single order.
 * @param segment Trading segment
 * @param side    BUY or SELL
 * @param turnover Quantity × price (use premium value for options)
 */
export function calcChargeBreakdown(
  segment: Segment,
  side: TradeSide,
  turnover: number,
): ChargeBreakdown {
  if (turnover <= 0) {
    return { brokerage: 0, stt: 0, ctt: 0, exchangeCharges: 0, sebiCharges: 0, gst: 0, stampDuty: 0, dpCharges: 0, total: 0 };
  }

  // ── Brokerage ──────────────────────────────────────────────────────────────
  let brokerage: number;
  if (segment === 'EQUITY_DELIVERY' || segment === 'EQUITY_INTRADAY') {
    // Lower of ₹20 or 0.1%, minimum ₹5
    brokerage = Math.max(5, Math.min(20, turnover * 0.001));
  } else {
    brokerage = 20; // Flat ₹20 per executed order
  }

  // ── STT ────────────────────────────────────────────────────────────────────
  let stt = 0;
  if (segment === 'EQUITY_DELIVERY') {
    stt = turnover * 0.001;                         // 0.1% both sides
  } else if (segment === 'EQUITY_INTRADAY' && side === 'SELL') {
    stt = turnover * 0.00025;                       // 0.025% sell only
  } else if (segment === 'FUTURES' && side === 'SELL') {
    stt = turnover * 0.0002;                        // 0.02% sell (Budget 2024)
  } else if (segment === 'OPTIONS' && side === 'SELL') {
    stt = turnover * 0.001;                         // 0.1% on premium (Budget 2024)
  }
  // COMMODITY: CTT instead; CURRENCY: no STT

  // ── CTT (Commodity only) ───────────────────────────────────────────────────
  const ctt = segment === 'COMMODITY' && side === 'SELL' ? r2(turnover * 0.0001) : 0;

  // ── Exchange Transaction Charges ───────────────────────────────────────────
  const exchangeCharges = r2(turnover * EXCHANGE_RATES[segment]);

  // ── SEBI Charges ───────────────────────────────────────────────────────────
  const sebiCharges = r2(turnover * SEBI_RATE);

  // ── GST (18% on brokerage + exchange charges + SEBI charges) ──────────────
  const gst = r2((brokerage + exchangeCharges + sebiCharges) * 0.18);

  // ── Stamp Duty (buy side only, applied on transaction value) ───────────────
  const stampDuty = side === 'BUY' ? r2(turnover * STAMP_RATES[segment]) : 0;

  // ── DP Charges (Equity Delivery sell only) ─────────────────────────────────
  // CDSL/NSDL demat debit: ₹13.5 + 18% GST = ₹15.93 per ISIN per day
  const dpCharges = segment === 'EQUITY_DELIVERY' && side === 'SELL' ? 15.93 : 0;

  const total = r2(
    brokerage + stt + ctt + exchangeCharges + sebiCharges + gst + stampDuty + dpCharges,
  );

  return {
    brokerage:       r2(brokerage),
    stt:             r2(stt),
    ctt,
    exchangeCharges,
    sebiCharges,
    gst,
    stampDuty,
    dpCharges,
    total,
  };
}

// ── Round-trip helper ─────────────────────────────────────────────────────────

export function calcRoundTrip(segment: Segment, turnover: number): {
  buy: ChargeBreakdown;
  sell: ChargeBreakdown;
  total: number;
  breakEvenPct: number;
} {
  const buy  = calcChargeBreakdown(segment, 'BUY',  turnover);
  const sell = calcChargeBreakdown(segment, 'SELL', turnover);
  const total = r2(buy.total + sell.total);
  const breakEvenPct = turnover > 0 ? r2((total / turnover) * 100) : 0;
  return { buy, sell, total, breakEvenPct };
}

// ── Human-readable rate labels ────────────────────────────────────────────────

export function sttLabel(segment: Segment, side: TradeSide): string {
  if (segment === 'EQUITY_DELIVERY') return '0.1% both sides';
  if (segment === 'EQUITY_INTRADAY') return side === 'SELL' ? '0.025% sell' : 'Nil (buy side)';
  if (segment === 'FUTURES') return side === 'SELL' ? '0.02% sell' : 'Nil (buy side)';
  if (segment === 'OPTIONS') return side === 'SELL' ? '0.1% on premium' : 'Nil (buy side)';
  return 'N/A';
}

export function brokerageLabel(segment: Segment): string {
  return segment === 'EQUITY_DELIVERY' || segment === 'EQUITY_INTRADAY'
    ? 'min(₹20, 0.1%), floor ₹5'
    : '₹20 flat per order';
}
