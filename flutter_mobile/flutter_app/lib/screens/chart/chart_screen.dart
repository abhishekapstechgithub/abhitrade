import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../config/constants.dart';
import '../../theme/app_theme.dart';
import '../../providers/app_provider.dart';
import '../../widgets/widgets.dart';
import '../../models/models.dart';

String _buildChartUrl(String symbol, String exchange, bool isDark) {
  final sym = symbol.toUpperCase();
  final themeStr = isDark ? 'd' : 'l';
  // BSE indices: open chart with no token + lookup enabled; JS will auto-search
  if (kBseIndexSearch.containsKey(sym)) {
    return '${AppConstants.religareChartBase}'
        '?ver=v1&mode=advance&pid=2'
        '&mktsegid=3'
        '&period=1&interval=MIN&style=line&zoom=y'
        '&xaxis=y&yaxis=y&hdr=y&title=n'
        '&headsup=y&buysell=n&lookup=y&theme=$themeStr'
        '&span=&continuous=&group=g1'
        '&apikey=${AppConstants.religareApiKey}';
  }
  final mktsegid = mktsegIdForExchange(exchange);
  final token = kNseTokens[sym] ?? sym;
  return '${AppConstants.religareChartBase}'
      '?ver=v1&mode=advance&pid=2'
      '&mktsegid=$mktsegid&tkn=$token'
      '&period=1&interval=MIN&style=line&zoom=y'
      '&xaxis=y&yaxis=y&hdr=y&title=n'
      '&headsup=y&buysell=n&lookup=y&theme=$themeStr'
      '&span=&continuous=&group=g1'
      '&apikey=${AppConstants.religareApiKey}';
}

class ChartScreen extends StatefulWidget {
  final String symbol;
  final String exchange;
  final String token;
  final String name;
  final WatchlistItem? watchlistItem;

  const ChartScreen({
    super.key,
    required this.symbol,
    required this.exchange,
    required this.token,
    required this.name,
    this.watchlistItem,
  });

  @override
  State<ChartScreen> createState() => _ChartScreenState();
}

class _ChartScreenState extends State<ChartScreen> {
  late WebViewController _controller;
  bool _loading = true;
  bool _error = false;
  String? _autoSearch; // non-null → inject JS search after page load
  bool _initialized = false;

