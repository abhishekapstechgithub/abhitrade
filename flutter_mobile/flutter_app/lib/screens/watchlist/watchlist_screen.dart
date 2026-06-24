import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../../providers/app_provider.dart';
import '../../services/api_service.dart';
import '../../theme/app_theme.dart';
import '../../widgets/widgets.dart';
import '../../models/models.dart';
import 'stock_detail_sheet.dart';

// ── Enums ──────────────────────────────────────────────────────────────────────
enum _SortBy { none, alpha, ltp, changePct, volume }
enum _DisplayCol { ltp, change, volume }
enum _Filter { all, gainers, losers }
enum _OcView { ltpPct, ltpOi, greeks, oiPct }

class WatchlistScreen extends StatefulWidget {
  const WatchlistScreen({super.key});

  @override
  State<WatchlistScreen> createState() => _WatchlistScreenState();
}

class _WatchlistScreenState extends State<WatchlistScreen> {
  late PageController _pageController;
  _SortBy _sortBy = _SortBy.none;
  bool _sortAsc = false;
  _DisplayCol _displayCol = _DisplayCol.ltp;
  _Filter _filter = _Filter.all;
  bool _showOC = false;

  @override
  void initState() {
    super.initState();
    final wl = context.read<WatchlistProvider>();
    _pageController = PageController(initialPage: wl.activeIndex);
    wl.addListener(_onWatchlistProviderChanged);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      wl.fetch();
      final mp = context.read<MarketProvider>();
      if (mp.indices.isEmpty) mp.fetch();
    });
  }

  @override
  void dispose() {
    context.read<WatchlistProvider>().removeListener(_onWatchlistProviderChanged);
    _pageController.dispose();
    super.dispose();
  }

  void _onWatchlistProviderChanged() {
    if (!mounted) return;
    final wl = context.read<WatchlistProvider>();
    if (_pageController.hasClients) {
      final currentPage = _pageController.page?.round() ?? 0;
      if (currentPage != wl.activeIndex && wl.activeIndex < wl.watchlists.length) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (_pageController.hasClients) {
            _pageController.jumpToPage(wl.activeIndex);
          }
        });
      }
    }
  }

  List<WatchlistItem> _processItems(List<WatchlistItem> raw) {
    var items = raw.toList();

    // Gainer/Loser filter
    switch (_filter) {
      case _Filter.gainers:
        items = items.where((i) => i.changePct > 0).toList();
        break;
      case _Filter.losers:
        items = items.where((i) => i.changePct < 0).toList();
        break;
      case _Filter.all:
        break;
    }

    // Sort
    if (_sortBy != _SortBy.none) {
      items.sort((a, b) {
        int cmp;
        switch (_sortBy) {
          case _SortBy.alpha:
            cmp = a.symbol.compareTo(b.symbol);
            break;
          case _SortBy.ltp:
            cmp = a.ltp.compareTo(b.ltp);
            break;
          case _SortBy.changePct:
            cmp = a.changePct.compareTo(b.changePct);
            break;
          case _SortBy.volume:
            cmp = a.volume.compareTo(b.volume);
            break;
          default:
            cmp = 0;
        }
        return _sortAsc ? cmp : -cmp;
      });
    }

    return items;
  }

  void _cycleDisplayCol() {
    setState(() {
      _displayCol = _DisplayCol
          .values[(_displayCol.index + 1) % _DisplayCol.values.length];
    });
  }

  void _cycleSort(_SortBy by) {
    setState(() {
      if (_sortBy == by) {
        if (_sortAsc == false) {
          _sortAsc = true;
        } else {
          _sortBy = _SortBy.none;
          _sortAsc = false;
        }
      } else {
        _sortBy = by;
        _sortAsc = false;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ext  = context.appColors;
    final wl   = context.watch<WatchlistProvider>();
    final mode = context.watch<TradingModeProvider>();

    final items = _processItems(wl.active?.items ?? []);

    return Scaffold(
      backgroundColor: ext.bg,
      appBar: AppBar(
        backgroundColor: ext.surface,
        surfaceTintColor: Colors.transparent,
        toolbarHeight: 64,
        titleSpacing: 16,
        title: GestureDetector(
          onTap: () => _showWatchlistPicker(context, wl),
          behavior: HitTestBehavior.opaque,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        wl.active?.name ?? 'My Watchlist',
                        style: context.isDark
                            ? TextStyle(
                                color: ext.textPrimary,
                                fontSize: 18,
                                fontWeight: FontWeight.w800)
                            : GoogleFonts.lora(
                                color: ext.textPrimary,
                                fontSize: 18,
                                fontWeight: FontWeight.w800),
                      ),
                      const SizedBox(width: 3),
                      Icon(Icons.keyboard_arrow_down_rounded,
                          color: ext.textPrimary, size: 22),
                    ],
                  ),
                  Text(
                    '${wl.active?.items.length ?? 0} scrips',
                    style: TextStyle(color: ext.textMuted, fontSize: 11),
                  ),
                ],
              ),
            ],
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(
              Icons.table_chart_outlined,
              color: _showOC ? AppColors.blue : ext.textSecondary,
            ),
            tooltip: 'Option Chain',
            onPressed: () => setState(() => _showOC = !_showOC),
          ),
          IconButton(
            icon: Icon(Icons.search_rounded, color: ext.textSecondary),
            onPressed: () => SymbolSearchSheet.show(context),
          ),
          Padding(
            padding: const EdgeInsets.only(right: 12),
            child: GestureDetector(
              onTap: () => _showAddMenu(context, wl),
              child: Container(
                width: 34,
                height: 34,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  border: Border.all(color: ext.border, width: 1.5),
                ),
                child: Icon(Icons.add_rounded,
                    color: ext.textSecondary, size: 20),
              ),
            ),
          ),
        ],
      ),
      body: _showOC
          ? _OptionChainPanel(onClose: () => setState(() => _showOC = false))
          : Column(
        children: [
          const _PinnedIndicesBar(),
          if (wl.error != null && !wl.loading)
            _ErrorBanner(
              message: wl.error!,
              onRetry: () => context.read<WatchlistProvider>().fetch(),
            ),

          // ── Filter + Sort + Column bar ────────────────────────────────────────
          if (!wl.loading && wl.watchlists.isNotEmpty)
            _FilterSortBar(
              filter: _filter,
              sortBy: _sortBy,
              sortAsc: _sortAsc,
              displayCol: _displayCol,
              itemCount: items.length,
              onFilterChange: (f) => setState(() => _filter = f),
              onSort: _cycleSort,
              onColToggle: _cycleDisplayCol,
              onWatchlistSelect: (idx) {
                wl.setActive(idx);
                _pageController.animateToPage(
                  idx,
                  duration: const Duration(milliseconds: 200),
                  curve: Curves.easeInOut,
                );
              },
            ),

          // ── List ──────────────────────────────────────────────────────────────
          Expanded(
            child: wl.loading
                ? const Center(
                    child: CircularProgressIndicator(
                        color: AppColors.blue, strokeWidth: 2))
                : wl.watchlists.isEmpty
                    ? _EmptyWatchlist(
                        message: wl.error != null
                            ? 'Could not load watchlists'
                            : 'No watchlists yet',
                        subMessage: wl.error != null
                            ? 'Check your connection and retry'
                            : 'Tap + to create your first watchlist',
                        onRetry: wl.error != null
                            ? () => context.read<WatchlistProvider>().fetch()
                            : null,
                        onCreate: wl.error == null
                            ? () => _showCreateWatchlistDialog(context)
                            : null,
                      )
                    : PageView(
                        controller: _pageController,
                        onPageChanged: (idx) {
                          wl.setActive(idx);
                        },
                        children: wl.watchlists.asMap().entries.map((e) {
                          final currentWl = e.value;
                          final currentItems = _processItems(currentWl.items);

                          if (currentItems.isEmpty) {
                            return _EmptyWatchlist(
                              message: 'Watchlist is empty',
                              subMessage: 'Tap + to add symbols',
                            );
                          }

                          return RefreshIndicator(
                            key: PageStorageKey<String>('wl_refresh_${currentWl.id}'),
                            onRefresh: () =>
                                context.read<WatchlistProvider>().refreshPrices(),
                            color: AppColors.blue,
                            child: ListView.separated(
                              key: PageStorageKey<String>('wl_list_${currentWl.id}'),
                              itemCount: currentItems.length,
                              separatorBuilder: (_, __) => Divider(
                                  indent: 0,
                                  endIndent: 0,
                                  color: ext.border,
                                  height: 1),
                              itemBuilder: (_, i) {
                                final item = currentItems[i];
                                return _SwipeableRow(
                                  key: ValueKey('${item.id}_${currentWl.id}'),
                                  item: item,
                                  displayCol: _displayCol,
                                  onTap: () =>
                                      StockDetailSheet.show(context, item),
                                  onBuy: () =>
                                      _openOrder(context, item, mode),
                                  onSell: () =>
                                      _openOrder(context, item, mode, sell: true),
                                  onDelete: () {
                                    context
                                        .read<WatchlistProvider>()
                                        .removeSymbol(currentWl.id, item.id);
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text(
                                            '${item.symbol} removed from watchlist'),
                                        backgroundColor: AppColors.red,
                                        behavior: SnackBarBehavior.floating,
                                      ),
                                    );
                                  },
                                  onLongPress: () => _showContextMenu(
                                      context, item, wl, mode),
                                );
                              },
                            ),
                          );
                        }).toList(),
                      ),
          ),
        ],
      ),
    );
  }

  // ── Order ──────────────────────────────────────────────────────────────────
  void _openOrder(BuildContext ctx, WatchlistItem item, TradingModeProvider mode,
      {bool sell = false}) {
    PlaceOrderSheet.show(ctx, item, mode.isPaper,
        (side, qty, price, tradingMode) async {
      if (mode.isPaper) {
        final err = await mode.placePaperOrder(
            symbol: item.symbol, side: side, quantity: qty, price: price);
        if (ctx.mounted) {
          ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
            content: Text(err.isEmpty
                ? 'Order placed: ${side.name.toUpperCase()} ${item.symbol} ×$qty'
                : err),
            backgroundColor: err.isEmpty ? AppColors.green : AppColors.red,
            behavior: SnackBarBehavior.floating,
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
              content: Text('Order placed: ${side.name.toUpperCase()} ${item.symbol}'),
              backgroundColor: AppColors.green,
              behavior: SnackBarBehavior.floating,
            ));
          }
        } catch (e) {
          if (ctx.mounted) {
            ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
              content: Text('$e'),
              backgroundColor: AppColors.red,
              behavior: SnackBarBehavior.floating,
            ));
          }
        }
      }
    });
  }

  // ── Long-press context menu ────────────────────────────────────────────────
  void _showContextMenu(BuildContext context, WatchlistItem item,
      WatchlistProvider wl, TradingModeProvider mode) {
    HapticFeedback.mediumImpact();
    final ext = context.appColors;
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) {
        final isPos = item.changePct >= 0;
        final priceColor = isPos ? AppColors.green : AppColors.red;
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                    color: ext.border, borderRadius: BorderRadius.circular(2)),
              ),
              // Stock header
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item.symbol,
                              style: TextStyle(
                                  color: ext.textPrimary,
                                  fontSize: 16,
                                  fontWeight: FontWeight.w800)),
                          Text(item.company,
                              style: TextStyle(
                                  color: ext.textMuted, fontSize: 11),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis),
                        ],
                      ),
                    ),
                    if (item.ltp > 0)
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '₹${NumberFormat('#,##,##0.00').format(item.ltp)}',
                            style: TextStyle(
                                color: ext.textPrimary,
                                fontSize: 15,
                                fontWeight: FontWeight.w800),
                          ),
                          Text(
                            '${isPos ? '▲' : '▼'}${item.changePct.abs().toStringAsFixed(2)}%',
                            style: TextStyle(
                                color: priceColor,
                                fontSize: 12,
                                fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
              Divider(color: ext.border, height: 1),
              _ContextTile(
                icon: Icons.trending_up,
                iconColor: AppColors.green,
                title: 'Buy ${item.symbol}',
                subtitle: 'Regular order',
                onTap: () {
                  Navigator.pop(context);
                  _openOrder(context, item, mode);
                },
              ),
              _ContextTile(
                icon: Icons.trending_down,
                iconColor: AppColors.red,
                title: 'Sell ${item.symbol}',
                subtitle: 'Regular order',
                onTap: () {
                  Navigator.pop(context);
                  _openOrder(context, item, mode, sell: true);
                },
              ),
              _ContextTile(
                icon: Icons.open_in_full,
                iconColor: AppColors.blue,
                title: 'View Chart',
                subtitle: 'Full-screen Religare chart',
                onTap: () {
                  Navigator.pop(context);
                  StockDetailSheet.show(context, item);
                },
              ),
              _ContextTile(
                icon: Icons.notifications_outlined,
                iconColor: AppColors.amber,
                title: 'Set Price Alert',
                subtitle: 'Get notified at your target price',
                onTap: () {
                  Navigator.pop(context);
                  _showAlertDialog(context, item);
                },
              ),
              _ContextTile(
                icon: Icons.delete_outline,
                iconColor: AppColors.red,
                title: 'Remove from Watchlist',
                subtitle: 'Remove ${item.symbol}',
                onTap: () {
                  Navigator.pop(context);
                  final wlId = wl.active?.id;
                  if (wlId == null) return;
                  context.read<WatchlistProvider>().removeSymbol(wlId, item.id);
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: Text('${item.symbol} removed'),
                    backgroundColor: AppColors.red,
                    behavior: SnackBarBehavior.floating,
                  ));
                },
              ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  void _showAlertDialog(BuildContext context, WatchlistItem item) {
    final ext = context.appColors;
    final ctrl = TextEditingController(
        text: item.ltp > 0 ? item.ltp.toStringAsFixed(2) : '');
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: ext.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: ext.border)),
        title: Text('Set Alert — ${item.symbol}',
            style: context.isDark
                ? TextStyle(color: ext.textPrimary, fontWeight: FontWeight.w700)
                : GoogleFonts.lora(color: ext.textPrimary, fontWeight: FontWeight.w700)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Enter target price to receive an alert',
                style: TextStyle(color: ext.textMuted, fontSize: 13)),
            const SizedBox(height: 12),
            TextField(
              controller: ctrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              style: TextStyle(color: ext.textPrimary),
              decoration: InputDecoration(
                prefixText: '₹  ',
                prefixStyle: TextStyle(color: ext.textSecondary),
                hintText: '0.00',
                hintStyle: TextStyle(color: ext.textMuted),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel', style: TextStyle(color: ext.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () {
              Navigator.pop(context);
              ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                content: Text(
                    'Alert set for ${item.symbol} at ₹${ctrl.text}'),
                backgroundColor: AppColors.amber,
                behavior: SnackBarBehavior.floating,
              ));
              ctrl.dispose();
            },
            child: const Text('Set Alert'),
          ),
        ],
      ),
    );
  }

  // ── Watchlist picker (dropdown) ────────────────────────────────────────────
  void _showWatchlistPicker(BuildContext context, WatchlistProvider wl) {
    HapticFeedback.lightImpact();
    final ext = context.appColors;
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (sheetCtx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                  color: ext.border, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Row(
                children: [
                  Text('My Watchlists',
                      style: TextStyle(
                          color: ext.textPrimary,
                          fontSize: 16,
                          fontWeight: FontWeight.w700)),
                ],
              ),
            ),
            Divider(color: ext.border, height: 1),
            ...wl.watchlists.asMap().entries.map((e) {
              final idx  = e.key;
              final w    = e.value;
              final isActive = idx == wl.activeIndex;
              return ListTile(
                leading: Container(
                  width: 40, height: 40,
                  decoration: BoxDecoration(
                    color: isActive ? AppColors.blueDim : ext.card,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(Icons.bookmark_rounded,
                      color: isActive ? AppColors.blue : ext.textMuted,
                      size: 20),
                ),
                title: Text(w.name,
                    style: TextStyle(
                        color: ext.textPrimary,
                        fontWeight: isActive ? FontWeight.w700 : FontWeight.w500,
                        fontSize: 14)),
                subtitle: Text('${w.items.length} scrips',
                    style: TextStyle(color: ext.textMuted, fontSize: 11)),
                trailing: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    if (isActive)
                      Padding(
                        padding: const EdgeInsets.only(right: 4),
                        child: const Icon(Icons.check_rounded,
                            color: AppColors.blue, size: 20),
                      ),
                    IconButton(
                      icon: Icon(Icons.more_vert_rounded,
                          color: ext.textMuted, size: 22),
                      padding: const EdgeInsets.all(8),
                      constraints: const BoxConstraints(
                          minWidth: 40, minHeight: 40),
                      onPressed: () {
                        Navigator.pop(sheetCtx);
                        _showWatchlistOptions(context, wl, idx);
                      },
                    ),
                  ],
                ),
                onTap: () {
                  Navigator.pop(sheetCtx);
                  wl.setActive(idx);
                  if (_pageController.hasClients) {
                    _pageController.jumpToPage(idx);
                  }
                },
              );
            }),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                  color: AppColors.blueDim,
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.add_rounded,
                    color: AppColors.blue, size: 20),
              ),
              title: Text('New Watchlist',
                  style: TextStyle(
                      color: ext.textPrimary,
                      fontWeight: FontWeight.w600,
                      fontSize: 14)),
              subtitle: Text('Create another list',
                  style: TextStyle(color: ext.textMuted, fontSize: 11)),
              onTap: () {
                Navigator.pop(sheetCtx);
                _showCreateWatchlistDialog(context);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ── Add menu ───────────────────────────────────────────────────────────────
  void _showAddMenu(BuildContext context, WatchlistProvider wl) {
    final ext = context.appColors;
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                  color: ext.border, borderRadius: BorderRadius.circular(2)),
            ),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                    color: AppColors.blueDim,
                    borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.playlist_add, color: AppColors.blue, size: 22),
              ),
              title: Text('New Watchlist',
                  style: TextStyle(
                      color: ext.textPrimary, fontWeight: FontWeight.w600)),
              subtitle: Text('Create another watchlist',
                  style: TextStyle(color: ext.textMuted, fontSize: 12)),
              onTap: () {
                Navigator.pop(context);
                _showCreateWatchlistDialog(context);
              },
            ),
            ListTile(
              leading: Container(
                width: 40, height: 40,
                decoration: BoxDecoration(
                    color: AppColors.greenDim,
                    borderRadius: BorderRadius.circular(10)),
                child: const Icon(Icons.add_circle_outline,
                    color: AppColors.green, size: 22),
              ),
              title: Text('Add Symbol',
                  style: TextStyle(
                      color: ext.textPrimary, fontWeight: FontWeight.w600)),
              subtitle: Text(
                  wl.active != null
                      ? 'Add to "${wl.active!.name}"'
                      : 'Create a watchlist first',
                  style: TextStyle(color: ext.textMuted, fontSize: 12)),
              enabled: wl.active != null,
              onTap: wl.active == null
                  ? null
                  : () {
                      Navigator.pop(context);
                      _showAddSymbolSheet(context, wl.active!.id);
                    },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  // ── Watchlist tab long-press options ───────────────────────────────────────
  void _showWatchlistOptions(
      BuildContext context, WatchlistProvider wl, int idx) {
    HapticFeedback.lightImpact();
    final ext = context.appColors;
    final watchlist = wl.watchlists[idx];
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4,
              margin: const EdgeInsets.symmetric(vertical: 12),
              decoration: BoxDecoration(
                  color: ext.border, borderRadius: BorderRadius.circular(2)),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(20, 0, 20, 12),
              child: Text(watchlist.name,
                  style: TextStyle(
                      color: ext.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w700)),
            ),
            Divider(color: ext.border, height: 1),
            _ContextTile(
              icon: Icons.add_circle_outline,
              iconColor: AppColors.green,
              title: 'Add Symbol',
              subtitle: 'Add stocks, indices to this list',
              onTap: () {
                Navigator.pop(context);
                _showAddSymbolSheet(context, watchlist.id);
              },
            ),
            _ContextTile(
              icon: Icons.edit_outlined,
              iconColor: AppColors.blue,
              title: 'Rename Watchlist',
              subtitle: 'Change the name of this list',
              onTap: () {
                Navigator.pop(context);
                _showRenameDialog(context, wl, watchlist);
              },
            ),
            _ContextTile(
              icon: Icons.delete_outline,
              iconColor: AppColors.red,
              title: 'Delete Watchlist',
              subtitle: 'Remove "${watchlist.name}" and all its symbols',
              onTap: () {
                Navigator.pop(context);
                _confirmDeleteWatchlist(context, wl, watchlist);
              },
            ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showRenameDialog(
      BuildContext context, WatchlistProvider wl, Watchlist watchlist) {
    final ext = context.appColors;
    final ctrl = TextEditingController(text: watchlist.name);
    showDialog(
      context: context,
      builder: (dlgCtx) => AlertDialog(
        backgroundColor: ext.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: ext.border)),
        title: Text('Rename Watchlist',
            style: dlgCtx.isDark
                ? TextStyle(
                    color: ext.textPrimary, fontWeight: FontWeight.w700)
                : GoogleFonts.lora(
                    color: ext.textPrimary, fontWeight: FontWeight.w700)),
        content: TextField(
          controller: ctrl,
          autofocus: true,
          style: TextStyle(color: ext.textPrimary),
          decoration: InputDecoration(
            hintText: 'Watchlist name',
            hintStyle: TextStyle(color: ext.textMuted),
            enabledBorder: UnderlineInputBorder(
                borderSide: BorderSide(color: ext.border)),
            focusedBorder: const UnderlineInputBorder(
                borderSide: BorderSide(color: AppColors.blue)),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dlgCtx),
            child: Text('Cancel', style: TextStyle(color: ext.textSecondary)),
          ),
          ElevatedButton(
            onPressed: () async {
              final err = await wl.renameWatchlist(watchlist.id, ctrl.text);
              if (dlgCtx.mounted) Navigator.pop(dlgCtx);
              if (err != null && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text(err),
                  backgroundColor: AppColors.red,
                  behavior: SnackBarBehavior.floating,
                ));
              }
            },
            child: const Text('Rename'),
          ),
        ],
      ),
    );
  }

  void _confirmDeleteWatchlist(
      BuildContext context, WatchlistProvider wl, Watchlist watchlist) {
    final ext = context.appColors;
    showDialog(
      context: context,
      builder: (dlgCtx) => AlertDialog(
        backgroundColor: ext.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: ext.border)),
        title: Text('Delete Watchlist',
            style: dlgCtx.isDark
                ? TextStyle(
                    color: ext.textPrimary, fontWeight: FontWeight.w700)
                : GoogleFonts.lora(
                    color: ext.textPrimary, fontWeight: FontWeight.w700)),
        content: Text(
          'Delete "${watchlist.name}" and all its ${watchlist.items.length} symbols? This cannot be undone.',
          style: TextStyle(color: ext.textSecondary, fontSize: 14),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dlgCtx),
            child: Text('Cancel', style: TextStyle(color: ext.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
            onPressed: () async {
              Navigator.pop(dlgCtx);
              final name = watchlist.name;
              await wl.deleteWatchlist(watchlist.id);
              if (context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                  content: Text('"$name" deleted'),
                  backgroundColor: AppColors.red,
                  behavior: SnackBarBehavior.floating,
                ));
              }
            },
            child: const Text('Delete',
                style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  void _showCreateWatchlistDialog(BuildContext context) {
    showDialog(context: context, builder: (_) => const _CreateWatchlistDialog());
  }

  void _showAddSymbolSheet(BuildContext context, String watchlistId) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddSymbolSheet(watchlistId: watchlistId),
    );
  }
}

