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

  Map<String, dynamic> _parse(http.Response res) {
    final body = jsonDecode(res.body) as Map<String, dynamic>;
    if (res.statusCode >= 400) {
      throw ApiException(res.statusCode, body['error']?.toString() ?? 'Request failed');
    }
    return body;
  }

  // ─── Auth ──────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) =>
      _post('/auth/login', {'email': email, 'password': password});

  Future<Map<String, dynamic>> register(
          String name, String email, String password) =>
      _post('/auth/login', {'name': name, 'email': email, 'password': password, 'register': true});

  Future<Map<String, dynamic>> refreshToken(String refreshToken) =>
      _post('/auth/refresh', {'refreshToken': refreshToken});

  Future<Map<String, dynamic>> getMe() => _get('/auth/me');

  // ─── Market ────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getIndexPrices() => _get('/index-prices', auth: false);

  Future<Map<String, dynamic>> getGainers({int limit = 10}) =>
      _get('/gainers-losers?type=gainers&limit=$limit', auth: false);

  Future<Map<String, dynamic>> getLosers({int limit = 10}) =>
      _get('/gainers-losers?type=losers&limit=$limit', auth: false);

  Future<Map<String, dynamic>> search(String query) =>
      _get('/search?q=${Uri.encodeQueryComponent(query)}', auth: false);

  // ─── Watchlist ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getWatchlists() => _get('/watchlists');

  Future<Map<String, dynamic>> createWatchlist(String name) =>
      _post('/watchlists', {'name': name}, auth: true);

  Future<Map<String, dynamic>> addToWatchlist(
          String watchlistId, String symbol, String exchange) =>
      _post('/watchlists/$watchlistId/items', {
        'symbol': symbol,
        'exchange': exchange,
      }, auth: true);

  // ─── Holdings ──────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getHoldings({String mode = 'live'}) =>
      _get('/holdings?mode=$mode');

  // ─── Orders ────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getOrders({
    String? status,
    int limit = 50,
    String mode = 'live',
  }) {
    final params = StringBuffer('?limit=$limit&mode=$mode');
    if (status != null) params.write('&status=$status');
    return _get('/orders$params');
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
    required String mode,
  }) =>
      _post('/orders', {
        'symbol': symbol,
        'exchange': exchange,
        'transaction_type': transactionType,
        'order_type': orderType,
        'product_type': productType,
        'quantity': quantity,
        if (price != null) 'price': price,
        if (triggerPrice != null) 'trigger_price': triggerPrice,
        'mode': mode,
      }, auth: true);

  Future<Map<String, dynamic>> cancelOrder(String orderId, String mode) =>
      _post('/orders/$orderId/cancel', {'mode': mode}, auth: true);

  // ─── Positions ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getPositions({String mode = 'live'}) =>
      _get('/positions?mode=$mode');

  // ─── Chart data ────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getChartData(
          String symbol, String exchange, String interval) =>
      _get('/chart-data?symbol=$symbol&exchange=$exchange&interval=$interval',
          auth: false);
}
