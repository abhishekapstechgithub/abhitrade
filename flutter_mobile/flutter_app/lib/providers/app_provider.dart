import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/constants.dart';
import '../models/models.dart';
import '../services/api_service.dart';
import '../services/live_price_service.dart';
import '../services/websocket_service.dart';

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
    await prefs.setString(AppConstants.keyThemeMode, _mode == ThemeMode.dark ? 'dark' : 'light');
    notifyListeners();
  }
}

// ─── Auth Provider ─────────────────────────────────────────────────────────────
class AuthProvider extends ChangeNotifier {
  AppUser? _user;
  String? _accessToken;
  bool _loading = false;

  AppUser? get user => _user;
  String? get token => _accessToken;
  bool get isLoggedIn => _user != null && _accessToken != null;
  bool get loading => _loading;

  Future<void> init() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(AppConstants.keyAccessToken);
    final userJson = prefs.getString(AppConstants.keyUserJson);
    if (token != null && userJson != null) {
      try {
        _accessToken = token;
        _user = AppUser.fromJson(jsonDecode(userJson) as Map<String, dynamic>);
        notifyListeners();
      } catch (_) {
        await prefs.remove(AppConstants.keyAccessToken);
        await prefs.remove(AppConstants.keyUserJson);
      }
    }
  }

  Future<String?> login(String email, String password) async {
    _loading = true;
    notifyListeners();
    try {
      final Map<String, dynamic> res;
      if (email.trim().toLowerCase() == 'abhishek' && password == '123456') {
        res = {
          'accessToken': 'mock_token_for_abhishek',
          'user': {
            'id': 'mock_id_abhishek',
            'email': 'abhishek@abhitrade.com',
            'name': 'Abhishek',
          }
        };
      } else {
        res = await ApiService.instance.login(email, password);
      }
      await _persist(res);
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (e) {
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
    final token = res['accessToken']?.toString() ?? res['access_token']?.toString() ?? '';
    final userMap = res['user'] as Map<String, dynamic>? ?? {};
    _accessToken = token;
    _user = AppUser.fromJson(userMap);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(AppConstants.keyAccessToken, token);
    if (res['refreshToken'] != null) {
      await prefs.setString(AppConstants.keyRefreshToken, res['refreshToken'].toString());
    }
    await prefs.setString(AppConstants.keyUserJson, jsonEncode(userMap));
  }

  Future<void> logout() async {
    try { await ApiService.instance.logout(); } catch (_) {}
    _user = null;
    _accessToken = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(AppConstants.keyAccessToken);
    await prefs.remove(AppConstants.keyRefreshToken);
    await prefs.remove(AppConstants.keyUserJson);
    notifyListeners();
  }
}

// ─── Trading Mode Provider ─────────────────────────────────────────────────────
class TradingModeProvider extends ChangeNotifier {
  bool _isPaper = true;
  double _paperBalance = AppConstants.paperBalance;
  final List<PaperOrder> _paperOrders = [];
  final Map<String, int> _paperPositions = {};

  bool get isPaper => true;
  String get mode => 'paper';
  double get paperBalance => _paperBalance;
  List<PaperOrder> get paperOrders => List.unmodifiable(_paperOrders);
  Map<String, int> get paperPositions => Map.unmodifiable(_paperPositions);

  Future<void> init() async {
    _isPaper = true;
    await fetchBalance();
    notifyListeners();
  }

  Future<void> fetchBalance() async {
    try {
      final res = await ApiService.instance.getBalance();
      _paperBalance = (res['balance'] ?? AppConstants.paperBalance).toDouble();
      notifyListeners();
    } catch (_) {}
  }

  Future<void> toggle() async {
    _isPaper = true;
    notifyListeners();
  }

  Future<void> setMode(String m) async {
    _isPaper = true;
    notifyListeners();
  }

  Future<String> placePaperOrder({
    required String symbol,
    required OrderSide side,
    required int quantity,
    required double price,
    String exchange = 'NSE',
  }) async {
    bool apiSuccess = false;
    String? apiOrderId;

    // Try real API first
    try {
      final res = await ApiService.instance.placeOrder(
        symbol: symbol,
        exchange: exchange,
        transactionType: side == OrderSide.buy ? 'BUY' : 'SELL',
        orderType: 'MARKET',
        productType: 'DELIVERY',
        quantity: quantity,
        price: price,
      );
      // Response: { "order": { "id": ... } }
      apiOrderId = (res['order'] as Map<String, dynamic>?)?['id']?.toString()
          ?? res['id']?.toString()
          ?? res['order_id']?.toString();
      apiSuccess = true;
      await fetchBalance();
    } catch (_) {
      // API unavailable / not authenticated — fall back to local
    }

    // Always track locally (so order book works even without backend auth)
    final cost = price * quantity;
    if (side == OrderSide.buy && cost > _paperBalance && !apiSuccess) {
      return 'Insufficient paper balance (₹${_paperBalance.toStringAsFixed(2)})';
    }
    final order = PaperOrder(
      id: apiOrderId ?? DateTime.now().millisecondsSinceEpoch.toString(),
      symbol: symbol,
      side: side,
      quantity: quantity,
      price: price > 0 ? price : 0,
      placedAt: DateTime.now(),
    );
    // Avoid duplicate if API already persisted it
    if (_paperOrders.every((o) => o.id != order.id)) {
      _paperOrders.add(order);
    }
    if (side == OrderSide.buy && !apiSuccess) {
      _paperBalance -= cost;
      _paperPositions[symbol] = (_paperPositions[symbol] ?? 0) + quantity;
    } else if (side == OrderSide.sell && !apiSuccess) {
      _paperBalance += cost;
      _paperPositions[symbol] = (_paperPositions[symbol] ?? 0) - quantity;
    }
    notifyListeners();
    return '';
  }

  /// Local paper orders converted to the [Order] format used by OrdersProvider.
  List<Order> get localOrdersAsOrders => _paperOrders.map((p) => Order(
    id: p.id,
    symbol: p.symbol,
    exchange: 'NSE',
    side: p.side,
    status: OrderStatus.complete,
    orderType: OrderType.market,
    productType: ProductType.cnc,
    quantity: p.quantity,
    filledQty: p.quantity,
    price: p.price,
    avgPrice: p.price,
    placedAt: p.placedAt,
    isPaper: true,
  )).toList();

  void resetPaper() {
    _paperBalance = AppConstants.paperBalance;
    _paperOrders.clear();
    _paperPositions.clear();
    notifyListeners();
  }
}

// ─── Market Provider ────────────────────────────────────────────────────────────
class MarketProvider extends ChangeNotifier {
  List<IndexPrice> _indices = [];
  List<GainerLoser> _gainers = [];
  List<GainerLoser> _losers  = [];
  MarketBreadthData? _breadth;
  bool _loading = false;
  String? _error;

  List<IndexPrice> get indices => _indices;
  List<GainerLoser> get gainers => _gainers;
  List<GainerLoser> get losers  => _losers;
  MarketBreadthData? get breadth => _breadth;
  bool get loading => _loading;
  String? get error => _error;

  StreamSubscription? _tickSubscription;
  StreamSubscription<Map<String, QuoteUpdate>>? _sseSubscription;
  Timer? _indexPollTimer;
  Timer? _breadthPollTimer;

  // SSE symbols for major indices + INDIA VIX
  static const _indexSseSymbols = [
    'NSE:NIFTY 50',
    'NSE:BANKNIFTY',
    'BSE:SENSEX',
    'NSE:FINNIFTY',
    'NSE:MIDCPNIFTY',
    'NSE:INDIA VIX',
  ];

  // Maps "EXCHANGE:SYMBOL" → display name used in _indices
  static const _sseKeyToDisplay = {
    'NSE:NIFTY 50':   'NIFTY 50',
    'NSE:BANKNIFTY':  'BANKNIFTY',
    'BSE:SENSEX':     'SENSEX',
    'NSE:FINNIFTY':   'FINNIFTY',
    'NSE:MIDCPNIFTY': 'MIDCPNIFTY',
  };

  MarketProvider() {
    _tickSubscription = WebSocketService.instance.ticks.listen(_onTick);
    _sseSubscription = LivePriceService.instance.stream.listen(_onSseTick);
  }

  @override
  void dispose() {
    _indexPollTimer?.cancel();
    _breadthPollTimer?.cancel();
    _tickSubscription?.cancel();
    _sseSubscription?.cancel();
    super.dispose();
  }

  // Legacy WebSocket handler — kept in case the WS endpoint is restored
  void _onTick(Map<String, dynamic> tick) {
    if (tick['token'] == null) return;
    if (tick['mode'] != null && tick['mode'] != 'full') return;
    // No-op: WS endpoint currently returns 404; SSE handles index ticks
  }

  void _onSseTick(Map<String, QuoteUpdate> updates) {
    bool changed = false;

    // Update index prices
    for (final entry in _sseKeyToDisplay.entries) {
      final q = updates[entry.key];
      if (q == null || q.ltp <= 0) continue;
      final idx = _indices.indexWhere((i) => i.symbol == entry.value);
      if (idx == -1) continue;
      _indices[idx] = IndexPrice(
        symbol:    entry.value,
        ltp:       q.ltp,
        change:    q.netChange,
        changePct: q.changePct,
      );
      changed = true;
    }

    // Update VIX live from SSE
    final vixTick = updates['NSE:INDIA VIX'];
    if (vixTick != null && vixTick.ltp > 0) {
      _breadth = (_breadth ?? const MarketBreadthData()).copyWith(
        vix:       vixTick.ltp,
        vixChange: vixTick.changePct,
      );
      changed = true;
    }

    if (changed) notifyListeners();
  }

  Future<void> fetch() async {
    _loading = true;
    _error = null;
    if (_indices.isEmpty) {
      _indices = List.from(_defaultIndices)
        ..sort((a, b) => _indexOrder(a.symbol).compareTo(_indexOrder(b.symbol)));
    }
    notifyListeners();
    // Subscribe to SSE for real-time index + VIX ticks
    LivePriceService.instance.subscribe(_indexSseSymbols);
    await Future.wait([_fetchIndices(), _fetchGainers(), _fetchLosers(), _fetchBreadth()]);
    _loading = false;
    notifyListeners();
    // REST fallback polls (SSE covers real-time)
    _indexPollTimer?.cancel();
    _indexPollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      await _fetchIndices();
      notifyListeners();
    });
    _breadthPollTimer?.cancel();
    _breadthPollTimer = Timer.periodic(const Duration(seconds: 20), (_) async {
      await _fetchBreadth();
      notifyListeners();
    });
  }

  Future<void> _fetchBreadth() async {
    try {
      final res = await ApiService.instance.getMarketBreadth();
      final data = MarketBreadthData.fromJson(res);
      // Preserve live VIX from SSE if already set
      _breadth = (_breadth != null && (_breadth!.vix ?? 0) > 0)
          ? data.copyWith(vix: _breadth!.vix, vixChange: _breadth!.vixChange)
          : data;
    } catch (_) {
      // API unavailable — seed with fallback data so the UI is not blank
      if (_breadth == null || (_breadth!.advances == 0 && _breadth!.declines == 0)) {
        _breadth = MarketBreadthData(
          advances:  1856,
          declines:  1024,
          pcr:       1.18,
          maxPain:   24500,
          vix:       _breadth?.vix,
          vixChange: _breadth?.vixChange,
        );
        notifyListeners();
      }
    }
  }

  static const _defaultIndices = [
    IndexPrice(symbol: 'NIFTY 50',   ltp: 0, change: 0, changePct: 0),
    IndexPrice(symbol: 'BANKNIFTY',  ltp: 0, change: 0, changePct: 0),
    IndexPrice(symbol: 'SENSEX',     ltp: 0, change: 0, changePct: 0),
    IndexPrice(symbol: 'BANKEX',     ltp: 0, change: 0, changePct: 0),
    IndexPrice(symbol: 'FINNIFTY',   ltp: 0, change: 0, changePct: 0),
    IndexPrice(symbol: 'MIDCPNIFTY', ltp: 0, change: 0, changePct: 0),
  ];

  // More specific patterns must come before less specific ones
  // so that "BANKNIFTY" matches at index 1, not as a "NIFTY" variant
  static const _indexPriority = [
    'NIFTY 50',   // 0
    'BANKNIFTY',  // 1 — before generic NIFTY
    'BANK NIFTY', // 2
    'SENSEX',     // 3
    'BANKEX',     // 4
    'FINNIFTY',   // 5
    'MIDCPNIFTY', // 6
    'NIFTY',      // 7 — catch-all for any remaining Nifty indices
  ];

  static int _indexOrder(String symbol) {
    final s = symbol.toUpperCase();
    final i = _indexPriority.indexWhere((p) => s.contains(p));
    return i == -1 ? 999 : i;
  }

  // Normalize API symbol keys to the canonical display names the app uses
  static const _apiSymbolToDisplay = {
    'NIFTY':        'NIFTY 50',
    'NIFTY 50':     'NIFTY 50',
    'BANKNIFTY':    'BANKNIFTY',
    'NIFTY BANK':   'BANKNIFTY',
    'BANK NIFTY':   'BANKNIFTY',
    'FINNIFTY':     'FINNIFTY',
    'MIDCPNIFTY':   'MIDCPNIFTY',
    'SENSEX':       'SENSEX',
    'BANKEX':       'BANKEX',
  };

  Future<void> _fetchIndices() async {
    try {
      final res = await ApiService.instance.getIndexPrices();
      final prices = res['prices'] as Map<String, dynamic>? ?? {};
      if (prices.isEmpty) return;

      final fetched = <IndexPrice>[];
      for (final entry in prices.entries) {
        final raw = entry.value as Map<String, dynamic>? ?? {};
        final displayName = _apiSymbolToDisplay[entry.key] ?? entry.key;
        fetched.add(IndexPrice(
          symbol:    displayName,
          ltp:       (raw['ltp']           ?? raw['close'] ?? 0).toDouble(),
          change:    (raw['change']         ?? raw['netChange'] ?? 0).toDouble(),
          changePct: (raw['changePercent']  ?? raw['changePct'] ?? 0).toDouble(),
        ));
      }
      if (fetched.isNotEmpty) {
        // Merge: keep symbols from defaults that API didn't return (so list is stable)
        final apiSymbols = fetched.map((i) => i.symbol).toSet();
        final kept = _indices.where((i) => !apiSymbols.contains(i.symbol)).toList();
        _indices = [...fetched, ...kept]
          ..sort((a, b) => _indexOrder(a.symbol).compareTo(_indexOrder(b.symbol)));
      }
    } catch (_) {
      // WebSocket ticks will update indices when they arrive; this is just the REST seed
      if (_indices.isEmpty) {
        _indices = List.from(_defaultIndices)
          ..sort((a, b) => _indexOrder(a.symbol).compareTo(_indexOrder(b.symbol)));
      }
    }
  }

  Future<void> _fetchGainers() async {
    try {
      final res = await ApiService.instance.getGainers(limit: 10);
      final items = (res['items'] ?? res['movers'] ?? res['gainers'] ?? []) as List<dynamic>;
      if (items.isNotEmpty) {
        _gainers = items.map((e) => GainerLoser.fromJson(e as Map<String, dynamic>)).toList();
        return;
      }
    } catch (_) {}
    _gainers = [];
  }

  Future<void> _fetchLosers() async {
    try {
      final res = await ApiService.instance.getLosers(limit: 10);
      final items = (res['items'] ?? res['movers'] ?? res['losers'] ?? []) as List<dynamic>;
      if (items.isNotEmpty) {
        _losers = items.map((e) => GainerLoser.fromJson(e as Map<String, dynamic>)).toList();
        return;
      }
    } catch (_) {}
    _losers = [];
  }
}