// ── Pinned Indices Bar ─────────────────────────────────────────────────────────
class _PinnedIndicesBar extends StatefulWidget {
  const _PinnedIndicesBar();

  @override
  State<_PinnedIndicesBar> createState() => _PinnedIndicesBarState();
}

class _PinnedIndicesBarState extends State<_PinnedIndicesBar> {
  static const _prefsKey = 'pinned_indices_v1';
  static const _displayNames = {
    'NIFTY 50':    'NIFTY 50',
    'BANKNIFTY':   'BANK NIFTY',
    'SENSEX':      'SENSEX',
    'BANKEX':      'BANKEX',
    'FINNIFTY':    'FIN NIFTY',
    'MIDCPNIFTY':  'MID NIFTY',
  };

  List<String> _pinned = ['NIFTY 50', 'SENSEX'];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    final saved = prefs.getStringList(_prefsKey);
    if (saved != null && saved.isNotEmpty) {
      if (mounted) setState(() => _pinned = saved);
    }
  }

  Future<void> _save(List<String> list) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(_prefsKey, list);
  }

  IndexPrice? _findPrice(List<IndexPrice> indices, String symbol) {
    try {
      return indices.firstWhere(
          (i) => i.symbol.toUpperCase() == symbol.toUpperCase());
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext     = context.appColors;
    final indices = context.watch<MarketProvider>().indices;

    return Container(
      height: 58,
      decoration: BoxDecoration(
        color: ext.surface,
        border: Border(bottom: BorderSide(color: ext.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: List.generate(_pinned.length, (i) {
                final sym   = _pinned[i];
                final price = _findPrice(indices, sym);
                final isPos = price?.isPositive ?? true;
                final color = isPos ? AppColors.green : AppColors.red;
                final name  = _displayNames[sym] ?? sym;
                final fmt   = NumberFormat('#,##,##0.##');

                return Expanded(
                  child: Container(
                    decoration: i < _pinned.length - 1
                        ? BoxDecoration(
                            border: Border(
                                right: BorderSide(color: ext.border)))
                        : null,
                    padding: const EdgeInsets.symmetric(horizontal: 14),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(name,
                            style: TextStyle(
                                color: ext.textMuted,
                                fontSize: 10.5,
                                fontWeight: FontWeight.w600,
                                letterSpacing: 0.2)),
                        const SizedBox(height: 2),
                        Row(
                          children: [
                            Text(
                              price != null && price.ltp > 0
                                  ? fmt.format(price.ltp)
                                  : '—',
                              style: TextStyle(
                                  color: ext.textPrimary,
                                  fontSize: 14.0,
                                  fontWeight: FontWeight.w800),
                            ),
                            if (price != null && price.ltp > 0) ...[
                              const SizedBox(width: 5),
                              Text(
                                '${isPos ? '+' : ''}${price.changePct.toStringAsFixed(2)}%',
                                style: TextStyle(
                                    color: color,
                                    fontSize: 11.5,
                                    fontWeight: FontWeight.w600),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              }),
            ),
          ),
          // Edit button
          GestureDetector(
            onTap: _showEditSheet,
            child: Container(
              width: 44,
              decoration: BoxDecoration(
                border: Border(left: BorderSide(color: ext.border)),
              ),
              alignment: Alignment.center,
              child: Icon(Icons.tune_rounded, color: ext.textMuted, size: 18),
            ),
          ),
        ],
      ),
    );
  }

  void _showEditSheet() {
    final ext = context.appColors;
    final tempPinned = List<String>.from(_pinned);
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => StatefulBuilder(
        builder: (ctx, setS) => SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 40, height: 4,
                margin: const EdgeInsets.symmetric(vertical: 12),
                decoration: BoxDecoration(
                    color: ext.border, borderRadius: BorderRadius.circular(2)),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 4),
                child: Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Pinned Indices',
                            style: TextStyle(
                                color: ext.textPrimary,
                                fontSize: 16,
                                fontWeight: FontWeight.w700)),
                        Text('Choose exactly 2',
                            style: TextStyle(
                                color: ext.textMuted, fontSize: 11)),
                      ],
                    ),
                    const Spacer(),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.blue,
                          padding: const EdgeInsets.symmetric(
                              horizontal: 18, vertical: 8)),
                      onPressed: tempPinned.length == 2
                          ? () {
                              Navigator.pop(ctx);
                              setState(() => _pinned = List.from(tempPinned));
                              _save(tempPinned);
                            }
                          : null,
                      child: const Text('Done',
                          style: TextStyle(
                              color: Colors.white, fontWeight: FontWeight.w700)),
                    ),
                  ],
                ),
              ),
              Divider(color: ext.border, height: 1),
              ..._displayNames.entries.map((e) {
                final sym  = e.key;
                final name = e.value;
                final sel  = tempPinned.contains(sym);
                return CheckboxListTile(
                  value: sel,
                  activeColor: AppColors.blue,
                  checkColor: Colors.white,
                  // Disable unchecked items when 2 are already selected
                  // (can only deselect, not add a 3rd)
                  enabled: sel || tempPinned.length < 2,
                  title: Text(name,
                      style: TextStyle(
                          color: (sel || tempPinned.length < 2)
                              ? ext.textPrimary
                              : ext.textMuted,
                          fontWeight: FontWeight.w600,
                          fontSize: 14)),
                  subtitle: Text(sym,
                      style: TextStyle(color: ext.textMuted, fontSize: 11)),
                  onChanged: (val) => setS(() {
                    if (val == true && tempPinned.length < 2) {
                      tempPinned.add(sym);
                    } else if (val == false) {
                      tempPinned.remove(sym);
                    }
                  }),
                );
              }),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}


