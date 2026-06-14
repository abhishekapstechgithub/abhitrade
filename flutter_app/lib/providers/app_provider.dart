import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/constants.dart';
import '../models/models.dart';
import '../services/api_service.dart';

// ─── Theme Provider ────────────────────────────────────────────────────────────
class ThemeProvider extends ChangeNotifier {
  ThemeMode _mode = ThemeMode.dark;
  ThemeMode get mode => _mode;
  bool get isDark => _mode == ThemeMode.dark;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getString(AppConstants.keyThemeMode);
    _mode = saved == 'light' ? ThemeMode.light : ThemeMode.dark;
    notifyListeners();
  }

  Future<void> toggle() async {
    _mode = _mode == ThemeMode.dark ? ThemeMode.light : ThemeMode.dark;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
        AppConstants.keyThemeMode, _mode == ThemeMode.dark ? 'dark' : 'light');
    notifyListeners();
  }
}

// ─── Auth Provider ─────────────────────────────────────────────────────────────
class AuthProvider extends ChangeNotifier {
  AppUser? _user;
  String?  _accessToken;
  bool     _loading = false;

  AppUser? get user         => _user;
  String?  get token        => _accessToken;
  bool     get isLoggedIn   => _user != null && _accessToken != null;
  bool     get loading      => _loading;

  Future<void> init() async {
    final prefs     = await SharedPreferences.getInstance();
    final token     = prefs.getString(AppConstants.keyAccessToken);
    final userJson  = prefs.getString(AppConstants.keyUserJson);
    if (token != null && userJson != null) {
      _accessToken = token;
      _user = AppUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
      notifyListeners();
    }
  }

  Future<String?> login(String email, String password) async {
    _loading = true;
    notifyListeners();
    try {
      final res = await ApiService.instance.login(email, password);
      await _persist(res);
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (_) {
      return 'Network error. Check your connection.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<String?> register(String name, String email, String password) async {
    _loading = true;
    notifyListeners();
    try {
      final res = await ApiService.instance.register(name, email, password);
      await _persist(res);
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (_) {
      return 'Network error. Check your connection.';
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> _persist(Map<String, dynamic> res) async {
    final token   = res['accessToken']?.toString()
                 ?? res['access_token']?.toString()
                 ?? '';
    final userMap = res['user'] as Map<String, dynamic>? ?? {};
    _accessToken  = token;
    _user         = AppUser.fromJson(userMap);
    final prefs   = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.keyAccessToken, token);
    if (res['refreshToken'] != null) {
      await prefs.setString(
          AppConstants.keyRefreshToken, res['refreshToken'].toString());
    }
    await prefs.setString(AppConstants.keyUserJson, jsonEncode(userMap));
  }

  Future<void> logout() async {
    try { await ApiService.instance.logout(); } catch (_) {}
    _user        = null;
    _accessToken = null;
    final prefs  = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.keyAccessToken);
    await prefs.remove(AppConstants.keyRefreshToken);
    await prefs.remove(AppConstants.keyUserJson);
    notifyListeners();
  }
}

// ─── Trading Mode Provider ─────────────────────────────────────────────────────
class TradingModeProvider extends ChangeNotifier {
  bool   _isPaper      = false;
  double _paperBalance = AppConstants.paperBalance;
  final List<PaperOrder>      _paperOrders    = [];
  final Map<String, int>      _paperPositions = {};

  bool   get isPaper         => _isPaper;
  String get mode            => _isPaper ? 'paper' : 'live';
  double get paperBalance    => _paperBalance;
  List<PaperOrder>      get paperOrders    => List.unmodifiable(_paperOrders);
  Map<String, int>      get paperPositions => Map.unmodifiable(_paperPositions);

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    _isPaper    = prefs.getString(AppConstants.keyTradingMode) == 'paper';
    notifyListeners();
  }

  Future<void> toggle() async {
    _isPaper    = !_isPaper;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.keyTradingMode, mode);
    notifyListeners();
  }

  String placePaperOrder({
    required String    symbol,
    required OrderSide side,
    required int       quantity,
    required double    price,
  }) {
    final total = price * quantity;
    if (side == OrderSide.buy && total > _paperBalance) {
      return 'Insufficient paper balance';
    }
    final id = 'P${DateTime.now().millisecondsSinceEpoch}';
    _paperOrders.insert(0, PaperOrder(
      id: id, symbol: symbol, side: side,
      quantity: quantity, price: price, placedAt: DateTime.now(),
    ));
    if (side == OrderSide.buy) {
      _paperBalance -= total;
      _paperPositions[symbol] = (_paperPositions[symbol] ?? 0) + quantity;
    } else {
      _paperBalance += total;
      _paperPositions[symbol] = (_paperPositions[symbol] ?? 0) - quantity;
    }
    notifyListeners();
    return '';
  }

  void resetPaper() {
    _paperBalance = AppConstants.paperBalance;
    _paperOrders.clear();
    _paperPositions.clear();
    notifyListeners();
  }
}

// ─── Market Provider ─── index prices + top gainers/losers ────────────────────
class MarketProvider extends ChangeNotifier {
  List<IndexPrice>  _indices = [];
  List<GainerLoser> _gainers = [];
  List<GainerLoser> _losers  = [];
  bool    _loading = false;
  String? _error;