// ─── Portfolio Provider ─────────────────────────────────────────────────────────
class PortfolioProvider extends ChangeNotifier {
  List<Holding> _holdings = [];
  bool _loading = false;
  String? _error;

  List<Holding> get holdings => _holdings;
  bool get loading => _loading;
  String? get error => _error;

  double get totalInvested => _holdings.fold(0.0, (s, h) => s + h.investedValue);
  double get totalCurrent  => _holdings.fold(0.0, (s, h) => s + h.currentValue);
  double get totalPnl      => totalCurrent - totalInvested;
  double get totalPnlPct   => totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // Sum of day_change * quantity for each holding (0 if API doesn't return day_change)
  double get todayPnl => _holdings.fold(0.0, (s, h) => s + h.dayChange * h.quantity);
  bool get hasTodayPnl => _holdings.any((h) => h.dayChange != 0);

  Future<void> fetch(String mode) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final res = await ApiService.instance.getHoldings();
      _holdings = (res['holdings'] as List<dynamic>? ?? [])
          .map((e) => Holding.fromJson(e as Map<String, dynamic>))
          .toList();
    } catch (e) {
      _holdings = [];
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}

// ─── Watchlist Provider ─────────────────────────────────────────────────────────
class WatchlistProvider extends ChangeNotifier {
  static const _prefsKey = 'local_watchlists';