// ── Filter + Sort + Column bar ─────────────────────────────────────────────────
class _FilterSortBar extends StatelessWidget {
  final _Filter filter;
  final _SortBy sortBy;
  final bool sortAsc;
  final _DisplayCol displayCol;
  final int itemCount;
  final void Function(_Filter) onFilterChange;
  final void Function(_SortBy) onSort;
  final VoidCallback onColToggle;
  final void Function(int) onWatchlistSelect;

  const _FilterSortBar({
    required this.filter,
    required this.sortBy,
    required this.sortAsc,
    required this.displayCol,
    required this.itemCount,
    required this.onFilterChange,
    required this.onSort,
    required this.onColToggle,
    required this.onWatchlistSelect,
  });

  String get _colLabel {
    switch (displayCol) {
      case _DisplayCol.ltp:      return 'LTP';
      case _DisplayCol.change:   return 'Chg ₹';
      case _DisplayCol.volume:   return 'Vol';
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final wl = context.watch<WatchlistProvider>();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: ext.surface,
        border: Border(bottom: BorderSide(color: ext.border)),
      ),
      child: Row(
        children: [
          Expanded(
            child: SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: wl.watchlists.asMap().entries.map((e) {
                  final idx = e.key;
                  final w = e.value;
                  final selected = idx == wl.activeIndex;
                  return Padding(
                    padding: const EdgeInsets.only(right: 6),
                    child: _FChip(
                      label: w.name,
                      selected: selected,
                      onTap: () => onWatchlistSelect(idx),
                    ),
                  );
                }).toList(),
              ),
            ),
          ),
          const SizedBox(width: 8),

          // Sort
          _SortBtn(
            label: '%',
            active: sortBy == _SortBy.changePct,
            asc: sortAsc,
            onTap: () => onSort(_SortBy.changePct),
          ),
          const SizedBox(width: 4),
          _SortBtn(
            label: 'Vol',
            active: sortBy == _SortBy.volume,
            asc: sortAsc,
            onTap: () => onSort(_SortBy.volume),
          ),
          const SizedBox(width: 6),

          // Column toggle
          GestureDetector(
            onTap: onColToggle,
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: AppColors.blueDim,
                borderRadius: BorderRadius.circular(6),
                border: Border.all(color: AppColors.blue.withValues(alpha: 0.4)),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(_colLabel,
                      style: const TextStyle(
                          color: AppColors.blue,
                          fontSize: 11,
                          fontWeight: FontWeight.w700)),
                  const SizedBox(width: 3),
                  const Icon(Icons.swap_horiz, color: AppColors.blue, size: 12),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _FChip extends StatelessWidget {
  final String label;
  final bool selected;
  final Color color;
  final VoidCallback onTap;

  const _FChip({
    required this.label,
    required this.selected,
    this.color = AppColors.blue,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 150),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: selected
              ? color.withValues(alpha: 0.18)
              : ext.card,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
              color: selected ? color.withValues(alpha: 0.5) : ext.border),
        ),
        child: Text(
          label,
          style: TextStyle(
            color: selected ? color : ext.textSecondary,
            fontSize: 11,
            fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
          ),
        ),
      ),
    );
  }
}

class _SortBtn extends StatelessWidget {
  final String label;
  final bool active;
  final bool asc;
  final VoidCallback onTap;

  const _SortBtn(
      {required this.label,
      required this.active,
      required this.asc,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        decoration: BoxDecoration(
          color: active ? AppColors.blueDim : ext.card,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(
              color: active
                  ? AppColors.blue.withValues(alpha: 0.4)
                  : ext.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(label,
                style: TextStyle(
                    color: active ? AppColors.blue : ext.textSecondary,
                    fontSize: 11,
                    fontWeight: active ? FontWeight.w700 : FontWeight.w500)),
            if (active) ...[
              const SizedBox(width: 2),
              Icon(
                asc ? Icons.arrow_upward : Icons.arrow_downward,
                color: AppColors.blue,
                size: 10,
              ),
            ] else ...[
              const SizedBox(width: 2),
              Icon(Icons.unfold_more, color: ext.textMuted, size: 10),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Swipeable row (Dismissible BUY / DELETE) ───────────────────────────────────
class _SwipeableRow extends StatelessWidget {
  final WatchlistItem item;
  final _DisplayCol displayCol;
  final VoidCallback onTap;
  final VoidCallback onBuy;
  final VoidCallback onSell;
  final VoidCallback onDelete;
  final VoidCallback onLongPress;

  const _SwipeableRow({
    super.key,
    required this.item,
    required this.displayCol,
    required this.onTap,
    required this.onBuy,
    required this.onSell,
    required this.onDelete,
    required this.onLongPress,
  });

  @override
  Widget build(BuildContext context) {
    return Dismissible(
      key: key!,
      // Swipe right → BUY
      background: Container(
        color: AppColors.green,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        alignment: Alignment.centerLeft,
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.bolt, color: Colors.white, size: 26),
            SizedBox(height: 2),
            Text('BUY',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 1)),
          ],
        ),
      ),
      // Swipe left → DELETE
      secondaryBackground: Container(
        color: AppColors.red,
        padding: const EdgeInsets.symmetric(horizontal: 20),
        alignment: Alignment.centerRight,
        child: const Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.delete_outline, color: Colors.white, size: 24),
            SizedBox(height: 2),
            Text('REMOVE',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 10,
                    fontWeight: FontWeight.w800,
                    letterSpacing: 0.5)),
          ],
        ),
      ),
      confirmDismiss: (direction) async {
        if (direction == DismissDirection.startToEnd) {
          onBuy();
          return false;
        }
        // DELETE — confirm
        onDelete();
        return false;
      },
      child: GestureDetector(
        onLongPress: onLongPress,
        child: _WatchlistItemTile(
          item: item,
          displayCol: displayCol,
          onTap: onTap,
          onBuy: onBuy,
        ),
      ),
    );
  }
}

