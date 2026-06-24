import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../config/constants.dart';
import '../../models/models.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../option_chain/option_chain_screen.dart';
import '../orders/place_order_sheet.dart';
import '../stock_chart/stock_chart_screen.dart';

// ── Public entry point ────────────────────────────────────────────────────────
class StockDetailSheet extends StatelessWidget {
  const StockDetailSheet._({required this.item});
  final WatchlistItem item;

  static void show(BuildContext context, WatchlistItem item) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => StockDetailSheet._(item: item),
    );
  }

  @override
  Widget build(BuildContext context) => _SheetBody(item: item);
}

// ── Main sheet ────────────────────────────────────────────────────────────────
class _SheetBody extends StatefulWidget {
  final WatchlistItem item;
  const _SheetBody({required this.item});
  @override
  State<_SheetBody> createState() => _SheetBodyState();
}

class _SheetBodyState extends State<_SheetBody>
    with SingleTickerProviderStateMixin {
  late final TabController _tabs;
  WatchlistItem   _item         = const WatchlistItem.empty();
  List<_DepthRow> _bids         = [];
  List<_DepthRow> _asks         = [];
  bool            _quoteLoading = true;
  String          _period       = '1D';
  bool            _chartReady   = false;
  WebViewController? _wvc;

  @override
  void initState() {
    super.initState();
    _tabs = TabController(length: 2, vsync: this);
    _item = widget.item;
    _loadQuote();
    _tabs.addListener(() {
      if (_tabs.index == 1 && _wvc == null) _initChart();
    });
  }

  @override
  void dispose() { _tabs.dispose(); super.dispose(); }

  Future<void> _loadQuote() async {
    try {
      final res   = await ApiService.instance.getTokenLtps([widget.item.token]);
      final data  = (res['data'] ?? res['ltp'] ?? {}) as Map<String, dynamic>;
      final entry = data[widget.item.token] ?? data[widget.item.symbol];
      if (entry != null && mounted) {
        final m = entry as Map<String, dynamic>;
        setState(() {
          _item = _item.copyWith(
            ltp:       _d(m['ltp']       ?? m['last_price']),
            open:      _d(m['open']      ?? m['open_price']),
            high:      _d(m['high']      ?? m['high_price']),
            low:       _d(m['low']       ?? m['low_price']),
            prevClose: _d(m['prev_close'] ?? m['close']),
            change:    _d(m['change']),
            changePct: _d(m['change_pct'] ?? m['pct_change']),
            volume:    (m['volume'] as num?)?.toInt() ?? 0,
          );
          final bids = (m['depth']?['buy']  ?? m['bids'] ?? []) as List;
          final asks = (m['depth']?['sell'] ?? m['asks'] ?? []) as List;
          _bids = bids.map(_DepthRow.fromJson).toList();
          _asks = asks.map(_DepthRow.fromJson).toList();
          _quoteLoading = false;
        });
      } else {
        if (mounted) setState(() => _quoteLoading = false);
      }
    } catch (_) {
      if (mounted) setState(() => _quoteLoading = false);
    }
  }

  void _initChart() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    _wvc = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(NavigationDelegate(
        onPageFinished: (_) { if (mounted) setState(() => _chartReady = true); },
      ))
      ..loadRequest(Uri.parse(_chartUrl(_period, isDark)));
    setState(() {});
  }

  void _switchPeriod(String p) {
    if (_period == p) return;
    setState(() { _period = p; _chartReady = false; });
    final isDark = Theme.of(context).brightness == Brightness.dark;
    _wvc?.loadRequest(Uri.parse(_chartUrl(p, isDark)));
  }

  String _chartUrl(String period, bool isDark) =>
      _buildChartUrl(_item.symbol, _item.exchange, period, isDark);

  void _openOptionChain() {
    OptionChainScreen.show(context,
        symbol: _item.symbol, exchange: _item.exchange);
  }

  void _openFullChart() {
    Navigator.push(context, MaterialPageRoute(
      builder: (_) => StockChartScreen(
        symbol: _item.symbol, exchange: _item.exchange,
        token: _item.token, name: _item.company.isNotEmpty
            ? _item.company : _item.symbol,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final ext    = context.appColors;
    final isPos  = _item.changePct >= 0;
    final accent = isPos ? AppColors.green : AppColors.red;
    final fmt    = NumberFormat('#,##,##0.00');

    return DraggableScrollableSheet(
      initialChildSize: 0.88,
      minChildSize:     0.5,
      maxChildSize:     0.95,
      snap: true,
      snapSizes: const [0.5, 0.88, 0.95],
      builder: (_, scroll) => Container(
        decoration: BoxDecoration(
          color: ext.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: Column(children: [
          // Drag handle
          Container(
            margin: const EdgeInsets.only(top: 10, bottom: 6),
            width: 38, height: 4,
            decoration: BoxDecoration(
                color: ext.border, borderRadius: BorderRadius.circular(2)),
          ),

          // ── Header ──────────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 0),
            child: Row(children: [
              Expanded(child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Text(_item.symbol, style: TextStyle(color: ext.textPrimary,
                        fontSize: 18, fontWeight: FontWeight.w800)),
                    const SizedBox(width: 8),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                      decoration: BoxDecoration(
                        color: ext.card, borderRadius: BorderRadius.circular(5),
                        border: Border.all(color: ext.border),
                      ),
                      child: Text(_item.exchange,
                          style: TextStyle(color: ext.textMuted, fontSize: 10,
                              fontWeight: FontWeight.w600)),
                    ),
                  ]),
                  const SizedBox(height: 2),
                  Text(_item.company, style: TextStyle(color: ext.textSecondary, fontSize: 12),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ],
              )),
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                _quoteLoading
                    ? _Shimmer(w: 80, h: 22, ext: ext)
                    : Text(_item.ltp > 0 ? '₹${fmt.format(_item.ltp)}' : '—',
                        style: TextStyle(color: ext.textPrimary,
                            fontSize: 20, fontWeight: FontWeight.w800)),
                const SizedBox(height: 2),
                _quoteLoading
                    ? _Shimmer(w: 60, h: 14, ext: ext)
                    : Text(
                        _item.ltp > 0
                          ? '${isPos ? '▲' : '▼'} ${fmt.format(_item.change.abs())} '
                            '(${_item.changePct.abs().toStringAsFixed(2)}%)'
                          : '—',
                        style: TextStyle(color: accent, fontSize: 11,
                            fontWeight: FontWeight.w600)),
              ]),
            ]),
          ),

          // ── Tab bar ─────────────────────────────────────────────────────────
          const SizedBox(height: 12),
          TabBar(
            controller: _tabs,
            labelColor: AppColors.blue,
            unselectedLabelColor: ext.textSecondary,
            indicatorColor: AppColors.blue,
            indicatorSize: TabBarIndicatorSize.label,
            labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700),
            unselectedLabelStyle: const TextStyle(fontSize: 13),
            dividerColor: ext.border,
            tabs: const [Tab(text: 'Overview'), Tab(text: 'Chart')],
          ),

          // ── Scrollable tab content ───────────────────────────────────────────
          Expanded(child: TabBarView(
            controller: _tabs,
            children: [
              // Tab 0 — Overview (OHLC + depth only, no action buttons here)
              SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                child: Column(children: [
                  _OHLCGrid(item: _item, loading: _quoteLoading, ext: ext),
                  const SizedBox(height: 14),
                  _DepthTable(bids: _bids, asks: _asks,
                      loading: _quoteLoading, ext: ext),
                  const SizedBox(height: 8),
                ]),
              ),

              // Tab 1 — Inline chart (basic)
              Column(children: [
                const SizedBox(height: 8),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  for (final p in ['1D', '1W', '1M'])
                    _PeriodBtn(label: p, active: _period == p,
                        onTap: () => _switchPeriod(p)),
                ]),
                const SizedBox(height: 8),
                Expanded(child: _wvc == null
                    ? Center(child: CircularProgressIndicator(
                        strokeWidth: 2, color: AppColors.green))
                    : Stack(children: [
                        WebViewWidget(controller: _wvc!),
                        if (!_chartReady)
                          Container(color: ext.surface,
                            child: const Center(child: CircularProgressIndicator(
                                strokeWidth: 2, color: AppColors.green))),
                      ])),
              ]),
            ],
          )),

          // ── Fixed bottom — always visible ────────────────────────────────────
          Divider(color: ext.border, height: 1),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 6),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              _ActionBtn(
                icon: Icons.link_rounded,
                label: 'Option Chain',
                onTap: _openOptionChain,
                ext: ext,
              ),
              const SizedBox(width: 12),
              _ActionBtn(
                icon: Icons.show_chart_rounded,
                label: 'Charts',
                onTap: _openFullChart,
                ext: ext,
              ),
            ]),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
              child: _BuySellRow(item: _item),
            ),
          ),
        ]),
      ),
    );
  }
}

