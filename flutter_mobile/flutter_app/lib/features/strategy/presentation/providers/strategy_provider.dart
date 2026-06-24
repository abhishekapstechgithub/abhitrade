import 'package:flutter/material.dart';
import '../../domain/repositories/strategy_repository.dart';

class StrategyProvider extends ChangeNotifier {
  final StrategyRepository _repo;

  List<SavedStrategy> _strategies = [];
  BacktestResult? _lastBacktest;
  bool _loading = false;
  String? _error;

  List<SavedStrategy> get strategies => _strategies;
  BacktestResult? get lastBacktest => _lastBacktest;
  bool get loading => _loading;
  String? get error => _error;

  List<SavedStrategy> byCategory(String cat) =>
      _strategies.where((s) => s.category == cat).toList();

  StrategyProvider(this._repo) {
    fetch();
  }

  Future<void> fetch() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _strategies = await _repo.getStrategies();
    } catch (e) {
      _error = e.toString();
      _strategies = [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> runBacktest(String strategyId, String period) async {
    _loading = true;
    notifyListeners();
    try {
      _lastBacktest = await _repo.backtest(strategyId, period);
    } catch (_) {
      _lastBacktest = null;
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> save(SavedStrategy strategy) async {
    await _repo.saveStrategy(strategy);
    await fetch();
  }

  Future<void> delete(String strategyId) async {
    await _repo.deleteStrategy(strategyId);
    _strategies.removeWhere((s) => s.id == strategyId);
    notifyListeners();
  }
}