// ── Watchlist item row ─────────────────────────────────────────────────────────
class _WatchlistItemTile extends StatelessWidget {
  final WatchlistItem item;
  final _DisplayCol displayCol;
  final VoidCallback onTap;
  final VoidCallback onBuy;

  const _WatchlistItemTile({
    required this.item,
    required this.displayCol,
    required this.onTap,
    required this.onBuy,
  });

  @override
  Widget build(BuildContext context) {
    final ext    = context.appColors;
    final isPos  = item.changePct >= 0;
    // Dark green and Dark red colors as requested
    final color  = isPos ? const Color(0xFF168A43) : const Color(0xFFC62828);

    // Format current date & time like "18 Jun 18:51:00"
    final timeStr = DateFormat('dd MMM HH:mm:ss').format(DateTime.now());

    return InkWell(
      onTap: onTap,
      splashColor: AppColors.blue.withValues(alpha: 0.06),
      highlightColor: AppColors.blue.withValues(alpha: 0.04),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Left Column: Symbol + Exchange + Time
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    item.symbol,
                    style: TextStyle(
                      color: ext.textPrimary,
                      fontSize: 15.5,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    '${item.exchange}  $timeStr',
                    style: TextStyle(
                      color: ext.textMuted,
                      fontSize: 12,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
            ),

            // Right Column: LTP / Value + Change
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                if (displayCol == _DisplayCol.ltp) ...[
                  Text(
                    item.ltp > 0
                        ? NumberFormat('#,##,##0.00').format(item.ltp)
                        : '—',
                    style: TextStyle(
                        color: item.ltp > 0 ? ext.textPrimary : ext.textMuted,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 6),
                  if (item.ltp > 0)
                    Text(
                      '${isPos ? '+' : ''}${item.change.toStringAsFixed(2)} (${isPos ? '+' : ''}${item.changePct.toStringAsFixed(2)}%)',
                      style: TextStyle(
                          color: color,
                          fontSize: 12,
                          fontWeight: FontWeight.w600),
                    ),
                ] else if (displayCol == _DisplayCol.change) ...[
                  Text(
                    item.ltp > 0
                        ? '${isPos ? '+' : ''}${item.change.toStringAsFixed(2)}'
                        : '—',
                    style: TextStyle(
                        color: item.ltp > 0 ? color : ext.textMuted,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 6),
                  if (item.ltp > 0)
                    Text(
                      '${isPos ? '+' : ''}${item.changePct.toStringAsFixed(2)}%',
                      style: TextStyle(
                          color: color,
                          fontSize: 12,
                          fontWeight: FontWeight.w600),
                    ),
                ] else ...[
                  // Volume
                  Text(
                    item.volume > 0
                        ? _fmtVol(item.volume)
                        : '—',
                    style: TextStyle(
                        color: item.volume > 0 ? ext.textPrimary : ext.textMuted,
                        fontSize: 15.5,
                        fontWeight: FontWeight.w700),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Volume',
                    style: TextStyle(color: ext.textMuted, fontSize: 12),
                  ),
                ],
              ],
            ),
          ],
        ),
      ),
    );
  }

  String _fmtVol(int v) {
    if (v >= 10000000) return '${(v / 10000000).toStringAsFixed(1)}Cr';
    if (v >= 100000)   return '${(v / 100000).toStringAsFixed(1)}L';
    if (v >= 1000)     return '${(v / 1000).toStringAsFixed(1)}K';
    return '$v';
  }
}


// ── Context menu tile ──────────────────────────────────────────────────────────
class _ContextTile extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  const _ContextTile({
    required this.icon,
    required this.iconColor,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return ListTile(
      leading: Container(
        width: 38, height: 38,
        decoration: BoxDecoration(
          color: iconColor.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: iconColor, size: 20),
      ),
      title: Text(title,
          style: TextStyle(
              color: ext.textPrimary,
              fontSize: 14,
              fontWeight: FontWeight.w600)),
      subtitle: Text(subtitle,
          style: TextStyle(color: ext.textMuted, fontSize: 11)),
      onTap: onTap,
    );
  }
}

// ── Error banner ───────────────────────────────────────────────────────────────
class _ErrorBanner extends StatelessWidget {
  final String message;
  final VoidCallback onRetry;
  const _ErrorBanner({required this.message, required this.onRetry});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: AppColors.redDim,
      child: Row(
        children: [
          const Icon(Icons.error_outline, color: AppColors.red, size: 16),
          const SizedBox(width: 8),
          Expanded(
              child: Text(message,
                  style: const TextStyle(color: AppColors.red, fontSize: 12))),
          TextButton(
            onPressed: onRetry,
            child: const Text('Retry',
                style: TextStyle(color: AppColors.red, fontSize: 12)),
          ),
        ],
      ),
    );
  }
}

// ── Empty state ────────────────────────────────────────────────────────────────
class _EmptyWatchlist extends StatelessWidget {
  final String message;
  final String subMessage;
  final VoidCallback? onRetry;
  final VoidCallback? onCreate;

  const _EmptyWatchlist({
    this.message = 'No watchlists found',
    this.subMessage = 'Pull to refresh',
    this.onRetry,
    this.onCreate,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 80, height: 80,
              decoration: BoxDecoration(
                color: AppColors.blueDim.withValues(alpha: 0.5),
                shape: BoxShape.circle,
              ),
              child:
                  const Icon(Icons.bookmark_border, size: 40, color: AppColors.blue),
            ),
            const SizedBox(height: 20),
            Text(message,
                style: TextStyle(
                    color: ext.textSecondary,
                    fontSize: 16,
                    fontWeight: FontWeight.w700),
                textAlign: TextAlign.center),
            const SizedBox(height: 8),
            Text(subMessage,
                style: TextStyle(color: ext.textMuted, fontSize: 13),
                textAlign: TextAlign.center),
            const SizedBox(height: 24),
            if (onCreate != null)
              ElevatedButton.icon(
                onPressed: onCreate,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Create Watchlist'),
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.blue,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 24, vertical: 12)),
              ),
            if (onRetry != null) ...[
              const SizedBox(height: 10),
              OutlinedButton.icon(
                onPressed: onRetry,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Retry'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ── Create Watchlist dialog ────────────────────────────────────────────────────
class _CreateWatchlistDialog extends StatefulWidget {
  const _CreateWatchlistDialog();

  @override
  State<_CreateWatchlistDialog> createState() =>
      _CreateWatchlistDialogState();
}

class _CreateWatchlistDialogState extends State<_CreateWatchlistDialog> {
  final _ctrl = TextEditingController();
  bool _loading = false;

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  Future<void> _create() async {
    final name = _ctrl.text.trim();
    if (name.isEmpty) return;
    setState(() => _loading = true);
    final err =
        await context.read<WatchlistProvider>().createWatchlist(name);
    if (!mounted) return;
    setState(() => _loading = false);
    if (err == null) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('"$name" created'),
        backgroundColor: AppColors.green,
        behavior: SnackBarBehavior.floating,
      ));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('Failed: $err'),
        backgroundColor: AppColors.red,
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return AlertDialog(
      backgroundColor: ext.surface,
      shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: ext.border)),
      title: Text('New Watchlist',
          style: TextStyle(
              color: ext.textPrimary, fontWeight: FontWeight.w700)),
      content: TextField(
        controller: _ctrl,
        autofocus: true,
        style: TextStyle(color: ext.textPrimary),
        decoration: InputDecoration(
          hintText: 'e.g. My Stocks, F&O, Indices',
          hintStyle: TextStyle(color: ext.textMuted),
        ),
        onSubmitted: (_) => _create(),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.pop(context),
          child: Text('Cancel', style: TextStyle(color: ext.textSecondary)),
        ),
        ElevatedButton(
          onPressed: _loading ? null : _create,
          child: _loading
              ? const SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: Colors.white))
              : const Text('Create'),
        ),
      ],
    );
  }
}

// ── Add Symbol — full-height bottom sheet ──────────────────────────────────────
class _AddSymbolSheet extends StatefulWidget {
  final String watchlistId;
  const _AddSymbolSheet({required this.watchlistId});

  @override
  State<_AddSymbolSheet> createState() => _AddSymbolSheetState();
}

class _AddSymbolSheetState extends State<_AddSymbolSheet> {
  final _ctrl = TextEditingController();
  List<Map<String, dynamic>> _filtered = List.from(_kPopularStocks);
  bool _searching = false;
  bool _adding = false;
  String _query = '';
  String _selectedCategory = 'All';

  static const _categories = [
    'All', 'Indices', 'Banking', 'IT', 'Auto', 'Pharma', 'Energy',
  ];