// ── Action Button ─────────────────────────────────────────────────────────────
class _ActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final AppThemeExtension ext;
  const _ActionBtn({required this.icon, required this.label,
      required this.onTap, required this.ext});
  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
      decoration: BoxDecoration(
        color: ext.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: ext.border),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, color: ext.textSecondary, size: 16),
        const SizedBox(width: 7),
        Text(label, style: TextStyle(color: ext.textSecondary,
            fontSize: 13, fontWeight: FontWeight.w600)),
      ]),
    ),
  );
}

// ── BUY / SELL row ────────────────────────────────────────────────────────────
class _BuySellRow extends StatelessWidget {
  final WatchlistItem item;
  const _BuySellRow({required this.item});
  @override
  Widget build(BuildContext context) => Row(children: [
    Expanded(child: FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.green,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      onPressed: () => PlaceOrderSheet.show(context,
          symbol: item.symbol, exchange: item.exchange,
          ltp: item.ltp, isBuy: true),
      child: const Text('BUY', style: TextStyle(fontSize: 15,
          fontWeight: FontWeight.w800, letterSpacing: 1.2)),
    )),
    const SizedBox(width: 12),
    Expanded(child: FilledButton(
      style: FilledButton.styleFrom(
        backgroundColor: AppColors.red,
        padding: const EdgeInsets.symmetric(vertical: 16),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
      onPressed: () => PlaceOrderSheet.show(context,
          symbol: item.symbol, exchange: item.exchange,
          ltp: item.ltp, isBuy: false),
      child: const Text('SELL', style: TextStyle(fontSize: 15,
          fontWeight: FontWeight.w800, letterSpacing: 1.2)),
    )),
  ]);
}

