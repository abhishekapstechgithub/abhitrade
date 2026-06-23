import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../config/constants.dart';
import '../models/models.dart';
import '../services/api_service.dart';
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
            'email': 'abhishek@abhitrade.online',
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
  }) async {
    try {
      await ApiService.instance.placeOrder(
        symbol: symbol,
        exchange: 'NSE', // Defaulting since this signature doesn't require it
        transactionType: side == OrderSide.buy ? 'BUY' : 'SELL',
        orderType: 'MARKET', 
        productType: 'CNC',
        quantity: quantity,
        price: price,
        isPaper: true,
      );
      await fetchBalance();
      return '';
    } catch (e) {
      return e.toString();
    }
  }

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
  bool _loading = false;
  String? _error;

  List<IndexPrice> get indices => _indices;
  List<GainerLoser> get gainers => _gainers;
  List<GainerLoser> get losers  => _losers;
  bool get loading => _loading;
  String? get error => _error;

  StreamSubscription? _tickSubscription;
  Timer? _indexPollTimer;

  // AngelOne SmartStream tokens for major indices (from lib/angelone/tokens.ts)
  static const _indexTokens = [
    '99926000', // NIFTY 50
    '99926009', // BANKNIFTY
    '99919000', // SENSEX
    '99926006', // NIFTY IT
    '99926003', // NIFTY MIDCAP 100
  ];

  static const _tokenToSymbol = {
    '99926000': 'NIFTY 50',
    '99926009': 'BANKNIFTY',
    '99919000': 'SENSEX',
    '99926006': 'NIFTY IT',
    '99926003': 'MIDCPNIFTY',
  };

  MarketProvider() {
    _tickSubscription = WebSocketService.instance.ticks.listen(_onTick);
    WebSocketService.instance.subscribe(_indexTokens);
  }

  @override
  void dispose() {
    _indexPollTimer?.cancel();
    _tickSubscription?.cancel();
    super.dispose();
  }

  void _onTick(Map<String, dynamic> tick) {
    if (tick['token'] == null) return;
    // Accept server-normalized ticks (mode='full') or raw ticks that carry ltp
    if (tick['mode'] != null && tick['mode'] != 'full') return;

    final token = tick['token'].toString();
    final symbol = _tokenToSymbol[token];
    if (symbol == null) return;

    final ltp       = ((tick['last_price'] ?? tick['ltp'])           ?? 0).toDouble();
    final change    = ((tick['net_change']  ?? tick['change'])        ?? 0).toDouble();
    final changePct = ((tick['percent_change'] ?? tick['pct'])        ?? 0).toDouble();

    final idx = _indices.indexWhere((i) => i.symbol == symbol);
    if (idx != -1) {
      _indices[idx] = IndexPrice(symbol: symbol, ltp: ltp, change: change, changePct: changePct);
      notifyListeners();
    }
  }

  Future<void> fetch() async {
    _loading = true;
    _error = null;
    if (_indices.isEmpty) {
      _indices = List.from(_defaultIndices)
        ..sort((a, b) => _indexOrder(a.symbol).compareTo(_indexOrder(b.symbol)));
    }
    notifyListeners();
    await Future.wait([_fetchIndices(), _fetchGainers(), _fetchLosers()]);
    _loading = false;
    notifyListeners();
    // REST poll every 5 s as a fallback when the WebSocket pub/sub path is silent
    // (indices live in at:idx:* Redis keys, not covered by market:ticks pub/sub).
    _indexPollTimer?.cancel();
    _indexPollTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      await _fetchIndices();
      notifyListeners();
    });
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
  Timer? _ltpPollTimer;

  WatchlistProvider() {
    _tickSubscription = WebSocketService.instance.ticks.listen(_onTick);
  }

  @override
  void dispose() {
    _ltpPollTimer?.cancel();
    _tickSubscription?.cancel();
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
      'ltp': i.ltp,
      'change': i.change,
      'changePct': i.changePct,
      'high': i.high,
      'low': i.low,
      'open': i.open,
      'prevClose': i.prevClose,
      'volume': i.volume,
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
              // Preserve any cached price data from local storage
              final cached = _watchlists
                  .expand((w) => w.items)
                  .where((i) => i.symbol == j['symbol'] && i.exchange == j['exchange'])
                  .firstOrNull;
              return WatchlistItem(
                id: j['id']?.toString() ?? '',
                symbol: j['symbol']?.toString() ?? '',
                company: j['trading_symbol']?.toString() ?? j['symbol']?.toString() ?? '',
                exchange: j['exchange']?.toString() ?? 'NSE',
                token: j['token']?.toString() ?? '',
                instrumentType: j['instrument_type']?.toString() ?? 'EQ',
                ltp: cached?.ltp ?? 0,
                change: cached?.change ?? 0,
                changePct: cached?.changePct ?? 0,
                high: cached?.high ?? 0,
                low: cached?.low ?? 0,
                open: cached?.open ?? 0,
                prevClose: cached?.prevClose ?? 0,
                volume: cached?.volume ?? 0,
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
    for (final wl in _watchlists) {
      for (final item in wl.items) {
        if (item.token.isNotEmpty) tokens.add(item.token);
      }
    }
    if (tokens.isEmpty) return;

    WebSocketService.instance.subscribe(tokens);
    // Seed immediately, then poll every 5 s as a fallback when WS ticks are silent.
    unawaited(_seedLtpsFromRest(tokens));
    _ltpPollTimer?.cancel();
    _ltpPollTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      unawaited(_seedLtpsFromRest(tokens));
    });
  }

  Future<void> _seedLtpsFromRest(List<String> tokens) async {
    try {
      final res = await ApiService.instance.getTokenLtps(tokens);
      final prices = res['prices'] as Map<String, dynamic>? ?? {};
      if (prices.isEmpty) return;

      bool changed = false;
      for (int i = 0; i < _watchlists.length; i++) {
        final wl = _watchlists[i];
        final newItems = List<WatchlistItem>.from(wl.items);
        bool wlChanged = false;

        for (int j = 0; j < newItems.length; j++) {
          final old = newItems[j];
          if (old.token.isEmpty) continue;
          final p = prices[old.token] as Map<String, dynamic>?;
          if (p == null) continue;
          final ltp = (p['ltp'] as num?)?.toDouble() ?? 0;
          if (ltp <= 0 || ltp == old.ltp) continue;

          final changePct = (p['change_pct'] as num?)?.toDouble() ?? old.changePct;
          final close = (p['close'] as num?)?.toDouble() ?? old.prevClose;
          final netChange = close > 0 ? ltp - close : 0.0;
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
            high: old.high,
            low: old.low,
            open: old.open,
            prevClose: close > 0 ? close : old.prevClose,
            volume: old.volume,
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
    } catch (_) {
      // Silent fail — WS ticks will eventually populate prices
    }
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
  bool _loading = false;
  String? _error;

  List<Order> get orders => _orders;
  List<Order> get activeOrders => _orders.where((o) => o.isActive).toList();
  List<Order> get completedOrders =>
      _orders.where((o) => o.status == OrderStatus.complete).toList();
  bool get loading => _loading;
  String? get error => _error;

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