  List<IndexPrice>  get indices => _indices;
  List<GainerLoser> get gainers => _gainers;
  List<GainerLoser> get losers  => _losers;
  bool    get loading => _loading;
  String? get error   => _error;

  Future<void> fetch() async {
    _loading = true;
    _error   = null;
    notifyListeners();
    await Future.wait([_fetchIndices(), _fetchGainers(), _fetchLosers()]);
    _loading = false;
    notifyListeners();
  }

  Future<void> _fetchIndices() async {
    try {
      final res    = await ApiService.instance.getIndexPrices();
      final prices = res['prices'] as Map<String, dynamic>? ?? {};
      _indices = prices.entries
          .map((e) => IndexPrice.fromJson(e.key, e.value as Map<String, dynamic>))
          .toList();
      if (_indices.isEmpty) _indices = _mockIndices();
    } catch (_) {
      _indices = _mockIndices();
    }
  }

  Future<void> _fetchGainers() async {
    try {
      final res = await ApiService.instance.getGainers(limit: 10);
      final items = res['items'] as List<dynamic>? ?? [];
      _gainers = items
          .map((e) => GainerLoser.fromJson(e as Map<String, dynamic>))
          .where((g) => g.symbol.isNotEmpty)
          .toList();
      if (_gainers.isEmpty) _gainers = _mockGainers();
    } catch (_) {
      _gainers = _mockGainers();
    }
  }

  Future<void> _fetchLosers() async {
    try {
      final res   = await ApiService.instance.getLosers(limit: 10);
      final items = res['items'] as List<dynamic>? ?? [];
      _losers = items
          .map((e) => GainerLoser.fromJson(e as Map<String, dynamic>))
          .where((g) => g.symbol.isNotEmpty)
          .toList();
      if (_losers.isEmpty) _losers = _mockLosers();
    } catch (_) {
      _losers = _mockLosers();
    }
  }

  List<IndexPrice> _mockIndices() => const [
        IndexPrice(symbol: 'NIFTY 50',     ltp: 22957.10, change:  123.50, changePct:  0.54),
        IndexPrice(symbol: 'SENSEX',        ltp: 75410.39, change:  312.50, changePct:  0.42),
        IndexPrice(symbol: 'BANK NIFTY',    ltp: 49832.35, change:  456.75, changePct:  0.92),
        IndexPrice(symbol: 'NIFTY MID150',  ltp: 18432.60, change:  -45.30, changePct: -0.25),
      ];

