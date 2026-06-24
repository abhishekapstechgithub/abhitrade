abstract class StrategyRepository {
  Future<List<SavedStrategy>> getStrategies();
  Future<BacktestResult> backtest(String strategyId, String period);
  Future<void> saveStrategy(SavedStrategy strategy);
  Future<void> deleteStrategy(String strategyId);
}

class SavedStrategy {
  final String id;
  final String name;
  final String symbol;
  final String expiry;
  final String category;
  final List<StrategyLeg> legs;
  final double maxProfit;
  final double maxLoss;
  final List<double> breakevens;
  final DateTime createdAt;

  const SavedStrategy({
    required this.id,
    required this.name,
    required this.symbol,
    required this.expiry,
    required this.category,
    required this.legs,
    required this.maxProfit,
    required this.maxLoss,
    required this.breakevens,
    required this.createdAt,
  });
}

class StrategyLeg {
  final String type;
  final String action;
  final double strike;
  final int quantity;
  final double premium;

  const StrategyLeg({
    required this.type,
    required this.action,
    required this.strike,
    required this.quantity,
    required this.premium,
  });
}

class BacktestResult {
  final String strategyId;
  final String period;
  final double pnl;
  final double maxDrawdown;
  final double winRate;
  final int totalTrades;
  final List<Map<String, dynamic>> equity;

  const BacktestResult({
    required this.strategyId,
    required this.period,
    required this.pnl,
    required this.maxDrawdown,
    required this.winRate,
    required this.totalTrades,
    required this.equity,
  });
}
