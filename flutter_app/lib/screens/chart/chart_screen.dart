import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../../theme/app_theme.dart';
import '../../providers/app_provider.dart';
import '../../widgets/widgets.dart';
import '../../models/models.dart';

/// Maps an Angel One-style token to Religare's token + mktsegid.
/// Falls back to the raw token with NSE equity segment.
_ReligareToken _mapToken(String token, String exchange) {
  // Special index overrides
  const indexMap = {
    '99926000': _ReligareToken('26000', 1),
    '99926009': _ReligareToken('26009', 1),
    '99926037': _ReligareToken('26037', 1),
    '99919000': _ReligareToken('19000', 3),
  };
  if (indexMap.containsKey(token)) return indexMap[token]!;

  final ex = exchange.toUpperCase();
  final seg = ex == 'BSE' ? 3 : 1;
  return _ReligareToken(token, seg);
}

class _ReligareToken {
  final String token;
  final int mktsegid;
  const _ReligareToken(this.token, this.mktsegid);
}

String _buildChartUrl(String token, String exchange) {
  final rt = _mapToken(token, exchange);
  return 'https://leap.religareonline.com/TV/index.html'
      '?ver=v1'
      '&mode=advance'
      '&pid=2'
      '&mktsegid=${rt.mktsegid}'
      '&tkn=${rt.token}'
      '&period=1'
      '&interval=MIN'
      '&style=line'
      '&zoom=y'
      '&xaxis=y'
      '&yaxis=y'
      '&hdr=y'
      '&title=n'
      '&headsup=y'
      '&buysell=y'
      '&lookup=y'
      '&theme=d'
      '&span='
      '&continuous='
      '&group=g1'
      '&apikey=0HVTVTkNzEg7Dwjd80T0bXbO8t8FThd';
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
  late final WebViewController _controller;
  bool _loading = true;
  bool _error = false;

  @override
  void initState() {
    super.initState();
    final url = _buildChartUrl(widget.token, widget.exchange);

    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF050B18))
      ..setNavigationDelegate(NavigationDelegate(
        onPageStarted: (_) => setState(() {
          _loading = true;
          _error = false;
        }),
        onPageFinished: (_) => setState(() => _loading = false),
        onWebResourceError: (_) => setState(() {
          _loading = false;
          _error = true;
        }),
      ))
      ..loadRequest(Uri.parse(url));
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final trading = context.watch<TradingModeProvider>();
    final item = widget.watchlistItem;

    return Scaffold(
      backgroundColor: const Color(0xFF050B18),
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
                    style: TextStyle(
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
                      final url = _buildChartUrl(widget.token, widget.exchange);
                      _controller.loadRequest(Uri.parse(url));
                    },
                  )
                : WebViewWidget(controller: _controller),
          ),
          // Loading overlay
          if (_loading)
            Container(
              color: const Color(0xFF050B18),
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
      (side, qty, price, mode) {
        if (trading.isPaper) {
          final err = trading.placePaperOrder(
            symbol: orderItem.symbol,
            side: side,
            quantity: qty,
            price: price,
          );
          if (ctx.mounted) {
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
              content: Text(err.isEmpty
                  ? 'Paper order placed: ${side.name.toUpperCase()} ${orderItem.symbol} x$qty @ ₹${price.toStringAsFixed(2)}'
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
            style: TextStyle(
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