  List<GainerLoser> _mockGainers() => [
        GainerLoser(symbol: 'RELIANCE',  tradingSymbol: 'RELIANCE',  companyName: 'Reliance Industries', companyShort: 'Reliance',   exchange: 'NSE', ltp: 2934.80, netChange:  68.25, percentChange:  2.35, volume: 5423100),
        GainerLoser(symbol: 'TCS',       tradingSymbol: 'TCS',       companyName: 'Tata Consultancy',    companyShort: 'TCS',        exchange: 'NSE', ltp: 4156.75, netChange:  77.50, percentChange:  1.89, volume: 1234500),
        GainerLoser(symbol: 'HDFCBANK',  tradingSymbol: 'HDFCBANK',  companyName: 'HDFC Bank',           companyShort: 'HDFC Bank',  exchange: 'NSE', ltp: 1678.40, netChange:  24.05, percentChange:  1.45, volume: 8765400),
        GainerLoser(symbol: 'INFY',      tradingSymbol: 'INFY',      companyName: 'Infosys',             companyShort: 'Infosys',    exchange: 'NSE', ltp: 1512.30, netChange:  18.40, percentChange:  1.23, volume: 2109800),
        GainerLoser(symbol: 'ICICIBANK', tradingSymbol: 'ICICIBANK', companyName: 'ICICI Bank',          companyShort: 'ICICI Bank', exchange: 'NSE', ltp: 1098.65, netChange:   9.65, percentChange:  0.99, volume: 6543200),
      ];

  List<GainerLoser> _mockLosers() => [
        GainerLoser(symbol: 'NESTLEIND', tradingSymbol: 'NESTLEIND', companyName: 'Nestle India',      companyShort: 'Nestle',    exchange: 'NSE', ltp: 2218.45, netChange:  -43.80, percentChange: -1.94, volume: 342100),
        GainerLoser(symbol: 'HINDUNILVR',tradingSymbol: 'HINDUNILVR',companyName: 'HUL',              companyShort: 'HUL',       exchange: 'NSE', ltp: 2340.60, netChange:  -32.15, percentChange: -1.35, volume: 876500),
        GainerLoser(symbol: 'BAJFINANCE',tradingSymbol: 'BAJFINANCE',companyName: 'Bajaj Finance',    companyShort: 'BajFinance',exchange: 'NSE', ltp: 6845.20, netChange:  -78.30, percentChange: -1.13, volume: 654300),
        GainerLoser(symbol: 'WIPRO',     tradingSymbol: 'WIPRO',     companyName: 'Wipro',            companyShort: 'Wipro',     exchange: 'NSE', ltp:  452.10, netChange:   -4.70, percentChange: -1.03, volume: 2198700),
      ];
}

// ─── Movers Provider ─── all 6 mover types with tab switching ─────────────────
class MoversProvider extends ChangeNotifier {
  String            _activeType = AppConstants.moverGainers;
  List<GainerLoser> _items      = [];
  bool              _loading    = false;
  String?           _fetchedAt;

  String            get activeType => _activeType;
  List<GainerLoser> get items      => _items;
  bool              get loading    => _loading;
  String?           get fetchedAt  => _fetchedAt;

