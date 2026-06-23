import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/constants.dart';

class QuoteUpdate {
  final String symbol;
  final String exchange;
  final double ltp;
  final double netChange;
  final double changePct;
  final double? high;
  final double? low;
  final double? open;
  final double? prevClose;
  final int? volume;

  const QuoteUpdate({
    required this.symbol,
    required this.exchange,
    required this.ltp,
    required this.netChange,
    required this.changePct,
    this.high,
    this.low,
    this.open,
    this.prevClose,
    this.volume,
  });

  factory QuoteUpdate.fromJson(Map<String, dynamic> j) => QuoteUpdate(
        symbol:    (j['symbol']   ?? '').toString().toUpperCase(),
        exchange:  (j['exchange'] ?? 'NSE').toString().toUpperCase(),
        ltp:       _d(j['ltp']       ?? 0),
        netChange: _d(j['netChange'] ?? j['net_change'] ?? 0),
        changePct: _d(j['changePct'] ?? j['change_pct'] ?? 0),
        high:      j['high']      != null ? _d(j['high'])      : null,
        low:       j['low']       != null ? _d(j['low'])       : null,
        open:      j['open']      != null ? _d(j['open'])      : null,
        prevClose: j['prevClose'] != null ? _d(j['prevClose']) : null,
        volume:    j['volume']    != null ? _i(j['volume'])    : null,
      );

  // e.g. "NSE:RELIANCE"
  String get key => '$exchange:$symbol';
}

double _d(dynamic v) =>
    (v is num) ? v.toDouble() : double.tryParse(v.toString()) ?? 0.0;
int _i(dynamic v) =>
    (v is int) ? v : int.tryParse(v.toString()) ?? 0;

/// Connects to /api/market-stream (SSE) and broadcasts live quote ticks.
/// Shared singleton — one SSE connection for the whole app.
class LivePriceService {
  LivePriceService._();
  static final LivePriceService instance = LivePriceService._();

  final StreamController<Map<String, QuoteUpdate>> _controller =
      StreamController.broadcast();

  Stream<Map<String, QuoteUpdate>> get stream => _controller.stream;

  final Set<String> _symbols = {};
  http.Client? _client;
  StreamSubscription<String>? _lineSub;
  Timer? _reconnectTimer;
  bool _connecting = false;

  /// Add [symbols] to live subscription (format: "NSE:RELIANCE", "BSE:SENSEX").
  /// Reconnects with the full merged set if new symbols are added.
  void subscribe(Iterable<String> symbols) {
    final normalised = symbols.map((s) => s.toUpperCase()).toSet();
    if (_symbols.containsAll(normalised) && _client != null) return;
    _symbols.addAll(normalised);
    _connect();
  }

  /// Replace the entire symbol set and force a reconnect.
  void replaceSubscription(Iterable<String> symbols) {
    _symbols
      ..clear()
      ..addAll(symbols.map((s) => s.toUpperCase()));
    // Reset flag so _connect() always proceeds for an explicit replace.
    _connecting = false;
    _connect();
  }

  void _connect() {
    if (_symbols.isEmpty || _connecting) return;
    _connecting = true;

    _reconnectTimer?.cancel();
    _lineSub?.cancel();
    _client?.close();
    _client = null;

    // apiBase = "https://abhitrade.com/api" → strip "/api" for root
    final base = AppConstants.apiBase.replaceFirst(RegExp(r'/api$'), '');
    final uri = Uri.parse('$base/api/market-stream')
        .replace(queryParameters: {'symbols': _symbols.join(',')});

    final client = http.Client();
    _client = client;
    final req = http.Request('GET', uri)
      ..headers['Accept'] = 'text/event-stream'
      ..headers['Cache-Control'] = 'no-cache';

    client.send(req).then((res) {
      _connecting = false;
      _lineSub = res.stream
          .transform(utf8.decoder)
          .transform(const LineSplitter())
          .listen(
            _onLine,
            onError: (_) => _scheduleReconnect(),
            onDone: _scheduleReconnect,
            cancelOnError: true,
          );
    }).catchError((_) {
      _connecting = false;
      _scheduleReconnect();
    });
  }

  void _onLine(String line) {
    if (!line.startsWith('data: ')) return;
    final payload = line.substring(6).trim();
    if (payload.isEmpty) return;
    try {
      final decoded = jsonDecode(payload);
      if (decoded is! List) return;
      final updates = <String, QuoteUpdate>{};
      for (final item in decoded) {
        if (item is Map<String, dynamic>) {
          final q = QuoteUpdate.fromJson(item);
          if (q.ltp > 0) updates[q.key] = q;
        }
      }
      if (updates.isNotEmpty && !_controller.isClosed) {
        _controller.add(updates);
      }
    } catch (_) {}
  }

  void _scheduleReconnect() {
    if (_controller.isClosed) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(const Duration(seconds: 5), () {
      _connecting = false;
      _connect();
    });
  }

  void dispose() {
    _reconnectTimer?.cancel();
    _lineSub?.cancel();
    _client?.close();
    _controller.close();
  }
}
