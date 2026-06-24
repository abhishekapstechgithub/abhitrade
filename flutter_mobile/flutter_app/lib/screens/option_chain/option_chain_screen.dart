import 'dart:async';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../orders/orders_screen.dart';
import '../portfolio/portfolio_screen.dart';
import '../stock_chart/stock_chart_screen.dart';

// ── Entry point ───────────────────────────────────────────────────────────────
class OptionChainScreen extends StatelessWidget {
  final String symbol;
  final String exchange;

  const OptionChainScreen._({required this.symbol, required this.exchange});

  static void show(BuildContext context,
      {required String symbol, required String exchange}) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (_) => OptionChainScreen._(symbol: symbol, exchange: exchange),
    );
  }

  @override
  Widget build(BuildContext context) =>
      _OptionChainBody(symbol: symbol, exchange: exchange);
}

// ── Univest option row model ──────────────────────────────────────────────────
class _OptRow {
  final double strike;
  final double callLtp, callPct, callOi, callVol;
  final double putLtp, putPct, putOi, putVol;
  final bool isAtm;
  const _OptRow({
    required this.strike,
    required this.callLtp, required this.callPct,
    required this.callOi,  required this.callVol,
    required this.putLtp,  required this.putPct,
    required this.putOi,   required this.putVol,
    this.isAtm = false,
  });
}

// ── Upcoming Tuesday expiry generator ────────────────────────────────────────
List<Map<String, String>> _niftyExpiries({int count = 8}) {
  final results = <Map<String, String>>[];
  var d = DateTime.now().toUtc();
  while (results.length < count) {
    final dow = d.weekday; // 1=Mon … 7=Sun
    final daysUntilTue = (2 - dow + 7) % 7;
    d = d.add(Duration(days: daysUntilTue == 0 ? 7 : daysUntilTue));
    final label = DateFormat('dd MMM yyyy').format(d);
    final value = DateFormat('yyyy-MM-dd').format(d);
    results.add({'label': label, 'value': value});
    d = d.add(const Duration(days: 1));
  }
  return results;
}

// ── Body ──────────────────────────────────────────────────────────────────────
class _OptionChainBody extends StatefulWidget {
  final String symbol, exchange;
  const _OptionChainBody({required this.symbol, required this.exchange});
  @override
  State<_OptionChainBody> createState() => _OptionChainBodyState();
}

class _OptionChainBodyState extends State<_OptionChainBody> {
  int _viewTab = 0; // 0=LTP 1=OI 2=Greeks (tab index)

  late List<Map<String, String>> _expiries;
  late String _selectedExpiry;

  double _spotPrice = 0;
  double _spotChange = 0;
  double _spotChangePct = 0;
  List<_OptRow> _rows = [];
  bool _loading = false;
  String? _error;

  Timer? _refreshTimer;

