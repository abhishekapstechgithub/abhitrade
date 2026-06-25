import 'dart:math';

// ─── Option Greeks ────────────────────────────────────────────────────────────

class OptionGreeks {
  final double delta;
  final double theta;
  final double gamma;
  final double vega;

  const OptionGreeks({
    required this.delta,
    required this.theta,
    required this.gamma,
    required this.vega,
  });

  const OptionGreeks.zero() : delta = 0, theta = 0, gamma = 0, vega = 0;

  factory OptionGreeks.fromJson(Map<String, dynamic> j) => OptionGreeks(
        delta: _d(j['delta'] ?? 0),
        theta: _d(j['theta'] ?? 0),
        gamma: _d(j['gamma'] ?? 0),
        vega:  _d(j['vega']  ?? 0),
      );

  static double _d(dynamic v) =>
      (v is num) ? v.toDouble() : double.tryParse(v.toString()) ?? 0.0;
}

// ─── Leg Input (matches spec) ─────────────────────────────────────────────────
//
// Input format per spec:
// { strike, type:"CE"/"PE", ltp, lotSize, quantityLots, action:"BUY"/"SELL",
//   greeks: { delta, theta, gamma, vega } }
//
class LegInput {
  final double strike;
  final bool isCall;       // true = CE, false = PE
  final double ltp;        // last traded price / premium
  final int lotSize;
  final int quantityLots;
  final bool isBuy;        // true = BUY, false = SELL
  final OptionGreeks? greeks; // from option chain; null → BS fallback

  const LegInput({
    required this.strike,
    required this.isCall,
    required this.ltp,
    required this.lotSize,
    required this.quantityLots,
    required this.isBuy,
    this.greeks,
  });
}

// ─── Payoff Data Point ────────────────────────────────────────────────────────

class PayoffPoint {
  final double spot;
  final double pnl;
  const PayoffPoint(this.spot, this.pnl);
}

// ─── Strategy Result ──────────────────────────────────────────────────────────

class StrategyResult {
  // A. Aggregate Greeks — Dir * TotalMultiplier weighted
  final double delta, theta, gamma, vega;

  // B. Premium
  /// Sum(ltp * Dir) — net premium per 1 unit (1 share)
  final double netPremiumPerUnit;
  /// Sum(ltp * Dir * lotSize * lots) — total ₹ cash flow
  /// Positive = Net Debit (premium paid), Negative = Net Credit (received)
  final double totalPremiumCashFlow;

  // C. Payoff extremes at expiry
  final double maxProfit, maxLoss;
  final double maxProfitPrice, maxLossPrice;

  // Risk metrics
  final List<double> breakevens; // all zero-crossings (may be multiple)
  final double pop;              // % of price range in profit
  final double rrRatio;          // |maxProfit| / |maxLoss|

  // Chart data — expiry payoff matrix (sorted by spot)
  final List<PayoffPoint> payoffData;

  const StrategyResult({
    required this.delta,   required this.theta,
    required this.gamma,   required this.vega,
    required this.netPremiumPerUnit,
    required this.totalPremiumCashFlow,
    required this.maxProfit,      required this.maxLoss,
    required this.maxProfitPrice, required this.maxLossPrice,
    required this.breakevens,
    required this.pop, required this.rrRatio,
    required this.payoffData,
  });

  /// First breakeven (for single-value display)
  double get breakeven => breakevens.isNotEmpty ? breakevens.first : 0;

  static StrategyResult empty() => const StrategyResult(
    delta: 0, theta: 0, gamma: 0, vega: 0,
    netPremiumPerUnit: 0, totalPremiumCashFlow: 0,
    maxProfit: 0, maxLoss: 0, maxProfitPrice: 0, maxLossPrice: 0,
    breakevens: [], pop: 0, rrRatio: 0,
    payoffData: [],
  );
}

// ─── Black-Scholes (public — used as greek fallback + T0 P&L in charts) ───────

double bsNcdf(double x) {
  const a = [0.254829592, -0.284496736, 1.421413741, -1.453152027, 1.061405429];
  final t = 1.0 / (1.0 + 0.3275911 * x.abs());
  var p = 0.0;
  for (var i = 4; i >= 0; i--) p = p * t + a[i];
  p *= t * exp(-x * x / 2) / sqrt(2 * pi);
  return x >= 0 ? 1.0 - p : p;
}

double bsNpdf(double x) => exp(-x * x / 2) / sqrt(2 * pi);

class BsResult {
  final double price, delta, gamma, theta, vega;
  const BsResult(this.price, this.delta, this.gamma, this.theta, this.vega);
}

/// Full Black-Scholes calculation.
/// [S]=spot, [K]=strike, [T]=time in years, [iv]=annual IV, [isCall]=option type.
BsResult bsCalc(double S, double K, double T, double iv, bool isCall) {
  const r = 0.07;
  if (T <= 0) {
    final v = isCall ? max(0.0, S - K) : max(0.0, K - S);
    return BsResult(
        v,
        isCall ? (S >= K ? 1.0 : 0.0) : (S <= K ? -1.0 : 0.0),
        0, 0, 0);
  }
  final sig = max(0.001, iv);
  final sqT = sqrt(T);
  final d1  = (log(S / K) + (r + sig * sig / 2) * T) / (sig * sqT);
  final d2  = d1 - sig * sqT;
  final df  = exp(-r * T);
  final price = isCall
      ? S * bsNcdf(d1) - K * df * bsNcdf(d2)
      : K * df * bsNcdf(-d2) - S * bsNcdf(-d1);
  final delta = isCall ? bsNcdf(d1) : bsNcdf(d1) - 1.0;
  final gamma = bsNpdf(d1) / (S * sig * sqT);
  final theta = (-S * bsNpdf(d1) * sig / (2 * sqT)
      - r * K * df * (isCall ? bsNcdf(d2) : bsNcdf(-d2))) / 365;
  final vega  = S * bsNpdf(d1) * sqT / 100;
  return BsResult(price, delta, gamma, theta, vega);
}