  Future<void> fetchType(String type) async {
    _activeType = type;
    _loading    = true;
    notifyListeners();
    try {
      final res   = await ApiService.instance.getMarketMovers(type: type, limit: 50);
      final raw   = res['items'] as List<dynamic>? ?? [];
      _items      = raw
          .map((e) => GainerLoser.fromJson(e as Map<String, dynamic>))
          .where((g) => g.symbol.isNotEmpty)
          .toList();
      _fetchedAt  = res['fetchedAt'] as String?;
    } catch (_) {
      _items = [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<void> refresh() => fetchType(_activeType);
}

// ─── Search Provider ──────────────────────────────────────────────────────────
class SearchProvider extends ChangeNotifier {
  List<SearchResult> _results  = [];
  bool               _loading  = false;
  String             _query    = '';

  List<SearchResult> get results => _results;
  bool               get loading => _loading;
  String             get query   => _query;
  bool               get hasResults => _results.isNotEmpty;

  Future<void> search(String q) async {
    if (q.trim().isEmpty) {
      _results = [];
      _query   = '';
      notifyListeners();
      return;
    }
    _query   = q;
    _loading = true;
    notifyListeners();
    try {
      final res = await ApiService.instance.search(q, limit: 20);
      final raw = res['results'] as List<dynamic>? ?? [];
      _results  = raw
          .map((e) => SearchResult.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      _results = [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  void clear() {
    _results = [];
    _query   = '';
    notifyListeners();
  }
}

// ─── Option Chain Provider ────────────────────────────────────────────────────
class OptionChainProvider extends ChangeNotifier {
  String               _symbol   = 'NIFTY';
  List<OptionExpiry>   _expiries = [];
  String?              _activeExpiry;
  OptionChainData?     _chain;
  bool                 _loadingExpiries = false;
  bool                 _loadingChain    = false;
  String?              _error;
  int                  _strikeCount     = 20;

  String             get symbol          => _symbol;
  List<OptionExpiry> get expiries        => _expiries;
  String?            get activeExpiry    => _activeExpiry;
  OptionChainData?   get chain           => _chain;
  bool               get loadingExpiries => _loadingExpiries;
  bool               get loadingChain    => _loadingChain;
  String?            get error           => _error;
  int                get strikeCount     => _strikeCount;

  Future<void> loadExpiries(String symbol) async {
    _symbol          = symbol;
    _loadingExpiries = true;
    _error           = null;
    notifyListeners();
    try {
      final res = await ApiService.instance.getOptionExpiries(symbol);
      final raw = res['expiries'] as List<dynamic>? ?? [];
      _expiries = raw
          .map((e) => OptionExpiry.fromJson(e as Map<String, dynamic>))
          .toList();
      if (_expiries.isNotEmpty && _activeExpiry == null) {
        _activeExpiry = _expiries.first.date;
        await loadChain();
      }
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load expiries';
    } finally {
      _loadingExpiries = false;
      notifyListeners();
    }
  }

  Future<void> selectExpiry(String date) async {
    _activeExpiry = date;
    await loadChain();
  }

  Future<void> loadChain() async {
    if (_activeExpiry == null) return;
    _loadingChain = true;
    _error        = null;
    notifyListeners();
    try {
      final res = await ApiService.instance.getOptionChain(
        symbol:      _symbol,
        expiry:      _activeExpiry!,
        strikeCount: _strikeCount,
      );
      _chain = OptionChainData.fromJson(res);
    } on ApiException catch (e) {
      _error = e.message;
    } catch (_) {
      _error = 'Failed to load option chain';
    } finally {
      _loadingChain = false;
      notifyListeners();
    }
  }

  void setStrikeCount(int count) {
    _strikeCount = count;
    loadChain();
  }
}

// ─── Portfolio Provider ────────────────────────────────────────────────────────
class PortfolioProvider extends ChangeNotifier {
  List<Holding> _holdings = [];
  bool    _loading = false;
  String? _error;

  List<Holding> get holdings    => _holdings;
  bool    get loading            => _loading;
  String? get error              => _error;

  double get totalInvested => _holdings.fold(0.0, (s, h) => s + h.investedValue);
  double get totalCurrent  => _holdings.fold(0.0, (s, h) => s + h.currentValue);
  double get totalPnl      => totalCurrent - totalInvested;
  double get totalPnlPct   => totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  double get todayPnl {
    final rng = Random(DateTime.now().day);
    return totalCurrent * (rng.nextDouble() * 0.02 - 0.01);
  }

  Future<void> fetch(String mode) async {
    _loading = true;
    _error   = null;
    notifyListeners();
    try {
      final res  = await ApiService.instance.getHoldings(mode: mode);
      final raw  = res['holdings'] as List<dynamic>? ?? [];
      _holdings  = raw
          .map((e) => Holding.fromJson(e as Map<String, dynamic>))
          .toList();
      if (_holdings.isEmpty) _holdings = _mockHoldings();
    } catch (_) {
      _holdings = _mockHoldings();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  List<Holding> _mockHoldings() => [
        Holding(symbol: 'RELIANCE',  company: 'Reliance Industries', exchange: 'NSE', quantity: 10, avgPrice: 2650.00, ltp: 2934.80, currentValue: 29348.0,  investedValue: 26500.0, pnl: 2848.0,   pnlPct: 10.75, sector: 'Energy'),
        Holding(symbol: 'TCS',       company: 'Tata Consultancy',    exchange: 'NSE', quantity:  5, avgPrice: 3820.00, ltp: 4156.75, currentValue: 20783.75, investedValue: 19100.0, pnl: 1683.75,  pnlPct:  8.82, sector: 'IT'),
        Holding(symbol: 'HDFCBANK',  company: 'HDFC Bank',           exchange: 'NSE', quantity: 20, avgPrice: 1520.00, ltp: 1678.40, currentValue: 33568.0,  investedValue: 30400.0, pnl: 3168.0,   pnlPct: 10.42, sector: 'Finance'),
        Holding(symbol: 'INFY',      company: 'Infosys',             exchange: 'NSE', quantity: 15, avgPrice: 1380.00, ltp: 1512.30, currentValue: 22684.5,  investedValue: 20700.0, pnl: 1984.5,   pnlPct:  9.59, sector: 'IT'),
        Holding(symbol: 'ICICIBANK', company: 'ICICI Bank',          exchange: 'NSE', quantity: 25, avgPrice: 980.00,  ltp: 1098.65, currentValue: 27466.25, investedValue: 24500.0, pnl: 2966.25,  pnlPct: 12.11, sector: 'Finance'),
        Holding(symbol: 'SBIN',      company: 'State Bank of India', exchange: 'NSE', quantity: 30, avgPrice: 740.00,  ltp:  812.45, currentValue: 24373.5,  investedValue: 22200.0, pnl: 2173.5,   pnlPct:  9.79, sector: 'Finance'),
      ];
}

// ─── Positions Provider ───────────────────────────────────────────────────────
class PositionsProvider extends ChangeNotifier {
  List<Position> _positions = [];
  bool    _loading = false;
  String? _error;

  List<Position> get positions    => _positions;
  bool    get loading              => _loading;
  String? get error                => _error;

  List<Position> get openPositions   => _positions.where((p) => p.netQty != 0).toList();
  List<Position> get closedPositions => _positions.where((p) => p.netQty == 0).toList();

  double get totalPnl       => _positions.fold(0.0, (s, p) => s + p.pnl);
  double get unrealisedPnl  => _positions.fold(0.0, (s, p) => s + p.unrealisedPnl);
  double get realisedPnl    => _positions.fold(0.0, (s, p) => s + p.realisedPnl);

  Future<void> fetch(String mode) async {
    _loading = true;
    _error   = null;
    notifyListeners();
    try {
      final res = await ApiService.instance.getPositions(mode: mode);
      final raw = res['positions'] as List<dynamic>? ?? [];
      _positions = raw
          .map((e) => Position.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (_) {
      _positions = [];
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}

// ─── Watchlist Provider ────────────────────────────────────────────────────────
class WatchlistProvider extends ChangeNotifier {
  List<Watchlist> _watchlists  = [];
  int             _activeIndex = 0;
  bool            _loading     = false;

  List<Watchlist> get watchlists  => _watchlists;
  Watchlist?      get active      =>
      _watchlists.isNotEmpty ? _watchlists[_activeIndex] : null;
  int             get activeIndex => _activeIndex;
  bool            get loading     => _loading;

  void setActive(int index) {
    _activeIndex = index;
    notifyListeners();
  }

  Future<void> fetch() async {
    _loading = true;
    notifyListeners();
    try {
      final res = await ApiService.instance.getWatchlists();
      final raw = res['watchlists'] as List<dynamic>? ?? [];
      _watchlists = raw
          .map((e) => Watchlist.fromJson(e as Map<String, dynamic>))
          .toList();
      if (_watchlists.isEmpty) _watchlists = _mockWatchlists();
    } catch (_) {
      _watchlists = _mockWatchlists();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  List<Watchlist> _mockWatchlists() => [
        Watchlist(id: '1', name: 'My Stocks', items: [
          WatchlistItem(id: '1', symbol: 'RELIANCE',  company: 'Reliance Industries', exchange: 'NSE', ltp: 2934.80, change:  68.25, changePct:  2.35, high: 2951.0, low: 2880.0, open: 2890.0, prevClose: 2866.55, volume: 5423100),
          WatchlistItem(id: '2', symbol: 'TCS',        company: 'Tata Consultancy',    exchange: 'NSE', ltp: 4156.75, change:  77.50, changePct:  1.89, high: 4175.0, low: 4090.0, open: 4100.0, prevClose: 4079.25, volume: 1234500),
          WatchlistItem(id: '3', symbol: 'HDFCBANK',   company: 'HDFC Bank',           exchange: 'NSE', ltp: 1678.40, change:  24.05, changePct:  1.45, high: 1690.0, low: 1655.0, open: 1660.0, prevClose: 1654.35, volume: 8765400),
          WatchlistItem(id: '4', symbol: 'INFY',        company: 'Infosys',             exchange: 'NSE', ltp: 1512.30, change:  18.40, changePct:  1.23, high: 1520.0, low: 1490.0, open: 1495.0, prevClose: 1493.90, volume: 2109800),
          WatchlistItem(id: '5', symbol: 'ICICIBANK',   company: 'ICICI Bank',          exchange: 'NSE', ltp: 1098.65, change:   9.65, changePct:  0.99, high: 1105.0, low: 1082.0, open: 1090.0, prevClose: 1089.00, volume: 6543200),
          WatchlistItem(id: '6', symbol: 'SBIN',         company: 'State Bank',          exchange: 'NSE', ltp:  812.45, change:   6.15, changePct:  0.76, high:  819.0, low:  800.0, open:  804.0, prevClose:  806.30, volume: 9876500),
          WatchlistItem(id: '7', symbol: 'ITC',           company: 'ITC Ltd',             exchange: 'NSE', ltp:  443.25, change:   2.80, changePct:  0.64, high:  448.0, low:  437.0, open:  440.0, prevClose:  440.45, volume: 7654300),
        ]),
        Watchlist(id: '2', name: 'Indices', items: [
          WatchlistItem(id: '8',  symbol: 'NIFTY 50',   company: 'NSE Index', exchange: 'NSE', ltp: 22957.10, change: 123.50, changePct: 0.54, high: 23010.0, low: 22800.0, open: 22850.0, prevClose: 22833.60, volume: 0),
          WatchlistItem(id: '9',  symbol: 'BANK NIFTY', company: 'NSE Index', exchange: 'NSE', ltp: 49832.35, change: 456.75, changePct: 0.92, high: 49900.0, low: 49200.0, open: 49380.0, prevClose: 49375.60, volume: 0),
          WatchlistItem(id: '10', symbol: 'SENSEX',      company: 'BSE Index', exchange: 'BSE', ltp: 75410.39, change: 312.50, changePct: 0.42, high: 75600.0, low: 75000.0, open: 75100.0, prevClose: 75097.89, volume: 0),
        ]),
        Watchlist(id: '3', name: 'F&O', items: [
          WatchlistItem(id: '11', symbol: 'NIFTY25JUN23000CE',     company: 'NIFTY Jun CE',       exchange: 'NSE', ltp:  245.50, change:  12.30, changePct:  5.27, high: 260.0, low: 220.0, open: 225.0, prevClose: 233.20, volume: 876543),
          WatchlistItem(id: '12', symbol: 'BANKNIFTY25JUN50000PE', company: 'BANKNIFTY Jun PE',   exchange: 'NSE', ltp:  187.25, change: -15.75, changePct: -7.75, high: 210.0, low: 180.0, open: 205.0, prevClose: 203.00, volume: 543210),
        ]),
      ];
}

// ─── Orders Provider ──────────────────────────────────────────────────────────
class OrdersProvider extends ChangeNotifier {
  List<Order> _orders  = [];
  bool    _loading     = false;
  String? _error;
  bool    _placing     = false;

  List<Order> get orders         => _orders;
  List<Order> get activeOrders   => _orders.where((o) => o.isActive).toList();
  List<Order> get completedOrders =>
      _orders.where((o) => o.status == OrderStatus.complete).toList();
  bool    get loading   => _loading;
  bool    get placing   => _placing;
  String? get error     => _error;

  Future<void> fetch(String mode) async {
    _loading = true;
    _error   = null;
    notifyListeners();
    try {
      final res = await ApiService.instance.getOrders(limit: 50, mode: mode);
      final raw = res['orders'] as List<dynamic>? ?? [];
      _orders   = raw
          .map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList();
      if (_orders.isEmpty) _orders = _mockOrders(mode);
    } catch (_) {
      _orders = _mockOrders(mode);
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<String?> placeOrder({
    required String symbol,
    required String exchange,
    required String transactionType,
    required String orderType,
    required String productType,
    required int    quantity,
    double?  price,
    double?  triggerPrice,
    required String mode,
  }) async {
    _placing = true;
    notifyListeners();
    try {
      await ApiService.instance.placeOrder(
        symbol:          symbol,
        exchange:        exchange,
        transactionType: transactionType,
        orderType:       orderType,
        productType:     productType,
        quantity:        quantity,
        price:           price,
        triggerPrice:    triggerPrice,
        mode:            mode,
      );
      await fetch(mode);
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (_) {
      return 'Failed to place order';
    } finally {
      _placing = false;
      notifyListeners();
    }
  }

  Future<bool> cancelOrder(String orderId, String mode) async {
    try {
      await ApiService.instance.cancelOrder(orderId, mode);
      _orders.removeWhere((o) => o.id == orderId);
      notifyListeners();
      return true;
    } catch (_) {
      return false;
    }
  }

  List<Order> _mockOrders(String mode) => [
        Order(id: '1', symbol: 'RELIANCE',  exchange: 'NSE', side: OrderSide.buy,  status: OrderStatus.open,     orderType: OrderType.limit,  productType: ProductType.cnc, quantity: 10, filledQty: 0,  price: 2930.00, avgPrice: 0,       placedAt: DateTime.now().subtract(const Duration(minutes:  5)), isPaper: mode == 'paper'),
        Order(id: '2', symbol: 'TCS',       exchange: 'NSE', side: OrderSide.sell, status: OrderStatus.open,     orderType: OrderType.limit,  productType: ProductType.cnc, quantity:  5, filledQty: 0,  price: 4160.00, avgPrice: 0,       placedAt: DateTime.now().subtract(const Duration(minutes: 12)), isPaper: mode == 'paper'),
        Order(id: '3', symbol: 'HDFCBANK',  exchange: 'NSE', side: OrderSide.buy,  status: OrderStatus.open,     orderType: OrderType.limit,  productType: ProductType.cnc, quantity: 20, filledQty: 0,  price: 1670.00, avgPrice: 0,       placedAt: DateTime.now().subtract(const Duration(minutes: 20)), isPaper: mode == 'paper'),
        Order(id: '4', symbol: 'INFY',      exchange: 'NSE', side: OrderSide.buy,  status: OrderStatus.complete, orderType: OrderType.market, productType: ProductType.mis, quantity: 15, filledQty: 15, price: 0,       avgPrice: 1508.40, placedAt: DateTime.now().subtract(const Duration(hours:    2)), isPaper: mode == 'paper'),
        Order(id: '5', symbol: 'ICICIBANK', exchange: 'NSE', side: OrderSide.sell, status: OrderStatus.complete, orderType: OrderType.limit,  productType: ProductType.cnc, quantity: 25, filledQty: 25, price: 1095.00, avgPrice: 1098.20, placedAt: DateTime.now().subtract(const Duration(hours:    3)), isPaper: mode == 'paper'),
      ];
}
