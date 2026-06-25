import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../config/constants.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../orders/place_order_sheet.dart';

// ── Public selection model (used by strategy screen) ─────────────────────────
class StrategyLegSelection {
  final double strike;
  final double ltp;
  final bool isCall;
  final bool isBuy;
  final int qtyLots;
  const StrategyLegSelection({
    required this.strike, required this.ltp,
    required this.isCall, required this.isBuy, this.qtyLots = 1,
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────
class OptionChainScreen extends StatelessWidget {
  final String symbol;
  final String exchange;
  final int lotSize;
  // Strategy mode: returns all staged legs at once
  final void Function(List<StrategyLegSelection>)? onLegsSelected;
  // Watch mode (legacy): single-leg order flow
  final void Function(double strike, double ltp, bool isCall, bool isBuy)? onLegSelected;

  const OptionChainScreen._({
    required this.symbol, required this.exchange, this.lotSize = 75,
    this.onLegsSelected, this.onLegSelected,
  });

  static void show(BuildContext context, {
    required String symbol,
    required String exchange,
    int lotSize = 75,
    void Function(List<StrategyLegSelection>)? onLegsSelected,
    void Function(double strike, double ltp, bool isCall, bool isBuy)? onLegSelected,
  }) {
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => OptionChainScreen._(
        symbol: symbol, exchange: exchange, lotSize: lotSize,
        onLegsSelected: onLegsSelected, onLegSelected: onLegSelected,
      ),
    ));
  }

  bool get _isStrategyMode => onLegsSelected != null;

  @override
  Widget build(BuildContext context) => _OptionChainBody(
    symbol: symbol, exchange: exchange, lotSize: lotSize,
    onLegsSelected: onLegsSelected, onLegSelected: onLegSelected,
    isStrategyMode: _isStrategyMode,
  );
}

// ── Row model ─────────────────────────────────────────────────────────────────
class _OptRow {
  final double strike;
  final double callLtp, callPct, callOi, callOiChg, callVol, callIv;
  final double callDelta, callTheta, callGamma, callVega;
  final double putLtp, putPct, putOi, putOiChg, putVol, putIv;
  final double putDelta, putTheta, putGamma, putVega;
  final bool isAtm;
  const _OptRow({
    required this.strike,
    required this.callLtp, required this.callPct,
    required this.callOi,  required this.callOiChg, required this.callVol,
    this.callIv = 0,
    this.callDelta = 0, this.callTheta = 0, this.callGamma = 0, this.callVega = 0,
    required this.putLtp,  required this.putPct,
    required this.putOi,   required this.putOiChg,  required this.putVol,
    this.putIv = 0,
    this.putDelta = 0, this.putTheta = 0, this.putGamma = 0, this.putVega = 0,
    this.isAtm = false,
  });

  double get iv => callIv > 0 ? callIv : putIv;
}

// ── Index tab model ───────────────────────────────────────────────────────────
class _IndexTab {
  final String label, symbol, exchange;
  double ltp = 0, change = 0, changePct = 0;
  _IndexTab({required this.label, required this.symbol, required this.exchange});
}

// ── Staged leg (multi-select state) ──────────────────────────────────────────
class _StagedLeg {
  final double strike;
  double ltp;
  final bool isCall;
  bool isBuy;
  int qtyLots;
  _StagedLeg({required this.strike, required this.ltp,
    required this.isCall, required this.isBuy, this.qtyLots = 1});
  String get key => '${strike.toInt()}_${isCall ? 'CE' : 'PE'}';
}

// ── Expiry label formatter ────────────────────────────────────────────────────
String _expiryLabel(String ymd) {
  // ymd = "YYYY-MM-DD" → "30 Jun '26"
  try {
    final d = DateTime.parse(ymd);
    return DateFormat("dd MMM ''yy").format(d);
  } catch (_) {
    return ymd;
  }
}

String _expiryShort(String ymd) {
  // "YYYY-MM-DD" → "30 Jun"
  try {
    final d = DateTime.parse(ymd);
    return DateFormat('dd MMM').format(d);
  } catch (_) {
    return ymd;
  }
}

// ── Body ──────────────────────────────────────────────────────────────────────
class _OptionChainBody extends StatefulWidget {
  final String symbol, exchange;
  final int lotSize;
  final bool isStrategyMode;
  final void Function(List<StrategyLegSelection>)? onLegsSelected;
  final void Function(double strike, double ltp, bool isCall, bool isBuy)? onLegSelected;

  const _OptionChainBody({
    required this.symbol, required this.exchange, required this.lotSize,
    required this.isStrategyMode, this.onLegsSelected, this.onLegSelected,
  });

  @override
  State<_OptionChainBody> createState() => _OptionChainBodyState();
}

class _OptionChainBodyState extends State<_OptionChainBody> {
  static final _tabs = [
    _IndexTab(label: 'NIFTY 50',  symbol: 'NIFTY',     exchange: 'NSE'),
    _IndexTab(label: 'BANKNIFTY', symbol: 'BANKNIFTY', exchange: 'NSE'),
    _IndexTab(label: 'FINNIFTY',  symbol: 'FINNIFTY',  exchange: 'NSE'),
    _IndexTab(label: 'SENSEX',    symbol: 'SENSEX',    exchange: 'BSE'),
    _IndexTab(label: 'BANKEX',    symbol: 'BANKEX',    exchange: 'BSE'),
  ];

  int _tabIdx = 0;
  List<String> _expiries = [];   // YYYY-MM-DD strings from API
  String _selectedExpiry = '';

  // View mode in strategy: 0=LTP, 1=OI, 2=Greeks
  int _viewMode = 0;
  bool _showOiVolume = true; // watch mode
  bool _fullChain = false;

  List<_OptRow> _allRows = [];
  List<_OptRow> _rows = [];
  bool _loading = true; // true from start so spinner shows immediately
  String? _error;
  Timer? _refreshTimer;
  double _spot = 0; // live spot price for ITM/OTM coloring
  int _retryCount = 0;
  // Incremented on every tab switch so stale in-flight responses are discarded.
  int _loadId = 0;

  // SSE state for live option chain updates
  HttpClient? _sseClient;
  StreamSubscription<String>? _sseSub;
  String _sseBuffer = '';
  String _sseEvent = '';
  bool _sseFailed = false;

  // Strategy mode state
  final Map<String, _StagedLeg> _staged = {}; // key = strike_CE/PE
  double? _expandedCallStrike;  // which strike's call side is expanded
  double? _expandedPutStrike;   // which strike's put side is expanded

  // Watch mode state
  double? _selectedStrike;

  _IndexTab get _currentTab => _tabs[_tabIdx];