  static const _categoryMap = {
    'Indices':  ['NIFTY 50', 'BANKNIFTY', 'SENSEX', 'BANKEX', 'FINNIFTY', 'MIDCPNIFTY'],
    'Banking':  ['HDFCBANK', 'ICICIBANK', 'SBIN', 'KOTAKBANK', 'AXISBANK', 'INDUSINDBK'],
    'IT':       ['TCS', 'INFY', 'WIPRO', 'HCLTECH', 'TECHM'],
    'Auto':     ['MARUTI', 'TATAMOTORS', 'BAJAJ-AUTO', 'HEROMOTOCO', 'EICHERMOT', 'M&M'],
    'Pharma':   ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'APOLLOHOSP'],
    'Energy':   ['ONGC', 'BPCL', 'POWERGRID', 'NTPC', 'COALINDIA'],
  };

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _onQueryChanged(String q) {
    _query = q.trim().toUpperCase();
    final local = _query.isEmpty
        ? _categoryFiltered
        : _kPopularStocks.where((s) {
            final sym  = (s['symbol'] as String).toUpperCase();
            final name = (s['name']   as String).toUpperCase();
            return sym.contains(_query) || name.contains(_query);
          }).toList();
    setState(() {
      _filtered = local;
      _searching = _query.isNotEmpty;
    });
    if (_query.length >= 2) _apiSearch(_query);
  }

  List<Map<String, dynamic>> get _categoryFiltered {
    if (_selectedCategory == 'All') return List.from(_kPopularStocks);
    final symbols = _categoryMap[_selectedCategory] ?? [];
    return _kPopularStocks
        .where((s) => symbols.contains(s['symbol']))
        .toList();
  }

  Future<void> _apiSearch(String q) async {
    try {
      final res = await ApiService.instance.search(q);
      if (!mounted || _query != q) return;
      final raw =
          (res['results'] ?? res['data'] ?? res['items'] ?? []) as List<dynamic>;
      final apiItems = raw.cast<Map<String, dynamic>>().map((e) {
            final ltpRaw = e['ltp'];
            final pctRaw = e['change_pct'];
            return {
              'symbol':          e['symbol']?.toString()  ?? '',
              'exchange':        (e['exchange'] ?? e['exch_seg'])?.toString() ?? 'NSE',
              'name':            e['name']?.toString() ?? e['company']?.toString() ?? '',
              'token':           e['token']?.toString() ?? '',
              'instrument_type': (e['instrument_type'] ?? e['instrumenttype'])?.toString() ?? 'EQ',
              'ltp':             ltpRaw is num ? ltpRaw.toDouble() : null,
              'change_pct':      pctRaw is num ? pctRaw.toDouble() : null,
            };
          }).where((e) => (e['symbol'] as String).isNotEmpty).toList();
      final apiSymbols = apiItems.map((e) => e['symbol'] as String).toSet();
      final merged = [
        ...apiItems,
        ..._filtered.where((e) => !apiSymbols.contains(e['symbol'])),
      ];
      if (mounted) setState(() { _filtered = merged; _searching = false; });
    } catch (_) {
      if (mounted) setState(() => _searching = false);
    }
  }

  Future<void> _addStock(Map<String, dynamic> stock) async {
    final sym   = stock['symbol']          as String;
    final exch  = stock['exchange']        as String;
    final name  = stock['name']            as String;
    final token = stock['token']?.toString() ?? '';
    final itype = stock['instrument_type']?.toString() ?? 'EQ';
    setState(() => _adding = true);
    final err = await context
        .read<WatchlistProvider>()
        .addSymbol(widget.watchlistId, sym, exch, name,
            token: token, instrumentType: itype);
    if (!mounted) return;
    setState(() => _adding = false);
    if (err == null) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text('$sym added to watchlist'),
        backgroundColor: AppColors.green,
        behavior: SnackBarBehavior.floating,
      ));
    } else {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(err),
        backgroundColor: AppColors.red,
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  Future<void> _addManualEntry() async {
    if (_query.isEmpty) return;
    await _addStock({'symbol': _query, 'exchange': 'NSE', 'name': _query});
  }

  @override
  Widget build(BuildContext context) {
    final ext    = context.appColors;
    final height = MediaQuery.of(context).size.height * 0.9;

    return Container(
      height: height,
      decoration: BoxDecoration(
        color: ext.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          // Handle
          Container(
            width: 40, height: 4,
            margin: const EdgeInsets.only(top: 10, bottom: 8),
            decoration: BoxDecoration(
                color: ext.border, borderRadius: BorderRadius.circular(2)),
          ),
          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(
              children: [
                Text('Add to Watchlist',
                    style: TextStyle(
                        color: ext.textPrimary,
                        fontSize: 17,
                        fontWeight: FontWeight.w800)),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: Icon(Icons.close, color: ext.textSecondary, size: 22),
                ),
              ],
            ),
          ),
          // Search field
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              controller: _ctrl,
              autofocus: true,
              style: TextStyle(color: ext.textPrimary),
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                hintText: 'Search symbol or company…',
                hintStyle: TextStyle(color: ext.textMuted, fontSize: 14),
                prefixIcon: Icon(Icons.search, color: ext.textMuted, size: 20),
                suffixIcon: _searching
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: AppColors.blue),
                        ),
                      )
                    : _query.isNotEmpty
                        ? IconButton(
                            icon: Icon(Icons.close, size: 18, color: ext.textMuted),
                            onPressed: () {
                              _ctrl.clear();
                              _onQueryChanged('');
                            })
                        : null,
                filled: true,
                fillColor: ext.card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: ext.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: ext.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.blue),
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
              onChanged: _onQueryChanged,
            ),
          ),
          // Category chips (only when not searching)
          if (_query.isEmpty)
            SizedBox(
              height: 36,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                padding: const EdgeInsets.symmetric(horizontal: 12),
                separatorBuilder: (_, __) => const SizedBox(width: 6),
                itemCount: _categories.length,
                itemBuilder: (_, i) {
                  final cat = _categories[i];
                  final selected = _selectedCategory == cat;
                  return GestureDetector(
                    onTap: () => setState(() {
                      _selectedCategory = cat;
                      _filtered = _categoryFiltered;
                    }),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: selected
                            ? AppColors.blue
                            : ext.card,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: selected ? AppColors.blue : ext.border,
                        ),
                      ),
                      child: Text(cat,
                          style: TextStyle(
                              color: selected
                                  ? Colors.white
                                  : ext.textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w600)),
                    ),
                  );
                },
              ),
            ),
          const SizedBox(height: 8),
          Divider(color: ext.border, height: 1),
          // Section label
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
            child: Row(
              children: [
                Text(
                  _query.isEmpty ? _selectedCategory : 'Search results',
                  style: TextStyle(
                      color: ext.textMuted,
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.5),
                ),
                if (_query.isEmpty && _filtered.isNotEmpty) ...[
                  const SizedBox(width: 6),
                  Text('(${_filtered.length})',
                      style: TextStyle(color: ext.textMuted, fontSize: 11)),
                ],
              ],
            ),
          ),
          // "Add NSE:QUERY directly" when unknown symbol
          if (_query.isNotEmpty && _filtered.isEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 4, 12, 8),
              child: GestureDetector(
                onTap: _adding ? null : _addManualEntry,
                child: Container(
                  width: double.infinity,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.blueDim,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: AppColors.blue.withValues(alpha: 0.4)),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.add_circle_outline,
                          color: AppColors.blue, size: 20),
                      const SizedBox(width: 10),
                      Text('Add "$_query" to NSE',
                          style: const TextStyle(
                              color: AppColors.blue,
                              fontWeight: FontWeight.w700,
                              fontSize: 13)),
                    ],
                  ),
                ),
              ),
            ),
          // Results list
          Expanded(
            child: _filtered.isEmpty && _query.isNotEmpty
                ? Center(
                    child: Text('No results for "$_query"',
                        style: TextStyle(color: ext.textMuted, fontSize: 13)),
                  )
                : ListView.separated(
                    padding: EdgeInsets.zero,
                    itemCount: _filtered.length,
                    separatorBuilder: (_, __) =>
                        Divider(indent: 68, color: ext.border, height: 1),
                    itemBuilder: (_, i) {
                      final s      = _filtered[i];
                      final sym    = s['symbol']  as String;
                      final name   = s['name']    as String;
                      final exch   = s['exchange'] as String;
                      final ltp    = s['ltp'] as double?;
                      final pct    = s['change_pct'] as double?;
                      final hasLtp = ltp != null && ltp > 0;
                      final pctColor = pct == null
                          ? ext.textMuted
                          : pct >= 0 ? AppColors.green : AppColors.red;
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 4),
                        title: Text(sym,
                            style: TextStyle(
                                color: ext.textPrimary,
                                fontSize: 14,
                                fontWeight: FontWeight.w700)),
                        subtitle: Text(
                          '$name  ·  $exch',
                          style:
                              TextStyle(color: ext.textMuted, fontSize: 11.5),
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (hasLtp) ...[
                              Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    '₹${ltp!.toStringAsFixed(2)}',
                                    style: TextStyle(
                                        color: ext.textPrimary,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600),
                                  ),
                                  if (pct != null)
                                    Text(
                                      '${pct >= 0 ? '+' : ''}${pct.toStringAsFixed(2)}%',
                                      style: TextStyle(
                                          color: pctColor, fontSize: 11),
                                    ),
                                ],
                              ),
                              const SizedBox(width: 8),
                            ],
                            _adding
                                ? const SizedBox(
                                    width: 22, height: 22,
                                    child: CircularProgressIndicator(
                                        strokeWidth: 2, color: AppColors.blue))
                                : Container(
                                    width: 32, height: 32,
                                    decoration: BoxDecoration(
                                      color: AppColors.greenDim,
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(Icons.add,
                                        color: AppColors.green, size: 20),
                                  ),
                          ],
                        ),
                        onTap: _adding ? null : () => _addStock(s),
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Global Symbol Search Sheet ─────────────────────────────────────────────────
class SymbolSearchSheet extends StatefulWidget {
  const SymbolSearchSheet({super.key});

  static Future<void> show(BuildContext context) =>
      showModalBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        backgroundColor: Colors.transparent,
        builder: (_) => const SymbolSearchSheet(),
      );

  @override
  State<SymbolSearchSheet> createState() => _SymbolSearchSheetState();
}

class _SymbolSearchSheetState extends State<SymbolSearchSheet> {
  final _ctrl = TextEditingController();
  List<Map<String, dynamic>> _results = List.from(_kPopularStocks);
  bool _apiLoading = false;
  String _query = '';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _onChanged(String q) {
    _query = q.trim().toUpperCase();
    final local = _query.isEmpty
        ? List<Map<String, dynamic>>.from(_kPopularStocks)
        : _kPopularStocks.where((s) {
            final sym  = (s['symbol'] as String).toUpperCase();
            final name = (s['name']   as String).toUpperCase();
            return sym.contains(_query) || name.contains(_query);
          }).toList();
    setState(() { _results = local; _apiLoading = _query.length >= 2; });
    if (_query.length >= 2) _apiSearch(_query);
  }

  Future<void> _apiSearch(String q) async {
    try {
      final res = await ApiService.instance.search(q);
      if (!mounted || _query != q) return;
      final raw = (res['results'] ?? res['data'] ?? res['items'] ?? []) as List<dynamic>;
      final apiItems = raw.cast<Map<String, dynamic>>().map((e) {
            final ltpRaw = e['ltp'];
            final pctRaw = e['change_pct'];
            return {
              'symbol':          e['symbol']?.toString()  ?? '',
              'exchange':        (e['exchange'] ?? e['exch_seg'])?.toString() ?? 'NSE',
              'name':            e['name']?.toString() ?? e['company']?.toString() ?? '',
              'token':           e['token']?.toString() ?? '',
              'instrument_type': (e['instrument_type'] ?? e['instrumenttype'])?.toString() ?? 'EQ',
              'ltp':             ltpRaw is num ? ltpRaw.toDouble() : null,
              'change_pct':      pctRaw is num ? pctRaw.toDouble() : null,
            };
          }).where((e) => (e['symbol'] as String).isNotEmpty).toList();
      final apiSyms = apiItems.map((e) => e['symbol'] as String).toSet();
      final merged = [
        ...apiItems,
        ..._results.where((e) => !apiSyms.contains(e['symbol'])),
      ];
      if (mounted) setState(() { _results = merged; _apiLoading = false; });
    } catch (_) {
      if (mounted) setState(() => _apiLoading = false);
    }
  }