  @override
  void initState() {
    super.initState();
    _autoSearch = kBseIndexSearch[widget.symbol.toUpperCase()];
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initialized) {
      _initialized = true;
      final isDark = Theme.of(context).brightness == Brightness.dark;
      final url = _buildChartUrl(widget.symbol, widget.exchange, isDark);

      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setBackgroundColor(Colors.transparent)
        ..setNavigationDelegate(NavigationDelegate(
          onPageStarted: (_) => setState(() {
            _loading = true;
            _error = false;
          }),
          onPageFinished: (_) {
            setState(() => _loading = false);
            if (_autoSearch != null) _injectSearch(_autoSearch!);
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame == true) {
              setState(() { _loading = false; _error = true; });
            }
          },
        ))
        ..loadRequest(Uri.parse(url));
    }
  }

  void _injectSearch(String query) {
    Future.delayed(const Duration(milliseconds: 2500), () {
      if (!mounted) return;
      _controller.runJavaScript('''
        (function() {
          var q = ${_escapeJs(query)};
          // Try TradingView widget setSymbol API
          function tryApi() {
            for (var k in window) {
              try {
                var o = window[k];
                if (!o || typeof o !== 'object') continue;
                if (typeof o.setSymbol === 'function') { o.setSymbol(q, '1', function(){}); return true; }
                if (o.chart && typeof o.chart === 'function' && typeof o.chart().setSymbol === 'function') {
                  o.chart().setSymbol(q, '1', function(){}); return true;
                }
              } catch(e) {}
            }
            return false;
          }
          // Fallback: click the lookup/search button, then type the query
          function tryUI() {
            var btn = document.querySelector('[class*="lookup"]')
                   || document.querySelector('[class*="symbol-search"]')
                   || document.querySelector('[class*="searchMode"]')
                   || document.querySelector('[class*="header"] [class*="symbol"]')
                   || document.querySelector('button[title]');
            if (!btn) return;
            btn.click();
            setTimeout(function() {
              var inp = document.querySelector('input[class*="search"]')
                     || document.querySelector('input[placeholder]')
                     || document.activeElement;
              if (inp && inp.tagName === 'INPUT') {
                inp.value = '';
                inp.focus();
                var nativeInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
                nativeInput && nativeInput.set && nativeInput.set.call(inp, q);
                inp.dispatchEvent(new Event('input', {bubbles:true}));
              }
            }, 600);
          }
          if (!tryApi()) tryUI();
        })();
      ''');
    });
  }

  static String _escapeJs(String s) => '"${s.replaceAll('"', '\\"')}"';


  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final trading = context.watch<TradingModeProvider>();
    final item = widget.watchlistItem;

    return Scaffold(
      backgroundColor: ext.bg,
      appBar: AppBar(
        backgroundColor: ext.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios_new, size: 20, color: ext.textSecondary),
          onPressed: () => Navigator.pop(context),
        ),
        title: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    widget.symbol,
                    style: context.isDark
                        ? TextStyle(
                            color: ext.textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          )
                        : GoogleFonts.lora(
                            color: ext.textPrimary,
                            fontSize: 16,
                            fontWeight: FontWeight.w800,
                          ),
                  ),
                  if (widget.name.isNotEmpty &&
                      widget.name != widget.symbol)
                    Text(
                      widget.name,
                      style: TextStyle(
                        color: ext.textMuted,
                        fontSize: 11,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                ],
              ),
            ),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.blueDim.withOpacity(0.3),
                borderRadius: BorderRadius.circular(5),
                border: Border.all(
                  color: AppColors.blue.withOpacity(0.5),
                ),
              ),
              child: Text(
                widget.exchange,
                style: const TextStyle(
                  color: AppColors.blue,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
        actions: [
          // BUY button
          Padding(
            padding: const EdgeInsets.only(right: 4),
            child: TextButton(
              style: TextButton.styleFrom(
                backgroundColor: AppColors.green.withOpacity(0.15),
                foregroundColor: AppColors.green,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                minimumSize: Size.zero,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(
                    color: AppColors.green.withOpacity(0.4),
                  ),
                ),
              ),
              onPressed: () => _openOrder(context, true, trading),
              child: const Text(
                'BUY',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ),
          // SELL button
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: TextButton(
              style: TextButton.styleFrom(
                backgroundColor: AppColors.red.withOpacity(0.15),
                foregroundColor: AppColors.red,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                minimumSize: Size.zero,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(8),
                  side: BorderSide(
                    color: AppColors.red.withOpacity(0.4),
                  ),
                ),
              ),
              onPressed: () => _openOrder(context, false, trading),
              child: const Text(
                'SELL',
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  letterSpacing: 0.5,
                ),
              ),
            ),
          ),
        ],
        bottom: PreferredSize(
          preferredSize: const Size.fromHeight(1),
          child: Divider(color: ext.border, height: 1),
        ),
      ),
      body: Stack(
        children: [
          // Live price bar if item available
          if (item != null)
            Align(
              alignment: Alignment.topCenter,
              child: _PriceBar(item: item),
            ),
          // WebView
          Padding(
            padding: item != null
                ? const EdgeInsets.only(top: 44)
                : EdgeInsets.zero,
            child: _error
                ? _ErrorView(
                    onRetry: () {
                      final isDark = Theme.of(context).brightness == Brightness.dark;
                      final url = _buildChartUrl(widget.symbol, widget.exchange, isDark);
                      _controller.loadRequest(Uri.parse(url));
                    },
                  )
                : WebViewWidget(controller: _controller),
          ),
          // Loading overlay
          if (_loading)
            Container(
              color: ext.bg,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(
                      color: AppColors.blue,
                      strokeWidth: 2,
                    ),
                    SizedBox(height: 16),
                    Text(
                      'Loading chart…',
                      style: TextStyle(
                        color: AppColors.blue,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ),
        ],
      ),
    );
  }

  void _openOrder(
    BuildContext ctx,
    bool isBuy,
    TradingModeProvider trading,
  ) {
    // Build a minimal WatchlistItem for order sheet
    final orderItem = widget.watchlistItem ??
        WatchlistItem(
          id: widget.token,
          symbol: widget.symbol,
          company: widget.name,
          exchange: widget.exchange,
          ltp: 0,
          change: 0,
          changePct: 0,
          high: 0,
          low: 0,
          open: 0,
          prevClose: 0,
          volume: 0,
        );

    PlaceOrderSheet.show(
      ctx,
      orderItem,
      trading.isPaper,
      (side, qty, price, mode) async {
        if (trading.isPaper) {
          final err = await trading.placePaperOrder(
            symbol: orderItem.symbol,
            side: side,
            quantity: qty,
            price: price,
          );
          if (ctx.mounted) {
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
              content: Text(err.isEmpty
                  ? 'Order placed: ${side.name.toUpperCase()} ${orderItem.symbol} x$qty @ ₹${price.toStringAsFixed(2)}'
                  : 'Error: $err'),
              backgroundColor: err.isEmpty ? AppColors.green : AppColors.red,
            ));
          }
        } else {
          if (ctx.mounted) {
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
              content: Text(
                'Order submitted: ${side.name.toUpperCase()} ${orderItem.symbol} x$qty',
              ),
              backgroundColor: AppColors.green,
            ));
          }
        }
      },
    );
  }
}