  @override
  void initState() {
    super.initState();
    final match = _tabs.indexWhere((t) =>
        t.symbol.toUpperCase() == widget.symbol.toUpperCase() ||
        t.label.toUpperCase().contains(widget.symbol.toUpperCase()));
    _tabIdx = match >= 0 ? match : 0;
    _loadExpiriesThenChain();
    _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) {
      if (!mounted) return;
      if (_rows.isEmpty && !_loading) {
        _silentRetry();
      } else if (_rows.isNotEmpty && _sseFailed) {
        // SSE is down — REST fallback until SSE reconnects
        _loadChain(silent: true);
      }
    });
  }

  Future<void> _loadExpiriesThenChain() async {
    if (!mounted) return;
    final capturedTabIdx = _tabIdx;
    final capturedLoadId = ++_loadId;
    setState(() { _loading = true; _error = null; });
    final tab = _tabs[capturedTabIdx];
    try {
      final res = await ApiService.instance.getOptionChainExpiries(
          tab.symbol, exchange: tab.exchange);
      // Discard if user switched tabs while we were waiting
      if (!mounted || _tabIdx != capturedTabIdx || capturedLoadId != _loadId) return;
      final list = (res['expiries'] as List<dynamic>? ?? [])
          .map((e) => e.toString())
          .toList();
      final nearest = res['nearest']?.toString() ?? '';
      if (mounted && list.isNotEmpty) {
        setState(() {
          _expiries = list;
          _selectedExpiry = nearest.isNotEmpty ? nearest : list.first;
        });
        await _loadChain();
        if (mounted) _startSse();
      } else if (mounted) {
        // Server returned empty expiries — show error and retry the full flow
        setState(() {
          _error = 'Could not load expiry dates. Retrying…';
          _loading = false;
        });
        _scheduleAutoRetry();
      }
    } catch (e) {
      // Expiries endpoint failed (e.g. 503) — don't use local-generated dates
      // because they won't match the server's actual expiry schedule.
      // Instead retry the full flow so we get real dates when the server recovers.
      if (mounted && _tabIdx == capturedTabIdx) {
        setState(() {
          _error = 'Server temporarily unavailable. Retrying…';
          _loading = false;
        });
        _scheduleAutoRetry();
      }
    }
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    _stopSse();
    super.dispose();
  }

  Future<void> _loadChain({bool silent = false}) async {
    if (_selectedExpiry.isEmpty) return; // wait until expiry is set
    // Capture context before any await so stale responses can be detected
    final capturedTabIdx = _tabIdx;
    final capturedExpiry = _selectedExpiry;
    final capturedLoadId = _loadId;
    if (!silent && mounted) setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiService.instance
          .getOptionChain(_tabs[capturedTabIdx].symbol, capturedExpiry);
      // Discard if user switched tabs or expiry while waiting
      if (!mounted || _tabIdx != capturedTabIdx || _selectedExpiry != capturedExpiry
          || capturedLoadId != _loadId) return;

      final spot = _d(res['spot'] ?? 0);
      if (spot > 0) {
        _tabs[capturedTabIdx].ltp = spot;
        _spot = spot;
      }
      // Update change/pct for ATM separator (API sends spotChange/spotChangePct)
      final spotChg = _d(res['spotChange'] ?? 0);
      final spotChgPct = _d(res['spotChangePct'] ?? 0);
      if (spotChg != 0) {
        _tabs[capturedTabIdx].change = spotChg;
        _tabs[capturedTabIdx].changePct = spotChgPct;
      }

      final rowList = (res['rows'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();

      if (rowList.isEmpty) {
        if (mounted && !silent) {
          setState(() {
            _error = 'No option data for this expiry. The market may be closed.';
            _loading = false;
          });
          _scheduleAutoRetry();
        } else if (mounted) {
          setState(() { _loading = false; });
        }
        return;
      }
      _retryCount = 0; // reset on success

      final built = rowList.map((row) {
        final strike = _d(row['strike'] ?? 0);
        final ce = row['ce'] as Map<String, dynamic>? ?? {};
        final pe = row['pe'] as Map<String, dynamic>? ?? {};
        // API returns 'changeOi', not 'oiChange'. Compute percentChange from ltp/close.
        final ceLtp   = _d(ce['ltp']   ?? 0);
        final ceClose = _d(ce['close'] ?? 0);
        final peLtp   = _d(pe['ltp']   ?? 0);
        final peClose = _d(pe['close'] ?? 0);
        return _OptRow(
          strike:    strike,
          callLtp:   ceLtp,
          callPct:   ceClose > 0 ? (ceLtp - ceClose) / ceClose * 100 : 0,
          callOi:    _d(ce['oi']       ?? 0),
          callOiChg: _d(ce['changeOi'] ?? 0),
          callVol:   _d(ce['volume']   ?? 0),
          callIv:    _d(ce['iv']       ?? 0),
          callDelta: _d(ce['delta']    ?? 0),
          callTheta: _d(ce['theta']    ?? 0),
          callGamma: _d(ce['gamma']    ?? 0),
          callVega:  _d(ce['vega']     ?? 0),
          putLtp:    peLtp,
          putPct:    peClose > 0 ? (peLtp - peClose) / peClose * 100 : 0,
          putOi:     _d(pe['oi']       ?? 0),
          putOiChg:  _d(pe['changeOi'] ?? 0),
          putVol:    _d(pe['volume']   ?? 0),
          putIv:     _d(pe['iv']       ?? 0),
          putDelta:  _d(pe['delta']    ?? 0),
          putTheta:  _d(pe['theta']    ?? 0),
          putGamma:  _d(pe['gamma']    ?? 0),
          putVega:   _d(pe['vega']     ?? 0),
          isAtm:     row['isAtm'] == true,
        );
      }).toList();

      if (mounted) {
        setState(() {
          _allRows = built;
          _rows    = _fullChain ? built : _sliceAroundAtm(built);
          _loading = false;
          _error   = null;
        });
      }
    } on ApiException catch (e) {
      if (mounted && _tabIdx == capturedTabIdx) {
        if (!silent) {
          setState(() {
            _error = (e.statusCode == 502 || e.statusCode == 503)
                ? 'Server temporarily unavailable. Retrying…'
                : e.message;
            _loading = false;
          });
        }
        if (e.statusCode == 502 || e.statusCode == 503) _scheduleAutoRetry();
      }
    } catch (e) {
      final msg = e.toString();
      if (mounted && _tabIdx == capturedTabIdx) {
        if (!silent) {
          setState(() {
            _error = msg.contains('SocketException') || msg.contains('Connection refused')
                ? 'Network error. Check your connection and try again.'
                : msg.contains('TimeoutException')
                    ? 'Request timed out. Retrying…'
                    : 'Unable to load option chain. Tap Retry.';
            _loading = false;
          });
        }
        // auto-retry on transient errors
        if (msg.contains('TimeoutException') || msg.contains('SocketException')) {
          _scheduleAutoRetry();
        }
      }
    }
  }

  void _scheduleAutoRetry() {
    // After initial burst (3s, 6s, 9s), the 5-second timer takes over silently.
    // No hard limit — server eventually comes back.
    if (_retryCount >= 3) return;
    _retryCount++;
    Future.delayed(Duration(seconds: _retryCount * 3), () {
      if (!mounted || _rows.isNotEmpty) return;
      _silentRetry();
    });
  }

  /// Retries loading without showing a spinner — keeps existing error message visible.
  Future<void> _silentRetry() async {
    if (_loading) return;
    final capturedTabIdx = _tabIdx;
    final tab = _tabs[capturedTabIdx];
    try {
      // Re-fetch expiries if we don't have them yet
      if (_expiries.isEmpty) {
        final res = await ApiService.instance
            .getOptionChainExpiries(tab.symbol, exchange: tab.exchange);
        if (!mounted || _tabIdx != capturedTabIdx) return;
        final list = (res['expiries'] as List<dynamic>? ?? [])
            .map((e) => e.toString())
            .toList();
        final nearest = res['nearest']?.toString() ?? '';
        if (mounted && list.isNotEmpty) {
          setState(() {
            _expiries = list;
            _selectedExpiry = nearest.isNotEmpty ? nearest : list.first;
          });
        } else {
          return;
        }
      }
      if (_selectedExpiry.isEmpty || !mounted) return;
      final capturedExpiry = _selectedExpiry;
      final res = await ApiService.instance
          .getOptionChain(tab.symbol, capturedExpiry);
      if (!mounted || _tabIdx != capturedTabIdx || _selectedExpiry != capturedExpiry) return;
      final rowList = (res['rows'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();
      if (rowList.isEmpty) return;
      // Success — parse and display
      final spot = _d(res['spot'] ?? 0);
      if (spot > 0) { _tabs[capturedTabIdx].ltp = spot; _spot = spot; }
      final spotChg = _d(res['spotChange'] ?? 0);
      if (spotChg != 0) {
        _tabs[capturedTabIdx].change = spotChg;
        _tabs[capturedTabIdx].changePct = _d(res['spotChangePct'] ?? 0);
      }
      final built = rowList.map((row) {
        final strike = _d(row['strike'] ?? 0);
        final ce = row['ce'] as Map<String, dynamic>? ?? {};
        final pe = row['pe'] as Map<String, dynamic>? ?? {};
        final ceLtp   = _d(ce['ltp']   ?? 0);
        final ceClose = _d(ce['close'] ?? 0);
        final peLtp   = _d(pe['ltp']   ?? 0);
        final peClose = _d(pe['close'] ?? 0);
        return _OptRow(
          strike:    strike,
          callLtp:   ceLtp,
          callPct:   ceClose > 0 ? (ceLtp - ceClose) / ceClose * 100 : 0,
          callOi:    _d(ce['oi']       ?? 0),
          callOiChg: _d(ce['changeOi'] ?? 0),
          callVol:   _d(ce['volume']   ?? 0),
          callIv:    _d(ce['iv']       ?? 0),
          callDelta: _d(ce['delta']    ?? 0),
          callTheta: _d(ce['theta']    ?? 0),
          callGamma: _d(ce['gamma']    ?? 0),
          callVega:  _d(ce['vega']     ?? 0),
          putLtp:    peLtp,
          putPct:    peClose > 0 ? (peLtp - peClose) / peClose * 100 : 0,
          putOi:     _d(pe['oi']       ?? 0),
          putOiChg:  _d(pe['changeOi'] ?? 0),
          putVol:    _d(pe['volume']   ?? 0),
          putIv:     _d(pe['iv']       ?? 0),
          putDelta:  _d(pe['delta']    ?? 0),
          putTheta:  _d(pe['theta']    ?? 0),
          putGamma:  _d(pe['gamma']    ?? 0),
          putVega:   _d(pe['vega']     ?? 0),
          isAtm:     row['isAtm'] == true,
        );
      }).toList();
      _retryCount = 0;
      setState(() {
        _allRows = built;
        _rows    = _fullChain ? built : _sliceAroundAtm(built);
        _loading = false;
        _error   = null;
      });
      _startSse();
    } catch (_) {
      // silent failure — keep existing error, timer will retry again
    }
  }

  List<_OptRow> _sliceAroundAtm(List<_OptRow> all) {
    if (all.isEmpty) return all;
    final idx = all.indexWhere((r) => r.isAtm);
    if (idx == -1) return all;
    final start = (idx - 7).clamp(0, all.length);
    final end   = (idx + 8).clamp(0, all.length);
    return all.sublist(start, end);
  }

  // ── Shared row parser (used by REST and SSE paths) ───────────────────────────
  _OptRow _parseRow(Map<String, dynamic> row) {
    final strike  = _d(row['strike'] ?? 0);
    final ce      = row['ce'] as Map<String, dynamic>? ?? {};
    final pe      = row['pe'] as Map<String, dynamic>? ?? {};
    final ceLtp   = _d(ce['ltp']   ?? 0);
    final ceClose = _d(ce['close'] ?? 0);
    final peLtp   = _d(pe['ltp']   ?? 0);
    final peClose = _d(pe['close'] ?? 0);
    return _OptRow(
      strike:    strike,
      callLtp:   ceLtp,
      callPct:   ceClose > 0 ? (ceLtp - ceClose) / ceClose * 100 : 0,
      callOi:    _d(ce['oi']       ?? 0),
      callOiChg: _d(ce['changeOi'] ?? 0),
      callVol:   _d(ce['volume']   ?? 0),
      callIv:    _d(ce['iv']       ?? 0),
      callDelta: _d(ce['delta']    ?? 0),
      callTheta: _d(ce['theta']    ?? 0),
      callGamma: _d(ce['gamma']    ?? 0),
      callVega:  _d(ce['vega']     ?? 0),
      putLtp:    peLtp,
      putPct:    peClose > 0 ? (peLtp - peClose) / peClose * 100 : 0,
      putOi:     _d(pe['oi']       ?? 0),
      putOiChg:  _d(pe['changeOi'] ?? 0),
      putVol:    _d(pe['volume']   ?? 0),
      putIv:     _d(pe['iv']       ?? 0),
      putDelta:  _d(pe['delta']    ?? 0),
      putTheta:  _d(pe['theta']    ?? 0),
      putGamma:  _d(pe['gamma']    ?? 0),
      putVega:   _d(pe['vega']     ?? 0),
      isAtm:     row['isAtm'] == true,
    );
  }

  // ── SSE: live option chain stream (2-second delta updates) ───────────────────
  void _startSse() {
    _stopSse();
    if (!mounted || _selectedExpiry.isEmpty) return;
    _connectSse(_tabIdx, _selectedExpiry);
  }

  Future<void> _connectSse(int capturedTabIdx, String capturedExpiry) async {
    final tab = _tabs[capturedTabIdx];
    final url = '${AppConstants.apiBase}/api/optionchain/stream'
        '?symbol=${tab.symbol}&expiry=$capturedExpiry&strikeCount=20';
    final client = HttpClient()
      ..connectionTimeout = const Duration(seconds: 10)
      ..autoUncompress = false;
    _sseClient = client;
    try {
      final req = await client.getUrl(Uri.parse(url));
      req.headers
        ..set(HttpHeaders.acceptHeader, 'text/event-stream')
        ..set(HttpHeaders.cacheControlHeader, 'no-cache')
        ..set('X-Accel-Buffering', 'no');
      final res = await req.close();
      if (!mounted || _tabIdx != capturedTabIdx || _selectedExpiry != capturedExpiry) {
        await res.drain<void>(); return;
      }
      _sseSub = res.transform(utf8.decoder).listen(
        _onSseChunk,
        onError: (_) => _onSseDisconnect(),
        onDone: _onSseDisconnect,
        cancelOnError: true,
      );
    } catch (_) {
      _onSseDisconnect();
    }
  }

  void _stopSse() {
    _sseSub?.cancel(); _sseSub = null;
    _sseClient?.close(force: true); _sseClient = null;
    _sseBuffer = ''; _sseEvent = '';
  }

  void _onSseDisconnect() {
    if (!mounted) return;
    _sseFailed = true;
    _stopSse();
    Future.delayed(const Duration(seconds: 3), () {
      if (mounted && _selectedExpiry.isNotEmpty) {
        _sseFailed = false;
        _startSse();
      }
    });
  }

  void _onSseChunk(String chunk) {
    _sseBuffer += chunk;
    while (true) {
      final nl = _sseBuffer.indexOf('\n');
      if (nl == -1) break;
      final line = _sseBuffer.substring(0, nl).trimRight();
      _sseBuffer = _sseBuffer.substring(nl + 1);
      _onSseLine(line);
    }
  }

  void _onSseLine(String line) {
    if (line.startsWith('event: ')) {
      _sseEvent = line.substring(7).trim();
    } else if (line.startsWith('data: ')) {
      final data = line.substring(6).trim();
      if (data.isEmpty) return;
      try {
        final json = jsonDecode(data) as Map<String, dynamic>;
        if (_sseEvent == 'snapshot')    _applySseSnapshot(json);
        else if (_sseEvent == 'delta')  _applySseDelta(json);
        else if (_sseEvent == 'error' && _rows.isEmpty) {
          if (mounted) setState(() { _error = json['message']?.toString() ?? 'Stream error'; _loading = false; });
        }
      } catch (_) {}
    } else if (line.isEmpty) {
      _sseEvent = '';
    }
  }

  void _applySseSnapshot(Map<String, dynamic> res) {
    if (!mounted) return;
    final spot = _d(res['spot'] ?? 0);
    if (spot > 0) { _tabs[_tabIdx].ltp = spot; _spot = spot; }
    final spotChg = _d(res['spotChange'] ?? 0);
    if (spotChg != 0) {
      _tabs[_tabIdx].change = spotChg;
      _tabs[_tabIdx].changePct = _d(res['spotChangePct'] ?? 0);
    }
    final rowList = (res['rows'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    if (rowList.isEmpty) return;
    final built = rowList.map(_parseRow).toList();
    _retryCount = 0;
    setState(() {
      _allRows = built;
      _rows = _fullChain ? built : _sliceAroundAtm(built);
      _loading = false; _error = null;
    });
  }

  void _applySseDelta(Map<String, dynamic> delta) {
    if (!mounted || _allRows.isEmpty) return;
    final spot = _d(delta['spot'] ?? 0);
    if (spot > 0) { _tabs[_tabIdx].ltp = spot; _spot = spot; }
    final spotChg = _d(delta['spotChange'] ?? 0);
    if (spotChg != 0) {
      _tabs[_tabIdx].change = spotChg;
      _tabs[_tabIdx].changePct = _d(delta['spotChangePct'] ?? 0);
    }
    final changedRowList = (delta['rows'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    if (changedRowList.isEmpty) { setState(() {}); return; }
    final deltaMap = <double, Map<String, dynamic>>{
      for (final r in changedRowList) _d(r['strike'] ?? 0): r,
    };
    final updated = _allRows.map((r) => deltaMap[r.strike] != null ? _parseRow(deltaMap[r.strike]!) : r).toList();
    setState(() {
      _allRows = updated;
      _rows = _fullChain ? updated : _sliceAroundAtm(updated);
    });
  }

  static double _d(dynamic v) =>
      (v is num) ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0.0;

  static final _fmtNum = NumberFormat('#,##,##0.00');
  static final _fmtInt = NumberFormat('#,##,##0');

  String _fmtLtp(double v)    => _fmtNum.format(v);
  String _fmtStrike(double v) => _fmtInt.format(v);

  String _fmtOi(double v) {
    if (v.abs() >= 1e7) return '${(v / 1e7).toStringAsFixed(1)}Cr';
    if (v.abs() >= 1e5) return '${(v / 1e5).toStringAsFixed(1)}L';
    if (v.abs() >= 1e3) return '${(v / 1e3).toStringAsFixed(0)}K';
    return v.toStringAsFixed(0);
  }

  // ── Expiry label (short: "30 Jun") ────────────────────────────────────────────
  String get _expiryShortLabel => _expiryShort(_selectedExpiry);

  // ── Staged leg helpers ────────────────────────────────────────────────────────
  _StagedLeg? _getStagedCall(double strike) =>
      _staged['${strike.toInt()}_CE'];
  _StagedLeg? _getStagedPut(double strike) =>
      _staged['${strike.toInt()}_PE'];

  void _toggleStagedCall(double strike, double ltp, bool isBuy) {
    final key = '${strike.toInt()}_CE';
    setState(() {
      if (_staged[key]?.isBuy == isBuy) {
        _staged.remove(key);
      } else {
        _staged[key] = _StagedLeg(strike: strike, ltp: ltp, isCall: true, isBuy: isBuy);
      }
    });
  }

  void _toggleStagedPut(double strike, double ltp, bool isBuy) {
    final key = '${strike.toInt()}_PE';
    setState(() {
      if (_staged[key]?.isBuy == isBuy) {
        _staged.remove(key);
      } else {
        _staged[key] = _StagedLeg(strike: strike, ltp: ltp, isCall: false, isBuy: isBuy);
      }
    });
  }

  void _done() {
    final legs = _staged.values.map((l) => StrategyLegSelection(
      strike: l.strike, ltp: l.ltp, isCall: l.isCall,
      isBuy: l.isBuy, qtyLots: l.qtyLots,
    )).toList();
    widget.onLegsSelected!(legs);
    Navigator.pop(context);
  }

  // ── Build ────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    if (widget.isStrategyMode) return _buildStrategyMode(ext);
    return _buildWatchMode(ext);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  STRATEGY MODE
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildStrategyMode(AppThemeExtension ext) {
    return Scaffold(
      backgroundColor: ext.surface,
      body: SafeArea(
        child: Column(children: [
          _strategyHeader(ext),
          _strategyColHeaders(ext),
          Expanded(child: _strategyChainBody(ext)),
          _strategyBottomBar(ext),
        ]),
      ),
    );
  }

  // Header: back | Expiry dropdown | LTP/OI/Greeks toggle | gear
  Widget _strategyHeader(AppThemeExtension ext) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: ext.border, width: 0.5))),
      child: Row(children: [
        GestureDetector(
          onTap: () => Navigator.pop(context),
          child: Icon(Icons.arrow_back_ios_new, color: ext.textPrimary, size: 18),
        ),
        const SizedBox(width: 12),
        // Expiry dropdown pill
        GestureDetector(
          onTap: () => _pickExpiry(context),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.blue.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.blue.withValues(alpha: 0.4)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(_expiryShortLabel,
                  style: TextStyle(color: AppColors.blue, fontSize: 13,
                      fontWeight: FontWeight.w700)),
              const SizedBox(width: 4),
              Icon(Icons.keyboard_arrow_down_rounded, color: AppColors.blue, size: 16),
            ]),
          ),
        ),
        const SizedBox(width: 12),
        // LTP / OI / Greeks toggle
        Expanded(
          child: Container(
            height: 32,
            decoration: BoxDecoration(
              color: ext.card,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: ext.border),
            ),
            child: Row(children: [
              _viewToggleBtn('LTP', 0, ext),
              _viewToggleBtn('OI', 1, ext),
              _viewToggleBtn('Greeks', 2, ext),
            ]),
          ),
        ),
        const SizedBox(width: 10),
        Icon(Icons.settings_outlined, color: ext.textSecondary, size: 22),
      ]),
    );
  }

  Widget _viewToggleBtn(String label, int idx, AppThemeExtension ext) {
    final sel = _viewMode == idx;
    return Expanded(
      child: GestureDetector(
        onTap: () => setState(() => _viewMode = idx),
        child: Container(
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: sel ? AppColors.blue : Colors.transparent,
            borderRadius: BorderRadius.circular(7),
          ),
          child: Text(label,
              style: TextStyle(
                  color: sel ? Colors.white : ext.textSecondary,
                  fontSize: 12,
                  fontWeight: sel ? FontWeight.w700 : FontWeight.w500)),
        ),
      ),
    );
  }

  // Column headers — changes with view mode
  Widget _strategyColHeaders(AppThemeExtension ext) {
    final String callHeader, putHeader;
    switch (_viewMode) {
      case 1:  callHeader = 'Call OI';   putHeader = 'Put OI';   break;
      case 2:  callHeader = 'Call Δ';    putHeader = 'Put Δ';    break;
      default: callHeader = 'Call LTP';  putHeader = 'Put LTP';  break;
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: ext.border, width: 0.5))),
      child: Row(children: [
        Expanded(
          child: Row(children: [
            Text(callHeader,
                style: TextStyle(color: ext.textMuted, fontSize: 10.5,
                    fontWeight: FontWeight.w600)),
            const Spacer(),
            Text('Call OI ',
                style: TextStyle(color: ext.textMuted, fontSize: 10.5,
                    fontWeight: FontWeight.w600)),
            Container(width: 8, height: 8,
                decoration: const BoxDecoration(
                    color: AppColors.red, shape: BoxShape.circle)),
          ]),
        ),
        SizedBox(width: 58,
            child: Center(child: Text('Strike',
                style: TextStyle(color: ext.textMuted, fontSize: 10.5,
                    fontWeight: FontWeight.w600)))),
        SizedBox(width: 34,
            child: Center(child: Text('IV',
                style: TextStyle(color: ext.textMuted, fontSize: 10.5,
                    fontWeight: FontWeight.w600)))),
        Expanded(
          child: Row(children: [
            Container(width: 8, height: 8,
                decoration: const BoxDecoration(
                    color: AppColors.green, shape: BoxShape.circle)),
            Text(' Put OI',
                style: TextStyle(color: ext.textMuted, fontSize: 10.5,
                    fontWeight: FontWeight.w600)),
            const Spacer(),
            Text(putHeader,
                style: TextStyle(color: ext.textMuted, fontSize: 10.5,
                    fontWeight: FontWeight.w600)),
          ]),
        ),
      ]),
    );
  }

  Widget _strategyChainBody(AppThemeExtension ext) {
    if (_loading && _rows.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _rows.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.error_outline, color: ext.textMuted, size: 40),
        const SizedBox(height: 8),
        Text(_error!, textAlign: TextAlign.center,
            style: TextStyle(color: ext.textMuted, fontSize: 13)),
        const SizedBox(height: 12),
        TextButton(
          onPressed: () { _retryCount = 0; _loadExpiriesThenChain(); },
          child: const Text('Retry'),
        ),
      ]));
    }
    if (_rows.isEmpty) {
      return Center(child:
          Text('No data', style: TextStyle(color: ext.textMuted)));
    }

    final maxOi = _rows.fold(0.0,
        (m, r) => [m, r.callOi, r.putOi].reduce((a, b) => a > b ? a : b));

    return ListView.builder(
      itemCount: _rows.length,
      itemBuilder: (_, idx) {
        final r = _rows[idx];
        return _strategyRow(r, ext, maxOi);
      },
    );
  }

  Widget _strategyRow(_OptRow r, AppThemeExtension ext, double maxOi) {
    final stagedCall   = _getStagedCall(r.strike);
    final stagedPut    = _getStagedPut(r.strike);
    final callExpanded = _expandedCallStrike == r.strike;
    final putExpanded  = _expandedPutStrike  == r.strike;

    // ITM / OTM background — based on live spot
    final isItmCall = _spot > 0 && r.strike < _spot; // call ITM when strike < spot
    final isItmPut  = _spot > 0 && r.strike > _spot; // put  ITM when strike > spot

    Color callBg = isItmCall
        ? const Color(0xFFFFF8E1).withValues(alpha: 0.80)  // warm ITM yellow
        : Colors.transparent;
    Color putBg = isItmPut
        ? AppColors.green.withValues(alpha: 0.08)           // soft ITM green
        : Colors.transparent;

    // Override with staged color (takes priority)
    if (stagedCall != null) {
      callBg = stagedCall.isBuy
          ? const Color(0xFFFFF0B3).withValues(alpha: 0.95)
          : AppColors.red.withValues(alpha: 0.12);
    }
    if (stagedPut != null) {
      putBg = stagedPut.isBuy
          ? AppColors.green.withValues(alpha: 0.15)
          : AppColors.red.withValues(alpha: 0.12);
    }
    if (r.isAtm && stagedCall == null) callBg = AppColors.blue.withValues(alpha: 0.05);
    if (r.isAtm && stagedPut  == null) putBg  = AppColors.blue.withValues(alpha: 0.05);

    // LayoutBuilder must be OUTSIDE IntrinsicHeight — LayoutBuilder can't return
    // intrinsic dimensions, which IntrinsicHeight requires from its subtree.
    return LayoutBuilder(builder: (_, constraints) {
      final sideW = (constraints.maxWidth - 58 - 34) / 2.0;
    return Column(mainAxisSize: MainAxisSize.min, children: [
      IntrinsicHeight(
        child: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // ── CALL SIDE ─────────────────────────────────────────────────────
          Expanded(
            child: GestureDetector(
              onTap: () => setState(() =>
                  _expandedCallStrike = callExpanded ? null : r.strike),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                color: callBg,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _callSideContent(r, ext, maxOi, sideW),
                    if (callExpanded) ...[
                      const SizedBox(height: 8),
                      Row(children: [
                        _bsBtnStrategy('B', AppColors.blue,
                            active: stagedCall?.isBuy == true,
                            onTap: () => _toggleStagedCall(r.strike, r.callLtp, true)),
                        const SizedBox(width: 8),
                        _bsBtnStrategy('S', AppColors.red,
                            active: stagedCall?.isBuy == false,
                            onTap: () => _toggleStagedCall(r.strike, r.callLtp, false)),
                      ]),
                      if (stagedCall != null) ...[
                        const SizedBox(height: 6),
                        _qtySelector(stagedCall, ext),
                      ],
                    ],
                  ],
                ),
              ),
            ),
          ),
          // ── STRIKE + IV CENTER ────────────────────────────────────────────
          Container(
            width: 58,
            color: r.isAtm
                ? AppColors.blue.withValues(alpha: 0.09)
                : ext.card.withValues(alpha: 0.5),
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 9),
            child: Text(_fmtStrike(r.strike),
                style: TextStyle(
                    color: r.isAtm ? AppColors.blue : ext.textPrimary,
                    fontSize: 12.5, fontWeight: FontWeight.w800)),
          ),
          // IV column
          Container(
            width: 34,
            color: r.isAtm
                ? AppColors.blue.withValues(alpha: 0.04)
                : Colors.transparent,
            alignment: Alignment.center,
            padding: const EdgeInsets.symmetric(vertical: 9),
            child: Text(
              r.iv > 0 ? r.iv.toStringAsFixed(1) : '--',
              style: TextStyle(color: ext.textMuted, fontSize: 10.5),
            ),
          ),
          // ── PUT SIDE ──────────────────────────────────────────────────────
          Expanded(
            child: GestureDetector(
              onTap: () => setState(() =>
                  _expandedPutStrike = putExpanded ? null : r.strike),
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                color: putBg,
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 9),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    _putSideContent(r, ext, maxOi, sideW),
                    if (putExpanded) ...[
                      const SizedBox(height: 8),
                      Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                        _bsBtnStrategy('B', AppColors.blue,
                            active: stagedPut?.isBuy == true,
                            onTap: () => _toggleStagedPut(r.strike, r.putLtp, true)),
                        const SizedBox(width: 8),
                        _bsBtnStrategy('S', AppColors.red,
                            active: stagedPut?.isBuy == false,
                            onTap: () => _toggleStagedPut(r.strike, r.putLtp, false)),
                      ]),
                      if (stagedPut != null) ...[
                        const SizedBox(height: 6),
                        _qtySelector(stagedPut, ext),
                      ],
                    ],
                  ],
                ),
              ),
            ),
          ),
        ]),
      ),
      Divider(color: ext.border, height: 0.5, thickness: 0.5),
    ]);
    }); // end LayoutBuilder
  }

  // ── Call-side content by view mode ────────────────────────────────────────────
  Widget _callSideContent(_OptRow r, AppThemeExtension ext, double maxOi, double sideW) {
    switch (_viewMode) {
      case 1: // OI view
        return Row(children: [
          Text(r.callOi > 0 ? _fmtOi(r.callOi) : '--',
              style: TextStyle(color: ext.textPrimary, fontSize: 12.5,
                  fontWeight: FontWeight.w600)),
          const Spacer(),
          _oiPill(_oiBarWidth(r.callOi, maxOi, sideW * 0.55), AppColors.red),
        ]);
      case 2: // Greeks view
        return Column(crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min, children: [
          Text(r.callDelta != 0 ? r.callDelta.toStringAsFixed(3) : '--',
              style: TextStyle(color: ext.textPrimary, fontSize: 12.5,
                  fontWeight: FontWeight.w600)),
          if (r.callTheta != 0)
            Text('θ ${r.callTheta.toStringAsFixed(1)}',
                style: TextStyle(color: AppColors.red, fontSize: 10)),
        ]);
      default: // LTP view
        return Row(children: [
          Text(r.callLtp > 0 ? r.callLtp.toStringAsFixed(2) : '--',
              style: TextStyle(color: ext.textPrimary, fontSize: 13,
                  fontWeight: FontWeight.w700)),
          const Spacer(),
          _oiPill(_oiBarWidth(r.callOi, maxOi, sideW * 0.50), AppColors.red),
        ]);
    }
  }

  // ── Put-side content by view mode ─────────────────────────────────────────────
  Widget _putSideContent(_OptRow r, AppThemeExtension ext, double maxOi, double sideW) {
    switch (_viewMode) {
      case 1: // OI view
        return Row(children: [
          _oiPill(_oiBarWidth(r.putOi, maxOi, sideW * 0.55), AppColors.green),
          const Spacer(),
          Text(r.putOi > 0 ? _fmtOi(r.putOi) : '--',
              style: TextStyle(color: ext.textPrimary, fontSize: 12.5,
                  fontWeight: FontWeight.w600)),
        ]);
      case 2: // Greeks view
        return Column(crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min, children: [
          Text(r.putDelta != 0 ? r.putDelta.toStringAsFixed(3) : '--',
              style: TextStyle(color: ext.textPrimary, fontSize: 12.5,
                  fontWeight: FontWeight.w600)),
          if (r.putTheta != 0)
            Text('θ ${r.putTheta.toStringAsFixed(1)}',
                style: TextStyle(color: AppColors.red, fontSize: 10)),
        ]);
      default: // LTP view
        return Row(children: [
          _oiPill(_oiBarWidth(r.putOi, maxOi, sideW * 0.50), AppColors.green),
          const Spacer(),
          Text(r.putLtp > 0 ? r.putLtp.toStringAsFixed(2) : '--',
              style: TextStyle(color: ext.textPrimary, fontSize: 13,
                  fontWeight: FontWeight.w700)),
        ]);
    }
  }

  double _oiBarWidth(double oi, double maxOi, double maxPx) {
    if (maxOi <= 0 || oi <= 0) return 4.0;
    return ((oi / maxOi) * maxPx).clamp(4.0, maxPx);
  }

  Widget _oiPill(double width, Color color) {
    return Container(
      width: width,
      height: 8,
      decoration: BoxDecoration(
          color: color.withValues(alpha: 0.50),
          borderRadius: BorderRadius.circular(4)),
    );
  }

  Widget _bsBtnStrategy(String label, Color color,
      {required bool active, required VoidCallback onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 40,
        height: 30,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: active ? color : color.withValues(alpha: 0.10),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
              color: active ? color : color.withValues(alpha: 0.35), width: 1),
        ),
        child: Text(label,
            style: TextStyle(
                color: active ? Colors.white : color,
                fontSize: 13, fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _qtySelector(_StagedLeg leg, AppThemeExtension ext) {
    final qtyOptions = List.generate(10, (i) => (i + 1) * widget.lotSize);
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Text('Qty ', style: TextStyle(color: ext.textMuted, fontSize: 11)),
      GestureDetector(
        onTap: () => _showQtyPicker(context, leg, qtyOptions, ext),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          decoration: BoxDecoration(
            border: Border.all(color: ext.border),
            borderRadius: BorderRadius.circular(6),
            color: ext.card,
          ),
          child: Row(mainAxisSize: MainAxisSize.min, children: [
            Text('${leg.qtyLots * widget.lotSize}',
                style: TextStyle(color: ext.textPrimary, fontSize: 12,
                    fontWeight: FontWeight.w600)),
            const SizedBox(width: 2),
            Icon(Icons.keyboard_arrow_down_rounded,
                color: ext.textMuted, size: 14),
          ]),
        ),
      ),
    ]);
  }

  void _showQtyPicker(BuildContext context, _StagedLeg leg,
      List<int> options, AppThemeExtension ext) {
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(margin: const EdgeInsets.symmetric(vertical: 8),
              width: 36, height: 4,
              decoration: BoxDecoration(color: ext.border,
                  borderRadius: BorderRadius.circular(2))),
          Text('Select Quantity (Lots)',
              style: TextStyle(color: ext.textPrimary,
                  fontSize: 14, fontWeight: FontWeight.w700)),
          const SizedBox(height: 8),
          ...List.generate(options.length, (i) {
            final lots = i + 1;
            final qty = options[i];
            return ListTile(
              title: Text('$lots ${lots == 1 ? 'Lot' : 'Lots'} ($qty shares)',
                  style: TextStyle(color: ext.textPrimary)),
              trailing: leg.qtyLots == lots
                  ? const Icon(Icons.check, color: AppColors.green) : null,
              onTap: () {
                setState(() => leg.qtyLots = lots);
                Navigator.pop(context);
              },
            );
          }),
          const SizedBox(height: 8),
        ]),
      ),
    );
  }

  // Bottom bar: "N legs selected" | Clear All | Show Editor | Done
  Widget _strategyBottomBar(AppThemeExtension ext) {
    final count = _staged.length;
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 14),
      decoration: BoxDecoration(
          color: ext.surface,
          border: Border(top: BorderSide(color: ext.border, width: 0.8)),
          boxShadow: [BoxShadow(
              color: Colors.black.withValues(alpha: 0.06),
              blurRadius: 8, offset: const Offset(0, -3))]),
      child: Row(children: [
        Text('$count ${count == 1 ? 'leg' : 'legs'} selected',
            style: TextStyle(color: ext.textSecondary, fontSize: 13,
                fontWeight: FontWeight.w500)),
        const Spacer(),
        // Clear All
        OutlinedButton(
          onPressed: count > 0 ? () => setState(() => _staged.clear()) : null,
          style: OutlinedButton.styleFrom(
            foregroundColor: ext.textSecondary,
            side: BorderSide(color: ext.border),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: const Text('Clear All', style: TextStyle(fontSize: 12)),
        ),
        const SizedBox(width: 8),
        // Show Editor (back to strategy without adding)
        OutlinedButton(
          onPressed: () => Navigator.pop(context),
          style: OutlinedButton.styleFrom(
            foregroundColor: AppColors.blue,
            side: const BorderSide(color: AppColors.blue),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: const Text('Show Editor', style: TextStyle(fontSize: 12)),
        ),
        const SizedBox(width: 8),
        // Done
        ElevatedButton(
          onPressed: count > 0 ? _done : null,
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.blue,
            disabledBackgroundColor: AppColors.blue.withValues(alpha: 0.4),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 8),
            minimumSize: Size.zero,
            tapTargetSize: MaterialTapTargetSize.shrinkWrap,
          ),
          child: const Text('Done',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                  color: Colors.white)),
        ),
      ]),
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  WATCH MODE (original layout)
  // ═══════════════════════════════════════════════════════════════════════════

  Widget _buildWatchMode(AppThemeExtension ext) {
    return Scaffold(
      backgroundColor: ext.surface,
      body: SafeArea(
        child: Column(children: [
          _buildTopBar(ext),
          _buildControls(ext),
          _buildChainHeader(ext),
          Expanded(child: _buildChainBody(ext)),
        ]),
      ),
    );
  }

  Widget _buildTopBar(AppThemeExtension ext) {
    return Container(
      color: ext.surface,
      child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
        IconButton(
          icon: Icon(Icons.arrow_back, color: ext.textPrimary, size: 22),
          onPressed: () => Navigator.pop(context),
          padding: const EdgeInsets.symmetric(horizontal: 8),
        ),
        Expanded(
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(children: List.generate(_tabs.length, (i) {
              final tab = _tabs[i];
              final sel = i == _tabIdx;
              final chg = tab.change;
              final color = chg >= 0 ? AppColors.green : AppColors.red;
              return GestureDetector(
                onTap: () {
                  if (i == _tabIdx) return;
                  _stopSse();
                  setState(() { _tabIdx = i; _loadId++; _allRows = []; _rows = []; _expiries = []; _selectedExpiry = ''; });
                  _loadExpiriesThenChain();
                },
                child: Container(
                  margin: const EdgeInsets.symmetric(horizontal: 3, vertical: 6),
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    border: Border.all(
                        color: sel ? AppColors.blue : ext.border,
                        width: sel ? 1.5 : 1),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(tab.label,
                          style: TextStyle(color: ext.textPrimary,
                              fontSize: 12, fontWeight: FontWeight.w700)),
                      if (tab.ltp > 0)
                        Text(
                          '${_fmtNum.format(tab.ltp)}  '
                          '${chg >= 0 ? '+' : ''}${_fmtNum.format(chg)}',
                          style: TextStyle(color: color, fontSize: 10)),
                    ],
                  ),
                ),
              );
            })),
          ),
        ),
        IconButton(
          icon: Icon(Icons.search, color: ext.textSecondary, size: 22),
          onPressed: () {},
          padding: const EdgeInsets.symmetric(horizontal: 8),
        ),
      ]),
    );
  }

  Widget _buildControls(AppThemeExtension ext) {
    final expiryLabel = _expiryLabel(_selectedExpiry);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration:
          BoxDecoration(border: Border(bottom: BorderSide(color: ext.border))),
      child: Row(children: [
        GestureDetector(
          onTap: () => _pickExpiry(context),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
                border: Border.all(color: AppColors.blue.withValues(alpha: 0.6)),
                borderRadius: BorderRadius.circular(6)),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Expiry',
                      style: TextStyle(color: ext.textMuted, fontSize: 9.5)),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(expiryLabel,
                        style: TextStyle(color: ext.textPrimary,
                            fontSize: 13, fontWeight: FontWeight.w600)),
                    const SizedBox(width: 2),
                    Icon(Icons.keyboard_arrow_down_rounded,
                        color: ext.textSecondary, size: 16),
                  ]),
                ]),
          ),
        ),
        const SizedBox(width: 14),
        _CheckItem(label: 'OI + Volume', value: _showOiVolume,
            onChanged: (v) => setState(() => _showOiVolume = v)),
        const SizedBox(width: 14),
        _CheckItem(label: 'Full chain', value: _fullChain,
            onChanged: (v) => setState(() {
              _fullChain = v;
              _rows = v ? _allRows : _sliceAroundAtm(_allRows);
            })),
        const Spacer(),
        if (_loading && _rows.isNotEmpty)
          const SizedBox(width: 13, height: 13,
              child: CircularProgressIndicator(strokeWidth: 1.5)),
      ]),
    );
  }

  Widget _buildChainHeader(AppThemeExtension ext) {
    final totalCallOi = _rows.fold(0.0, (s, r) => s + r.callOi);
    final totalPutOi  = _rows.fold(0.0, (s, r) => s + r.putOi);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration:
          BoxDecoration(border: Border(bottom: BorderSide(color: ext.border))),
      child: Row(children: [
        Text('Calls',
            style: TextStyle(color: ext.textPrimary,
                fontSize: 12, fontWeight: FontWeight.w700)),
        Expanded(child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('(${_fmtOi(totalCallOi)}) Call OI ',
              style: TextStyle(color: ext.textSecondary, fontSize: 10)),
          Container(width: 16, height: 2, color: AppColors.red),
          const SizedBox(width: 3),
          Container(width: 16, height: 2, color: AppColors.green),
          Text(' Put OI (${_fmtOi(totalPutOi)})',
              style: TextStyle(color: ext.textSecondary, fontSize: 10)),
        ])),
        Text('Puts',
            style: TextStyle(color: ext.textPrimary,
                fontSize: 12, fontWeight: FontWeight.w700)),
      ]),
    );
  }

  Widget _buildChainBody(AppThemeExtension ext) {
    if (_loading && _rows.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _rows.isEmpty) {
      return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.error_outline, color: ext.textMuted, size: 40),
        const SizedBox(height: 8),
        Text(_error!, textAlign: TextAlign.center,
            style: TextStyle(color: ext.textMuted, fontSize: 13)),
        const SizedBox(height: 12),
        TextButton(
          onPressed: () { _retryCount = 0; _loadExpiriesThenChain(); },
          child: const Text('Retry'),
        ),
      ]));
    }
    if (_rows.isEmpty) {
      return Center(child: Text('No data', style: TextStyle(color: ext.textMuted)));
    }

    final maxOi = _rows.fold(0.0,
        (m, r) => [m, r.callOi, r.putOi].reduce((a, b) => a > b ? a : b));
    final atmIdx = _rows.indexWhere((r) => r.isAtm);

    return ListView.builder(
      itemCount: _rows.length + (atmIdx >= 0 ? 1 : 0),
      itemBuilder: (_, idx) {
        final hasSep = atmIdx >= 0;
        if (hasSep && idx == atmIdx) return _buildAtmSeparator(ext);
        final rowIdx = hasSep && idx > atmIdx ? idx - 1 : idx;
        final r = _rows[rowIdx];
        return Column(mainAxisSize: MainAxisSize.min, children: [
          _buildRow(r, ext, maxOi),
          Divider(color: ext.border, height: 1, indent: 8, endIndent: 8),
        ]);
      },
    );
  }

  Widget _buildAtmSeparator(AppThemeExtension ext) {
    final tab = _currentTab;
    final chg = tab.change;
    final chgPct = tab.changePct;
    return Stack(alignment: Alignment.center, children: [
      Divider(color: ext.border, height: 1, thickness: 1),
      Container(
        margin: const EdgeInsets.symmetric(vertical: 6),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        decoration: BoxDecoration(
            color: const Color(0xFF1E1E1E),
            borderRadius: BorderRadius.circular(20),
            boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 4)]),
        child: Text(
          '${tab.ltp > 0 ? _fmtNum.format(tab.ltp) : '--'}  |  '
          '${chg >= 0 ? '+' : ''}${_fmtNum.format(chg)} '
          '(${chgPct >= 0 ? '+' : ''}${chgPct.toStringAsFixed(2)}%)',
          style: const TextStyle(color: Colors.white,
              fontSize: 13, fontWeight: FontWeight.w600),
        ),
      ),
    ]);
  }

  void _handleOrder({required double strike, required double ltp,
      required bool isCall, required bool isBuy}) {
    if (widget.onLegSelected != null) {
      widget.onLegSelected!(strike, ltp, isCall, isBuy);
      Navigator.pop(context);
    } else {
      final tab = _currentTab;
      PlaceOrderSheet.show(context,
        symbol:   '${tab.symbol} ${strike.toInt()} ${isCall ? 'CE' : 'PE'}',
        exchange: tab.exchange,
        ltp:      ltp,
        isBuy:    isBuy,
      );
    }
  }

  Widget _buildRow(_OptRow r, AppThemeExtension ext, double maxOi) {
    final callPctColor = r.callPct >= 0 ? AppColors.green : AppColors.red;
    final putPctColor  = r.putPct  >= 0 ? AppColors.green : AppColors.red;
    final pctFmt = (double v) => '${v >= 0 ? '+' : ''}${v.toStringAsFixed(2)}%';
    final isSelected = _selectedStrike == r.strike;

    return GestureDetector(
      onTap: () => setState(() =>
          _selectedStrike = isSelected ? null : r.strike),
      child: Container(
        color: isSelected
            ? AppColors.blue.withValues(alpha: 0.06)
            : Colors.transparent,
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  Text('₹${_fmtLtp(r.callLtp)}',
                      style: TextStyle(color: ext.textPrimary,
                          fontSize: 13.5, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  Text(pctFmt(r.callPct),
                      style: TextStyle(color: callPctColor, fontSize: 11)),
                ]),
                if (_showOiVolume) ...[
                  const SizedBox(height: 4),
                  _oiLine('OI',     _fmtOi(r.callOi),    ext),
                  _oiLine('OI Chg', _fmtOi(r.callOiChg), ext),
                  _oiLine('Volume', _fmtOi(r.callVol),   ext),
                ],
                if (isSelected) ...[
                  const SizedBox(height: 6),
                  Row(children: [
                    _bsBtn('B', AppColors.green,
                        () => _handleOrder(strike: r.strike, ltp: r.callLtp,
                            isCall: true, isBuy: true)),
                    const SizedBox(width: 6),
                    _bsBtn('S', AppColors.red,
                        () => _handleOrder(strike: r.strike, ltp: r.callLtp,
                            isCall: true, isBuy: false)),
                  ]),
                ],
              ],
            )),
            Container(
              width: 62,
              alignment: Alignment.center,
              padding: const EdgeInsets.only(top: 2),
              child: Text(_fmtStrike(r.strike),
                  style: TextStyle(color: ext.textPrimary,
                      fontSize: 13, fontWeight: FontWeight.w800)),
            ),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              mainAxisSize: MainAxisSize.min,
              children: [
                Row(children: [
                  Text(pctFmt(r.putPct),
                      style: TextStyle(color: putPctColor, fontSize: 11)),
                  const Spacer(),
                  Text('₹${_fmtLtp(r.putLtp)}',
                      style: TextStyle(color: ext.textPrimary,
                          fontSize: 13.5, fontWeight: FontWeight.w700)),
                ]),
                if (_showOiVolume) ...[
                  const SizedBox(height: 4),
                  _oiLine('OI',     _fmtOi(r.putOi),    ext, rightAlign: true),
                  _oiLine('OI Chg', _fmtOi(r.putOiChg), ext, rightAlign: true),
                  _oiLine('Volume', _fmtOi(r.putVol),   ext, rightAlign: true),
                ],
                if (isSelected) ...[
                  const SizedBox(height: 6),
                  Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                    _bsBtn('B', AppColors.green,
                        () => _handleOrder(strike: r.strike, ltp: r.putLtp,
                            isCall: false, isBuy: true)),
                    const SizedBox(width: 6),
                    _bsBtn('S', AppColors.red,
                        () => _handleOrder(strike: r.strike, ltp: r.putLtp,
                            isCall: false, isBuy: false)),
                  ]),
                ],
              ],
            )),
          ]),
          const SizedBox(height: 6),
          _buildOiBars(r, maxOi),
        ]),
      ),
    );
  }

  Widget _bsBtn(String label, Color color, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
        decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: color.withValues(alpha: 0.4))),
        child: Text(label,
            style: TextStyle(color: color, fontSize: 11,
                fontWeight: FontWeight.w700)),
      ),
    );
  }

  Widget _oiLine(String label, String value, AppThemeExtension ext,
      {bool rightAlign = false}) {
    final children = <Widget>[
      Text(label, style: TextStyle(color: ext.textMuted, fontSize: 10.5)),
      const Spacer(),
      Text(value, style: TextStyle(color: ext.textSecondary, fontSize: 10.5)),
    ];
    return Padding(
      padding: const EdgeInsets.only(top: 2),
      child: Row(children: rightAlign ? children.reversed.toList() : children),
    );
  }

  Widget _buildOiBars(_OptRow r, double maxOi) {
    if (maxOi <= 0) return const SizedBox.shrink();
    return LayoutBuilder(builder: (_, box) {
      final maxBar = box.maxWidth * 0.3;
      final cw = (r.callOi / maxOi * maxBar).clamp(2.0, maxBar);
      final pw = (r.putOi  / maxOi * maxBar).clamp(2.0, maxBar);
      return Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(width: cw, height: 3,
            decoration: BoxDecoration(color: AppColors.red,
                borderRadius: BorderRadius.circular(2))),
        const SizedBox(width: 4),
        Container(width: pw, height: 3,
            decoration: BoxDecoration(color: AppColors.green,
                borderRadius: BorderRadius.circular(2))),
      ]);
    });
  }

  void _pickExpiry(BuildContext context) {
    final ext = context.appColors;
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => Column(mainAxisSize: MainAxisSize.min, children: [
        Container(margin: const EdgeInsets.symmetric(vertical: 8),
            width: 36, height: 4,
            decoration: BoxDecoration(color: ext.border,
                borderRadius: BorderRadius.circular(2))),
        ..._expiries.map((ymd) => ListTile(
          title: Text(_expiryLabel(ymd),
              style: TextStyle(color: ext.textPrimary)),
          trailing: ymd == _selectedExpiry
              ? Icon(Icons.check, color: AppColors.blue) : null,
          onTap: () async {
            Navigator.pop(context);
            _stopSse();
            setState(() {
              _selectedExpiry = ymd;
              _allRows = []; _rows = []; _error = null;
            });
            await _loadChain();
            if (mounted) _startSse();
          },
        )),
        const SizedBox(height: 8),
      ]),
    );
  }
}

// ── Checkbox item widget ──────────────────────────────────────────────────────
class _CheckItem extends StatelessWidget {
  final String label;
  final bool value;
  final ValueChanged<bool> onChanged;
  const _CheckItem({required this.label, required this.value, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return GestureDetector(
      onTap: () => onChanged(!value),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        SizedBox(width: 18, height: 18,
            child: Checkbox(
              value: value, onChanged: (v) => onChanged(v ?? false),
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              activeColor: AppColors.green,
              side: BorderSide(color: ext.border, width: 1.5),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(3)),
            )),
        const SizedBox(width: 5),
        Text(label, style: TextStyle(color: ext.textSecondary, fontSize: 12.5)),
      ]),
    );
  }
}
