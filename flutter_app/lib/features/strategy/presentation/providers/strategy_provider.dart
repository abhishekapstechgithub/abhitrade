import 'package:flutter/material.dart';
import '../../domain/repositories/strategy_repository.dart';

class StrategyProvider extends ChangeNotifier {
  final StrategyRepository _repo;

  // ─── Saved Strategies ─────────────────────────────────────────────────────
  List<SavedStrategy> _strategies = [];
  int _strategiesTotal = 0;
  bool _loadingStrategies = false;
  String? _strategiesError;

  // ─── Option Chain ──────────────────────────────────────────────────────────
  OptionChain? _currentChain;
  List<OptionExpiry> _expiries = [];
  bool _loadingChain = false;
  String? _chainError;

  // ─── IV Data ──────────────────────────────────────────────────────────────
  IvData? _ivData;
  bool _loadingIv = false;

  // ─── Greeks ───────────────────────────────────────────────────────────────
  GreeksResult? _greeksResult;
  bool _loadingGreeks = false;

  // ─── Payoff ───────────────────────────────────────────────────────────────
  PayoffData? _payoffData;
  bool _loadingPayoff = false;

  // ─── Auto-Builder ─────────────────────────────────────────────────────────
  List<BuiltStrategy> _builtStrategies = [];
  bool _loadingBuilder = false;

  // ─── Templates ────────────────────────────────────────────────────────────
  List<StrategyTemplate> _templates = [];
  bool _loadingTemplates = false;

  // ─── Backtest ─────────────────────────────────────────────────────────────
  BacktestJob? _backtestJob;
  bool _pollingBacktest = false;

  // ─── Getters ──────────────────────────────────────────────────────────────
  List<SavedStrategy> get strategies => _strategies;
  int get strategiesTotal => _strategiesTotal;
  bool get loadingStrategies => _loadingStrategies;
  String? get strategiesError => _strategiesError;

  OptionChain? get currentChain => _currentChain;
  List<OptionExpiry> get expiries => _expiries;
  bool get loadingChain => _loadingChain;
  String? get chainError => _chainError;

  IvData? get ivData => _ivData;
  bool get loadingIv => _loadingIv;

  GreeksResult? get greeksResult => _greeksResult;
  bool get loadingGreeks => _loadingGreeks;

  PayoffData? get payoffData => _payoffData;
  bool get loadingPayoff => _loadingPayoff;

  List<BuiltStrategy> get builtStrategies => _builtStrategies;
  bool get loadingBuilder => _loadingBuilder;

  List<StrategyTemplate> get templates => _templates;
  bool get loadingTemplates => _loadingTemplates;

  BacktestJob? get backtestJob => _backtestJob;
  BacktestResult? get lastBacktest => _backtestJob?.result;
  bool get pollingBacktest => _pollingBacktest;

  // Backward-compatible aliases
  bool get loading => _loadingStrategies;
  String? get error => _strategiesError;

  List<SavedStrategy> byCategory(String cat) =>
      _strategies.where((s) => s.sentiment == cat).toList();

  StrategyProvider(this._repo) {
    fetchStrategies();
    fetchTemplates();
  }

  // ─── Saved Strategies ─────────────────────────────────────────────────────

  Future<void> fetchStrategies({String? search, String? sentiment}) async {
    _loadingStrategies = true;
    _strategiesError = null;
    notifyListeners();
    try {
      final page = await _repo.getStrategies(
          search: search, sentiment: sentiment);
      _strategies = page.strategies;
      _strategiesTotal = page.total;
    } catch (e) {
      _strategiesError = e.toString();
      _strategies = [];
    } finally {
      _loadingStrategies = false;
      notifyListeners();
    }
  }

  // Backward-compatible alias
  Future<void> fetch() => fetchStrategies();

  Future<SavedStrategy?> save(Map<String, dynamic> payload) async {
    try {
      final created = await _repo.createStrategy(payload);
      _strategies.insert(0, created);
      notifyListeners();
      return created;
    } catch (_) {
      return null;
    }
  }

  Future<SavedStrategy?> updateStrategy(
      String id, Map<String, dynamic> payload) async {
    try {
      final updated = await _repo.updateStrategy(id, payload);
      final idx = _strategies.indexWhere((s) => s.id == id);
      if (idx >= 0) _strategies[idx] = updated;
      notifyListeners();
      return updated;
    } catch (_) {
      return null;
    }
  }

  Future<void> delete(String strategyId) async {
    await _repo.deleteStrategy(strategyId);
    _strategies.removeWhere((s) => s.id == strategyId);
    notifyListeners();
  }

  Future<SavedStrategy?> duplicate(String strategyId) async {
    try {
      final copy = await _repo.duplicateStrategy(strategyId);
      _strategies.insert(0, copy);
      notifyListeners();
      return copy;
    } catch (_) {
      return null;
    }
  }

  // ─── Option Chain & Expiries ───────────────────────────────────────────────

  Future<void> loadExpiries(String underlying) async {
    _expiries = [];
    notifyListeners();
    try {
      _expiries = await _repo.getOptionExpiries(underlying);
    } catch (_) {}
    notifyListeners();
  }

