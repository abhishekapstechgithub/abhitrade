import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/widgets.dart';
import '../../models/models.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tab;
  static const _tabs = ['Open Orders', 'Positions', 'Order Book'];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: _tabs.length, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final mode = context.read<TradingModeProvider>().mode;
      context.read<OrdersProvider>().fetch(mode);
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ext   = context.appColors;
    final orders = context.watch<OrdersProvider>();
    final mode  = context.watch<TradingModeProvider>();

    return Scaffold(
      backgroundColor: ext.bg,
      appBar: AppBar(
        backgroundColor: ext.surface,
        surfaceTintColor: Colors.transparent,
        title: Row(
          children: [
            Text('Orders',
                style: TextStyle(
                    color: ext.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700)),
            const SizedBox(width: 10),
            if (mode.isPaper)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: AppColors.amberDim,
                  borderRadius: BorderRadius.circular(6),
                ),
                child: const Text('PAPER',
                    style: TextStyle(
                        color: AppColors.amber,
                        fontSize: 11,
                        fontWeight: FontWeight.w700)),
              ),
          ],
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.more_vert, color: ext.textSecondary),
            onPressed: () {},
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          tabs: _tabs.map((t) => Tab(text: t)).toList(),
        ),
      ),
      body: Column(
        children: [
          if (mode.isPaper) PaperModeBanner(balance: mode.paperBalance),
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                _OrdersList(
                  orders: orders.activeOrders,
                  loading: orders.loading,
                  emptyMsg: 'No open orders',
                  emptyIcon: Icons.receipt_long_outlined,
                  onCancel: (o) => _cancel(context, o, mode),
                ),
                _PositionsTab(isPaper: mode.isPaper, paperPositions: mode.paperPositions),
                _OrdersList(
                  orders: orders.orders,
                  loading: orders.loading,
                  emptyMsg: 'No orders yet',
                  emptyIcon: Icons.history_outlined,
                ),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {},
        backgroundColor: AppColors.blue,
        icon: const Icon(Icons.add, color: Colors.white),
        label: const Text('New Order',
            style: TextStyle(color: Colors.white, fontWeight: FontWeight.w600)),
      ),
    );
  }

  void _cancel(BuildContext ctx, Order order, TradingModeProvider mode) {
    showDialog(
      context: ctx,
      builder: (_) => AlertDialog(
        backgroundColor: ctx.appColors.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: ctx.appColors.border)),
        title: Text('Cancel Order',
            style: TextStyle(
                color: ctx.appColors.textPrimary, fontWeight: FontWeight.w700)),
        content: Text(
            'Cancel ${order.isBuy ? "BUY" : "SELL"} ${order.symbol}?',
            style: TextStyle(color: ctx.appColors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('No', style: TextStyle(color: ctx.appColors.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
            onPressed: () {
              Navigator.pop(ctx);
              ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(
                content: Text('Order cancelled'),
                backgroundColor: AppColors.red,
              ));
            },
            child: const Text('Yes, Cancel'),
          ),
        ],
      ),
    );
  }
}

class _OrdersList extends StatelessWidget {
  final List<Order> orders;
  final bool loading;
  final String emptyMsg;
  final IconData emptyIcon;
  final void Function(Order)? onCancel;

  const _OrdersList({
    required this.orders,
    required this.loading,
    required this.emptyMsg,
    required this.emptyIcon,
    this.onCancel,
  });

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return _OrdersShimmer();
    }
    if (orders.isEmpty) {
      final ext = context.appColors;
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 72,
                height: 72,
                decoration: BoxDecoration(
                  color: AppColors.blueDim.withOpacity(0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(emptyIcon, size: 36, color: AppColors.blue),
              ),
              const SizedBox(height: 20),
              Text(emptyMsg,
                  style: TextStyle(
                      color: ext.textPrimary,
                      fontSize: 18,
                      fontWeight: FontWeight.w700)),
              const SizedBox(height: 8),
              Text(
                'Your orders will appear here once placed.',
                style: TextStyle(color: ext.textMuted, fontSize: 13),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      );
    }
    return ListView.builder(
      padding: const EdgeInsets.only(top: 8, bottom: 100),
      itemCount: orders.length,
      itemBuilder: (_, i) => OrderCard(
        order: orders[i],
        onCancel: orders[i].isActive && onCancel != null
            ? () => onCancel!(orders[i])
            : null,
      ),
    );
  }
}

class _OrdersShimmer extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return ListView.builder(
      padding: const EdgeInsets.only(top: 8),
      itemCount: 5,
      itemBuilder: (_, __) => Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: ext.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ext.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _OBone(w: 40, h: 20, r: 6, ext: ext),
                const SizedBox(width: 8),
                _OBone(w: 90, h: 16, r: 4, ext: ext),
                const Spacer(),
                _OBone(w: 60, h: 14, r: 4, ext: ext),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                _OBone(w: 40, h: 12, r: 4, ext: ext),
                const SizedBox(width: 12),
                _OBone(w: 60, h: 12, r: 4, ext: ext),
                const SizedBox(width: 12),
                _OBone(w: 45, h: 12, r: 4, ext: ext),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _OBone extends StatelessWidget {
  final double w, h, r;
  final AppThemeExtension ext;
  const _OBone({required this.w, required this.h, required this.r, required this.ext});

  @override
  Widget build(BuildContext context) => Container(
        width: w,
        height: h,
        decoration: BoxDecoration(
          color: ext.border,
          borderRadius: BorderRadius.circular(r),
        ),
      );
}

class _PositionsTab extends StatelessWidget {
  final bool isPaper;
  final Map<String, int> paperPositions;

  const _PositionsTab({
    required this.isPaper,
    required this.paperPositions,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    if (isPaper) {
      final entries = paperPositions.entries.where((e) => e.value != 0).toList();
      if (entries.isEmpty) {
        return Center(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.pie_chart_outline, size: 52, color: ext.textMuted),
              const SizedBox(height: 16),
              Text('No paper positions',
                  style: TextStyle(
                      color: ext.textSecondary,
                      fontSize: 16,
                      fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text('Buy or sell from the watchlist',
                  style: TextStyle(color: ext.textMuted, fontSize: 13)),
            ],
          ),
        );
      }
      return ListView.separated(
        itemCount: entries.length,
        separatorBuilder: (_, __) =>
            Divider(indent: 16, endIndent: 16, color: ext.border, height: 1),
        itemBuilder: (_, i) {
          final e = entries[i];
          final isBuy = e.value > 0;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: isBuy ? AppColors.greenDim : AppColors.redDim,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(isBuy ? 'LONG' : 'SHORT',
                      style: TextStyle(
                          color: isBuy ? AppColors.green : AppColors.red,
                          fontSize: 11,
                          fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(e.key,
                          style: TextStyle(
                              color: ext.textPrimary,
                              fontSize: 14,
                              fontWeight: FontWeight.w700)),
                      Text('NSE EQ  •  Paper Position',
                          style: TextStyle(color: ext.textMuted, fontSize: 12)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('Qty: ${e.value.abs()}',
                        style: TextStyle(
                            color: ext.textPrimary,
                            fontSize: 14,
                            fontWeight: FontWeight.w600)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.amberDim,
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: const Text('PAPER',
                          style: TextStyle(
                              color: AppColors.amber,
                              fontSize: 10,
                              fontWeight: FontWeight.w600)),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      );
    }

    // Live positions (placeholder)
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.pie_chart_outline, size: 52, color: ext.textMuted),
          const SizedBox(height: 16),
          Text('No open positions',
              style: TextStyle(
                  color: ext.textSecondary,
                  fontSize: 16,
                  fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
