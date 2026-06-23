// ─── Leg ─────────────────────────────────────────────────────────────────────
class StrategyLeg {
  final String underlying;
  final String expiry;
  final double strike;
  final String optionType; // 'CE' | 'PE'
  final String side;       // 'BUY' | 'SELL'
  final int lots;
  final double premium;
  final int lotSize;
  final String token;

  const StrategyLeg({
    this.underlying = '',
    this.expiry = '',
    required this.strike,
    required this.optionType,
    required this.side,
    required this.lots,
    required this.premium,
    this.lotSize = 75,
    this.token = '',
  });

  int get quantity => lots * lotSize;
  bool get isBuy => side == 'BUY';

  factory StrategyLeg.fromJson(Map<String, dynamic> j) => StrategyLeg(
        underlying: j['underlying']?.toString() ?? '',
        expiry: j['expiry']?.toString() ?? '',
        strike: (j['strike'] ?? 0).toDouble(),
        optionType: j['option_type']?.toString() ?? 'CE',
        side: j['side']?.toString() ?? 'BUY',
        lots: (j['lots'] ?? 1).toInt(),
        premium: (j['premium'] ?? 0).toDouble(),
        lotSize: (j['lot_size'] ?? 75).toInt(),
        token: j['token']?.toString() ?? '',
      );

  Map<String, dynamic> toJson() => {
        'underlying': underlying,
        'expiry': expiry,
        'strike': strike,
        'option_type': optionType,
        'side': side,
        'lots': lots,
        'premium': premium,
        'lot_size': lotSize,
        'token': token,
      };
}

// ─── Saved Strategy ───────────────────────────────────────────────────────────
class SavedStrategy {
  final String id;
  final String name;
  final String underlying;
  final String sentiment; // 'Bullish' | 'Bearish' | 'Neutral' | 'Volatile'
  final List<StrategyLeg> legs;
  final double maxProfit;
  final double maxLoss;
  final List<double> breakevens;
  final double pop;
  final String rrRatio;
  final List<String> tags;
  final DateTime createdAt;
  final DateTime updatedAt;
  final Map<String, dynamic>? paramsJson;
  final Map<String, dynamic>? analysisJson;

  SavedStrategy({
    required this.id,
    required this.name,
    required this.underlying,
    required this.sentiment,
    required this.legs,
    this.maxProfit = 0,
    this.maxLoss = 0,
    this.breakevens = const [],
    this.pop = 0,
    this.rrRatio = '',
    this.tags = const [],
    required this.createdAt,
    DateTime? updatedAt,
    this.paramsJson,
    this.analysisJson,
  }) : updatedAt = updatedAt ?? createdAt;

  // Backward-compatible aliases
  String get symbol => underlying;
  String get category => sentiment;
  String get expiry => legs.isNotEmpty ? legs.first.expiry : '';