  @override
  void initState() {
    super.initState();
    _expiries = _niftyExpiries();
    _selectedExpiry = _expiries.first['value']!;
    _loadChain();
    _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) => _loadChain(silent: true));
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadChain({bool silent = false}) async {
    if (!silent && mounted) setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiService.instance.getOptionChain(_selectedExpiry);
      if (!mounted) return;
      final data = res['data'] as Map<String, dynamic>?;
      if (data == null) throw Exception('No data in response');

      final spot = _d(data['SpotP'] ?? data['spotPrice'] ?? 0);
      final spotChng = _d(data['SChng'] ?? 0);
      final spotPct = _d(data['SPerChng'] ?? 0);

      final ceList = (data['CE'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();
      final peList = (data['PE'] as List<dynamic>? ?? [])
          .cast<Map<String, dynamic>>();

      // Build strike → CE/PE maps
      final ceMap = <double, Map<String, dynamic>>{};
      final peMap = <double, Map<String, dynamic>>{};
      for (final c in ceList) {
        final s = double.tryParse(c['Stk']?.toString() ?? '') ?? 0;
        if (s > 0) ceMap[s] = c;
      }
      for (final p in peList) {
        final s = double.tryParse(p['Stk']?.toString() ?? '') ?? 0;
        if (s > 0) peMap[s] = p;
      }

      final allStrikes = {...ceMap.keys, ...peMap.keys}.toList()..sort();
      if (allStrikes.isEmpty) {
        setState(() { _rows = []; _loading = false; });
        return;
      }

      // Find ATM
      final atm = allStrikes.reduce((a, b) => (a - spot).abs() < (b - spot).abs() ? a : b);
      final atmIdx = allStrikes.indexOf(atm);
      final start = (atmIdx - 7).clamp(0, allStrikes.length);
      final end = (atmIdx + 8).clamp(0, allStrikes.length);
      final visible = allStrikes.sublist(start, end);

      final rows = <_OptRow>[];
      for (final strike in visible) {
        final ce = ceMap[strike];
        final pe = peMap[strike];
        final ceLtp = _d(ce?['Ltp'] ?? 0);
        final peLtp = _d(pe?['Ltp'] ?? 0);
        final cePct = _d(ce?['Pctchng'] ?? ce?['pctChng'] ?? 0);
        final pePct = _d(pe?['Pctchng'] ?? pe?['pctChng'] ?? 0);
        final ceOi = _d(ce?['OI'] ?? 0);
        final peOi = _d(pe?['OI'] ?? 0);
        final ceVol = _d(ce?['Vol'] ?? 0);
        final peVol = _d(pe?['Vol'] ?? 0);
        rows.add(_OptRow(
          strike: strike,
          callLtp: ceLtp, callPct: cePct, callOi: ceOi, callVol: ceVol,
          putLtp:  peLtp, putPct:  pePct, putOi:  peOi, putVol:  peVol,
          isAtm: strike == atm,
        ));
      }

      setState(() {
        _spotPrice = spot;
        _spotChange = spotChng;
        _spotChangePct = spotPct;
        _rows = rows;
        _loading = false;
        _error = null;
      });
    } on ApiException catch (e) {
      if (mounted && !silent) setState(() { _error = e.message; _loading = false; });
    } catch (e) {
      if (mounted && !silent) setState(() { _error = e.toString(); _loading = false; });
    }
  }

  static double _d(dynamic v) =>
      (v is num) ? v.toDouble() : double.tryParse(v?.toString() ?? '') ?? 0.0;

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final fmt = NumberFormat('#,##,##0.00');
    final fmtS = NumberFormat('#,##,##0');

    String fmtOi(double v) {
      if (v >= 1e7) return '${(v / 1e7).toStringAsFixed(1)}Cr';
      if (v >= 1e5) return '${(v / 1e5).toStringAsFixed(1)}L';
      if (v >= 1e3) return '${(v / 1e3).toStringAsFixed(0)}K';
      return v.toStringAsFixed(0);
    }

    return DraggableScrollableSheet(
      initialChildSize: 0.96,
      minChildSize: 0.6,
      maxChildSize: 0.97,
      snap: true,
      snapSizes: const [0.6, 0.96],
      builder: (_, scroll) => Container(
        decoration: BoxDecoration(
          color: ext.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(children: [
          // Drag handle
          Container(
            margin: const EdgeInsets.only(top: 8, bottom: 4),
            width: 36, height: 4,
            decoration: BoxDecoration(
                color: ext.border, borderRadius: BorderRadius.circular(2)),
          ),

          // ── Index header (spot price) ────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            child: Row(children: [
              Text('NIFTY', style: TextStyle(
                  color: ext.textPrimary, fontSize: 16, fontWeight: FontWeight.w800)),
              const SizedBox(width: 10),
              if (_spotPrice > 0) ...[
                Text(fmt.format(_spotPrice), style: TextStyle(
                    color: ext.textPrimary, fontSize: 14, fontWeight: FontWeight.w700)),
                const SizedBox(width: 6),
                Text(
                  '${_spotChange >= 0 ? '+' : ''}${fmt.format(_spotChange)} '
                  '(${_spotChangePct >= 0 ? '+' : ''}${_spotChangePct.toStringAsFixed(2)}%)',
                  style: TextStyle(
                    color: _spotChange >= 0 ? AppColors.green : AppColors.red,
                    fontSize: 12,
                  ),
                ),
              ] else if (_loading)
                const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 1.5)),
              const Spacer(),
              if (_loading && _rows.isNotEmpty)
                const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.5)),
            ]),
          ),

          Divider(color: ext.border, height: 1),

          // ── Sub-header: view tabs + expiry picker ───────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            child: Row(children: [
              ...['LTP', 'OI', 'Greeks'].asMap().entries.map((e) {
                final sel = _viewTab == e.key;
                return GestureDetector(
                  onTap: () => setState(() => _viewTab = e.key),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 140),
                    margin: const EdgeInsets.only(right: 6),
                    padding: const EdgeInsets.symmetric(horizontal: 11, vertical: 5),
                    decoration: BoxDecoration(
                      color: sel ? AppColors.blue : ext.card,
                      borderRadius: BorderRadius.circular(7),
                      border: Border.all(color: sel ? AppColors.blue : ext.border),
                    ),
                    child: Text(e.value, style: TextStyle(
                        color: sel ? Colors.white : ext.textSecondary,
                        fontSize: 12, fontWeight: FontWeight.w700)),
                  ),
                );
              }),
              const Spacer(),
              // Expiry dropdown
              GestureDetector(
                onTap: () => _pickExpiry(context),
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 9, vertical: 5),
                  decoration: BoxDecoration(
                    color: ext.card, borderRadius: BorderRadius.circular(7),
                    border: Border.all(color: ext.border),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    Text(
                      _expiries.firstWhere((e) => e['value'] == _selectedExpiry,
                          orElse: () => {'label': _selectedExpiry})['label']!,
                      style: TextStyle(color: ext.textPrimary,
                          fontSize: 11, fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(width: 3),
                    Icon(Icons.keyboard_arrow_down_rounded,
                        color: ext.textMuted, size: 15),
                  ]),
                ),
              ),
            ]),
          ),

          Divider(color: ext.border, height: 1),

          // ── Column headers ─────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
            child: Row(children: [
              SizedBox(width: 60, child: Text(
                  _viewTab == 1 ? 'CE OI' : 'CE Vol',
                  style: TextStyle(color: ext.textMuted, fontSize: 11))),
              Expanded(child: Text('Call LTP', textAlign: TextAlign.center,
                  style: TextStyle(color: ext.textMuted, fontSize: 11))),
              SizedBox(width: 70, child: Text('Strike\nPrice',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: ext.textMuted, fontSize: 11, height: 1.2))),
              Expanded(child: Text('Put LTP', textAlign: TextAlign.center,
                  style: TextStyle(color: ext.textMuted, fontSize: 11))),
              SizedBox(width: 60, child: Text(
                  _viewTab == 1 ? 'PE OI' : 'PE Vol',
                  textAlign: TextAlign.right,
                  style: TextStyle(color: ext.textMuted, fontSize: 11))),
            ]),
          ),

          Divider(color: ext.border, height: 1),

          // ── Body ───────────────────────────────────────────────────────
          Expanded(child: _buildBody(ext, fmt, fmtS, fmtOi, scroll)),

          // ── Bottom bar ─────────────────────────────────────────────────
          Divider(color: ext.border, height: 1),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              child: Row(children: [
                _BotBtn('Open Orders', onTap: () {
                  Navigator.pop(context);
                  Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const OrdersScreen()));
                }),
                const SizedBox(width: 8),
                _BotBtn('Positions', onTap: () {
                  Navigator.pop(context);
                  Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const PortfolioScreen()));
                }),
                const SizedBox(width: 8),
                _BotBtn('Charts ↗', onTap: () {
                  Navigator.pop(context);
                  Navigator.push(context, MaterialPageRoute(
                    builder: (_) => StockChartScreen(
                      symbol: 'NIFTY', exchange: 'NSE',
                      token: 'NIFTY', name: 'NIFTY 50',
                    ),
                  ));
                }),
                const Spacer(),
                IconButton(
                  onPressed: () => _loadChain(),
                  icon: Icon(Icons.refresh_rounded, color: ext.textSecondary),
                  padding: EdgeInsets.zero,
                  constraints: const BoxConstraints(),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }

  Widget _buildBody(AppThemeExtension ext, NumberFormat fmt, NumberFormat fmtS,
      String Function(double) fmtOi, ScrollController scroll) {
    if (_loading && _rows.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }
    if (_error != null && _rows.isEmpty) {
      return Center(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.error_outline, color: ext.textMuted, size: 40),
          const SizedBox(height: 8),
          Text(_error!, textAlign: TextAlign.center,
              style: TextStyle(color: ext.textMuted, fontSize: 13)),
          const SizedBox(height: 12),
          TextButton(onPressed: _loadChain, child: const Text('Retry')),
        ]),
      );
    }
    if (_rows.isEmpty) {
      return Center(child: Text('No data', style: TextStyle(color: ext.textMuted)));
    }

    return ListView.separated(
      controller: scroll,
      itemCount: _rows.length,
      separatorBuilder: (_, __) => Divider(color: ext.border, height: 1),
      itemBuilder: (_, i) {
        final r = _rows[i];
        if (r.isAtm) {
          return Column(children: [
            Container(
              color: AppColors.amber.withValues(alpha: 0.08),
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 5),
              child: Row(children: [
                Text('ATM', style: const TextStyle(
                    color: AppColors.amber, fontSize: 11, fontWeight: FontWeight.w700)),
                const SizedBox(width: 8),
                if (_spotPrice > 0)
                  Text('| ${fmt.format(_spotPrice)}', style: const TextStyle(
                      color: AppColors.amber, fontSize: 11)),
              ]),
            ),
            _row(r, ext, fmt, fmtS, fmtOi, atm: true),
          ]);
        }
        return _row(r, ext, fmt, fmtS, fmtOi, atm: false);
      },
    );
  }

  void _pickExpiry(BuildContext context) {
    final ext = context.appColors;
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(16))),
      builder: (_) => Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(margin: const EdgeInsets.symmetric(vertical: 8),
              width: 36, height: 4,
              decoration: BoxDecoration(color: ext.border, borderRadius: BorderRadius.circular(2))),
          ..._expiries.map((e) => ListTile(
            title: Text(e['label']!, style: TextStyle(color: ext.textPrimary)),
            trailing: e['value'] == _selectedExpiry
                ? Icon(Icons.check, color: AppColors.blue) : null,
            onTap: () {
              Navigator.pop(context);
              setState(() {
                _selectedExpiry = e['value']!;
                _rows = [];
                _error = null;
              });
              _loadChain();
            },
          )),
          const SizedBox(height: 8),
        ],
      ),
    );
  }

  Widget _row(_OptRow r, AppThemeExtension ext, NumberFormat fmt,
      NumberFormat fmtS, String Function(double) fmtOi, {required bool atm}) {
    final showOi = _viewTab == 1;
    return Container(
      color: atm ? AppColors.amber.withValues(alpha: 0.04) : Colors.transparent,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: Row(children: [
        SizedBox(width: 60, child: Text(
            fmtOi(showOi ? r.callOi : r.callVol),
            style: TextStyle(color: ext.textSecondary, fontSize: 11))),
        Expanded(child: Column(children: [
          Text('₹${fmt.format(r.callLtp)}',
              style: const TextStyle(color: AppColors.red,
                  fontSize: 13, fontWeight: FontWeight.w700)),
          if (r.callPct != 0)
            Text('${r.callPct >= 0 ? '+' : ''}${r.callPct.toStringAsFixed(2)}%',
                style: TextStyle(
                    color: r.callPct >= 0 ? AppColors.green : AppColors.red,
                    fontSize: 10)),
        ])),
        SizedBox(width: 70, child: Text(fmtS.format(r.strike),
            textAlign: TextAlign.center,
            style: TextStyle(color: ext.textPrimary,
                fontSize: 13, fontWeight: FontWeight.w800))),
        Expanded(child: Column(children: [
          Text('₹${fmt.format(r.putLtp)}',
              style: const TextStyle(color: AppColors.green,
                  fontSize: 13, fontWeight: FontWeight.w700)),
          if (r.putPct != 0)
            Text('${r.putPct >= 0 ? '+' : ''}${r.putPct.toStringAsFixed(2)}%',
                style: TextStyle(
                    color: r.putPct >= 0 ? AppColors.green : AppColors.red,
                    fontSize: 10)),
        ])),
        SizedBox(width: 60, child: Text(
            fmtOi(showOi ? r.putOi : r.putVol),
            textAlign: TextAlign.right,
            style: TextStyle(color: ext.textSecondary, fontSize: 11))),
      ]),
    );
  }
}

class _BotBtn extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _BotBtn(this.label, {required this.onTap});
  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        decoration: BoxDecoration(
          color: ext.card, borderRadius: BorderRadius.circular(8),
          border: Border.all(color: ext.border),
        ),
        child: Text(label, style: TextStyle(
            color: ext.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