// ── OHLC Grid ─────────────────────────────────────────────────────────────────
class _OHLCGrid extends StatelessWidget {
  final WatchlistItem item;
  final bool loading;
  final AppThemeExtension ext;
  const _OHLCGrid({required this.item, required this.loading, required this.ext});

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##,##0.00');
    return Container(
      decoration: BoxDecoration(
        color: ext.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ext.border),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: Row(children: [
            for (final h in ['Open', 'High', 'Low', 'Prev. Close'])
              Expanded(child: Text(h, textAlign: TextAlign.center,
                  style: TextStyle(color: ext.textMuted, fontSize: 11,
                      fontWeight: FontWeight.w500))),
          ]),
        ),
        Divider(color: ext.border, height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
          child: Row(children: [
            _Cell(loading ? '—' : fmt.format(item.open),    ext: ext),
            _Cell(loading ? '—' : fmt.format(item.high),    ext: ext, color: AppColors.green),
            _Cell(loading ? '—' : fmt.format(item.low),     ext: ext, color: AppColors.red),
            _Cell(loading ? '—' : fmt.format(item.prevClose), ext: ext),
          ]),
        ),
      ]),
    );
  }
}

class _Cell extends StatelessWidget {
  final String value;
  final AppThemeExtension ext;
  final Color? color;
  const _Cell(this.value, {required this.ext, this.color});
  @override
  Widget build(BuildContext context) => Expanded(
    child: Text(value, textAlign: TextAlign.center,
        style: TextStyle(color: color ?? ext.textPrimary,
            fontSize: 13, fontWeight: FontWeight.w700)),
  );
}

// ── Market Depth Table ────────────────────────────────────────────────────────
class _DepthTable extends StatelessWidget {
  final List<_DepthRow> bids, asks;
  final bool loading;
  final AppThemeExtension ext;
  const _DepthTable({required this.bids, required this.asks,
      required this.loading, required this.ext});

  @override
  Widget build(BuildContext context) {
    final fmt    = NumberFormat('#,##,##0.00');
    final fmtQty = NumberFormat('#,##,##0');
    int totalBid = bids.fold(0, (s, r) => s + r.qty);
    int totalAsk = asks.fold(0, (s, r) => s + r.qty);

    return Container(
      decoration: BoxDecoration(
        color: ext.card, borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ext.border),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: Row(children: [
            Expanded(child: Text('Qty.',
                style: TextStyle(color: ext.textMuted, fontSize: 11))),
            Expanded(child: Text('Buy Price', textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.green, fontSize: 11,
                    fontWeight: FontWeight.w600))),
            Expanded(child: Text('Sell Price', textAlign: TextAlign.center,
                style: const TextStyle(color: AppColors.red, fontSize: 11,
                    fontWeight: FontWeight.w600))),
            Expanded(child: Text('Qty.', textAlign: TextAlign.right,
                style: TextStyle(color: ext.textMuted, fontSize: 11))),
          ]),
        ),
        Divider(color: ext.border, height: 1),
        if (loading || (bids.isEmpty && asks.isEmpty))
          ..._placeholders(ext)
        else
          ...List.generate(5, (i) {
            final bid = i < bids.length ? bids[i] : null;
            final ask = i < asks.length ? asks[i] : null;
            return Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(children: [
                Expanded(child: Text(bid != null ? fmtQty.format(bid.qty) : '—',
                    style: TextStyle(color: ext.textPrimary, fontSize: 13))),
                Expanded(child: Text(bid != null ? fmt.format(bid.price) : '—',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.green, fontSize: 13,
                        fontWeight: FontWeight.w600))),
                Expanded(child: Text(ask != null ? fmt.format(ask.price) : '—',
                    textAlign: TextAlign.center,
                    style: const TextStyle(color: AppColors.red, fontSize: 13,
                        fontWeight: FontWeight.w600))),
                Expanded(child: Text(ask != null ? fmtQty.format(ask.qty) : '—',
                    textAlign: TextAlign.right,
                    style: TextStyle(color: ext.textPrimary, fontSize: 13))),
              ]),
            );
          }),
        Divider(color: ext.border, height: 1),
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          child: Row(children: [
            Text(fmtQty.format(totalBid), style: TextStyle(
                color: ext.textPrimary, fontSize: 13, fontWeight: FontWeight.w800)),
            Expanded(child: Text('Total Quantity', textAlign: TextAlign.center,
                style: TextStyle(color: ext.textMuted, fontSize: 11))),
            Text(fmtQty.format(totalAsk), style: TextStyle(
                color: ext.textPrimary, fontSize: 13, fontWeight: FontWeight.w800)),
          ]),
        ),
      ]),
    );
  }

  List<Widget> _placeholders(AppThemeExtension ext) => List.generate(5, (_) =>
    Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(children: [
        Expanded(child: _Shimmer(w: 40, h: 14, ext: ext)),
        Expanded(child: Center(child: _Shimmer(w: 55, h: 14, ext: ext))),
        Expanded(child: Center(child: _Shimmer(w: 55, h: 14, ext: ext))),
        Expanded(child: Align(alignment: Alignment.centerRight,
            child: _Shimmer(w: 40, h: 14, ext: ext))),
      ]),
    ));
}