  Future<void> _addToWatchlist(
      BuildContext ctx, WatchlistProvider wl, Map<String, dynamic> s) async {
    final wlId  = wl.active?.id;
    if (wlId == null) return;
    final sym   = s['symbol']            as String;
    final exch  = s['exchange']          as String;
    final name  = s['name']              as String;
    final token = s['token']?.toString() ?? '';
    final itype = s['instrument_type']?.toString() ?? 'EQ';
    final err = await wl.addSymbol(wlId, sym, exch, name,
        token: token, instrumentType: itype);
    if (ctx.mounted) {
      ScaffoldMessenger.of(ctx).showSnackBar(SnackBar(
        content: Text(err == null ? '$sym added to watchlist' : err),
        backgroundColor: err == null ? AppColors.green : AppColors.red,
        behavior: SnackBarBehavior.floating,
      ));
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext  = context.appColors;
    final wl   = context.watch<WatchlistProvider>();
    final inWL = wl.active?.items.map((i) => i.symbol).toSet() ?? <String>{};
    final height = MediaQuery.of(context).size.height * 0.9;

    return Container(
      height: height,
      decoration: BoxDecoration(
        color: ext.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: Column(
        children: [
          Container(
            width: 40, height: 4,
            margin: const EdgeInsets.symmetric(vertical: 10),
            decoration: BoxDecoration(
                color: ext.border, borderRadius: BorderRadius.circular(2)),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
            child: Row(
              children: [
                Text('Search Symbols',
                    style: TextStyle(
                        color: ext.textPrimary,
                        fontSize: 17,
                        fontWeight: FontWeight.w800)),
                const Spacer(),
                GestureDetector(
                  onTap: () => Navigator.pop(context),
                  child: Icon(Icons.close, color: ext.textSecondary, size: 22),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 0, 12, 8),
            child: TextField(
              controller: _ctrl,
              autofocus: true,
              style: TextStyle(color: ext.textPrimary),
              textCapitalization: TextCapitalization.characters,
              decoration: InputDecoration(
                hintText: 'Search RELIANCE, TCS, NIFTY…',
                hintStyle: TextStyle(color: ext.textMuted, fontSize: 14),
                prefixIcon: Icon(Icons.search, color: ext.textMuted, size: 20),
                suffixIcon: _apiLoading
                    ? const Padding(
                        padding: EdgeInsets.all(12),
                        child: SizedBox(
                          width: 16, height: 16,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: AppColors.blue),
                        ),
                      )
                    : (_query.isNotEmpty
                        ? IconButton(
                            icon: Icon(Icons.close, size: 18, color: ext.textMuted),
                            onPressed: () { _ctrl.clear(); _onChanged(''); },
                          )
                        : null),
                filled: true,
                fillColor: ext.card,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: ext.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: ext.border),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: AppColors.blue),
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
              onChanged: _onChanged,
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 2, 16, 6),
            child: Row(
              children: [
                Text(
                  _query.isEmpty ? 'POPULAR SYMBOLS' : 'RESULTS',
                  style: TextStyle(
                      color: ext.textMuted,
                      fontSize: 10.5,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 0.5),
                ),
                const SizedBox(width: 6),
                Text('(${_results.length})',
                    style: TextStyle(color: ext.textMuted, fontSize: 10.5)),
              ],
            ),
          ),
          Divider(color: ext.border, height: 1),
          Expanded(
            child: _results.isEmpty
                ? Center(
                    child: Text(
                      'No results for "$_query"',
                      style: TextStyle(color: ext.textMuted, fontSize: 14),
                    ),
                  )
                : ListView.separated(
                    padding: EdgeInsets.zero,
                    itemCount: _results.length,
                    separatorBuilder: (_, __) =>
                        Divider(indent: 72, color: ext.border, height: 1),
                    itemBuilder: (ctx, i) {
                      final s      = _results[i];
                      final sym    = s['symbol']  as String;
                      final exch   = s['exchange'] as String;
                      final name   = s['name']     as String;
                      final isInWL = inWL.contains(sym);
                      final ltp    = s['ltp'] as double?;
                      final pct    = s['change_pct'] as double?;
                      final hasLtp = ltp != null && ltp > 0;
                      final pctColor = pct == null
                          ? ext.textMuted
                          : pct >= 0 ? AppColors.green : AppColors.red;
                      return ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 14, vertical: 4),
                        title: Row(
                          children: [
                            Flexible(
                              child: Text(sym,
                                  style: TextStyle(
                                      color: ext.textPrimary,
                                      fontSize: 14,
                                      fontWeight: FontWeight.w700),
                                  overflow: TextOverflow.ellipsis),
                            ),
                            const SizedBox(width: 6),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 5, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.blueDim.withValues(alpha: 0.5),
                                borderRadius: BorderRadius.circular(4),
                              ),
                              child: Text(exch,
                                  style: const TextStyle(
                                      color: AppColors.teal,
                                      fontSize: 8.5,
                                      fontWeight: FontWeight.w700)),
                            ),
                            if (isInWL) ...[
                              const SizedBox(width: 6),
                              Container(
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 5, vertical: 2),
                                decoration: BoxDecoration(
                                  color: const Color(0xFF0D3321),
                                  borderRadius: BorderRadius.circular(4),
                                ),
                                child: const Text('In watchlist',
                                    style: TextStyle(
                                        color: AppColors.green,
                                        fontSize: 8.5,
                                        fontWeight: FontWeight.w700)),
                              ),
                            ],
                          ],
                        ),
                        subtitle: Text(name,
                            style: TextStyle(
                                color: ext.textMuted, fontSize: 11.5),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis),
                        trailing: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            if (hasLtp) ...[
                              Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                crossAxisAlignment: CrossAxisAlignment.end,
                                children: [
                                  Text(
                                    '₹${ltp!.toStringAsFixed(2)}',
                                    style: TextStyle(
                                        color: ext.textPrimary,
                                        fontSize: 13,
                                        fontWeight: FontWeight.w600),
                                  ),
                                  if (pct != null)
                                    Text(
                                      '${pct >= 0 ? '+' : ''}${pct.toStringAsFixed(2)}%',
                                      style: TextStyle(
                                          color: pctColor, fontSize: 11),
                                    ),
                                ],
                              ),
                              const SizedBox(width: 8),
                            ],
                            isInWL
                                ? Container(
                                    width: 32, height: 32,
                                    decoration: BoxDecoration(
                                      color: const Color(0xFF0D3321),
                                      borderRadius: BorderRadius.circular(8),
                                    ),
                                    child: const Icon(Icons.check_rounded,
                                        color: AppColors.green, size: 18),
                                  )
                                : GestureDetector(
                                    onTap: () => _addToWatchlist(ctx, wl, s),
                                    child: Container(
                                      width: 32, height: 32,
                                      decoration: BoxDecoration(
                                        color: AppColors.blueDim,
                                        borderRadius: BorderRadius.circular(8),
                                      ),
                                      child: const Icon(Icons.add_rounded,
                                          color: AppColors.blue, size: 20),
                                    ),
                                  ),
                          ],
                        ),
                        onTap: () {
                          final existing = isInWL
                              ? wl.active!.items
                                  .firstWhere((it) => it.symbol == sym)
                              : WatchlistItem(
                                  id: sym,
                                  symbol: sym,
                                  company: name,
                                  exchange: exch,
                                  ltp: 0, change: 0, changePct: 0,
                                  high: 0, low: 0, open: 0, prevClose: 0,
                                  volume: 0, sparkline: const [],
                                );
                          Navigator.pop(context);
                          StockDetailSheet.show(context, existing);
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }
}

// ── Popular stocks list ────────────────────────────────────────────────────────
const _kPopularStocks = [
  {'symbol': 'NIFTY 50',   'exchange': 'NSE', 'name': 'Nifty 50 Index'},
  {'symbol': 'BANKNIFTY',  'exchange': 'NSE', 'name': 'Bank Nifty Index'},
  {'symbol': 'SENSEX',     'exchange': 'BSE', 'name': 'BSE Sensex Index'},
  {'symbol': 'BANKEX',     'exchange': 'BSE', 'name': 'BSE Bankex Index'},
  {'symbol': 'FINNIFTY',   'exchange': 'NSE', 'name': 'Nifty Financial Services'},
  {'symbol': 'MIDCPNIFTY', 'exchange': 'NSE', 'name': 'Nifty Midcap Select'},
  {'symbol': 'RELIANCE',   'exchange': 'NSE', 'name': 'Reliance Industries'},
  {'symbol': 'TCS',        'exchange': 'NSE', 'name': 'Tata Consultancy Services'},
  {'symbol': 'HDFCBANK',   'exchange': 'NSE', 'name': 'HDFC Bank'},
  {'symbol': 'ICICIBANK',  'exchange': 'NSE', 'name': 'ICICI Bank'},
  {'symbol': 'INFY',       'exchange': 'NSE', 'name': 'Infosys'},
  {'symbol': 'HINDUNILVR', 'exchange': 'NSE', 'name': 'Hindustan Unilever'},
  {'symbol': 'ITC',        'exchange': 'NSE', 'name': 'ITC Ltd'},
  {'symbol': 'SBIN',       'exchange': 'NSE', 'name': 'State Bank of India'},
  {'symbol': 'BHARTIARTL', 'exchange': 'NSE', 'name': 'Bharti Airtel'},
  {'symbol': 'KOTAKBANK',  'exchange': 'NSE', 'name': 'Kotak Mahindra Bank'},
  {'symbol': 'LT',         'exchange': 'NSE', 'name': 'Larsen & Toubro'},
  {'symbol': 'AXISBANK',   'exchange': 'NSE', 'name': 'Axis Bank'},
  {'symbol': 'BAJFINANCE', 'exchange': 'NSE', 'name': 'Bajaj Finance'},
  {'symbol': 'ASIANPAINT', 'exchange': 'NSE', 'name': 'Asian Paints'},
  {'symbol': 'TITAN',      'exchange': 'NSE', 'name': 'Titan Company'},
  {'symbol': 'MARUTI',     'exchange': 'NSE', 'name': 'Maruti Suzuki'},
  {'symbol': 'SUNPHARMA',  'exchange': 'NSE', 'name': 'Sun Pharmaceutical'},
  {'symbol': 'TATAMOTORS', 'exchange': 'NSE', 'name': 'Tata Motors'},
  {'symbol': 'WIPRO',      'exchange': 'NSE', 'name': 'Wipro'},
  {'symbol': 'HCLTECH',    'exchange': 'NSE', 'name': 'HCL Technologies'},
  {'symbol': 'ULTRACEMCO', 'exchange': 'NSE', 'name': 'UltraTech Cement'},
  {'symbol': 'M&M',        'exchange': 'NSE', 'name': 'Mahindra & Mahindra'},
  {'symbol': 'ONGC',       'exchange': 'NSE', 'name': 'Oil & Natural Gas Corp'},
  {'symbol': 'POWERGRID',  'exchange': 'NSE', 'name': 'Power Grid Corporation'},
  {'symbol': 'NTPC',       'exchange': 'NSE', 'name': 'NTPC Ltd'},
  {'symbol': 'JSWSTEEL',   'exchange': 'NSE', 'name': 'JSW Steel'},
  {'symbol': 'TATASTEEL',  'exchange': 'NSE', 'name': 'Tata Steel'},
  {'symbol': 'ADANIENT',   'exchange': 'NSE', 'name': 'Adani Enterprises'},
  {'symbol': 'ADANIPORTS', 'exchange': 'NSE', 'name': 'Adani Ports'},
  {'symbol': 'BAJAJ-AUTO', 'exchange': 'NSE', 'name': 'Bajaj Auto'},
  {'symbol': 'DRREDDY',    'exchange': 'NSE', 'name': "Dr Reddy's Laboratories"},
  {'symbol': 'CIPLA',      'exchange': 'NSE', 'name': 'Cipla'},
  {'symbol': 'COALINDIA',  'exchange': 'NSE', 'name': 'Coal India'},
  {'symbol': 'EICHERMOT',  'exchange': 'NSE', 'name': 'Eicher Motors'},
  {'symbol': 'NESTLEIND',  'exchange': 'NSE', 'name': 'Nestle India'},
  {'symbol': 'GRASIM',     'exchange': 'NSE', 'name': 'Grasim Industries'},
  {'symbol': 'HINDALCO',   'exchange': 'NSE', 'name': 'Hindalco Industries'},
  {'symbol': 'TECHM',      'exchange': 'NSE', 'name': 'Tech Mahindra'},
  {'symbol': 'BPCL',       'exchange': 'NSE', 'name': 'Bharat Petroleum'},
  {'symbol': 'BRITANNIA',  'exchange': 'NSE', 'name': 'Britannia Industries'},
  {'symbol': 'HEROMOTOCO', 'exchange': 'NSE', 'name': 'Hero MotoCorp'},
  {'symbol': 'INDUSINDBK', 'exchange': 'NSE', 'name': 'IndusInd Bank'},
  {'symbol': 'APOLLOHOSP', 'exchange': 'NSE', 'name': 'Apollo Hospitals'},
  {'symbol': 'TATACONSUM', 'exchange': 'NSE', 'name': 'Tata Consumer Products'},
  {'symbol': 'BAJAJFINSV', 'exchange': 'NSE', 'name': 'Bajaj Finserv'},
  {'symbol': 'SBILIFE',    'exchange': 'NSE', 'name': 'SBI Life Insurance'},
  {'symbol': 'HDFCLIFE',   'exchange': 'NSE', 'name': 'HDFC Life Insurance'},
  {'symbol': 'ZOMATO',     'exchange': 'NSE', 'name': 'Zomato'},
  {'symbol': 'IRCTC',      'exchange': 'NSE', 'name': 'IRCTC'},
  {'symbol': 'HAL',        'exchange': 'NSE', 'name': 'Hindustan Aeronautics'},
  {'symbol': 'BEL',        'exchange': 'NSE', 'name': 'Bharat Electronics'},
  {'symbol': 'DMART',      'exchange': 'NSE', 'name': 'Avenue Supermarts'},
  {'symbol': 'IRFC',       'exchange': 'NSE', 'name': 'Indian Railway Finance Corp'},
  {'symbol': 'RVNL',       'exchange': 'NSE', 'name': 'Rail Vikas Nigam'},
  {'symbol': 'PIDILITIND', 'exchange': 'NSE', 'name': 'Pidilite Industries'},
  {'symbol': 'PFC',        'exchange': 'NSE', 'name': 'Power Finance Corporation'},
  {'symbol': 'RECLTD',     'exchange': 'NSE', 'name': 'REC Ltd'},
  {'symbol': 'TATACHEM',   'exchange': 'NSE', 'name': 'Tata Chemicals'},
  {'symbol': 'AMBUJACEM',  'exchange': 'NSE', 'name': 'Ambuja Cements'},
  {'symbol': 'CONCOR',     'exchange': 'NSE', 'name': 'Container Corp of India'},
  {'symbol': 'DIVISLAB',   'exchange': 'NSE', 'name': 'Divi\'s Laboratories'},
];

// ── Option Chain Panel ────────────────────────────────────────────────────────

class _OptionChainPanel extends StatefulWidget {
  final VoidCallback onClose;
  const _OptionChainPanel({required this.onClose});

  @override
  State<_OptionChainPanel> createState() => _OptionChainPanelState();
}

class _OptionChainPanelState extends State<_OptionChainPanel> {
  static const _availableSymbols = [
    'NIFTY', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY',
  ];

  String _symbol       = 'NIFTY';
  List<String> _expiries = [];
  String? _expiry;
  _OcView _view        = _OcView.ltpPct;
  bool _loading        = false;
  String? _error;
  Map<String, dynamic>? _chain;
  Timer? _refreshTimer;

  final _fmt  = NumberFormat('#,##,##0.##');
  final _fmtI = NumberFormat('#,##,##0');

  @override
  void initState() {
    super.initState();
    _loadExpiries();
  }

  @override
  void dispose() {
    _refreshTimer?.cancel();
    super.dispose();
  }

  Future<void> _loadExpiries() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiService.instance.getOptionExpiries(_symbol);
      final list = (res['expiries'] as List<dynamic>? ?? []).cast<String>();
      if (!mounted) return;
      setState(() {
        _expiries = list;
        _expiry   = list.isNotEmpty ? list[0] : null;
        _loading  = false;
      });
      if (_expiry != null) _loadChain(initial: true);
    } catch (_) {
      if (!mounted) return;
      setState(() { _error = 'Failed to load expiries'; _loading = false; });
    }
  }