  factory SavedStrategy.fromJson(Map<String, dynamic> j) {
    final analysis = j['analysis_json'] as Map<String, dynamic>?;
    final legs = (j['legs_json'] as List<dynamic>? ?? [])
        .map((e) => StrategyLeg.fromJson(e as Map<String, dynamic>))
        .toList();
    return SavedStrategy(
      id: j['id']?.toString() ?? '',
      name: j['name']?.toString() ?? '',
      underlying: j['underlying']?.toString() ?? '',
      sentiment: j['sentiment']?.toString() ?? 'Neutral',
      legs: legs,
      maxProfit: (analysis?['max_profit'] ?? 0).toDouble(),
      maxLoss: (analysis?['max_loss'] ?? 0).toDouble(),
      breakevens: (analysis?['breakeven'] as List<dynamic>? ?? [])
          .map((e) => (e as num).toDouble())
          .toList(),
      pop: (analysis?['pop'] ?? 0).toDouble(),
      rrRatio: analysis?['rr_ratio']?.toString() ?? '',
      tags: (j['tags'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList(),
      createdAt: j['created_at'] != null
          ? DateTime.tryParse(j['created_at']) ?? DateTime.now()
          : DateTime.now(),
      updatedAt: j['updated_at'] != null
          ? DateTime.tryParse(j['updated_at'])
          : null,
      paramsJson: j['params_json'] as Map<String, dynamic>?,
      analysisJson: analysis,
    );
  }
}

// ─── Saved Strategies Page ────────────────────────────────────────────────────
class SavedStrategiesPage {
  final List<SavedStrategy> strategies;
  final int total;
  final int page;

  const SavedStrategiesPage({
    required this.strategies,
    required this.total,
    required this.page,
  });
}

// ─── Option Chain ─────────────────────────────────────────────────────────────
class OptionExpiry {
  final String date;
  final int dte;
  final String type; // 'weekly' | 'monthly'

  const OptionExpiry({
    required this.date,
    required this.dte,
    required this.type,
  });

  factory OptionExpiry.fromJson(Map<String, dynamic> j) => OptionExpiry(
        date: j['date']?.toString() ?? '',
        dte: (j['dte'] ?? 0).toInt(),
        type: j['type']?.toString() ?? 'weekly',
      );
}

class OptionQuote {
  final double ltp;
  final double iv;
  final int oi;
  final int volume;
  final double bid;
  final double ask;
  final double delta;
  final double gamma;
  final double theta;
  final double vega;

  const OptionQuote({
    this.ltp = 0,
    this.iv = 0,
    this.oi = 0,
    this.volume = 0,
    this.bid = 0,
    this.ask = 0,
    this.delta = 0,
    this.gamma = 0,
    this.theta = 0,
    this.vega = 0,
  });

  factory OptionQuote.fromJson(Map<String, dynamic>? j) {
    if (j == null) return const OptionQuote();
    return OptionQuote(
      ltp: (j['ltp'] ?? 0).toDouble(),
      iv: (j['iv'] ?? 0).toDouble(),
      oi: (j['oi'] ?? 0).toInt(),
      volume: (j['volume'] ?? 0).toInt(),
      bid: (j['bid'] ?? 0).toDouble(),
      ask: (j['ask'] ?? 0).toDouble(),
      delta: (j['delta'] ?? 0).toDouble(),
      gamma: (j['gamma'] ?? 0).toDouble(),
      theta: (j['theta'] ?? 0).toDouble(),
      vega: (j['vega'] ?? 0).toDouble(),
    );
  }
}

class OptionChainStrike {
  final double strike;
  final OptionQuote calls;
  final OptionQuote puts;

  const OptionChainStrike({
    required this.strike,
    required this.calls,
    required this.puts,
  });

  factory OptionChainStrike.fromJson(Map<String, dynamic> j) => OptionChainStrike(
        strike: (j['strike'] ?? 0).toDouble(),
        calls: OptionQuote.fromJson(j['calls'] as Map<String, dynamic>?),
        puts: OptionQuote.fromJson(j['puts'] as Map<String, dynamic>?),
      );
}

class OptionChain {
  final String underlying;
  final double spot;
  final String expiry;
  final int dte;
  final List<OptionChainStrike> strikes;
  final double pcr;
  final DateTime timestamp;

  const OptionChain({
    required this.underlying,
    required this.spot,
    required this.expiry,
    required this.dte,
    required this.strikes,
    this.pcr = 1.0,
    required this.timestamp,
  });

  factory OptionChain.fromJson(Map<String, dynamic> j) => OptionChain(
        underlying: j['underlying']?.toString() ?? '',
        spot: (j['spot'] ?? 0).toDouble(),
        expiry: j['expiry']?.toString() ?? '',
        dte: (j['dte'] ?? 0).toInt(),
        strikes: (j['strikes'] as List<dynamic>? ?? [])
            .map((e) => OptionChainStrike.fromJson(e as Map<String, dynamic>))
            .toList(),
        pcr: (j['pcr'] ?? 1.0).toDouble(),
        timestamp: j['timestamp'] != null
            ? DateTime.tryParse(j['timestamp']) ?? DateTime.now()
            : DateTime.now(),
      );
}

// ─── IV Data ─────────────────────────────────────────────────────────────────
class IvData {
  final String underlying;
  final double currentIv;
  final double ivRank;
  final double ivPercentile;
  final double iv52wHigh;
  final double iv52wLow;
  final List<Map<String, dynamic>> history;

  const IvData({
    required this.underlying,
    required this.currentIv,
    required this.ivRank,
    required this.ivPercentile,
    required this.iv52wHigh,
    required this.iv52wLow,
    this.history = const [],
  });

  factory IvData.fromJson(Map<String, dynamic> j) => IvData(
        underlying: j['underlying']?.toString() ?? '',
        currentIv: (j['current_iv'] ?? 0).toDouble(),
        ivRank: (j['iv_rank'] ?? 0).toDouble(),
        ivPercentile: (j['iv_percentile'] ?? 0).toDouble(),
        iv52wHigh: (j['iv_52w_high'] ?? 0).toDouble(),
        iv52wLow: (j['iv_52w_low'] ?? 0).toDouble(),
        history: (j['history'] as List<dynamic>? ?? [])
            .map((e) => e as Map<String, dynamic>)
            .toList(),
      );
}

// ─── Greeks ───────────────────────────────────────────────────────────────────
class GreeksPosition {
  final double delta;
  final double gamma;
  final double theta;
  final double vega;
  final double rho;
  final double charm;
  final double vanna;
  final double netPremiumCr;

  const GreeksPosition({
    this.delta = 0,
    this.gamma = 0,
    this.theta = 0,
    this.vega = 0,
    this.rho = 0,
    this.charm = 0,
    this.vanna = 0,
    this.netPremiumCr = 0,
  });

  factory GreeksPosition.fromJson(Map<String, dynamic>? j) {
    if (j == null) return const GreeksPosition();
    return GreeksPosition(
      delta: (j['delta'] ?? 0).toDouble(),
      gamma: (j['gamma'] ?? 0).toDouble(),
      theta: (j['theta'] ?? 0).toDouble(),
      vega: (j['vega'] ?? 0).toDouble(),
      rho: (j['rho'] ?? 0).toDouble(),
      charm: (j['charm'] ?? 0).toDouble(),
      vanna: (j['vanna'] ?? 0).toDouble(),
      netPremiumCr: (j['net_premium_cr'] ?? 0).toDouble(),
    );
  }
}

class LegGreeks {
  final double ltp;
  final double delta;
  final double gamma;
  final double theta;
  final double vega;
  final double iv;
  final String moneyness;

  const LegGreeks({
    this.ltp = 0,
    this.delta = 0,
    this.gamma = 0,
    this.theta = 0,
    this.vega = 0,
    this.iv = 0,
    this.moneyness = 'ATM',
  });

  factory LegGreeks.fromJson(Map<String, dynamic> j) => LegGreeks(
        ltp: (j['ltp'] ?? 0).toDouble(),
        delta: (j['delta'] ?? 0).toDouble(),
        gamma: (j['gamma'] ?? 0).toDouble(),
        theta: (j['theta'] ?? 0).toDouble(),
        vega: (j['vega'] ?? 0).toDouble(),
        iv: (j['iv'] ?? 0).toDouble(),
        moneyness: j['moneyness']?.toString() ?? 'ATM',
      );
}

class StrategyAnalysis {
  final double maxProfit;
  final double maxLoss;
  final List<double> breakeven;
  final double pop;
  final String rrRatio;

  const StrategyAnalysis({
    this.maxProfit = 0,
    this.maxLoss = 0,
    this.breakeven = const [],
    this.pop = 0,
    this.rrRatio = '',
  });

  factory StrategyAnalysis.fromJson(Map<String, dynamic>? j) {
    if (j == null) return const StrategyAnalysis();
    return StrategyAnalysis(
      maxProfit: (j['max_profit'] ?? 0).toDouble(),
      maxLoss: (j['max_loss'] ?? 0).toDouble(),
      breakeven: (j['breakeven'] as List<dynamic>? ?? [])
          .map((e) => (e as num).toDouble())
          .toList(),
      pop: (j['pop'] ?? 0).toDouble(),
      rrRatio: j['rr_ratio']?.toString() ?? '',
    );
  }
}

class GreeksResult {
  final GreeksPosition position;
  final GreeksPosition perLot;
  final List<LegGreeks> legs;
  final StrategyAnalysis analysis;

  const GreeksResult({
    required this.position,
    required this.perLot,
    required this.legs,
    required this.analysis,
  });

  factory GreeksResult.fromJson(Map<String, dynamic> j) => GreeksResult(
        position:
            GreeksPosition.fromJson(j['position'] as Map<String, dynamic>?),
        perLot:
            GreeksPosition.fromJson(j['per_lot'] as Map<String, dynamic>?),
        legs: (j['legs'] as List<dynamic>? ?? [])
            .map((e) => LegGreeks.fromJson(e as Map<String, dynamic>))
            .toList(),
        analysis: StrategyAnalysis.fromJson(
            j['analysis'] as Map<String, dynamic>?),
      );
}

// ─── Payoff ──────────────────────────────────────────────────────────────────
class PayoffData {
  final List<List<double>> expiryPnl;
  final List<List<double>> t0Pnl;
  final List<double> breakeven;
  final double spot;
  final double maxProfit;
  final double maxLoss;

  const PayoffData({
    this.expiryPnl = const [],
    this.t0Pnl = const [],
    this.breakeven = const [],
    this.spot = 0,
    this.maxProfit = 0,
    this.maxLoss = 0,
  });

  factory PayoffData.fromJson(Map<String, dynamic> j) {
    List<List<double>> parseMatrix(dynamic raw) =>
        (raw as List<dynamic>? ?? [])
            .map((row) => (row as List<dynamic>)
                .map((e) => (e as num).toDouble())
                .toList())
            .toList();
    return PayoffData(
      expiryPnl: parseMatrix(j['expiry_pnl']),
      t0Pnl: parseMatrix(j['t0_pnl']),
      breakeven: (j['breakeven'] as List<dynamic>? ?? [])
          .map((e) => (e as num).toDouble())
          .toList(),
      spot: (j['spot'] ?? 0).toDouble(),
      maxProfit: (j['max_profit'] ?? 0).toDouble(),
      maxLoss: (j['max_loss'] ?? 0).toDouble(),
    );
  }
}

// ─── Templates ───────────────────────────────────────────────────────────────
class StrategyTemplate {
  final int id;
  final String name;
  final String sentiment;
  final String description;
  final List<Map<String, dynamic>> legsTemplate;
  final String iconName;

  const StrategyTemplate({
    required this.id,
    required this.name,
    required this.sentiment,
    required this.description,
    this.legsTemplate = const [],
    this.iconName = 'bar_chart',
  });

  factory StrategyTemplate.fromJson(Map<String, dynamic> j) => StrategyTemplate(
        id: (j['id'] ?? 0).toInt(),
        name: j['name']?.toString() ?? '',
        sentiment: j['sentiment']?.toString() ?? 'Neutral',
        description: j['description']?.toString() ?? '',
        legsTemplate: (j['legs_template'] as List<dynamic>? ?? [])
            .map((e) => e as Map<String, dynamic>)
            .toList(),
        iconName: j['icon_name']?.toString() ?? 'bar_chart',
      );
}

// ─── Built Strategy ───────────────────────────────────────────────────────────
class BuiltStrategy {
  final String templateName;
  final List<StrategyLeg> legs;
  final StrategyAnalysis analysis;
  final double netPremium;
  final double score;

  const BuiltStrategy({
    required this.templateName,
    required this.legs,
    required this.analysis,
    this.netPremium = 0,
    this.score = 0,
  });

  factory BuiltStrategy.fromJson(Map<String, dynamic> j) => BuiltStrategy(
        templateName: j['template_name']?.toString() ?? '',
        legs: (j['legs'] as List<dynamic>? ?? [])
            .map((e) => StrategyLeg.fromJson(e as Map<String, dynamic>))
            .toList(),
        analysis: StrategyAnalysis.fromJson(
            j['analysis'] as Map<String, dynamic>?),
        netPremium: (j['net_premium'] ?? 0).toDouble(),
        score: (j['score'] ?? 0).toDouble(),
      );
}

// ─── Backtest ─────────────────────────────────────────────────────────────────
class BacktestResult {
  final int trades;
  final double winRate;
  final double avgPnlPerTrade;
  final double totalPnl;
  final double maxDrawdown;
  final double sharpeRatio;
  final List<Map<String, dynamic>> pnlCurve;

  const BacktestResult({
    this.trades = 0,
    this.winRate = 0,
    this.avgPnlPerTrade = 0,
    this.totalPnl = 0,
    this.maxDrawdown = 0,
    this.sharpeRatio = 0,
    this.pnlCurve = const [],
  });

  factory BacktestResult.fromJson(Map<String, dynamic> j) => BacktestResult(
        trades: (j['trades'] ?? 0).toInt(),
        winRate: (j['win_rate'] ?? 0).toDouble(),
        avgPnlPerTrade: (j['avg_pnl_per_trade'] ?? 0).toDouble(),
        totalPnl: (j['total_pnl'] ?? 0).toDouble(),
        maxDrawdown: (j['max_drawdown'] ?? 0).toDouble(),
        sharpeRatio: (j['sharpe_ratio'] ?? 0).toDouble(),
        pnlCurve: (j['pnl_curve'] as List<dynamic>? ?? [])
            .map((e) => e as Map<String, dynamic>)
            .toList(),
      );
}

class BacktestJob {
  final String jobId;
  final String status; // 'queued' | 'running' | 'complete' | 'failed'
  final int estimatedSeconds;
  final BacktestResult? result;

  const BacktestJob({
    required this.jobId,
    required this.status,
    this.estimatedSeconds = 0,
    this.result,
  });

  bool get isComplete => status == 'complete';
  bool get isFailed => status == 'failed';
  bool get isPending => status == 'queued' || status == 'running';

  factory BacktestJob.fromJson(Map<String, dynamic> j) => BacktestJob(
        jobId: j['job_id']?.toString() ?? '',
        status: j['status']?.toString() ?? 'queued',
        estimatedSeconds: (j['estimated_seconds'] ?? 0).toInt(),
        result: j['result'] != null
            ? BacktestResult.fromJson(j['result'] as Map<String, dynamic>)
            : null,
      );
}

// ─── Repository Interface ─────────────────────────────────────────────────────
abstract class StrategyRepository {
  // Option chain & expiries
  Future<List<OptionExpiry>> getOptionExpiries(String underlying);
  Future<OptionChain> getOptionChain(String underlying, String expiry,
      {int strikes = 20});

  // IV data
  Future<IvData> getIvData(String underlying, String expiry);

  // Greeks & payoff
  Future<GreeksResult> computeGreeks({
    required double spot,
    required double iv,
    required int dte,
    required List<StrategyLeg> legs,
    double riskFreeRate = 0.07,
  });
  Future<PayoffData> getPayoff({
    required double spot,
    required double iv,
    required int dte,
    required List<StrategyLeg> legs,
    double priceRangePct = 0.20,
    int points = 200,
  });

  // Auto-builder
  Future<List<BuiltStrategy>> buildStrategy({
    required String underlying,
    required String sentiment,
    required String expiry,
    int maxLegs = 4,
    double? maxRiskCr,
    double? minPop,
    double? maxPremiumCr,
  });

  // Templates
  Future<List<StrategyTemplate>> getTemplates({String? sentiment});
  Future<SavedStrategy> applyTemplate(
    int templateId, {
    required String underlying,
    required String expiry,
    required double spot,
    required double iv,
  });

  // Saved strategies CRUD
  Future<SavedStrategiesPage> getStrategies({
    int page = 1,
    int limit = 20,
    String? search,
    String? sentiment,
  });
  Future<SavedStrategy> createStrategy(Map<String, dynamic> payload);
  Future<SavedStrategy> getStrategy(String id);
  Future<SavedStrategy> updateStrategy(String id, Map<String, dynamic> payload);
  Future<void> deleteStrategy(String id);
  Future<SavedStrategy> duplicateStrategy(String id);

  // Backtesting
  Future<BacktestJob> startBacktest({
    required String strategyId,
    required String periodFrom,
    required String periodTo,
    String entryDay = 'monday',
    int entryDte = 30,
    int exitDte = 5,
    int stopLossPct = 50,
    int targetPct = 75,
  });
  Future<BacktestJob> pollBacktest(String jobId);
}
