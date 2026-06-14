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
        'Accept':       'application/json',
        if (token != null) 'Authorization': 'Bearer $token',
      };

  Future<Map<String, dynamic>> _get(
    String path, {
    bool auth = true,
    Map<String, String>? query,
  }) async {
    final token = auth ? await _token() : null;
    var uri = Uri.parse('${AppConstants.apiBase}$path');
    if (query != null && query.isNotEmpty) {
      uri = uri.replace(queryParameters: {...uri.queryParameters, ...query});
    }
    final res = await http
        .get(uri, headers: _headers(token))
        .timeout(const Duration(seconds: 20));
    return _parse(res);
  }

  Future<Map<String, dynamic>> _post(
    String path,
    Map<String, dynamic> body, {
    bool auth = false,
  }) async {
    final token = auth ? await _token() : null;
    final uri   = Uri.parse('${AppConstants.apiBase}$path');
    final res   = await http
        .post(uri, headers: _headers(token), body: jsonEncode(body))
        .timeout(const Duration(seconds: 20));
    return _parse(res);
  }

  Future<Map<String, dynamic>> _delete(String path) async {
    final token = await _token();
    final uri   = Uri.parse('${AppConstants.apiBase}$path');
    final res   = await http
        .delete(uri, headers: _headers(token))
        .timeout(const Duration(seconds: 20));
    return _parse(res);
  }

  Map<String, dynamic> _parse(http.Response res) {
    if (res.body.isEmpty) return {};
    final body = jsonDecode(res.body);
    if (body is! Map<String, dynamic>) return {'data': body};
    if (res.statusCode >= 400) {
      throw ApiException(
          res.statusCode, body['error']?.toString() ?? 'Request failed');
    }
    return body;
  }

  // ─── Health ────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> health() =>
      _get('/health', auth: false);

  // ─── Auth ──────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) =>
      _post('/auth/login', {'email': email, 'password': password});

  Future<Map<String, dynamic>> register(
          String name, String email, String password) =>
      _post('/auth/register', {
        'name':     name,
        'email':    email,
        'password': password,
      });

  Future<Map<String, dynamic>> refreshToken(String refreshToken) =>
      _post('/auth/refresh', {'refreshToken': refreshToken});

  Future<Map<String, dynamic>> getMe() => _get('/auth/me');

  Future<Map<String, dynamic>> logout() =>
      _post('/auth/logout', {}, auth: true);

  // ─── Index Prices ─────────────────────────────────────────────────────────
  /// GET /api/index-prices
  /// Returns { prices: { 'NIFTY 50': { ltp, change, ... }, ... } }
  Future<Map<String, dynamic>> getIndexPrices() =>
      _get('/index-prices', auth: false);

  // ─── Market Movers ────────────────────────────────────────────────────────
  /// GET /api/market-movers?type=gainers|losers|volume_shockers|top_by_volume|52w_high|52w_low&limit=50
  /// Returns { items: [...], total, fetchedAt, type }
  Future<Map<String, dynamic>> getMarketMovers({
    String type  = AppConstants.moverGainers,
    int    limit = 50,
  }) =>
      _get('/market-movers', auth: false, query: {
        'type':  type,
        'limit': limit.toString(),
      });

  Future<Map<String, dynamic>> getGainers({int limit = 10}) =>
      getMarketMovers(type: AppConstants.moverGainers, limit: limit);

  Future<Map<String, dynamic>> getLosers({int limit = 10}) =>
      getMarketMovers(type: AppConstants.moverLosers, limit: limit);

  Future<Map<String, dynamic>> getVolumeShockers({int limit = 20}) =>
      getMarketMovers(type: AppConstants.moverVolumeShockers, limit: limit);

  Future<Map<String, dynamic>> getTopByVolume({int limit = 20}) =>
      getMarketMovers(type: AppConstants.moverTopByVolume, limit: limit);

  Future<Map<String, dynamic>> get52wHigh({int limit = 20}) =>
      getMarketMovers(type: AppConstants.mover52wHigh, limit: limit);

  Future<Map<String, dynamic>> get52wLow({int limit = 20}) =>
      getMarketMovers(type: AppConstants.mover52wLow, limit: limit);

  /// POST /api/market-movers — force sync all 6 types from Groww
  Future<Map<String, dynamic>> syncMarketMovers() =>
      _post('/market-movers', {}, auth: false);

  // ─── Search ───────────────────────────────────────────────────────────────
  /// GET /api/search?q=...&limit=20
  /// Returns { results: [...], source: 'redis'|'mock' }
  Future<Map<String, dynamic>> search(String query, {int limit = 20}) =>
      _get('/search', auth: false, query: {
        'q':     Uri.encodeQueryComponent(query),
        'limit': limit.toString(),
      });

  // ─── Option Chain ─────────────────────────────────────────────────────────
  /// GET /api/optionchain/expiries?symbol=NIFTY
  /// Returns { expiries: [{ date, label, isWeekly }] }
  Future<Map<String, dynamic>> getOptionExpiries(String symbol) =>
      _get('/optionchain/expiries', auth: false, query: {'symbol': symbol});

  /// GET /api/optionchain?symbol=NIFTY&expiry=2025-06-26&strikeCount=20
  /// Returns { symbol, expiry, spotPrice, rows, analytics }
  Future<Map<String, dynamic>> getOptionChain({
    required String symbol,
    required String expiry,
    int strikeCount = 20,
  }) =>
      _get('/optionchain', auth: false, query: {
        'symbol':      symbol,
        'expiry':      expiry,
        'strikeCount': strikeCount.toString(),
      });

  /// GET /api/optionchain/quote?token=...
  /// Returns the live quote for a single option token
  Future<Map<String, dynamic>> getOptionQuote(String token) =>
      _get('/optionchain/quote', auth: false, query: {'token': token});

  // ─── Watchlist ────────────────────────────────────────────────────────────
  /// GET /api/watchlists  → { watchlists: [...] }
  Future<Map<String, dynamic>> getWatchlists() => _get('/watchlists');

  /// POST /api/watchlists  → { watchlist: {...} }
  Future<Map<String, dynamic>> createWatchlist(String name) =>
      _post('/watchlists', {'name': name}, auth: true);

  /// POST /api/watchlists/:id/items
  Future<Map<String, dynamic>> addToWatchlist(
    String watchlistId,
    String symbol,
    String exchange,
  ) =>
      _post('/watchlists/$watchlistId/items',
          {'symbol': symbol, 'exchange': exchange},
          auth: true);

  /// DELETE /api/watchlists/:watchlistId/items/:itemId
  Future<Map<String, dynamic>> removeFromWatchlist(
          String watchlistId, String itemId) =>
      _delete('/watchlists/$watchlistId/items/$itemId');

  // ─── Holdings ─────────────────────────────────────────────────────────────
  /// GET /api/holdings?mode=live|paper
  Future<Map<String, dynamic>> getHoldings({String mode = 'live'}) =>
      _get('/holdings', query: {'mode': mode});

  // ─── Orders ───────────────────────────────────────────────────────────────
  /// GET /api/orders?status=...&limit=50&mode=live|paper
  Future<Map<String, dynamic>> getOrders({
    String? status,
    int     limit = 50,
    String  mode  = 'live',
  }) {
    final q = <String, String>{'limit': limit.toString(), 'mode': mode};
    if (status != null) q['status'] = status;
    return _get('/orders', query: q);
  }

  /// POST /api/orders
  Future<Map<String, dynamic>> placeOrder({
    required String symbol,
    required String exchange,
    required String transactionType, // BUY | SELL
    required String orderType,       // MARKET | LIMIT | SL | SL-M
    required String productType,     // CNC | MIS | NRML
    required int    quantity,
    double?  price,
    double?  triggerPrice,
    String   mode = 'live',
  }) =>
      _post('/orders', {
        'symbol':           symbol,
        'exchange':         exchange,
        'transaction_type': transactionType,
        'order_type':       orderType,
        'product_type':     productType,
        'quantity':         quantity,
        if (price        != null) 'price':         price,
        if (triggerPrice != null) 'trigger_price': triggerPrice,
        'mode': mode,
      }, auth: true);

  /// POST /api/orders/:id/cancel
  Future<Map<String, dynamic>> cancelOrder(String orderId, String mode) =>
      _post('/orders/$orderId/cancel', {'mode': mode}, auth: true);

  /// POST /api/orders/:id/modify
  Future<Map<String, dynamic>> modifyOrder(
    String orderId, {
    int?    quantity,
    double? price,
    double? triggerPrice,
    String  mode = 'live',
  }) =>
      _post('/orders/$orderId/modify', {
        if (quantity     != null) 'quantity':      quantity,
        if (price        != null) 'price':         price,
        if (triggerPrice != null) 'trigger_price': triggerPrice,
        'mode': mode,
      }, auth: true);

  // ─── Positions ────────────────────────────────────────────────────────────
  /// GET /api/positions?mode=live|paper
  Future<Map<String, dynamic>> getPositions({String mode = 'live'}) =>
      _get('/positions', query: {'mode': mode});

  // ─── Portfolio ────────────────────────────────────────────────────────────
  /// GET /api/portfolio?mode=live|paper
  Future<Map<String, dynamic>> getPortfolio({String mode = 'live'}) =>
      _get('/portfolio', query: {'mode': mode});

  // ─── Chart Data ───────────────────────────────────────────────────────────
  /// GET /api/chart-data?symbol=...&exchange=...&interval=...
  Future<Map<String, dynamic>> getChartData(
    String symbol,
    String exchange,
    String interval,
  ) =>
      _get('/chart-data', auth: false, query: {
        'symbol':   symbol,
        'exchange': exchange,
        'interval': interval,
      });
}