  Future<void> _loadChain({bool initial = false}) async {
    if (_expiry == null) return;
    if (initial) setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiService.instance.getOptionChain(
        _symbol, _expiry!, strikes: 25,
      );
      if (!mounted) return;
      setState(() { _chain = res; _loading = false; _error = null; });
      if (initial) {
        _refreshTimer?.cancel();
        _refreshTimer = Timer.periodic(const Duration(seconds: 5), (_) {
          if (mounted) _loadChain();
        });
      }
    } catch (_) {
      if (!mounted) return;
      if (initial) setState(() { _error = 'Failed to load option chain'; _loading = false; });
    }
  }

  void _changeSymbol(String sym) {
    if (sym == _symbol) return;
    _refreshTimer?.cancel();
    setState(() { _symbol = sym; _expiries = []; _expiry = null; _chain = null; });
    _loadExpiries();
  }

  void _changeExpiry(String iso) {
    if (iso == _expiry) return;
    _refreshTimer?.cancel();
    setState(() { _expiry = iso; _chain = null; });
    _loadChain(initial: true);
  }

  String _fmtExpiry(String iso) {
    try {
      final d = DateTime.parse(iso);
      const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return '${d.day} ${m[d.month - 1]} ${d.year}';
    } catch (_) { return iso; }
  }

  String _fmtOi(num? v) {
    if (v == null || v == 0) return '—';
    if (v >= 10000000) return '${(v / 10000000).toStringAsFixed(1)}Cr';
    if (v >= 100000)   return '${(v / 100000).toStringAsFixed(1)}L';
    return _fmtI.format(v);
  }

  double _chngPct(Map<String, dynamic>? q) {
    if (q == null) return 0;
    final ltp   = (q['ltp']   as num?)?.toDouble() ?? 0;
    final close = (q['close'] as num?)?.toDouble() ?? 0;
    if (close <= 0 || ltp <= 0) return 0;
    return (ltp - close) / close * 100;
  }

  double _oiChngPct(Map<String, dynamic>? q) {
    if (q == null) return 0;
    final oi    = (q['oi']       as num?)?.toDouble() ?? 0;
    final chg   = (q['changeOi'] as num?)?.toDouble() ?? 0;
    if (oi <= 0) return 0;
    return chg / oi * 100;
  }

  List<String> _callLabels() {
    switch (_view) {
      case _OcView.ltpPct:  return ['Chng%', 'LTP'];
      case _OcView.ltpOi:   return ['OI', 'LTP'];
      case _OcView.greeks:  return ['Delta', 'IV%'];
      case _OcView.oiPct:   return ['OI Chng%', 'OI'];
    }
  }

  List<String> _putLabels() {
    switch (_view) {
      case _OcView.ltpPct:  return ['LTP', 'Chng%'];
      case _OcView.ltpOi:   return ['LTP', 'OI'];
      case _OcView.greeks:  return ['IV%', 'Delta'];
      case _OcView.oiPct:   return ['OI', 'OI Chng%'];
    }
  }

  List<String> _callCells(Map<String, dynamic>? ce) {
    if (ce == null) return ['—', '—'];
    final ltp  = (ce['ltp'] as num?)?.toDouble() ?? 0;
    final chng = _chngPct(ce);
    switch (_view) {
      case _OcView.ltpPct:
        return [
          '${chng >= 0 ? '+' : ''}${chng.toStringAsFixed(2)}%',
          ltp > 0 ? '₹${_fmt.format(ltp)}' : '—',
        ];
      case _OcView.ltpOi:
        return [_fmtOi(ce['oi'] as num?), ltp > 0 ? '₹${_fmt.format(ltp)}' : '—'];
      case _OcView.greeks:
        return [
          (ce['delta'] as num?) != null ? (ce['delta'] as num).toStringAsFixed(3) : '—',
          (ce['iv'] as num?) != null ? '${(ce['iv'] as num).toStringAsFixed(1)}%' : '—',
        ];
      case _OcView.oiPct:
        final op = _oiChngPct(ce);
        return ['${op >= 0 ? '+' : ''}${op.toStringAsFixed(1)}%', _fmtOi(ce['oi'] as num?)];
    }
  }

  List<String> _putCells(Map<String, dynamic>? pe) {
    if (pe == null) return ['—', '—'];
    final ltp  = (pe['ltp'] as num?)?.toDouble() ?? 0;
    final chng = _chngPct(pe);
    switch (_view) {
      case _OcView.ltpPct:
        return [
          ltp > 0 ? '₹${_fmt.format(ltp)}' : '—',
          '${chng >= 0 ? '+' : ''}${chng.toStringAsFixed(2)}%',
        ];
      case _OcView.ltpOi:
        return [ltp > 0 ? '₹${_fmt.format(ltp)}' : '—', _fmtOi(pe['oi'] as num?)];
      case _OcView.greeks:
        return [
          (pe['iv']    as num?) != null ? '${(pe['iv']    as num).toStringAsFixed(1)}%' : '—',
          (pe['delta'] as num?) != null ? (pe['delta'] as num).toStringAsFixed(3) : '—',
        ];
      case _OcView.oiPct:
        final op = _oiChngPct(pe);
        return [_fmtOi(pe['oi'] as num?), '${op >= 0 ? '+' : ''}${op.toStringAsFixed(1)}%'];
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext  = context.appColors;
    final rows = (_chain?['rows'] as List<dynamic>? ?? []).cast<Map<String, dynamic>>();
    final spot = (_chain?['spot'] as num?)?.toDouble() ?? 0;

    return Column(
      children: [
        // ── Tab header ────────────────────────────────────────────────────
        Container(
          color: ext.surface,
          padding: const EdgeInsets.fromLTRB(4, 4, 4, 0),
          child: Row(
            children: [
              GestureDetector(
                onTap: widget.onClose,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  child: Text('Watchlist',
                    style: TextStyle(color: ext.textSecondary, fontSize: 14, fontWeight: FontWeight.w500)),
                ),
              ),
              Container(
                decoration: const BoxDecoration(
                  border: Border(bottom: BorderSide(color: AppColors.blue, width: 2.5)),
                ),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                child: const Text('Option Chain',
                  style: TextStyle(color: AppColors.blue, fontSize: 14, fontWeight: FontWeight.w600)),
              ),
              const Spacer(),
              IconButton(
                icon: Icon(Icons.open_in_new_rounded, size: 17, color: ext.textMuted),
                onPressed: null,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
              IconButton(
                icon: Icon(Icons.close_rounded, size: 20, color: ext.textMuted),
                onPressed: widget.onClose,
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              ),
              const SizedBox(width: 6),
            ],
          ),
        ),

        // ── Symbol + Expiry selectors ─────────────────────────────────────
        Container(
          color: ext.surface,
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
          child: Row(
            children: [
              _OcDropdown(
                value: _symbol,
                items: _availableSymbols,
                onChanged: _changeSymbol,
                ext: ext,
              ),
              const SizedBox(width: 8),
              _OcDropdown(
                value: _expiry != null ? _fmtExpiry(_expiry!) : '—',
                items: _expiries.map(_fmtExpiry).toList(),
                onChanged: (label) {
                  final idx = _expiries.indexWhere((e) => _fmtExpiry(e) == label);
                  if (idx != -1) _changeExpiry(_expiries[idx]);
                },
                ext: ext,
              ),
              const Spacer(),
              if (_loading && _chain != null)
                const SizedBox(
                  width: 14, height: 14,
                  child: CircularProgressIndicator(strokeWidth: 1.5, color: AppColors.blue),
                ),
            ],
          ),
        ),

        Divider(height: 1, thickness: 1, color: ext.border),

        // ── Column headers ────────────────────────────────────────────────
        if (!_loading || _chain != null) ...[
          Container(
            color: ext.surface,
            padding: const EdgeInsets.symmetric(vertical: 5),
            child: Row(
              children: [
                Expanded(
                  flex: 4,
                  child: Center(
                    child: Text('CALL',
                      style: TextStyle(color: ext.textMuted, fontSize: 10,
                          fontWeight: FontWeight.w700, letterSpacing: 0.8)),
                  ),
                ),
                _OcViewButton(view: _view, onChanged: (v) => setState(() => _view = v), ext: ext),
                Expanded(
                  flex: 4,
                  child: Center(
                    child: Text('PUT',
                      style: TextStyle(color: ext.textMuted, fontSize: 10,
                          fontWeight: FontWeight.w700, letterSpacing: 0.8)),
                  ),
                ),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.only(bottom: 4),
            child: Row(
              children: [
                Expanded(flex: 2, child: Text(_callLabels()[0], textAlign: TextAlign.center,
                    style: TextStyle(color: ext.textMuted, fontSize: 9))),
                Expanded(flex: 2, child: Text(_callLabels()[1], textAlign: TextAlign.center,
                    style: TextStyle(color: ext.textMuted, fontSize: 9))),
                const SizedBox(width: 60),
                Expanded(flex: 2, child: Text(_putLabels()[0], textAlign: TextAlign.center,
                    style: TextStyle(color: ext.textMuted, fontSize: 9))),
                Expanded(flex: 2, child: Text(_putLabels()[1], textAlign: TextAlign.center,
                    style: TextStyle(color: ext.textMuted, fontSize: 9))),
              ],
            ),
          ),
          Divider(height: 1, thickness: 1, color: ext.border),
        ],

        // ── Table body ───────────────────────────────────────────────────
        Expanded(
          child: _loading && _chain == null
              ? const Center(child: CircularProgressIndicator(color: AppColors.blue, strokeWidth: 2))
              : _error != null
                  ? Center(
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.error_outline, color: AppColors.red, size: 36),
                          const SizedBox(height: 8),
                          Text(_error!, style: TextStyle(color: ext.textSecondary, fontSize: 13)),
                          const SizedBox(height: 12),
                          ElevatedButton.icon(
                            onPressed: _loadExpiries,
                            icon: const Icon(Icons.refresh, size: 16),
                            label: const Text('Retry'),
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppColors.blue,
                              foregroundColor: Colors.white,
                            ),
                          ),
                        ],
                      ),
                    )
                  : rows.isEmpty
                      ? Center(
                          child: Text('No option data available',
                            style: TextStyle(color: ext.textMuted, fontSize: 13)))
                      : Stack(
                          children: [
                            ListView.builder(
                              padding: const EdgeInsets.only(bottom: 64),
                              itemCount: rows.length,
                              itemBuilder: (_, i) =>
                                  _buildRow(rows[i], spot, ext, i, rows),
                            ),
                            Positioned(
                              bottom: 12,
                              left: 0,
                              right: 0,
                              child: Center(
                                child: ElevatedButton.icon(
                                  onPressed: () {},
                                  icon: const Icon(Icons.add, size: 15),
                                  label: const Text('CREATE STRATEGY',
                                    style: TextStyle(
                                      fontSize: 11,
                                      fontWeight: FontWeight.w800,
                                      letterSpacing: 0.6,
                                    )),
                                  style: ElevatedButton.styleFrom(
                                    backgroundColor: AppColors.blue,
                                    foregroundColor: Colors.white,
                                    shape: const StadiumBorder(),
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 20, vertical: 11),
                                    elevation: 4,
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
        ),
      ],
    );
  }

  Widget _buildRow(
    Map<String, dynamic> row,
    double spot,
    dynamic ext,
    int i,
    List<Map<String, dynamic>> allRows,
  ) {
    final strike = (row['strike'] as num).toDouble();
    final isAtm  = row['isAtm'] == true;
    final ce     = row['ce'] as Map<String, dynamic>?;
    final pe     = row['pe'] as Map<String, dynamic>?;
    final cItm   = spot > 0 && strike < spot;
    final pItm   = spot > 0 && strike > spot;
    final isDark = context.isDark;

    final callCells = _callCells(ce);
    final putCells  = _putCells(pe);

    final showSpotLine = spot > 0 &&
        i > 0 &&
        (allRows[i - 1]['strike'] as num).toDouble() < spot &&
        strike >= spot;

    // Determine text colors by view
    Color callLeftColor  = ext.textSecondary;
    Color callRightColor = ext.textPrimary;
    Color putLeftColor   = ext.textPrimary;
    Color putRightColor  = ext.textSecondary;
    if (_view == _OcView.ltpPct) {
      final cc = _chngPct(ce);
      callLeftColor = cc >= 0 ? AppColors.green : AppColors.red;
      final pc = _chngPct(pe);
      putRightColor = pc >= 0 ? AppColors.green : AppColors.red;
    } else if (_view == _OcView.oiPct) {
      callLeftColor = _oiChngPct(ce) >= 0 ? AppColors.green : AppColors.red;
      putRightColor = _oiChngPct(pe) >= 0 ? AppColors.green : AppColors.red;
    }

    // ITM backgrounds
    final cItmBg = isDark ? const Color(0xFF221400) : const Color(0xFFFFF3E0);
    final pItmBg = isDark ? const Color(0xFF00180A) : const Color(0xFFECFDF5);
    final defBg  = ext.bg;

    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Spot price separator line
        if (showSpotLine)
          Container(
            color: AppColors.red.withOpacity(0.12),
            padding: const EdgeInsets.symmetric(vertical: 3),
            child: Row(
              children: [
                const Expanded(child: Divider(color: AppColors.red, thickness: 0.5)),
                const SizedBox(width: 6),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.red,
                    borderRadius: BorderRadius.circular(3),
                  ),
                  child: Text(
                    _fmt.format(spot),
                    style: const TextStyle(
                      color: Colors.white, fontSize: 10, fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 6),
                const Expanded(child: Divider(color: AppColors.red, thickness: 0.5)),
              ],
            ),
          ),
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Call left
              Expanded(
                flex: 2,
                child: Container(
                  color: cItm ? cItmBg : defBg,
                  padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 3),
                  alignment: Alignment.centerRight,
                  child: Text(callCells[0],
                    style: TextStyle(color: callLeftColor, fontSize: 10.5, fontWeight: FontWeight.w500)),
                ),
              ),
              // Call right (LTP)
              Expanded(
                flex: 2,
                child: Container(
                  color: cItm ? cItmBg : defBg,
                  padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 3),
                  alignment: Alignment.centerRight,
                  child: Text(callCells[1],
                    style: TextStyle(color: callRightColor, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ),
              // Strike
              Container(
                width: 60,
                color: isAtm
                    ? (isDark ? const Color(0xFF1A3A5C) : const Color(0xFFEBF2FF))
                    : ext.surface,
                alignment: Alignment.center,
                padding: const EdgeInsets.symmetric(vertical: 9),
                child: Text(
                  _fmtI.format(strike),
                  style: TextStyle(
                    color: isAtm ? AppColors.blue : ext.textPrimary,
                    fontSize: 11,
                    fontWeight: isAtm ? FontWeight.w700 : FontWeight.w600,
                  ),
                ),
              ),
              // Put left (LTP)
              Expanded(
                flex: 2,
                child: Container(
                  color: pItm ? pItmBg : defBg,
                  padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 3),
                  alignment: Alignment.centerLeft,
                  child: Text(putCells[0],
                    style: TextStyle(color: putLeftColor, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ),
              // Put right
              Expanded(
                flex: 2,
                child: Container(
                  color: pItm ? pItmBg : defBg,
                  padding: const EdgeInsets.symmetric(vertical: 9, horizontal: 3),
                  alignment: Alignment.centerLeft,
                  child: Text(putCells[1],
                    style: TextStyle(color: putRightColor, fontSize: 10.5, fontWeight: FontWeight.w500)),
                ),
              ),
            ],
          ),
        ),
        Divider(height: 0.5, thickness: 0.5, color: ext.border.withOpacity(0.4)),
      ],
    );
  }
}

// ── Option Chain helper widgets ───────────────────────────────────────────────

class _OcDropdown extends StatelessWidget {
  final String value;
  final List<String> items;
  final ValueChanged<String> onChanged;
  final dynamic ext;

  const _OcDropdown({
    required this.value,
    required this.items,
    required this.onChanged,
    required this.ext,
  });

  @override
  Widget build(BuildContext context) {
    if (items.isEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
        decoration: BoxDecoration(
          border: Border.all(color: ext.border),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(value, style: TextStyle(color: ext.textSecondary, fontSize: 13, fontWeight: FontWeight.w600)),
            const SizedBox(width: 4),
            Icon(Icons.keyboard_arrow_down, size: 16, color: ext.textMuted),
          ],
        ),
      );
    }
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
      decoration: BoxDecoration(
        border: Border.all(color: ext.border),
        borderRadius: BorderRadius.circular(6),
        color: ext.surface,
      ),
      child: DropdownButtonHideUnderline(
        child: DropdownButton<String>(
          value: items.contains(value) ? value : items.first,
          isDense: true,
          dropdownColor: ext.surface,
          style: TextStyle(color: ext.textPrimary, fontSize: 13, fontWeight: FontWeight.w600),
          icon: Icon(Icons.keyboard_arrow_down, size: 17, color: ext.textMuted),
          items: items.map((s) => DropdownMenuItem(
            value: s,
            child: Text(s, style: TextStyle(color: ext.textPrimary, fontSize: 13)),
          )).toList(),
          onChanged: (v) { if (v != null) onChanged(v); },
        ),
      ),
    );
  }
}

