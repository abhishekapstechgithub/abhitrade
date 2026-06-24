import 'dart:async';
import 'package:flutter/material.dart';
import '../../models/models.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../watchlist/stock_detail_sheet.dart';

class SearchScreen extends StatefulWidget {
  const SearchScreen({super.key});

  static Future<void> show(BuildContext context) => Navigator.push(
        context,
        PageRouteBuilder(
          pageBuilder: (_, __, ___) => const SearchScreen(),
          transitionDuration: const Duration(milliseconds: 220),
          transitionsBuilder: (_, anim, __, child) =>
              FadeTransition(opacity: anim, child: child),
        ),
      );

  @override
  State<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends State<SearchScreen> {
  final _ctrl   = TextEditingController();
  final _focus  = FocusNode();
  Timer?        _debounce;
  bool          _loading = false;
  String        _error   = '';
  List<_Result> _results = [];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _ctrl.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    _debounce?.cancel();
    if (q.trim().length < 2) {
      setState(() { _results = []; _loading = false; _error = ''; });
      return;
    }
    setState(() { _loading = true; _error = ''; });
    _debounce = Timer(const Duration(milliseconds: 350), () => _search(q.trim()));
  }

  Future<void> _search(String q) async {
    try {
      final res  = await ApiService.instance.search(q);
      final data = (res['data'] ?? res['results'] ?? res['instruments'] ?? []) as List;
      if (!mounted) return;
      setState(() {
        _loading = false;
        _results = data.map((e) => _Result.fromJson(e as Map<String, dynamic>)).toList();
      });
    } catch (e) {
      if (!mounted) return;
      setState(() { _loading = false; _error = 'Search failed'; });
    }
  }

  void _open(_Result r) {
    final item = WatchlistItem(
      id: r.token, symbol: r.symbol, company: r.company,
      exchange: r.exchange, token: r.token,
      ltp: 0, change: 0, changePct: 0,
      open: 0, high: 0, low: 0, prevClose: 0, volume: 0,
    );
    StockDetailSheet.show(context, item);
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;

    return Scaffold(
      backgroundColor: ext.bg,
      body: SafeArea(
        child: Column(
          children: [
            // Search bar
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 8),
              child: Row(children: [
                Expanded(
                  child: Container(
                    height: 48,
                    decoration: BoxDecoration(
                      color: ext.card,
                      borderRadius: BorderRadius.circular(13),
                      border: Border.all(color: ext.border),
                    ),
                    child: Row(children: [
                      const SizedBox(width: 14),
                      Icon(Icons.search_rounded, color: ext.textMuted, size: 20),
                      const SizedBox(width: 8),
                      Expanded(
                        child: TextField(
                          controller: _ctrl,
                          focusNode: _focus,
                          onChanged: _onChanged,
                          style: TextStyle(color: ext.textPrimary, fontSize: 15),
                          decoration: InputDecoration(
                            hintText: 'Search symbol, company...',
                            hintStyle: TextStyle(color: ext.textMuted, fontSize: 14),
                            border: InputBorder.none,
                            isDense: true,
                            contentPadding: EdgeInsets.zero,
                          ),
                        ),
                      ),
                      if (_ctrl.text.isNotEmpty)
                        GestureDetector(
                          onTap: () { _ctrl.clear(); _onChanged(''); },
                          child: Padding(
                            padding: const EdgeInsets.only(right: 12),
                            child: Icon(Icons.close, color: ext.textMuted, size: 18),
                          ),
                        ),
                    ]),
                  ),
                ),
                const SizedBox(width: 10),
                GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: Text('Cancel',
                      style: TextStyle(color: AppColors.blue, fontSize: 15,
                          fontWeight: FontWeight.w600)),
                ),
              ]),
            ),

            // Results
            Expanded(child: _buildBody(ext)),
          ],
        ),
      ),
    );
  }

  Widget _buildBody(AppThemeExtension ext) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator(
        strokeWidth: 2, color: AppColors.green));
    }
    if (_error.isNotEmpty) {
      return Center(child: Text(_error,
          style: TextStyle(color: ext.textMuted, fontSize: 14)));
    }
    if (_results.isEmpty && _ctrl.text.length >= 2) {
      return Center(child: Text('No results for "${_ctrl.text}"',
          style: TextStyle(color: ext.textMuted, fontSize: 14)));
    }
    if (_results.isEmpty) {
      return _HintView(ext: ext);
    }

    return ListView.separated(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      itemCount: _results.length,
      separatorBuilder: (_, __) => Divider(color: ext.border, height: 1),
      itemBuilder: (_, i) {
        final r = _results[i];
        return InkWell(
          onTap: () => _open(r),
          borderRadius: BorderRadius.circular(10),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(children: [
              // Exchange badge
              Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: ext.card,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: ext.border),
                ),
                alignment: Alignment.center,
                child: Text(r.exchange.length > 3 ? r.exchange.substring(0, 3) : r.exchange,
                    style: TextStyle(color: ext.textSecondary, fontSize: 10,
                        fontWeight: FontWeight.w700)),
              ),
              const SizedBox(width: 12),
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(r.symbol, style: TextStyle(color: ext.textPrimary,
                      fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(r.company, style: TextStyle(color: ext.textMuted, fontSize: 12),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              )),
              Icon(Icons.chevron_right_rounded, color: ext.border, size: 20),
            ]),
          ),
        );
      },
    );
  }
}

