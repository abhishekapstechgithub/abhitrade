import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../config/constants.dart';
import '../../theme/app_theme.dart';
import '../option_chain/option_chain_screen.dart';
import '../orders/orders_screen.dart';
import '../orders/place_order_sheet.dart';
import '../portfolio/portfolio_screen.dart';

class StockChartScreen extends StatefulWidget {
  final String symbol;
  final String exchange;
  final String token;
  final String name;

  const StockChartScreen({
    super.key,
    required this.symbol,
    required this.exchange,
    required this.token,
    required this.name,
  });

  @override
  State<StockChartScreen> createState() => _StockChartScreenState();
}

class _Tab {
  final String sym, exchange, expiry, token;
  final double price, change, changePct;
  const _Tab(this.sym, this.exchange, this.price, this.change, this.changePct,
      this.expiry, {this.token = ''});
}

const _indexTabs = [
  _Tab('NIFTY',     'NSE', 24102.90,  89.80, 0.37, 'Expiry Tomorrow'),
  _Tab('SENSEX',    'BSE', 79345.60, 267.40, 0.34, 'Expiry 30 Jun'),
  _Tab('BANKNIFTY', 'NSE', 57935.60, 249.85, 0.43, 'Expiry 30 Jun'),
];

class _StockChartScreenState extends State<StockChartScreen> {
  WebViewController? _wvc;
  bool _chartReady = false;
  int  _selTab     = 0;
  late final List<_Tab> _allTabs;

  @override
  void initState() {
    super.initState();
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    _buildTabs();
    WidgetsBinding.instance.addPostFrameCallback((_) => _loadChart());
  }

  void _buildTabs() {
    final upSym = widget.symbol.toUpperCase();
    // Check if the symbol is one of the index tabs
    final idxMatch = _indexTabs.indexWhere(
        (t) => t.sym == upSym);
    if (idxMatch >= 0) {
      _allTabs = List.from(_indexTabs);
      _selTab = idxMatch;
    } else {
      // Add the stock as the first tab, then the indices
      _allTabs = [
        _Tab(widget.symbol, widget.exchange, 0, 0, 0, widget.exchange,
            token: widget.token),
        ..._indexTabs,
      ];
      _selTab = 0;
    }
  }

  @override
  void dispose() {
    SystemChrome.setPreferredOrientations([DeviceOrientation.portraitUp]);
    super.dispose();
  }

