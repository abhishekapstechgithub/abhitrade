import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/widgets.dart';
import '../../models/models.dart';
import '../chart/chart_screen.dart';

class WatchlistScreen extends StatefulWidget {
  const WatchlistScreen({super.key});

  @override
  State<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends State<WatchlistScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;
  final _searchCtrl = TextEditingController();
  bool _searching = false;
  String _searchQuery = '';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<WatchlistProvider>().fetch();
    });
    _tabCtrl = TabController(length: 0, vsync: this);
    _tabCtrl.addListener(() {
      if (!_tabCtrl.indexIsChanging) {
        context.read<WatchlistProvider>().setActive(_tabCtrl.index);
      }
    });
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _searchCtrl.dispose();
    super.dispose();
  }

  void _rebuildTabs(int count) {
    if (_tabCtrl.length != count) {
      _tabCtrl.dispose();
      _tabCtrl = TabController(length: count, vsync: this);
      _tabCtrl.addListener(() {
        if (!_tabCtrl.indexIsChanging) {
          context.read<WatchlistProvider>().setActive(_tabCtrl.index);
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final wl   = context.watch<WatchlistProvider>();
    final mode = context.watch<TradingModeProvider>();

    _rebuildTabs(wl.watchlists.length);

    final items = (wl.active?.items ?? []).where((i) {
      if (_searchQuery.isEmpty) return true;
      final q = _searchQuery.toLowerCase();
      return i.symbol.toLowerCase().contains(q) ||
          i.company.toLowerCase().contains(q);
    }).toList();

    return Scaffold(
      backgroundColor: ext.bg,
      appBar: AppBar(
        backgroundColor: ext.surface,
        surfaceTintColor: Colors.transparent,
        title: _searching
            ? TextField(
                controller: _searchCtrl,
                autofocus: true,
                style: TextStyle(color: ext.textPrimary),
                decoration: InputDecoration(
                  hintText: 'Search symbols…',
                  hintStyle: TextStyle(color: ext.textMuted),
                  border: InputBorder.none,
                  contentPadding: EdgeInsets.zero,
                ),
                onChanged: (v) => setState(() => _searchQuery = v),
              )
            : Text('Watchlist',
                style: TextStyle(
                    color: ext.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: Icon(
                _searching ? Icons.close : Icons.search,
                color: ext.textSecondary),
            onPressed: () => setState(() {
              _searching = !_searching;
              if (!_searching) {
                _searchQuery = '';
                _searchCtrl.clear();
              }
            }),
          ),
          IconButton(
            icon: Icon(Icons.add, color: ext.textSecondary),
            onPressed: () => _showAddDialog(context),
          ),
        ],
        bottom: wl.watchlists.isNotEmpty
            ? TabBar(
                controller: _tabCtrl,
                isScrollable: true,
                tabAlignment: TabAlignment.start,
                tabs: wl.watchlists
                    .map((w) => Tab(text: w.name))
                    .toList(),
              )
            : null,
      ),
      body: Column(
        children: [
          // Paper mode banner
          if (mode.isPaper) PaperModeBanner(balance: mode.paperBalance),
          // Sort bar
          if (!wl.loading)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: ext.surface,
                border: Border(bottom: BorderSide(color: ext.border)),
              ),
              child: Row(
                children: [
                  Text('${items.length} symbols',
                      style: TextStyle(color: ext.textMuted, fontSize: 12)),
                  const Spacer(),
                  _SortChip(label: 'LTP', onTap: () {}),
                  const SizedBox(width: 8),
                  _SortChip(label: 'Change %', onTap: () {}),
                  const SizedBox(width: 8),
                  _SortChip(label: 'Volume', onTap: () {}),
                ],
              ),
            ),
          // List
          Expanded(
            child: wl.loading
                ? const Center(
                    child: CircularProgressIndicator(
                        color: AppColors.blue, strokeWidth: 2))
                : items.isEmpty
                    ? _EmptyWatchlist()
                    : ListView.separated(
                        itemCount: items.length,
                        separatorBuilder: (_, __) =>
                            Divider(indent: 16, endIndent: 16, color: ext.border, height: 1),
                        itemBuilder: (_, i) => WatchlistRow(
                          item: items[i],
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ChartScreen(
                                symbol: items[i].symbol,
                                exchange: items[i].exchange,
                                token: items[i].id,
                                name: items[i].company,
                                watchlistItem: items[i],
                              ),
                            ),
                          ),
                          onBuy: () => _openOrder(context, items[i], mode),
                          onSell: () => _openOrder(context, items[i], mode, sell: true),
                        ),
                      ),
          ),
        ],
      ),
    );
  }

  void _openOrder(BuildContext ctx, WatchlistItem item, TradingModeProvider mode,
      {bool sell = false}) {
    PlaceOrderSheet.show(
      ctx,
      item,
      mode.isPaper,
      (side, qty, price, tradingMode) async {
        if (mode.isPaper) {
          final err = mode.placePaperOrder(
              symbol: item.symbol,
              side: side,
              quantity: qty,
              price: price);
          if (ctx.mounted) {
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
              content: Text(err.isEmpty
                  ? '✅ Paper order placed: ${side.name.toUpperCase()} ${item.symbol} x$qty @ ₹${price.toStringAsFixed(2)}'
                  : '❌ $err'),
              backgroundColor: err.isEmpty ? AppColors.green : AppColors.red,
            ));
          }
        } else {
          try {
            await context.read<OrdersProvider>().placeOrder(
                  symbol: item.symbol,
                  exchange: item.exchange,
                  side: side,
                  qty: qty,
                  price: price,
                  tradingMode: tradingMode,
                );
            if (ctx.mounted) {
              ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                content: Text('✅ Order placed: ${side.name.toUpperCase()} ${item.symbol}'),
                backgroundColor: AppColors.green,
              ));
            }
          } catch (e) {
            if (ctx.mounted) {
              ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
                content: Text('❌ $e'),
                backgroundColor: AppColors.red,
              ));
            }
          }
        }
      },
    );
  }

  void _showAddDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => const _AddSymbolDialog(),
    );
  }
}