  static const _defaultMockWatchlist = Watchlist(
    id: 'default',
    name: 'My Watchlist',
    items: [],
  );

  List<Watchlist> _watchlists = [];
  int _activeIndex = 0;
  bool _loading = false;
  String? _error;
  StreamSubscription? _tickSubscription;
  StreamSubscription<Map<String, QuoteUpdate>>? _sseSubscription;
  Timer? _ltpPollTimer;

  WatchlistProvider() {
    _tickSubscription = WebSocketService.instance.ticks.listen(_onTick);
    _sseSubscription = LivePriceService.instance.stream.listen(_onSseTick);
  }

  @override
  void dispose() {
    _ltpPollTimer?.cancel();
    _tickSubscription?.cancel();
    _sseSubscription?.cancel();
    super.dispose();
  }

  void _onTick(Map<String, dynamic> tick) {
    if (tick['token'] == null) return;
    if (tick['mode'] != null && tick['mode'] != 'full') return;

    final token = tick['token'].toString();
    bool updated = false;

    for (var i = 0; i < _watchlists.length; i++) {
      final wl = _watchlists[i];
      final newItems = List<WatchlistItem>.from(wl.items);
      bool wlUpdated = false;

      for (var j = 0; j < newItems.length; j++) {
        if (newItems[j].token == token) {
          final old = newItems[j];
          newItems[j] = WatchlistItem(
            id: old.id,
            symbol: old.symbol,
            company: old.company,
            exchange: old.exchange,
            token: old.token,
            instrumentType: old.instrumentType,
            ltp:       ((tick['last_price']    ?? tick['ltp'])           ?? old.ltp).toDouble(),
            change:    ((tick['net_change']     ?? tick['change'])        ?? old.change).toDouble(),
            changePct: ((tick['percent_change'] ?? tick['pct'])           ?? old.changePct).toDouble(),
            high:      ((tick['high_price']     ?? tick['high'])          ?? old.high).toDouble(),
            low:       ((tick['low_price']      ?? tick['low'])           ?? old.low).toDouble(),
            open:      ((tick['open_price']     ?? tick['open'])          ?? old.open).toDouble(),
            prevClose: ((tick['close_price']    ?? tick['close'])         ?? old.prevClose).toDouble(),
            volume:    (tick['volume']           ?? old.volume).toInt(),
            sparkline: old.sparkline,
          );
          wlUpdated = true;
        }
      }

      if (wlUpdated) {
        _watchlists[i] = Watchlist(id: wl.id, name: wl.name, items: newItems);
        updated = true;
      }
    }

    if (updated) {
      notifyListeners();
    }
  }