// ── Period Button ─────────────────────────────────────────────────────────────
class _PeriodBtn extends StatelessWidget {
  final String label;
  final bool active;
  final VoidCallback onTap;
  const _PeriodBtn({required this.label, required this.active, required this.onTap});
  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        margin: const EdgeInsets.symmetric(horizontal: 6),
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 7),
        decoration: BoxDecoration(
          color: active ? AppColors.blue : ext.card,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: active ? AppColors.blue : ext.border),
        ),
        child: Text(label, style: TextStyle(
          color: active ? Colors.white : ext.textSecondary,
          fontSize: 13, fontWeight: FontWeight.w700,
        )),
      ),
    );
  }
}

// ── Shimmer ───────────────────────────────────────────────────────────────────
class _Shimmer extends StatelessWidget {
  final double w, h;
  final AppThemeExtension ext;
  const _Shimmer({required this.w, required this.h, required this.ext});
  @override
  Widget build(BuildContext context) => Container(
    width: w, height: h,
    decoration: BoxDecoration(color: ext.border, borderRadius: BorderRadius.circular(4)),
  );
}

// ── Depth row model ───────────────────────────────────────────────────────────
class _DepthRow {
  final double price;
  final int    qty;
  const _DepthRow({required this.price, required this.qty});
  factory _DepthRow.fromJson(dynamic j) {
    final m = j as Map<String, dynamic>;
    return _DepthRow(
      price: _d(m['price'] ?? m['Price']),
      qty:   (m['quantity'] ?? m['Qty'] ?? m['qty'] ?? 0) as int,
    );
  }
}

// ── Chart URL ─────────────────────────────────────────────────────────────────
String _buildChartUrl(String symbol, String exchange, String period, bool isDark) {
  final sym      = symbol.toUpperCase();
  final theme    = isDark ? 'd' : 'l';
  final mktsegid = mktsegIdForExchange(exchange);

  String per, ivl;
  switch (period) {
    case '1W': per = '5';  ivl = '15MIN'; break;
    case '1M': per = '30'; ivl = '60MIN'; break;
    default:   per = '1';  ivl = 'MIN';   break;
  }

  if (kBseIndexSearch.containsKey(sym)) {
    return '${AppConstants.religareChartBase}'
        '?ver=v1&mode=basic&pid=2&mktsegid=3'
        '&period=$per&interval=$ivl&style=line&zoom=n'
        '&xaxis=y&yaxis=y&hdr=y&title=n&headsup=n&buysell=n'
        '&lookup=y&theme=$theme&apikey=${AppConstants.religareApiKey}';
  }
  final token = kNseTokens[sym] ?? sym;
  return '${AppConstants.religareChartBase}'
      '?ver=v1&mode=basic&pid=2&mktsegid=$mktsegid&tkn=$token'
      '&period=$per&interval=$ivl&style=line&zoom=n'
      '&xaxis=y&yaxis=y&hdr=y&title=n&headsup=n&buysell=n'
      '&lookup=y&theme=$theme&apikey=${AppConstants.religareApiKey}';
}

double _d(dynamic v) {
  if (v == null) return 0.0;
  if (v is num)  return v.toDouble();
  return double.tryParse(v.toString()) ?? 0.0;
}