// ── Price Bar ─────────────────────────────────────────────────────────────────
class _PriceBar extends StatelessWidget {
  final WatchlistItem item;
  const _PriceBar({required this.item});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final color = item.isPositive ? AppColors.green : AppColors.red;
    final dimColor = item.isPositive
        ? (context.isDark ? AppColors.greenDim : AppColors.greenDimLight)
        : (context.isDark ? AppColors.redDim : AppColors.redDimLight);

    return Container(
      height: 44,
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16),
      decoration: BoxDecoration(
        color: ext.surface,
        border: Border(bottom: BorderSide(color: ext.border)),
      ),
      child: Row(
        children: [
          Text(
            '₹${item.ltp.toStringAsFixed(2)}',
            style: TextStyle(
              color: ext.textPrimary,
              fontSize: 16,
              fontWeight: FontWeight.w800,
            ),
          ),
          const SizedBox(width: 10),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: dimColor,
              borderRadius: BorderRadius.circular(5),
            ),
            child: Text(
              '${fmtChange(item.change)}  (${fmtChange(item.changePct)}%)',
              style: TextStyle(
                color: color,
                fontSize: 12,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          const Spacer(),
          _MiniStat('H', '₹${item.high.toStringAsFixed(2)}', ext),
          const SizedBox(width: 10),
          _MiniStat('L', '₹${item.low.toStringAsFixed(2)}', ext),
          const SizedBox(width: 10),
          _MiniStat('Vol', fmtCompact(item.volume.toDouble()), ext),
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  final String label;
  final String value;
  final AppThemeExtension ext;
  const _MiniStat(this.label, this.value, this.ext);

  @override
  Widget build(BuildContext context) => Column(
        mainAxisAlignment: MainAxisAlignment.center,
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Text(label,
              style: TextStyle(color: ext.textMuted, fontSize: 9, height: 1.1)),
          Text(value,
              style: TextStyle(
                color: ext.textSecondary,
                fontSize: 11,
                fontWeight: FontWeight.w600,
                height: 1.1,
              )),
        ],
      );
}

// ── Error View ────────────────────────────────────────────────────────────────
class _ErrorView extends StatelessWidget {
  final VoidCallback onRetry;
  const _ErrorView({required this.onRetry});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.signal_wifi_off_rounded, size: 52, color: ext.textMuted),
          const SizedBox(height: 16),
          Text(
            'Chart failed to load',
            style: context.isDark
                ? TextStyle(
                    color: ext.textSecondary,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  )
                : GoogleFonts.lora(
                    color: ext.textSecondary,
                    fontSize: 16,
                    fontWeight: FontWeight.w600,
                  ),
          ),
          const SizedBox(height: 8),
          Text(
            'Check your internet connection and try again',
            style: TextStyle(color: ext.textMuted, fontSize: 13),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 24),
          ElevatedButton.icon(
            onPressed: onRetry,
            icon: const Icon(Icons.refresh),
            label: const Text('Retry'),
          ),
        ],
      ),
    );
  }
}