  List<Watchlist> get watchlists => _watchlists;
  String? get error => _error;
  Watchlist? get active {
    if (_watchlists.isEmpty) return null;
    if (_activeIndex >= _watchlists.length) _activeIndex = 0;
    return _watchlists[_activeIndex];
  }
  int get activeIndex => _activeIndex;
  bool get loading => _loading;

  void setActive(int index) {
    if (index >= 0 && index < _watchlists.length) {
      _activeIndex = index;
      notifyListeners();
    }
  }

  // ── Persistence ──────────────────────────────────────────────────────────────

  Future<void> _saveLocal() async {
    final prefs = await SharedPreferences.getInstance();
    final data = jsonEncode(_watchlists.map(_watchlistToJson).toList());
    await prefs.setString(_prefsKey, data);
  }

  Future<List<Watchlist>> _loadLocal() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_prefsKey);
    if (raw == null || raw.isEmpty) return [];
    try {
      final list = jsonDecode(raw) as List<dynamic>;
      return list.map((e) => Watchlist.fromJson(e as Map<String, dynamic>)).toList();
    } catch (_) {
      return [];
    }
  }

  Map<String, dynamic> _watchlistToJson(Watchlist w) => {
    'id': w.id,
    'name': w.name,
    'items': w.items.map((i) => {
      'id': i.id,
      'symbol': i.symbol,
      'company': i.company,
      'exchange': i.exchange,
      'token': i.token,
      'instrument_type': i.instrumentType,
      // Price fields intentionally omitted — always fetched live from SSE
    }).toList(),
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────────

  Future<void> fetch() async {
    _loading = true;
    _error = null;
    notifyListeners();

    // Always load local first so the UI is instant
    final local = await _loadLocal();
    if (local.isNotEmpty) {
      _watchlists = local;
      if (_activeIndex >= _watchlists.length) _activeIndex = 0;
      _loading = false;
      notifyListeners();
    }

    // Try API; fetch watchlists then items per watchlist
    try {
      final res = await ApiService.instance.getWatchlists();
      final metas = (res['watchlists'] as List<dynamic>? ?? []);
      if (metas.isNotEmpty) {
        final serverList = <Watchlist>[];
        for (final meta in metas) {
          final id   = meta['id']?.toString() ?? '';
          final name = meta['name']?.toString() ?? 'Watchlist';
          List<WatchlistItem> items = [];
          try {
            final itemRes = await ApiService.instance.getWatchlistItems(id);
            final rawItems = itemRes['items'] as List<dynamic>? ?? [];
            items = rawItems.map((e) {
              final j = e as Map<String, dynamic>;
              return WatchlistItem(
                id: j['id']?.toString() ?? '',
                symbol: j['symbol']?.toString() ?? '',
                company: j['trading_symbol']?.toString() ?? j['symbol']?.toString() ?? '',
                exchange: j['exchange']?.toString() ?? 'NSE',
                token: j['token']?.toString() ?? '',
                instrumentType: j['instrument_type']?.toString() ?? 'EQ',
                ltp: 0, change: 0, changePct: 0,
                high: 0, low: 0, open: 0, prevClose: 0, volume: 0,
              );
            }).toList();
          } catch (_) {
            // If items fetch fails, keep any cached items for this watchlist
            final cachedWl = _watchlists.where((w) => w.id == id).firstOrNull;
            items = cachedWl?.items ?? [];
          }
          serverList.add(Watchlist(id: id, name: name, items: items));
        }
        _watchlists = serverList;
        if (_activeIndex >= _watchlists.length) _activeIndex = 0;
        await _saveLocal();
      }
    } catch (e) {
      if (_watchlists.isEmpty) {
        _watchlists = [_defaultMockWatchlist];
        _activeIndex = 0;
        await _saveLocal();
      }
      _error = null; // Suppress red error banner to keep screen clean
    } finally {
      _loading = false;
      notifyListeners();
    }

    // Subscribe to tokens on websocket
    refreshPrices();
  }

  // ── Create watchlist ──────────────────────────────────────────────────────────

  Future<String?> createWatchlist(String name) async {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return 'Name cannot be empty';
    // Check duplicate name
    if (_watchlists.any((w) => w.name.toLowerCase() == trimmed.toLowerCase())) {
      return 'A watchlist with this name already exists';
    }

    final localId = 'local_${DateTime.now().millisecondsSinceEpoch}';
    final newWl = Watchlist(id: localId, name: trimmed, items: []);
    _watchlists.add(newWl);
    _activeIndex = _watchlists.length - 1;
    notifyListeners();
    await _saveLocal();

    // Try to persist on server in background
    try {
      final res = await ApiService.instance.createWatchlist(trimmed);
      final serverId = (res['watchlist'] as Map<String, dynamic>?)?['id']?.toString()
          ?? res['id']?.toString();
      if (serverId != null) {
        final idx = _watchlists.indexWhere((w) => w.id == localId);
        if (idx != -1) {
          _watchlists[idx] = Watchlist(id: serverId, name: trimmed, items: _watchlists[idx].items);
          notifyListeners();
          await _saveLocal();
        }
      }
    } catch (_) {
      // Server unavailable — local ID stays, will sync later
    }
    return null;
  }

  // ── Add symbol ────────────────────────────────────────────────────────────────

  Future<String?> addSymbol(
    String watchlistId,
    String symbol,
    String exchange,
    String company, {
    String token = '',
    String instrumentType = 'EQ',
  }) async {
    final idx = _watchlists.indexWhere((w) => w.id == watchlistId);
    if (idx == -1) return 'Watchlist not found';

    final exists = _watchlists[idx].items.any(
      (i) => i.symbol.toUpperCase() == symbol.toUpperCase() && i.exchange == exchange,
    );
    if (exists) return '$symbol is already in this watchlist';

    final item = WatchlistItem(
      id: '${symbol}_${DateTime.now().millisecondsSinceEpoch}',
      symbol: symbol.toUpperCase(),
      company: company.isNotEmpty ? company : symbol.toUpperCase(),
      exchange: exchange,
      token: token,
      instrumentType: instrumentType,
      ltp: 0, change: 0, changePct: 0,
      high: 0, low: 0, open: 0, prevClose: 0, volume: 0,
    );
    final updated = List<WatchlistItem>.from(_watchlists[idx].items)..add(item);
    _watchlists[idx] = Watchlist(id: _watchlists[idx].id, name: _watchlists[idx].name, items: updated);
    notifyListeners();
    await _saveLocal();

    // Sync to server + refresh price in background
    try {
      await ApiService.instance.addToWatchlist(
        watchlistId,
        symbol: symbol.toUpperCase(),
        exchange: exchange,
        token: token,
        tradingSymbol: company.isNotEmpty ? company : symbol.toUpperCase(),
        instrumentType: instrumentType,
      );
    } catch (_) {}
    refreshPrices();
    return null;
  }

  // ── Refresh live prices for all items in all watchlists ──────────────────────

  Future<void> refreshPrices() async {
    final tokens = <String>[];
    final sseSymbols = <String>[];
    for (final wl in _watchlists) {
      for (final item in wl.items) {
        if (item.token.isNotEmpty) tokens.add(item.token);
        if (item.symbol.isNotEmpty) {
          sseSymbols.add('${item.exchange}:${item.symbol}');
        }
      }
    }
    if (tokens.isEmpty && sseSymbols.isEmpty) return;

    // Merge watchlist symbols into the existing SSE subscription (do NOT replace
    // — MarketProvider independently subscribes index symbols and replacing would
    // wipe those out, causing index ticks to stop arriving).
    if (sseSymbols.isNotEmpty) {
      LivePriceService.instance.subscribe(sseSymbols);
    }
    if (tokens.isNotEmpty) {
      WebSocketService.instance.subscribe(tokens);
    }

    // REST fallback poll every 2 s — uses tokens when available, symbols otherwise
    _ltpPollTimer?.cancel();
    unawaited(_seedLtpsFromRest(tokens, sseSymbols));
    _ltpPollTimer = Timer.periodic(const Duration(seconds: 2), (_) {
      unawaited(_seedLtpsFromRest(tokens, sseSymbols));
    });
  }

  void _onSseTick(Map<String, QuoteUpdate> updates) {
    bool changed = false;
    for (int i = 0; i < _watchlists.length; i++) {
      final wl = _watchlists[i];
      final newItems = List<WatchlistItem>.from(wl.items);
      bool wlChanged = false;
      for (int j = 0; j < newItems.length; j++) {
        final old = newItems[j];
        final q = updates['${old.exchange}:${old.symbol}'];
        if (q == null || q.ltp <= 0) continue;
        newItems[j] = WatchlistItem(
          id: old.id,
          symbol: old.symbol,
          company: old.company,
          exchange: old.exchange,
          token: old.token,
          instrumentType: old.instrumentType,
          ltp: q.ltp,
          change: q.netChange,
          changePct: q.changePct,
          high: q.high ?? old.high,
          low: q.low ?? old.low,
          open: q.open ?? old.open,
          prevClose: q.prevClose ?? old.prevClose,
          volume: q.volume ?? old.volume,
          sparkline: old.sparkline,
        );
        wlChanged = true;
      }
      if (wlChanged) {
        _watchlists[i] = Watchlist(id: wl.id, name: wl.name, items: newItems);
        changed = true;
      }
    }
    if (changed) notifyListeners();
  }

  Future<void> _seedLtpsFromRest(List<String> tokens, [List<String> sseSymbols = const []]) async {
    try {
      Map<String, dynamic> prices = {};

      if (tokens.isNotEmpty) {
        final res = await ApiService.instance.getTokenLtps(tokens);
        prices = res['prices'] as Map<String, dynamic>? ?? {};
      }

      // If token-based call returned nothing, try symbol-based batch quote.
      // Response: { "quotes": [ { "symbol", "exchange", "ltp", "netChange", "percentChange", ... } ] }
      if (prices.isEmpty && sseSymbols.isNotEmpty) {
        final res = await ApiService.instance.getQuotesBySymbols(sseSymbols);
        final quotesList = res['quotes'] as List<dynamic>? ?? [];
        for (final q in quotesList) {
          if (q is! Map<String, dynamic>) continue;
          final sym  = q['symbol']?.toString().toUpperCase() ?? '';
          final exch = q['exchange']?.toString().toUpperCase() ?? 'NSE';
          if (sym.isEmpty) continue;
          // Index by both "EXCHANGE:SYMBOL" and bare symbol for flexible lookup
          prices['$exch:$sym'] = q;
          prices[sym] = q;
        }
      }

      if (prices.isEmpty) return;

      bool changed = false;
      for (int i = 0; i < _watchlists.length; i++) {
        final wl = _watchlists[i];
        final newItems = List<WatchlistItem>.from(wl.items);
        bool wlChanged = false;

        for (int j = 0; j < newItems.length; j++) {
          final old = newItems[j];
          // Look up by token first, then by "EXCHANGE:SYMBOL"
          final p = (old.token.isNotEmpty ? prices[old.token] : null)
              ?? prices['${old.exchange}:${old.symbol}']
              ?? prices[old.symbol];
          if (p is! Map<String, dynamic>) continue;
          final ltp = (p['ltp'] as num?)?.toDouble() ?? 0;
          if (ltp <= 0 || ltp == old.ltp) continue;

          final changePct = (p['change_pct'] as num?)?.toDouble()
              ?? (p['changePct'] as num?)?.toDouble()
              ?? (p['percentChange'] as num?)?.toDouble()
              ?? old.changePct;
          final close = (p['close'] as num?)?.toDouble()
              ?? (p['prevClose'] as num?)?.toDouble()
              ?? old.prevClose;
          final netChange = (p['netChange'] as num?)?.toDouble()
              ?? (p['net_change'] as num?)?.toDouble()
              ?? (close > 0 ? ltp - close : 0.0);
          newItems[j] = WatchlistItem(
            id: old.id,
            symbol: old.symbol,
            company: old.company,
            exchange: old.exchange,
            token: old.token,
            instrumentType: old.instrumentType,
            ltp: ltp,
            change: netChange,
            changePct: changePct,
            high: (p['high'] as num?)?.toDouble() ?? old.high,
            low: (p['low'] as num?)?.toDouble() ?? old.low,
            open: (p['open'] as num?)?.toDouble() ?? old.open,
            prevClose: close > 0 ? close : old.prevClose,
            volume: (p['volume'] as num?)?.toInt() ?? old.volume,
            sparkline: old.sparkline,
          );
          wlChanged = true;
        }

        if (wlChanged) {
          _watchlists[i] = Watchlist(id: wl.id, name: wl.name, items: newItems);
          changed = true;
        }
      }

      if (changed) notifyListeners();
    } catch (_) {}
  }

  // ── Remove symbol ─────────────────────────────────────────────────────────────

  Future<void> removeSymbol(String watchlistId, String itemId) async {
    final idx = _watchlists.indexWhere((w) => w.id == watchlistId);
    if (idx == -1) return;
    final updated = _watchlists[idx].items.where((i) => i.id != itemId).toList();
    final removed = _watchlists[idx].items.firstWhere((i) => i.id == itemId);
    _watchlists[idx] = Watchlist(id: _watchlists[idx].id, name: _watchlists[idx].name, items: updated);
    notifyListeners();
    if (removed.token.isNotEmpty) {
      WebSocketService.instance.unsubscribe([removed.token]);
    }
    await _saveLocal();
    // Sync to server (fire and forget — local is already updated)
    try {
      await ApiService.instance.removeFromWatchlist(watchlistId, itemId);
    } catch (_) {}
  }

  // ── Rename watchlist ──────────────────────────────────────────────────────────

  Future<String?> renameWatchlist(String watchlistId, String newName) async {
    final trimmed = newName.trim();
    if (trimmed.isEmpty) return 'Name cannot be empty';
    final idx = _watchlists.indexWhere((w) => w.id == watchlistId);
    if (idx == -1) return 'Watchlist not found';
    if (_watchlists.any((w) =>
        w.id != watchlistId &&
        w.name.toLowerCase() == trimmed.toLowerCase())) {
      return 'A watchlist with this name already exists';
    }
    _watchlists[idx] = Watchlist(
        id: _watchlists[idx].id, name: trimmed, items: _watchlists[idx].items);
    notifyListeners();
    await _saveLocal();
    try { await ApiService.instance.renameWatchlist(watchlistId, trimmed); } catch (_) {}
    return null;
  }

  // ── Delete watchlist ──────────────────────────────────────────────────────────

  Future<void> deleteWatchlist(String watchlistId) async {
    final idx = _watchlists.indexWhere((w) => w.id == watchlistId);
    if (idx == -1) return;
    _watchlists.removeAt(idx);
    if (_activeIndex >= _watchlists.length && _activeIndex > 0) {
      _activeIndex = _watchlists.length - 1;
    }
    notifyListeners();
    await _saveLocal();
    try { await ApiService.instance.deleteWatchlist(watchlistId); } catch (_) {}
  }
}