  void _loadChart() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final tab = _allTabs[_selTab];
    _wvc = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) { if (mounted) setState(() => _chartReady = true); },
      ))
      ..loadRequest(Uri.parse(_url(tab, isDark)));
    setState(() { _chartReady = false; });
  }

  void _switchTab(int i) {
    if (_selTab == i) return;
    setState(() { _selTab = i; _chartReady = false; });
    final isDark = Theme.of(context).brightness == Brightness.dark;
    _wvc?.loadRequest(Uri.parse(_url(_allTabs[i], isDark)));
  }

  String _url(_Tab tab, bool isDark) {
    final theme    = isDark ? 'd' : 'l';
    final upSym    = tab.sym.toUpperCase();
    final isBse    = tab.exchange.toUpperCase() == 'BSE';
    final mktsegid = isBse ? 3 : mktsegIdForExchange('NSE');

    if (kBseIndexSearch.containsKey(upSym)) {
      return '${AppConstants.religareChartBase}'
          '?ver=v1&mode=advance&pid=2&mktsegid=$mktsegid'
          '&period=1&interval=5MIN&style=candle&zoom=y'
          '&xaxis=y&yaxis=y&hdr=y&title=n&headsup=y&buysell=n'
          '&lookup=y&theme=$theme&span=&continuous=&group=g1'
          '&apikey=${AppConstants.religareApiKey}';
    }
    // Resolve token: prefer kNseTokens lookup, then tab.token, then sym
    final tkn = kNseTokens[upSym] ?? (tab.token.isNotEmpty ? tab.token : upSym);
    return '${AppConstants.religareChartBase}'
        '?ver=v1&mode=advance&pid=2&mktsegid=$mktsegid&tkn=$tkn'
        '&period=1&interval=5MIN&style=candle&zoom=y'
        '&xaxis=y&yaxis=y&hdr=y&title=n&headsup=y&buysell=n'
        '&lookup=y&theme=$theme&span=&continuous=&group=g1'
        '&apikey=${AppConstants.religareApiKey}';
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final fmt = NumberFormat('#,##,##0.00');
    final t   = _allTabs[_selTab];
    final isStock = t.price == 0 && _selTab == 0 &&
        t.sym.toUpperCase() != 'NIFTY' &&
        t.sym.toUpperCase() != 'SENSEX' &&
        t.sym.toUpperCase() != 'BANKNIFTY';

    return Scaffold(
      backgroundColor: ext.surface,
      body: Column(children: [

        // ── Top bar: back + scrollable index tabs ──────────────────────────────
        SafeArea(
          bottom: false,
          child: Container(
            color: ext.surface,
            child: Row(crossAxisAlignment: CrossAxisAlignment.center, children: [
              IconButton(
                icon: Icon(Icons.arrow_back_rounded, color: ext.textPrimary, size: 22),
                onPressed: () => Navigator.pop(context),
                padding: const EdgeInsets.only(left: 12, right: 4),
                constraints: const BoxConstraints(),
              ),
              Expanded(
                child: SizedBox(
                  height: 58,
                  child: ListView.builder(
                    scrollDirection: Axis.horizontal,
                    itemCount: _allTabs.length,
                    padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 5),
                    itemBuilder: (_, i) {
                      final tab = _allTabs[i];
                      final sel = _selTab == i;
                      final clr = tab.change >= 0 ? AppColors.green : AppColors.red;
                      final isStockTab = tab.price == 0 && i == 0 &&
                          tab.sym.toUpperCase() != 'NIFTY' &&
                          tab.sym.toUpperCase() != 'SENSEX' &&
                          tab.sym.toUpperCase() != 'BANKNIFTY';
                      return GestureDetector(
                        onTap: () => _switchTab(i),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 150),
                          margin: const EdgeInsets.only(right: 6),
                          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                          decoration: BoxDecoration(
                            color: sel
                                ? AppColors.blue.withValues(alpha: 0.08)
                                : Colors.transparent,
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color: sel ? AppColors.blue : ext.border,
                              width: sel ? 1.5 : 1,
                            ),
                          ),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Row(mainAxisSize: MainAxisSize.min, children: [
                                Text(tab.sym, style: TextStyle(
                                    color: sel ? AppColors.blue : ext.textPrimary,
                                    fontSize: 11, fontWeight: FontWeight.w800)),
                                if (!isStockTab) ...[
                                  const SizedBox(width: 6),
                                  Text(fmt.format(tab.price), style: TextStyle(
                                      color: sel ? AppColors.blue : ext.textPrimary,
                                      fontSize: 11, fontWeight: FontWeight.w700)),
                                  const SizedBox(width: 5),
                                  Text('+${fmt.format(tab.change)} '
                                      '(+${tab.changePct.toStringAsFixed(2)}%)',
                                      style: TextStyle(color: clr, fontSize: 9.5)),
                                ],
                              ]),
                              if (sel && !isStockTab)
                                Text(tab.expiry, style: const TextStyle(
                                    color: AppColors.amber, fontSize: 9,
                                    fontWeight: FontWeight.w600)),
                              if (sel && isStockTab)
                                Text(tab.exchange, style: TextStyle(
                                    color: ext.textMuted, fontSize: 9,
                                    fontWeight: FontWeight.w500)),
                            ],
                          ),
                        ),
                      );
                    },
                  ),
                ),
              ),
            ]),
          ),
        ),

        // ── TradingView WebView ────────────────────────────────────────────────
        Expanded(child: Stack(children: [
          if (_wvc != null) WebViewWidget(controller: _wvc!),
          if (_wvc == null || !_chartReady)
            Container(
              color: ext.surface,
              child: const Center(child: CircularProgressIndicator(
                  strokeWidth: 2.5, color: AppColors.green)),
            ),
        ])),

        // ── Fixed bottom ───────────────────────────────────────────────────────
        SafeArea(
          top: false,
          child: Container(
            color: ext.surface,
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Divider(color: ext.border, height: 1),
              // Action row
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.fromLTRB(10, 8, 10, 4),
                child: Row(children: [
                  // Trade (outlined blue pill)
                  GestureDetector(
                    onTap: () => PlaceOrderSheet.show(context,
                        symbol: t.sym, exchange: t.exchange,
                        ltp: t.price > 0 ? t.price : 0),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 13, vertical: 7),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: AppColors.blue, width: 1.5),
                      ),
                      child: const Text('Trade', style: TextStyle(
                          color: AppColors.blue, fontSize: 12,
                          fontWeight: FontWeight.w700)),
                    ),
                  ),
                  const SizedBox(width: 8),
                  _BotBtn('Open Orders', onTap: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const OrdersScreen()))),
                  const SizedBox(width: 8),
                  _BotBtn('Positions', onTap: () => Navigator.push(context,
                      MaterialPageRoute(builder: (_) => const PortfolioScreen()))),
                  const SizedBox(width: 8),
                  _BotBtn('Option Chain', onTap: () => OptionChainScreen.show(
                      context, symbol: t.sym, exchange: t.exchange)),
                  const SizedBox(width: 8),
                  IconButton(
                    icon: Icon(Icons.more_vert_rounded, color: ext.textSecondary),
                    onPressed: () {},
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                  ),
                ]),
              ),
              // BUY CALL / BUY PUT
              Padding(
                padding: const EdgeInsets.fromLTRB(12, 2, 12, 12),
                child: Row(children: [
                  Expanded(child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.green,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                    onPressed: () => PlaceOrderSheet.show(context,
                        symbol: isStock ? t.sym : '${t.sym} CE',
                        exchange: isStock ? t.exchange : 'NFO',
                        ltp: t.price > 0 ? t.price : 0,
                        isBuy: true),
                    icon: const Icon(Icons.arrow_upward_rounded,
                        color: Colors.white, size: 18),
                    label: Text(isStock ? 'BUY ${t.sym}' : 'BUY CALL',
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w800,
                            color: Colors.white)),
                  )),
                  const SizedBox(width: 12),
                  Expanded(child: FilledButton.icon(
                    style: FilledButton.styleFrom(
                      backgroundColor: AppColors.red,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(10)),
                    ),
                    onPressed: () => PlaceOrderSheet.show(context,
                        symbol: isStock ? t.sym : '${t.sym} PE',
                        exchange: isStock ? t.exchange : 'NFO',
                        ltp: t.price > 0 ? t.price : 0,
                        isBuy: false),
                    icon: const Icon(Icons.arrow_downward_rounded,
                        color: Colors.white, size: 18),
                    label: Text(isStock ? 'SELL ${t.sym}' : 'BUY PUT',
                        style: const TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w800,
                            color: Colors.white)),
                  )),
                ]),
              ),
            ]),
          ),
        ),
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
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          color: ext.card, borderRadius: BorderRadius.circular(8),
          border: Border.all(color: ext.border),
        ),
        child: Text(label, style: TextStyle(color: ext.textPrimary,
            fontSize: 12, fontWeight: FontWeight.w600)),
      ),
    );
  }
}