class _OcViewButton extends StatelessWidget {
  final _OcView view;
  final ValueChanged<_OcView> onChanged;
  final dynamic ext;

  const _OcViewButton({required this.view, required this.onChanged, required this.ext});

  static const _labels = <_OcView, String>{
    _OcView.ltpPct: 'LTP%',
    _OcView.ltpOi:  'LTP & OI',
    _OcView.greeks: 'Greeks',
    _OcView.oiPct:  'OI%',
  };

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<_OcView>(
      initialValue: view,
      color: ext.surface,
      onSelected: onChanged,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(color: ext.border),
      ),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
        decoration: BoxDecoration(
          border: Border.all(color: ext.border),
          borderRadius: BorderRadius.circular(6),
          color: ext.surface,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_labels[view]!,
              style: const TextStyle(color: AppColors.blue, fontSize: 11, fontWeight: FontWeight.w700)),
            const SizedBox(width: 3),
            const Icon(Icons.keyboard_arrow_down, size: 15, color: AppColors.blue),
          ],
        ),
      ),
      itemBuilder: (_) => _OcView.values.map((v) => PopupMenuItem(
        value: v,
        child: Text(_labels[v]!,
          style: TextStyle(
            color: v == view ? AppColors.blue : ext.textPrimary,
            fontSize: 13,
            fontWeight: v == view ? FontWeight.w600 : FontWeight.w400,
          ),
        ),
      )).toList(),
    );
  }
}

// ── Orders provider extension ──────────────────────────────────────────────────
extension OrdersProviderX on OrdersProvider {
  Future<void> placeOrder({
    required String symbol,
    required String exchange,
    required OrderSide side,
    required int qty,
    required double price,
    required String tradingMode,
  }) async {
    await ApiService.instance.placeOrder(
      symbol: symbol,
      exchange: exchange,
      transactionType: side == OrderSide.buy ? 'BUY' : 'SELL',
      orderType: price > 0 ? 'LIMIT' : 'MARKET',
      productType: 'CNC',
      quantity: qty,
      price: price > 0 ? price : null,
      isPaper: tradingMode == 'paper',
    );
    await fetch(tradingMode);
  }
}
