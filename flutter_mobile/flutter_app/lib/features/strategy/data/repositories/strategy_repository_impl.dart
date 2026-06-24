import '../../domain/repositories/strategy_repository.dart';

class StrategyRepositoryImpl implements StrategyRepository {
  @override
  Future<List<SavedStrategy>> getStrategies() async {
    await Future.delayed(const Duration(milliseconds: 400));
    return _mockStrategies;
  }

  @override
  Future<BacktestResult> backtest(String strategyId, String period) async {
    await Future.delayed(const Duration(milliseconds: 800));
    return _mockBacktest(strategyId, period);
  }

  @override
  Future<void> saveStrategy(SavedStrategy strategy) async {
    await Future.delayed(const Duration(milliseconds: 200));
  }

  @override
  Future<void> deleteStrategy(String strategyId) async {
    await Future.delayed(const Duration(milliseconds: 200));
  }

  BacktestResult _mockBacktest(String strategyId, String period) {
    return BacktestResult(
      strategyId: strategyId,
      period: period,
      pnl: 12450.0,
      maxDrawdown: -3200.0,
      winRate: 62.5,
      totalTrades: 24,
      equity: List.generate(30, (i) => {
        'day': i + 1,
        'value': 100000.0 + (i * 415.0) + (i % 5 == 0 ? -800.0 : 200.0),
      }),
    );
  }

  static final List<SavedStrategy> _mockStrategies = [
    SavedStrategy(
      id: 's1',
      name: 'Bull Call Spread',
      symbol: 'NIFTY',
      expiry: '2026-06-26',
      category: 'Bullish',
      legs: [
        StrategyLeg(type: 'CE', action: 'BUY',  strike: 23500, quantity: 50, premium: 120),
        StrategyLeg(type: 'CE', action: 'SELL', strike: 23700, quantity: 50, premium:  55),
      ],
      maxProfit:  3250,
      maxLoss:   -3250,
      breakevens: [23565],
      createdAt: DateTime(2026, 6, 20),
    ),
    SavedStrategy(
      id: 's2',
      name: 'Iron Condor',
      symbol: 'NIFTY',
      expiry: '2026-06-26',
      category: 'Neutral',
      legs: [
        StrategyLeg(type: 'PE', action: 'BUY',  strike: 23000, quantity: 50, premium:  30),
        StrategyLeg(type: 'PE', action: 'SELL', strike: 23200, quantity: 50, premium:  70),
        StrategyLeg(type: 'CE', action: 'SELL', strike: 23800, quantity: 50, premium:  65),
        StrategyLeg(type: 'CE', action: 'BUY',  strike: 24000, quantity: 50, premium:  25),
      ],
      maxProfit:  4000,
      maxLoss:   -6000,
      breakevens: [23120, 23880],
      createdAt: DateTime(2026, 6, 18),
    ),
  ];
}