class _SortChip extends StatelessWidget {
  final String label;
  final VoidCallback onTap;
  const _SortChip({required this.label, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: ext.card,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: ext.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label, style: TextStyle(color: ext.textSecondary, fontSize: 11)),
            const SizedBox(width: 2),
            Icon(Icons.unfold_more, size: 12, color: ext.textMuted),
          ],
        ),
      ),
    );
  }
}

class _EmptyWatchlist extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.star_border, size: 56, color: ext.textMuted),
          const SizedBox(height: 16),
          Text('No symbols in this watchlist',
              style: TextStyle(color: ext.textSecondary, fontSize: 16, fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Tap + to add symbols',
              style: TextStyle(color: ext.textMuted, fontSize: 13)),
        ],
      ),
    );
  }
}

class _AddSymbolDialog extends StatefulWidget {
  const _AddSymbolDialog();

  @override
  State<_AddSymbolDialog> createState() => _AddSymbolDialogState();
}

class _AddSymbolDialogState extends State<_AddSymbolDialog> {
  final _ctrl = TextEditingController();

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return AlertDialog(
      backgroundColor: ext.surface,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: ext.border)),
      title: Text('Add Symbol',
          style: TextStyle(color: ext.textPrimary, fontWeight: FontWeight.w700)),
      content: TextField(
        controller: _ctrl,
        autofocus: true,
        decoration: const InputDecoration(hintText: 'e.g. RELIANCE, TCS'),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Cancel', style: TextStyle(color: ext.textSecondary)),
        ),
        ElevatedButton(
          onPressed: () => Navigator.pop(context),
          child: const Text('Add'),
        ),
      ],
    );
  }
}

// Extend OrdersProvider with placeOrder capability
extension OrdersProviderX on OrdersProvider {
  Future<void> placeOrder({
    required String symbol,
    required String exchange,
    required OrderSide side,
    required int qty,
    required double price,
    required String tradingMode,
  }) =>
      fetch(tradingMode);
}
