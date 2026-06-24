import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import '../config/constants.dart';

class ApiException implements Exception {
  final int statusCode;
  final String message;
  const ApiException(this.statusCode, this.message);
  @override
  String toString() => 'ApiException($statusCode): $message';
}

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  Future<String?> _token() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(AppConstants.keyAccessToken);
  }

  Map<String, String> _headers([String? token]) => {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    if (token != null) 'Authorization': 'Bearer $token',
  };

  Future<Map<String, dynamic>> _get(String path, {bool auth = true}) async {
    final token = auth ? await _token() : null;
    final uri = Uri.parse('${AppConstants.apiBase}$path');
    final res = await http.get(uri, headers: _headers(token))
        .timeout(const Duration(seconds: 15));
    return _parse(res);
  }

  Future<Map<String, dynamic>> _post(
      String path, Map<String, dynamic> body, {bool auth = false}) async {
    final token = auth ? await _token() : null;
    final uri = Uri.parse('${AppConstants.apiBase}$path');
    final res = await http.post(
      uri,
      headers: _headers(token),
      body: jsonEncode(body),
    ).timeout(const Duration(seconds: 15));
    return _parse(res);
  }

  Future<Map<String, dynamic>> _patch(
      String path, Map<String, dynamic> body, {bool auth = true}) async {
    final token = auth ? await _token() : null;
    final uri = Uri.parse('${AppConstants.apiBase}$path');
    final res = await http.patch(
      uri,
      headers: _headers(token),
      body: jsonEncode(body),
    ).timeout(const Duration(seconds: 15));
    return _parse(res);
  }

  Future<Map<String, dynamic>> _delete(String path, {bool auth = true}) async {
    final token = auth ? await _token() : null;
    final uri = Uri.parse('${AppConstants.apiBase}$path');
    final res = await http.delete(uri, headers: _headers(token))
        .timeout(const Duration(seconds: 15));
    return _parse(res);
  }

  Map<String, dynamic> _parse(http.Response res) {
    if (res.statusCode == 204) return {};
    try {
      final raw = res.body.trim();
      if (raw.isEmpty || (!raw.startsWith('{') && !raw.startsWith('['))) {
        if (raw.contains('<html') || raw.contains('<HTML') ||
            raw.contains('<!DOCTYPE') || raw.contains('<!doctype')) {
          throw ApiException(res.statusCode,
              'Server returned HTML. The API might be down or suspended.');
        }
        throw ApiException(res.statusCode, 'Invalid server response');
      }
      final body = jsonDecode(raw) as Map<String, dynamic>;
      if (res.statusCode >= 400) {
        throw ApiException(
          res.statusCode,
          body['error']?.toString() ??
              body['message']?.toString() ??
              'Request failed (${res.statusCode})',
        );
      }
      return body;
    } on ApiException {
      rethrow;
    } catch (_) {
      throw ApiException(res.statusCode, 'Server error (${res.statusCode})');
    }
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> login(String email, String password) async {
    final uri = Uri.parse('${AppConstants.apiBase}/api/auth/login');
    final res = await http.post(
      uri,
      headers: _headers(),
      body: jsonEncode({'email': email, 'password': password}),
    ).timeout(const Duration(seconds: 15));
    // Extract refresh token from Set-Cookie (mobile: tk_refresh cookie)
    final setCookie = res.headers['set-cookie'] ?? '';
    final match = RegExp(r'tk_refresh=([^;,\s]+)').firstMatch(setCookie);
    if (match != null) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(AppConstants.keyRefreshToken, match.group(1)!);
    }
    return _parse(res);
  }

  // Register reuses the login endpoint with register:true (per API docs §1.1)
  Future<Map<String, dynamic>> register(String name, String email, String password) =>
      _post('/api/auth/login',
          {'name': name, 'email': email, 'password': password, 'register': true},
          auth: false);

  Future<Map<String, dynamic>> refreshToken() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(AppConstants.keyRefreshToken);
    final headers = _headers();
    // Mobile sends the refresh token in the X-Refresh-Token header (docs §1.3)
    if (token != null) headers['X-Refresh-Token'] = token;
    final uri = Uri.parse('${AppConstants.apiBase}/api/auth/refresh');
    final res =
        await http.post(uri, headers: headers).timeout(const Duration(seconds: 15));
    return _parse(res);
  }

  Future<Map<String, dynamic>> getMe() => _get('/api/auth/me');

  Future<void> logout() async {
    try {
      await _post('/api/auth/logout', {}, auth: true);
    } catch (_) {}
  }

  // ─── Market data ───────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getIndexPrices() =>
      _get('/api/index-prices', auth: false);

  /// Gainers or losers. [type] = 'gainers' | 'losers' | 'oi-gainers' | 'oi-losers'
  Future<Map<String, dynamic>> getGainersLosers({
    String type = 'gainers',
    int limit = 20,
  }) =>
      _get('/api/gainers-losers?type=$type&limit=$limit', auth: false);

  Future<Map<String, dynamic>> getGainers({int limit = 10}) =>
      getGainersLosers(type: 'gainers', limit: limit);

  Future<Map<String, dynamic>> getLosers({int limit = 10}) =>
      getGainersLosers(type: 'losers', limit: limit);

  Future<Map<String, dynamic>> getMarketBreadth() =>
      _get('/api/market-breadth', auth: false);

  /// Symbol search — no auth required (docs §4).
  Future<Map<String, dynamic>> search(String query,
          {String exchange = 'all', String type = '', int limit = 20}) {
    final params = StringBuffer('?q=${Uri.encodeQueryComponent(query)}&limit=$limit');
    if (exchange.isNotEmpty && exchange != 'all') params.write('&exchange=$exchange');
    if (type.isNotEmpty && type != 'all') params.write('&type=$type');
    return _get('/api/search$params', auth: false);
  }

  // ─── Token / price registry ────────────────────────────────────────────────

  Future<void> watchTokens(List<String> tokens) async {
    if (tokens.isEmpty) return;
    try {
      await _post('/api/tokens/watch', {'tokens': tokens}, auth: true);
    } catch (_) {}
  }

  Future<void> unwatchTokens(List<String> tokens) async {
    if (tokens.isEmpty) return;
    try {
      await _post('/api/tokens/unwatch', {'tokens': tokens}, auth: true);
    } catch (_) {}
  }

  /// Batch LTP by instrument token IDs (docs §2.3).
  /// Response: { "prices": { "<token>": { "ltp", "change_pct", "net_change", "close", ... } } }
  Future<Map<String, dynamic>> getTokenLtps(List<String> tokens) =>
      _get('/api/tokens/ltp?tokens=${tokens.join(',')}', auth: false);

  /// Batch quote by EXCHANGE:SYMBOL strings (docs §2.2).
  /// Response: { "quotes": [ { "symbol", "exchange", "ltp", "netChange", "percentChange", ... } ] }
  Future<Map<String, dynamic>> getQuotesBySymbols(List<String> symbols) =>
      _get(
        '/api/quotes?symbols=${Uri.encodeQueryComponent(symbols.join(','))}',
        auth: false,
      );

  // ─── Watchlists ────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getWatchlists() => _get('/api/watchlists');

  Future<Map<String, dynamic>> getWatchlistItems(String watchlistId) =>
      _get('/api/watchlists/$watchlistId/items');

  Future<Map<String, dynamic>> createWatchlist(String name) =>
      _post('/api/watchlists', {'name': name}, auth: true);

  Future<Map<String, dynamic>> renameWatchlist(
          String watchlistId, String newName) =>
      _patch('/api/watchlists/$watchlistId', {'name': newName});

  Future<Map<String, dynamic>> deleteWatchlist(String watchlistId) =>
      _delete('/api/watchlists/$watchlistId');

  Future<Map<String, dynamic>> addToWatchlist(
    String watchlistId, {
    required String symbol,
    required String exchange,
    String token = '',
    String tradingSymbol = '',
    String instrumentType = 'EQ',
  }) =>
      _post('/api/watchlists/$watchlistId/items', {
        'symbol': symbol,
        'exchange': exchange,
        'token': token,
        'trading_symbol': tradingSymbol.isEmpty ? symbol : tradingSymbol,
        'instrument_type': instrumentType,
      }, auth: true);

  Future<Map<String, dynamic>> removeFromWatchlist(
          String watchlistId, String itemId) =>
      _delete('/api/watchlists/$watchlistId/items/$itemId');

  // ─── Holdings (docs §8) ────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getHoldings() =>
      _get('/api/holdings', auth: true);

  // ─── Orders (docs §6) ──────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getOrders({
    String? status,
    int limit = 50,
    int offset = 0,
  }) {
    final params = <String>[
      'limit=$limit',
      'offset=$offset',
      if (status != null) 'status=$status',
    ];
    return _get('/api/orders?${params.join('&')}', auth: true);
  }

  Future<Map<String, dynamic>> placeOrder({
    required String symbol,
    required String exchange,
    required String transactionType,
    required String orderType,
    required String productType,
    required int quantity,
    double? price,
    double? triggerPrice,
    String? tradingSymbol,
  }) =>
      _post('/api/orders', {
        'exchange': exchange,
        'symbol': symbol,
        'transaction_type': transactionType.toUpperCase(),
        'order_type': orderType.toUpperCase(),
        'product_type': productType.toUpperCase(),
        'quantity': quantity,
        if (price != null && price > 0) 'price': price,
        if (triggerPrice != null) 'trigger_price': triggerPrice,
        if (tradingSymbol != null && tradingSymbol.isNotEmpty)
          'trading_symbol': tradingSymbol,
      }, auth: true);

  /// Cancel an order (docs §6.4) — DELETE /api/orders/{orderId}
  Future<Map<String, dynamic>> cancelOrder(String orderId) =>
      _delete('/api/orders/$orderId');

  // ─── Positions (docs §7) ───────────────────────────────────────────────────

  Future<Map<String, dynamic>> getPositions({String? date}) {
    final path = date != null
        ? '/api/positions?date=$date'
        : '/api/positions';
    return _get(path, auth: true);
  }

  // ─── Balance (paper trading — internal endpoint) ───────────────────────────

  Future<Map<String, dynamic>> getBalance() =>
      _get('/api/paper/user/balance', auth: true);

  // ─── Option chain ──────────────────────────────────────────────────────────

  /// Fetch NIFTY option chain via Univest proxy.
  /// [expiry] = 'YYYY-MM-DD' format.
  /// Response: { code, data: { CE: [...], PE: [...], SpotP, SChng, SPerChng } }
  Future<Map<String, dynamic>> getOptionChain(String expiry) =>
      _get('/api/optionchain/univest?expiry=$expiry', auth: false);

  // ─── Chart data ────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> getChartData(
          String symbol, String exchange, String timeframe) =>
      _get(
        '/api/yahoo-chart'
        '?symbol=${Uri.encodeQueryComponent(symbol)}'
        '&exchange=${Uri.encodeQueryComponent(exchange)}'
        '&timeframe=$timeframe',
        auth: false,
      );
}
