import '../../domain/repositories/strategy_repository.dart';
import '../../../../services/api_service.dart';

class StrategyRepositoryImpl implements StrategyRepository {
  final ApiService _api = ApiService.instance;

  // ─── Option Chain & Expiries ───────────────────────────────────────────────

  @override
  Future<List<OptionExpiry>> getOptionExpiries(String underlying) async {
    try {
      final res = await _api.getOptionExpiries(underlying);
      // Backend returns: { symbol, expiries: ["2025-06-26", ...], nearest }
      final expiries = (res['expiries'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList();
      final now = DateTime.now();
      return expiries.map((dateStr) {
        final date = DateTime.tryParse(dateStr) ?? now;
        final dte  = date.difference(now).inDays;
        // Heuristic: monthly expiry = last Thursday of month
        final isMonthly = date.day >= 25;
        return OptionExpiry(
          date: dateStr,
          dte: dte.clamp(0, 365),
          type: isMonthly ? 'monthly' : 'weekly',
        );
      }).toList();
    } catch (_) {
      return _mockExpiries;
    }
  }

  @override
  Future<OptionChain> getOptionChain(String underlying, String expiry,
      {int strikes = 20}) async {
    try {
      final res = await _api.getOptionChain(underlying, expiry, strikes: strikes);
      return _mapBackendChain(res, underlying, expiry);
    } catch (_) {
      return _mockChain(underlying, expiry);
    }
  }

  /// Maps the backend /api/optionchain response to our domain OptionChain model.
  /// Backend format:
  ///   { symbol, expiry, spot, atm, strikeInterval,
  ///     rows: [ { strike, isAtm, isItm, ce: { ltp, oi, volume, bid, ask,
  ///               delta, gamma, theta, vega, iv, ... }, pe: {...} } ],
  ///     analytics: { totalCallOI, totalPutOI, pcr, ... }, timestamp, source }
  static OptionChain _mapBackendChain(
      Map<String, dynamic> res, String underlying, String expiry) {
    final spot  = (res['spot'] ?? 0).toDouble();
    final now   = DateTime.now();
    final expDate = DateTime.tryParse(expiry) ?? now;
    final dte   = expDate.difference(now).inDays.clamp(0, 365);
    final pcr   = (res['analytics']?['pcr'] ?? 1.0).toDouble();

    final rows  = (res['rows'] as List<dynamic>? ?? []);
    final strikeList = rows.map((r) {
      final row = r as Map<String, dynamic>;
      return OptionChainStrike(
        strike: (row['strike'] ?? 0).toDouble(),
        calls:  _mapQuote(row['ce'] as Map<String, dynamic>?),
        puts:   _mapQuote(row['pe'] as Map<String, dynamic>?),
      );
    }).toList();

    return OptionChain(
      underlying: res['symbol']?.toString() ?? underlying,
      spot: spot,
      expiry: expiry,
      dte: dte,
      strikes: strikeList,
      pcr: pcr,
      timestamp: res['timestamp'] != null
          ? DateTime.tryParse(res['timestamp']) ?? now
          : now,
    );
  }

  static OptionQuote _mapQuote(Map<String, dynamic>? q) {
    if (q == null) return const OptionQuote();
    return OptionQuote(
      ltp:    (q['ltp']    ?? 0).toDouble(),
      iv:     (q['iv']     ?? 0).toDouble(),
      oi:     (q['oi']     ?? 0).toInt(),
      volume: (q['volume'] ?? 0).toInt(),
      bid:    (q['bid']    ?? 0).toDouble(),
      ask:    (q['ask']    ?? 0).toDouble(),
      delta:  (q['delta']  ?? 0).toDouble(),
      gamma:  (q['gamma']  ?? 0).toDouble(),
      theta:  (q['theta']  ?? 0).toDouble(),
      vega:   (q['vega']   ?? 0).toDouble(),
    );
  }

  // ─── IV Data ──────────────────────────────────────────────────────────────

  @override
  Future<IvData> getIvData(String underlying, String expiry) async {
    try {
      final res = await _api.getIvData(underlying, expiry);
      return IvData.fromJson(res);
    } catch (_) {
      return _mockIvData(underlying);
    }
  }

  // ─── Greeks & Payoff ──────────────────────────────────────────────────────

  @override
  Future<GreeksResult> computeGreeks({
    required double spot,
    required double iv,
    required int dte,
    required List<StrategyLeg> legs,
    double riskFreeRate = 0.07,
  }) async {
    try {
      final res = await _api.computeGreeks(
        spot: spot,
        iv: iv,
        dte: dte,
        legsJson: legs.map((l) => l.toJson()).toList(),
        riskFreeRate: riskFreeRate,
      );
      return GreeksResult.fromJson(res);
    } catch (_) {
      return _mockGreeks(legs);
    }
  }

  @override
  Future<PayoffData> getPayoff({
    required double spot,
    required double iv,
    required int dte,
    required List<StrategyLeg> legs,
    double priceRangePct = 0.20,
    int points = 200,
  }) async {
    try {
      final res = await _api.getPayoff(
        spot: spot,
        iv: iv,
        dte: dte,
        legsJson: legs.map((l) => l.toJson()).toList(),
        priceRangePct: priceRangePct,
        points: points,
      );
      return PayoffData.fromJson(res);
    } catch (_) {
      return _mockPayoff(spot);
    }
  }

  // ─── Auto-Builder ─────────────────────────────────────────────────────────

  @override
  Future<List<BuiltStrategy>> buildStrategy({
    required String underlying,
    required String sentiment,
    required String expiry,
    int maxLegs = 4,
    double? maxRiskCr,
    double? minPop,
    double? maxPremiumCr,
  }) async {
    try {
      final res = await _api.buildStrategy(
        underlying: underlying,
        sentiment: sentiment,
        expiry: expiry,
        maxLegs: maxLegs,
        maxRiskCr: maxRiskCr,
        minPop: minPop,
        maxPremiumCr: maxPremiumCr,
      );
      return (res['strategies'] as List<dynamic>? ?? [])
          .map((e) => BuiltStrategy.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return _mockBuiltStrategies(sentiment);
    }
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  @override
  Future<List<StrategyTemplate>> getTemplates({String? sentiment}) async {
    try {
      final res = await _api.getStrategyTemplates(sentiment: sentiment);
      return (res['templates'] as List<dynamic>? ?? [])
          .map((e) => StrategyTemplate.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      return _mockTemplates;
    }
  }

  @override
  Future<SavedStrategy> applyTemplate(
    int templateId, {
    required String underlying,
    required String expiry,
    required double spot,
    required double iv,
  }) async {
    final res = await _api.applyStrategyTemplate(
      templateId,
      underlying: underlying,
      expiry: expiry,
      spot: spot,
      iv: iv,
    );
    return SavedStrategy(
      id: '',
      name: res['template_name']?.toString() ?? 'Strategy',
      underlying: underlying,
      sentiment: res['sentiment']?.toString() ?? 'Neutral',
      legs: (res['legs'] as List<dynamic>? ?? [])
          .map((e) => StrategyLeg.fromJson(e as Map<String, dynamic>))
          .toList(),
      createdAt: DateTime.now(),
      analysisJson: res['analysis'] as Map<String, dynamic>?,
    );
  }

  // ─── Saved Strategies CRUD ────────────────────────────────────────────────

  @override
  Future<SavedStrategiesPage> getStrategies({
    int page = 1,
    int limit = 20,
    String? search,
    String? sentiment,
  }) async {
    try {
      final res = await _api.getSavedStrategies(
        page: page,
        limit: limit,
        search: search,
        sentiment: sentiment,
      );
      return SavedStrategiesPage(
        strategies: (res['strategies'] as List<dynamic>? ?? [])
            .map((e) => SavedStrategy.fromJson(e as Map<String, dynamic>))
            .toList(),
        total: (res['total'] ?? 0).toInt(),
        page: (res['page'] ?? page).toInt(),
      );
    } catch (_) {
      return SavedStrategiesPage(
        strategies: _mockStrategies,
        total: _mockStrategies.length,
        page: 1,
      );
    }
  }

  @override
  Future<SavedStrategy> createStrategy(Map<String, dynamic> payload) async {
    final res = await _api.createSavedStrategy(payload);
    return SavedStrategy.fromJson(res);
  }

  @override
  Future<SavedStrategy> getStrategy(String id) async {
    final res = await _api.getSavedStrategy(id);
    return SavedStrategy.fromJson(res);
  }

  @override
  Future<SavedStrategy> updateStrategy(
      String id, Map<String, dynamic> payload) async {
    final res = await _api.updateSavedStrategy(id, payload);
    return SavedStrategy.fromJson(res);
  }

  @override
  Future<void> deleteStrategy(String id) => _api.deleteSavedStrategy(id);

  @override
  Future<SavedStrategy> duplicateStrategy(String id) async {
    final res = await _api.duplicateSavedStrategy(id);
    return SavedStrategy.fromJson(res);
  }

  // ─── Backtesting ──────────────────────────────────────────────────────────

  @override
  Future<BacktestJob> startBacktest({
    required String strategyId,
    required String periodFrom,
    required String periodTo,
    String entryDay = 'monday',
    int entryDte = 30,
    int exitDte = 5,
    int stopLossPct = 50,
    int targetPct = 75,
  }) async {
    try {
      final res = await _api.startBacktest(
        strategyId: strategyId,
        periodFrom: periodFrom,
        periodTo: periodTo,
        entryDay: entryDay,
        entryDte: entryDte,
        exitDte: exitDte,
        stopLossPct: stopLossPct,
        targetPct: targetPct,
      );
      return BacktestJob.fromJson(res);
    } catch (_) {
      return const BacktestJob(
          jobId: 'mock', status: 'queued', estimatedSeconds: 5);
    }
  }

  @override
  Future<BacktestJob> pollBacktest(String jobId) async {
    if (jobId == 'mock') {
      return BacktestJob(
          jobId: jobId, status: 'complete', result: _mockBacktestResult);
    }
    try {
      final res = await _api.pollBacktest(jobId);
      return BacktestJob.fromJson(res);
    } catch (_) {
      return BacktestJob(
          jobId: jobId, status: 'complete', result: _mockBacktestResult);
    }
  }

  // ─── Mock Data ────────────────────────────────────────────────────────────

  static final List<OptionExpiry> _mockExpiries = [
    const OptionExpiry(date: '2026-06-26', dte: 3, type: 'weekly'),
    const OptionExpiry(date: '2026-07-03', dte: 10, type: 'weekly'),
    const OptionExpiry(date: '2026-07-31', dte: 38, type: 'monthly'),
  ];

  static OptionChain _mockChain(String underlying, String expiry) => OptionChain(
        underlying: underlying,
        spot: 24500,
        expiry: expiry,
        dte: 10,
        pcr: 0.92,
        timestamp: DateTime.now(),
        strikes: List.generate(10, (i) {
          final strike = 24000.0 + (i * 100);
          return OptionChainStrike(
            strike: strike,
            calls: OptionQuote(
              ltp: 200 - i * 15,
              iv: 0.12 + i * 0.005,
              oi: 100000 + i * 5000,
              volume: 5000,
              delta: 0.7 - i * 0.05,
              gamma: 0.002,
              theta: -8.0,
              vega: 9.0,
            ),
            puts: OptionQuote(
              ltp: 50 + i * 15,
              iv: 0.13 + i * 0.005,
              oi: 80000 + i * 4000,
              volume: 4000,
              delta: -(0.3 + i * 0.05),
              gamma: 0.002,
              theta: -5.0,
              vega: 8.0,
            ),
          );
        }),
      );

  static IvData _mockIvData(String underlying) => IvData(
        underlying: underlying,
        currentIv: 0.1245,
        ivRank: 45.2,
        ivPercentile: 61.8,
        iv52wHigh: 0.2234,
        iv52wLow: 0.0812,
        history: List.generate(
          30,
          (i) => {
            'date':
                '2026-05-${(i + 1).toString().padLeft(2, '0')}',
            'iv': 0.10 + (i % 7) * 0.003,
          },
        ),
      );

  static GreeksResult _mockGreeks(List<StrategyLeg> legs) => GreeksResult(
        position: const GreeksPosition(
          delta: 0.38,
          gamma: 0.0021,
          theta: -215.6,
          vega: 142.3,
          rho: 38.6,
          charm: -12.4,
          vanna: 65.2,
        ),
        perLot: const GreeksPosition(
          delta: 0.19,
          gamma: 0.00105,
          theta: -107.8,
          vega: 71.15,
          rho: 19.3,
          charm: -6.2,
          vanna: 32.6,
        ),
        legs: legs
            .map((_) => const LegGreeks(
                  ltp: 310,
                  delta: 0.5,
                  gamma: 0.002,
                  theta: -8.0,
                  vega: 9.0,
                  iv: 0.12,
                  moneyness: 'ATM',
                ))
            .toList(),
        analysis: const StrategyAnalysis(
          maxProfit: 425000,
          maxLoss: -131250,
          breakeven: [24675],
          pop: 45.2,
          rrRatio: '1:3.24',
        ),
      );

  static PayoffData _mockPayoff(double spot) {
    final lo = spot * 0.8;
    final step = (spot * 0.4) / 50;
    final expiry = List.generate(50, (i) {
      final p = lo + i * step;
      final pnl = (p - spot) * 75 - 500;
      return [p, pnl];
    });
    return PayoffData(
      expiryPnl: expiry,
      t0Pnl: expiry.map((e) => [e[0], e[1] * 0.6]).toList(),
      breakeven: [spot + 100],
      spot: spot,
      maxProfit: 425000,
      maxLoss: -131250,
    );
  }

  static List<BuiltStrategy> _mockBuiltStrategies(String sentiment) {
    final name = sentiment == 'Bullish'
        ? 'Bull Call Spread'
        : sentiment == 'Bearish'
            ? 'Bear Put Spread'
            : 'Iron Condor';
    return [
      BuiltStrategy(
        templateName: name,
        legs: [
          const StrategyLeg(
            underlying: 'NIFTY',
            expiry: '2026-06-26',
            strike: 24500,
            optionType: 'CE',
            side: 'BUY',
            lots: 1,
            premium: 120,
            lotSize: 75,
          ),
          const StrategyLeg(
            underlying: 'NIFTY',
            expiry: '2026-06-26',
            strike: 24700,
            optionType: 'CE',
            side: 'SELL',
            lots: 1,
            premium: 55,
            lotSize: 75,
          ),
        ],
        analysis: const StrategyAnalysis(
          maxProfit: 9375,
          maxLoss: -4875,
          breakeven: [24565],
          pop: 45.0,
          rrRatio: '1:1.92',
        ),
        netPremium: 4875,
        score: 87.4,
      ),
    ];
  }

  static const BacktestResult _mockBacktestResult = BacktestResult(
    trades: 24,
    winRate: 62.5,
    avgPnlPerTrade: 18420,
    totalPnl: 441480,
    maxDrawdown: -286000,
    sharpeRatio: 1.34,
  );

  static final List<SavedStrategy> _mockStrategies = [
    SavedStrategy(
      id: 's1',
      name: 'Bull Call Spread',
      underlying: 'NIFTY',
      sentiment: 'Bullish',
      legs: const [
        StrategyLeg(
          underlying: 'NIFTY',
          expiry: '2026-06-26',
          strike: 23500,
          optionType: 'CE',
          side: 'BUY',
          lots: 1,
          premium: 120,
          lotSize: 75,
        ),
        StrategyLeg(
          underlying: 'NIFTY',
          expiry: '2026-06-26',
          strike: 23700,
          optionType: 'CE',
          side: 'SELL',
          lots: 1,
          premium: 55,
          lotSize: 75,
        ),
      ],
      maxProfit: 4875,
      maxLoss: -3675,
      breakevens: const [23565],
      pop: 45.0,
      rrRatio: '1:1.33',
      createdAt: DateTime(2026, 6, 20),
    ),
    SavedStrategy(
      id: 's2',
      name: 'Iron Condor',
      underlying: 'NIFTY',
      sentiment: 'Neutral',
      legs: const [
        StrategyLeg(
          underlying: 'NIFTY',
          expiry: '2026-06-26',
          strike: 23000,
          optionType: 'PE',
          side: 'BUY',
          lots: 1,
          premium: 30,
          lotSize: 75,
        ),
        StrategyLeg(
          underlying: 'NIFTY',
          expiry: '2026-06-26',
          strike: 23200,
          optionType: 'PE',
          side: 'SELL',
          lots: 1,
          premium: 70,
          lotSize: 75,
        ),
        StrategyLeg(
          underlying: 'NIFTY',
          expiry: '2026-06-26',
          strike: 23800,
          optionType: 'CE',
          side: 'SELL',
          lots: 1,
          premium: 65,
          lotSize: 75,
        ),
        StrategyLeg(
          underlying: 'NIFTY',
          expiry: '2026-06-26',
          strike: 24000,
          optionType: 'CE',
          side: 'BUY',
          lots: 1,
          premium: 25,
          lotSize: 75,
        ),
      ],
      maxProfit: 6000,
      maxLoss: -9000,
      breakevens: const [23120, 23880],
      pop: 62.0,
      rrRatio: '1:1.50',
      createdAt: DateTime(2026, 6, 18),
    ),
  ];

  static final List<StrategyTemplate> _mockTemplates = [
    const StrategyTemplate(
      id: 1,
      name: 'Bull Call Spread',
      sentiment: 'Bullish',
      description: 'Buy lower strike CE, sell higher strike CE',
      iconName: 'trending_up',
    ),
    const StrategyTemplate(
      id: 2,
      name: 'Bear Put Spread',
      sentiment: 'Bearish',
      description: 'Buy higher strike PE, sell lower strike PE',
      iconName: 'trending_down',
    ),
    const StrategyTemplate(
      id: 3,
      name: 'Iron Condor',
      sentiment: 'Neutral',
      description: 'Sell OTM call and put spreads for range-bound market',
      iconName: 'swap_horiz',
    ),
    const StrategyTemplate(
      id: 4,
      name: 'Short Straddle',
      sentiment: 'Neutral',
      description: 'Sell ATM CE and PE for premium collection',
      iconName: 'remove',
    ),
    const StrategyTemplate(
      id: 5,
      name: 'Long Straddle',
      sentiment: 'Volatile',
      description: 'Buy ATM CE and PE to profit from a big move',
      iconName: 'open_in_full',
    ),
    const StrategyTemplate(
      id: 6,
      name: 'Bull Put Spread',
      sentiment: 'Bullish',
      description: 'Sell higher strike PE, buy lower strike PE',
      iconName: 'call_made',
    ),
    const StrategyTemplate(
      id: 7,
      name: 'Bear Call Spread',
      sentiment: 'Bearish',
      description: 'Sell lower strike CE, buy higher strike CE',
      iconName: 'call_received',
    ),
    const StrategyTemplate(
      id: 8,
      name: 'Short Strangle',
      sentiment: 'Neutral',
      description: 'Sell OTM CE and PE for premium in a stable market',
      iconName: 'compress',
    ),
  ];
}