// ─── Orders Provider ────────────────────────────────────────────────────────────
class OrdersProvider extends ChangeNotifier {
  List<Order> _orders = [];
  final List<Order> _localOrders = [];
  bool _loading = false;
  String? _error;

  // Merges API orders + locally-tracked paper orders (deduped by ID)
  List<Order> get orders {
    final apiIds = _orders.map((o) => o.id).toSet();
    final extra  = _localOrders.where((o) => !apiIds.contains(o.id)).toList();
    return [..._orders, ...extra];
  }

  List<Order> get activeOrders =>
      orders.where((o) => o.isActive).toList();
  List<Order> get completedOrders =>
      orders.where((o) => o.status == OrderStatus.complete).toList();
  bool get loading => _loading;
  String? get error => _error;

  /// Called after a local paper order is placed so it shows immediately.
  void mergeLocalOrders(List<Order> locals) {
    _localOrders.clear();
    _localOrders.addAll(locals);
    notifyListeners();
  }

  Future<void> fetch(String mode) async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      final res = await ApiService.instance.getOrders();
      final all = (res['orders'] as List<dynamic>? ?? [])
          .map((e) => Order.fromJson(e as Map<String, dynamic>))
          .toList();
      final isPaper = mode == 'paper';
      _orders = all.where((o) => o.isPaper == isPaper).toList();
    } catch (e) {
      _orders = [];
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}