class _HintView extends StatelessWidget {
  final AppThemeExtension ext;
  const _HintView({required this.ext});

  static const _popular = [
    ('RELIANCE', 'Reliance Industries', 'NSE'),
    ('NIFTY 50',  'NSE Nifty 50 Index',  'NSE'),
    ('HDFCBANK',  'HDFC Bank Ltd',        'NSE'),
    ('INFY',      'Infosys Ltd',          'NSE'),
    ('TCS',       'Tata Consultancy',     'NSE'),
    ('BANKNIFTY', 'Nifty Bank Index',     'NSE'),
    ('ZOMATO',    'Zomato Ltd',           'NSE'),
    ('IRCTC',     'Indian Railway Catering','NSE'),
  ];

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 4, 16, 16),
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Text('Popular Symbols',
              style: TextStyle(color: ext.textMuted, fontSize: 12,
                  fontWeight: FontWeight.w600, letterSpacing: 0.5)),
        ),
        ..._popular.map((t) {
          final (sym, co, ex) = t;
          return InkWell(
            onTap: () {
              final item = WatchlistItem(
                id: sym, symbol: sym, company: co, exchange: ex, token: sym,
                ltp: 0, change: 0, changePct: 0,
                open: 0, high: 0, low: 0, prevClose: 0, volume: 0,
              );
              StockDetailSheet.show(context, item);
            },
            borderRadius: BorderRadius.circular(10),
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Row(children: [
                Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: ext.card, borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: ext.border),
                  ),
                  alignment: Alignment.center,
                  child: Text(ex, style: TextStyle(color: ext.textSecondary,
                      fontSize: 10, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(sym, style: TextStyle(color: ext.textPrimary,
                      fontSize: 15, fontWeight: FontWeight.w700)),
                  const SizedBox(height: 2),
                  Text(co, style: TextStyle(color: ext.textMuted, fontSize: 12)),
                ])),
                Icon(Icons.chevron_right_rounded, color: ext.border, size: 20),
              ]),
            ),
          );
        }),
      ],
    );
  }
}

class _Result {
  final String symbol, company, exchange, token, instrumentType;
  const _Result({required this.symbol, required this.company,
      required this.exchange, required this.token, this.instrumentType = 'EQ'});

  factory _Result.fromJson(Map<String, dynamic> j) {
    final sym     = j['symbol']?.toString() ?? j['trading_symbol']?.toString() ?? '';
    final rawName = j['company']?.toString() ?? j['name']?.toString() ?? '';
    final tradSym = j['tradingSymbol']?.toString() ?? j['trading_symbol']?.toString() ?? '';
    // When server name == symbol, use tradingSymbol as subtitle (shows EQ/FUT/OPT etc.)
    final company = (rawName.isEmpty || rawName == sym) ? tradSym : rawName;
    return _Result(
      symbol:         sym,
      company:        company.isEmpty ? sym : company,
      exchange:       j['exchange']?.toString() ?? 'NSE',
      token:          j['token']?.toString() ?? j['instrument_token']?.toString() ?? '',
      instrumentType: j['instrumentType']?.toString() ?? j['instrument_type']?.toString() ?? 'EQ',
    );
  }
}