// ─── Strategy Calculator ──────────────────────────────────────────────────────

class StrategyCalculator {
  StrategyCalculator._();

  /// Calculate all strategy metrics from a list of [LegInput].
  ///
  /// [spot] / [iv] / [dte] are needed only when a leg has no input greeks
  /// (they drive the Black-Scholes fallback).
  static StrategyResult calculate(
    List<LegInput> legs, {
    double spot = 0,
    double iv   = 0.15,
    double dte  = 30,
  }) {
    if (legs.isEmpty) return StrategyResult.empty();

    // ── Price range: (minStrike − 10%) to (maxStrike + 10%), step 25 or 50 ──
    final strikes   = legs.map((l) => l.strike).toList();
    final minStrike = strikes.reduce(min);
    final maxStrike = strikes.reduce(max);
    final step = (maxStrike - minStrike) > 2000 ? 50.0 : 25.0;

    final lo = ((minStrike * 0.90) / step).floor() * step;
    final hi = ((maxStrike * 1.10) / step).ceil()  * step;

    // ── A. Aggregate Strategy Greeks ─────────────────────────────────────────
    double d = 0, g = 0, t = 0, v = 0;
    final T = max(0.001, dte / 365);
    final effectiveSpot = spot > 0 ? spot : (minStrike + maxStrike) / 2;

    for (final l in legs) {
      final dir  = l.isBuy ? 1.0 : -1.0;
      final mult = (l.lotSize * l.quantityLots).toDouble();

      final OptionGreeks greeks;
      if (l.greeks != null) {
        greeks = l.greeks!;
      } else {
        final bs = bsCalc(effectiveSpot, l.strike, T, iv, l.isCall);
        greeks = OptionGreeks(
            delta: bs.delta, theta: bs.theta,
            gamma: bs.gamma, vega:  bs.vega);
      }

      // Strategy Greek = greek * Dir * TotalMultiplier
      d += greeks.delta * dir * mult;
      g += greeks.gamma * dir * mult;
      t += greeks.theta * dir * mult;
      v += greeks.vega  * dir * mult;
    }

    // ── B. Premium Calculations ───────────────────────────────────────────────
    double netPremiumPerUnit    = 0; // Sum(ltp * Dir)
    double totalPremiumCashFlow = 0; // Sum(ltp * Dir * lotSize * lots)

    for (final l in legs) {
      final dir  = l.isBuy ? 1.0 : -1.0;
      final mult = (l.lotSize * l.quantityLots).toDouble();
      netPremiumPerUnit    += l.ltp * dir;
      totalPremiumCashFlow += l.ltp * dir * mult;
    }

    // ── C. Expiry Payoff Matrix ───────────────────────────────────────────────
    final payoffData = <PayoffPoint>[];
    double maxP = -1e9, maxPPrice = effectiveSpot;
    double minP =  1e9, minPPrice = effectiveSpot;
    int profitCt = 0, totalCt = 0;
    double? prevPnl;
    final breakevens = <double>[];

    for (double s = lo; s <= hi + step * 0.01; s += step) {
      final pnl = _expiryPayoff(legs, s);
      payoffData.add(PayoffPoint(s, pnl));

      if (pnl > maxP) { maxP = pnl; maxPPrice = s; }
      if (pnl < minP) { minP = pnl; minPPrice = s; }
      if (pnl > 0) profitCt++;
      totalCt++;

      // Breakeven: linear interpolation at sign change
      if (prevPnl != null && prevPnl * pnl < 0) {
        final be = s - step * pnl / (pnl - prevPnl);
        breakevens.add(double.parse(be.toStringAsFixed(2)));
      }
      prevPnl = pnl;
    }

    final pop     = totalCt > 0 ? profitCt / totalCt * 100 : 0.0;
    final rrRatio = minP.abs() > 0.01 ? maxP / minP.abs() : 99.0;

    return StrategyResult(
      delta: d, theta: t, gamma: g, vega: v,
      netPremiumPerUnit:    netPremiumPerUnit,
      totalPremiumCashFlow: totalPremiumCashFlow,
      maxProfit:      maxP.clamp(-1e8, 1e8),
      maxLoss:        minP.clamp(-1e8, 1e8),
      maxProfitPrice: maxPPrice,
      maxLossPrice:   minPPrice,
      breakevens:     breakevens,
      pop:            pop,
      rrRatio:        rrRatio,
      payoffData:     payoffData,
    );
  }

  /// Expiry PnL per spec Section C:
  /// For CE: intrinsic = max(spot − strike, 0)
  /// For PE: intrinsic = max(strike − spot, 0)
  /// PnL = (intrinsic − ltp) * Dir * TotalMultiplier
  static double _expiryPayoff(List<LegInput> legs, double spot) {
    double total = 0;
    for (final l in legs) {
      final intrinsic = l.isCall
          ? max(0.0, spot - l.strike)
          : max(0.0, l.strike - spot);
      final dir  = l.isBuy ? 1.0 : -1.0;
      final mult = (l.lotSize * l.quantityLots).toDouble();
      total += (intrinsic - l.ltp) * dir * mult;
    }
    return total;
  }
}
