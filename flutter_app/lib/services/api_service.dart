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
        if (raw.contains('<html') || raw.contains('<HTML') || raw.contains('<!DOCTYPE') || raw.contains('<!doctype')) {
          throw ApiException(res.statusCode, 'Server returned HTML. The API might be down or suspended.');
        }
        throw ApiException(res.statusCode, 'Invalid server response');
      }
      final body = jsonDecode(raw) as Map<String, dynamic>;
      if (res.statusCode >= 400) {
        throw ApiException(
          res.statusCode,
          body['error']?.toString() ?? body['message']?.toString() ?? 'Request failed (${res.statusCode})',
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
    // Capture at_sid refresh cookie from Set-Cookie header
    final setCookie = res.headers['set-cookie'] ?? '';
    if (setCookie.contains('at_sid=')) {
      final match = RegExp(r'at_sid=([^;,\s]+)').firstMatch(setCookie);
      if (match != null) {
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString(AppConstants.keyRefreshToken, match.group(1)!);
      }
    }
    return _parse(res);
  }

  Future<Map<String, dynamic>> register(String name, String email, String phone) =>
      _post('/api/auth/register', {'name': name, 'email': email, 'phone': phone});

  Future<Map<String, dynamic>> sendOtp(String phone) =>
      _post('/api/auth/send-otp', {'phone': phone});

  Future<Map<String, dynamic>> verifyOtp(String phone, String otp) =>
      _post('/api/auth/verify-otp', {'phone': phone, 'otp': otp});

  Future<Map<String, dynamic>> refreshToken() async {
    final prefs = await SharedPreferences.getInstance();
    final atSid = prefs.getString(AppConstants.keyRefreshToken);
    final headers = _headers();
    if (atSid != null) headers['Cookie'] = 'at_sid=$atSid';
    final uri = Uri.parse('${AppConstants.apiBase}/api/auth/refresh');
    final res = await http.post(uri, headers: headers)
        .timeout(const Duration(seconds: 15));
    return _parse(res);
  }

  Future<Map<String, dynamic>> getMe() => _get('/api/auth/me');

  Future<void> logout() async {
    try {
      await _post('/api/auth/logout', {}, auth: true);
    } catch (_) {}
  }

  // ─── Market ────────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getIndexPrices() =>
      _get('/api/index-prices', auth: false);

  Future<Map<String, dynamic>> getMarketMovers({
    String type = 'gainers',
    int limit = 20,
  }) =>
      _get('/api/market-movers?type=$type&limit=$limit', auth: false);

  Future<Map<String, dynamic>> getGainers({int limit = 10}) =>
      getMarketMovers(type: 'gainers', limit: limit);

  Future<Map<String, dynamic>> getLosers({int limit = 10}) =>
      getMarketMovers(type: 'losers', limit: limit);

  Future<Map<String, dynamic>> getGainersAndLosers({int limit = 10}) =>
      _get('/api/gainers-losers?limit=$limit', auth: false);

  Future<Map<String, dynamic>> search(String query) async {
    return _get('/api/scrip/search?q=${Uri.encodeQueryComponent(query)}', auth: true);
  }

  // ─── Token Registry ─────────────────────────────────────────────────────────
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

  Future<Map<String, dynamic>> getTokenLtps(List<String> tokens) =>
      _get('/api/tokens/ltp?tokens=${tokens.join(',')}', auth: false);

  // ─── Watchlist ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getWatchlists() => _get('/api/watchlists');

  Future<Map<String, dynamic>> getWatchlistItems(String watchlistId) =>
      _get('/api/watchlists/$watchlistId/items');

  Future<Map<String, dynamic>> createWatchlist(String name) =>
      _post('/api/watchlists', {'name': name}, auth: true);

  Future<Map<String, dynamic>> renameWatchlist(String watchlistId, String newName) =>
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

  // ─── Holdings ──────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getHoldings() => _get('/api/paper/portfolio/positions', auth: true);

  // ─── Orders & Balance ──────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getOrders({
    String? status,
    int limit = 50,
    int offset = 0,
  }) {
    return _get('/api/paper/portfolio/orders', auth: true);
  }

  Future<Map<String, dynamic>> getBalance() =>
      _get('/api/paper/user/balance', auth: true);

  Future<Map<String, dynamic>> placeOrder({
    required String symbol,
    required String exchange,
    required String transactionType,
    required String orderType,
    required String productType,
    required int quantity,
    double? price,
    double? triggerPrice,
    bool isPaper = false,
    String? token,
    String? tradingSymbol,
  }) =>
      _post('/api/paper/orders/place', {
        'token': token ?? symbol,
        'transaction_type': transactionType.toUpperCase(),
        'order_type': orderType.toUpperCase(),
        'quantity': quantity,
        if (price != null) 'price': price,
      }, auth: true);

  Future<Map<String, dynamic>> cancelOrder(String orderId) =>
      _post('/api/paper/orders/cancel', {'order_id': orderId}, auth: true);

  // ─── Positions ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getPositions({String? date}) {
    return _get('/api/paper/portfolio/positions', auth: true);
  }

  // ─── Chart data ────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getChartData(
          String symbol, String exchange, String timeframe) =>
      _get(
        '/api/yahoo-chart?symbol=${Uri.encodeQueryComponent(symbol)}'
        '&exchange=${Uri.encodeQueryComponent(exchange)}'
        '&timeframe=$timeframe',
        auth: false,
      );

  // ─── Option Chain & Expiries ───────────────────────────────────────────────
  // Backend: GET /api/optionchain/expiries?symbol=NIFTY
  // Returns: { symbol, expiries: string[], nearest: string }
  Future<Map<String, dynamic>> getOptionExpiries(String symbol) => _get(
        '/api/optionchain/expiries?symbol=${Uri.encodeQueryComponent(symbol)}',
        auth: false,
      );

  // Backend: GET /api/optionchain?symbol=NIFTY&expiry=2025-06-26&strikeCount=20
  // Returns: { symbol, expiry, spot, spotChange, spotChangePct, atm,
  //            strikeInterval, rows:[{strike,isAtm,isItm,ce:{...},pe:{...}}],
  //            analytics:{totalCallOI,...}, timestamp, source }
  Future<Map<String, dynamic>> getOptionChain(
    String symbol,
    String expiry, {
    int strikes = 20,
  }) =>
      _get(
        '/api/optionchain'
        '?symbol=${Uri.encodeQueryComponent(symbol)}'
        '&expiry=${Uri.encodeQueryComponent(expiry)}'
        '&strikeCount=$strikes',
        auth: false,
      );

  // ─── IV Data ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getIvData(
          String underlying, String expiry) =>
      _get(
        '/api/iv-data'
        '?underlying=${Uri.encodeQueryComponent(underlying)}'
        '&expiry=${Uri.encodeQueryComponent(expiry)}',
        auth: true,
      );

  // ─── Strategy Greeks ──────────────────────────────────────────────────────
  Future<Map<String, dynamic>> computeGreeks({
    required double spot,
    required double iv,
    required int dte,
    required List<Map<String, dynamic>> legsJson,
    double riskFreeRate = 0.07,
  }) =>
      _post(
        '/api/strategy/greeks',
        {
          'spot': spot,
          'iv': iv,
          'dte': dte,
          'risk_free_rate': riskFreeRate,
          'legs': legsJson,
        },
        auth: true,
      );

  // ─── Payoff ───────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getPayoff({
    required double spot,
    required double iv,
    required int dte,
    required List<Map<String, dynamic>> legsJson,
    double priceRangePct = 0.20,
    int points = 200,
  }) =>
      _post(
        '/api/strategy/payoff',
        {
          'spot': spot,
          'iv': iv,
          'dte': dte,
          'legs': legsJson,
          'price_range_pct': priceRangePct,
          'points': points,
        },
        auth: true,
      );

  // ─── Strategy Auto-Builder ────────────────────────────────────────────────
  Future<Map<String, dynamic>> buildStrategy({
    required String underlying,
    required String sentiment,
    required String expiry,
    int maxLegs = 4,
    double? maxRiskCr,
    double? minPop,
    double? maxPremiumCr,
  }) =>
      _post(
        '/api/strategy/build',
        {
          'underlying': underlying,
          'sentiment': sentiment,
          'expiry': expiry,
          'max_legs': maxLegs,
          if (maxRiskCr != null) 'max_risk_cr': maxRiskCr,
          if (minPop != null) 'min_pop': minPop,
          if (maxPremiumCr != null) 'max_premium_cr': maxPremiumCr,
        },
        auth: true,
      );

  // ─── Strategy Templates ───────────────────────────────────────────────────
  Future<Map<String, dynamic>> getStrategyTemplates({String? sentiment}) {
    final q = sentiment != null
        ? '?sentiment=${Uri.encodeQueryComponent(sentiment)}'
        : '';
    return _get('/api/strategy/templates$q', auth: false);
  }

  Future<Map<String, dynamic>> applyStrategyTemplate(
    int templateId, {
    required String underlying,
    required String expiry,
    required double spot,
    required double iv,
  }) =>
      _post(
        '/api/strategy/templates/$templateId/apply',
        {
          'underlying': underlying,
          'expiry': expiry,
          'spot': spot,
          'iv': iv,
        },
        auth: true,
      );

  // ─── Saved Strategies CRUD ────────────────────────────────────────────────
  Future<Map<String, dynamic>> getSavedStrategies({
    int page = 1,
    int limit = 20,
    String? search,
    String? sentiment,
  }) {
    var path = '/api/strategy/saved?page=$page&limit=$limit';
    if (search != null) path += '&search=${Uri.encodeQueryComponent(search)}';
    if (sentiment != null) {
      path += '&sentiment=${Uri.encodeQueryComponent(sentiment)}';
    }
    return _get(path, auth: true);
  }

  Future<Map<String, dynamic>> createSavedStrategy(
          Map<String, dynamic> payload) =>
      _post('/api/strategy/saved', payload, auth: true);

  Future<Map<String, dynamic>> getSavedStrategy(String id) =>
      _get('/api/strategy/saved/$id', auth: true);

  Future<Map<String, dynamic>> updateSavedStrategy(
          String id, Map<String, dynamic> payload) =>
      _patch('/api/strategy/saved/$id', payload, auth: true);

  Future<Map<String, dynamic>> deleteSavedStrategy(String id) =>
      _delete('/api/strategy/saved/$id', auth: true);

  Future<Map<String, dynamic>> duplicateSavedStrategy(String id) =>
      _post('/api/strategy/saved/$id/duplicate', {}, auth: true);

  // ─── Backtesting ─────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> startBacktest({
    required String strategyId,
    required String periodFrom,
    required String periodTo,
    String entryDay = 'monday',
    int entryDte = 30,
    int exitDte = 5,
    int stopLossPct = 50,
    int targetPct = 75,
  }) =>
      _post(
        '/api/strategy/backtest',
        {
          'strategy_id': strategyId,
          'period_from': periodFrom,
          'period_to': periodTo,
          'entry_day': entryDay,
          'entry_dte': entryDte,
          'exit_dte': exitDte,
          'stop_loss_pct': stopLossPct,
          'target_pct': targetPct,
        },
        auth: true,
      );

  Future<Map<String, dynamic>> pollBacktest(String jobId) =>
      _get('/api/strategy/backtest/$jobId', auth: true);
}