  Future<void> loadOptionChain(String underlying, String expiry,
      {int strikes = 20}) async {
    _loadingChain = true;
    _chainError = null;
    notifyListeners();
    try {
      _currentChain = await _repo.getOptionChain(underlying, expiry,
          strikes: strikes);
    } catch (e) {
      _chainError = e.toString();
      _currentChain = null;
    } finally {
      _loadingChain = false;
      notifyListeners();
    }
  }

  // ─── IV Data ──────────────────────────────────────────────────────────────

  Future<void> loadIvData(String underlying, String expiry) async {
    _loadingIv = true;
    notifyListeners();
    try {
      _ivData = await _repo.getIvData(underlying, expiry);
    } catch (_) {
      _ivData = null;
    } finally {
      _loadingIv = false;
      notifyListeners();
    }
  }

  // ─── Greeks ───────────────────────────────────────────────────────────────

  Future<void> computeGreeks({
    required double spot,
    required double iv,
    required int dte,
    required List<StrategyLeg> legs,
    double riskFreeRate = 0.07,
  }) async {
    if (legs.isEmpty) return;
    _loadingGreeks = true;
    notifyListeners();
    try {
      _greeksResult = await _repo.computeGreeks(
        spot: spot,
        iv: iv,
        dte: dte,
        legs: legs,
        riskFreeRate: riskFreeRate,
      );
    } catch (_) {
      _greeksResult = null;
    } finally {
      _loadingGreeks = false;
      notifyListeners();
    }
  }

  // ─── Payoff ───────────────────────────────────────────────────────────────

  Future<void> loadPayoff({
    required double spot,
    required double iv,
    required int dte,
    required List<StrategyLeg> legs,
    double priceRangePct = 0.20,
    int points = 200,
  }) async {
    if (legs.isEmpty) return;
    _loadingPayoff = true;
    notifyListeners();
    try {
      _payoffData = await _repo.getPayoff(
        spot: spot,
        iv: iv,
        dte: dte,
        legs: legs,
        priceRangePct: priceRangePct,
        points: points,
      );
    } catch (_) {
      _payoffData = null;
    } finally {
      _loadingPayoff = false;
      notifyListeners();
    }
  }

  // ─── Auto-Builder ─────────────────────────────────────────────────────────

  Future<void> buildStrategies({
    required String underlying,
    required String sentiment,
    required String expiry,
    int maxLegs = 4,
    double? maxRiskCr,
    double? minPop,
    double? maxPremiumCr,
  }) async {
    _loadingBuilder = true;
    _builtStrategies = [];
    notifyListeners();
    try {
      _builtStrategies = await _repo.buildStrategy(
        underlying: underlying,
        sentiment: sentiment,
        expiry: expiry,
        maxLegs: maxLegs,
        maxRiskCr: maxRiskCr,
        minPop: minPop,
        maxPremiumCr: maxPremiumCr,
      );
    } catch (_) {
      _builtStrategies = [];
    } finally {
      _loadingBuilder = false;
      notifyListeners();
    }
  }

  // ─── Templates ────────────────────────────────────────────────────────────

  Future<void> fetchTemplates({String? sentiment}) async {
    _loadingTemplates = true;
    notifyListeners();
    try {
      _templates = await _repo.getTemplates(sentiment: sentiment);
    } catch (_) {
      _templates = [];
    } finally {
      _loadingTemplates = false;
      notifyListeners();
    }
  }

  Future<SavedStrategy?> applyTemplate(
    int templateId, {
    required String underlying,
    required String expiry,
    required double spot,
    required double iv,
  }) async {
    try {
      return await _repo.applyTemplate(
        templateId,
        underlying: underlying,
        expiry: expiry,
        spot: spot,
        iv: iv,
      );
    } catch (_) {
      return null;
    }
  }

  // ─── Backtesting ──────────────────────────────────────────────────────────

  Future<void> runBacktest({
    required String strategyId,
    required String periodFrom,
    required String periodTo,
    String entryDay = 'monday',
    int entryDte = 30,
    int exitDte = 5,
    int stopLossPct = 50,
    int targetPct = 75,
  }) async {
    _backtestJob = null;
    _pollingBacktest = true;
    notifyListeners();
    try {
      _backtestJob = await _repo.startBacktest(
        strategyId: strategyId,
        periodFrom: periodFrom,
        periodTo: periodTo,
        entryDay: entryDay,
        entryDte: entryDte,
        exitDte: exitDte,
        stopLossPct: stopLossPct,
        targetPct: targetPct,
      );
      if (_backtestJob!.isPending) {
        await _pollUntilComplete(_backtestJob!.jobId);
      }
    } catch (_) {
      _backtestJob = null;
    } finally {
      _pollingBacktest = false;
      notifyListeners();
    }
  }

  Future<void> _pollUntilComplete(String jobId) async {
    for (int i = 0; i < 60; i++) {
      await Future.delayed(const Duration(seconds: 3));
      try {
        final job = await _repo.pollBacktest(jobId);
        _backtestJob = job;
        notifyListeners();
        if (!job.isPending) break;
      } catch (_) {
        break;
      }
    }
  }
}
