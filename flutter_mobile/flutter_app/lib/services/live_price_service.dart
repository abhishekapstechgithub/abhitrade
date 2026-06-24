import 'dart:async';
import 'dart:convert';
import 'dart:io';
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

/// Connects to /api/market-stream (SSE) using dart:io for true unbuffered
/// streaming. Shared singleton — one SSE connection for the whole app.
class LivePriceService {
  LivePriceService._();
  static final LivePriceService instance = LivePriceService._();

  final StreamController<Map<String, QuoteUpdate>> _controller =
      StreamController.broadcast();

  Stream<Map<String, QuoteUpdate>> get stream => _controller.stream;

  final Set<String> _symbols = {};
  HttpClient? _httpClient;
  StreamSubscription? _lineSub;
  Timer? _reconnectTimer;
  bool _connecting = false;

  // Accumulates partial SSE lines across TCP chunks
  String _lineBuffer = '';

  void subscribe(Iterable<String> symbols) {
    final normalised = symbols.map((s) => s.toUpperCase()).toSet();
    final isNewSymbols = !_symbols.containsAll(normalised);
    _symbols.addAll(normalised);
    // Reconnect if new symbols were added OR if the connection dropped
    if (isNewSymbols || _httpClient == null) {
      _connecting = false;
      _connect();
    }
  }

  // Only call this when you intentionally want to replace the entire symbol set
  // (e.g. a standalone screen that owns its own SSE subscription lifecycle).
  void replaceSubscription(Iterable<String> symbols) {
    _symbols
      ..clear()
      ..addAll(symbols.map((s) => s.toUpperCase()));
    _connecting = false;
    _connect();
  }

  void _connect() {
    if (_symbols.isEmpty || _connecting) return;
    _connecting = true;

    _reconnectTimer?.cancel();
    _lineSub?.cancel();
    _httpClient?.close(force: true);
    _httpClient = null;
    _lineBuffer = '';

    final uri = Uri.parse('${AppConstants.apiBase}/api/market-stream')
        .replace(queryParameters: {'symbols': _symbols.join(',')});

    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 10)
      ..autoUncompress = false; // keep raw bytes for streaming
    _httpClient = client;

    client.getUrl(uri).then((req) {
      req.headers
        ..set(HttpHeaders.acceptHeader, 'text/event-stream')
        ..set(HttpHeaders.cacheControlHeader, 'no-cache')
        ..set('X-Accel-Buffering', 'no'); // disable nginx buffering
      return req.close();
    }).then((res) {
      _connecting = false;
      // Decode bytes → string manually so we can handle partial chunks
      _lineSub = res
          .transform(utf8.decoder)
          .listen(
            _onChunk,
            onError: (_) => _scheduleReconnect(),
            onDone: _scheduleReconnect,
            cancelOnError: true,
          );
    }).catchError((_) {
      _connecting = false;
      _scheduleReconnect();
    });
  }

  // Process raw SSE text that may contain multiple partial lines per TCP chunk.
  void _onChunk(String chunk) {
    _lineBuffer += chunk;
    // Split on newlines but keep the last (potentially incomplete) fragment
    final parts = _lineBuffer.split('\n');
    _lineBuffer = parts.removeLast(); // incomplete tail
    for (final line in parts) {
      _onLine(line.trimRight());
    }
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
    _reconnectTimer = Timer(const Duration(seconds: 2), () {
      _connecting = false;
      _connect();
    });
  }

  void dispose() {
    _reconnectTimer?.cancel();
    _lineSub?.cancel();
    _httpClient?.close(force: true);
    _controller.close();
  }
}
