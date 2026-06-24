import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/widgets.dart';
import '../../config/constants.dart';

// ── Main screen ────────────────────────────────────────────────────────────────

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen>
    with TickerProviderStateMixin {
  // Outer: Orders | Positions | Holdings | Portfolio
  late TabController _sectionTab;
  // Inner (Orders section only): Open | Traded | Cancelled | Rejected
  late TabController _orderTab;

  static const _sections = ['Orders', 'Positions', 'Holdings', 'Portfolio'];
  static const _orderTabs = [
    'Open Orders', 'Traded Orders', 'Cancelled Orders', 'Rejected Orders'
  ];

  @override
  void initState() {
    super.initState();
    _sectionTab = TabController(length: _sections.length, vsync: this);
    _orderTab   = TabController(length: _orderTabs.length, vsync: this);
    _sectionTab.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final trading = context.read<TradingModeProvider>();
      final mode    = trading.mode;
      // Merge any locally-placed orders first so they show while API loads
      context.read<OrdersProvider>().mergeLocalOrders(trading.localOrdersAsOrders);
      context.read<OrdersProvider>().fetch(mode);
      context.read<PortfolioProvider>().fetch(mode);
    });
  }

  @override
  void dispose() {
    _sectionTab.dispose();
    _orderTab.dispose();
    super.dispose();
  }

  bool get _onOrders => _sectionTab.index == 0;

  @override
  Widget build(BuildContext context) {
    final ext  = context.appColors;

    return Scaffold(
      backgroundColor: ext.bg,
      appBar: AppBar(
        backgroundColor: ext.surface,
        surfaceTintColor: Colors.transparent,
        titleSpacing: 0,
        title: TabBar(
          controller: _sectionTab,
          indicatorColor: AppColors.blue,
          labelColor: AppColors.blue,
          unselectedLabelColor: ext.textSecondary,
          labelStyle: const TextStyle(
              fontSize: 13, fontWeight: FontWeight.w700),
          unselectedLabelStyle: const TextStyle(
              fontSize: 13, fontWeight: FontWeight.w500),
          tabs: _sections
              .map((s) => Tab(text: s, height: 48))
              .toList(),
        ),
        bottom: PreferredSize(
          preferredSize: Size.fromHeight(_onOrders ? 40 : 0),
          child: _onOrders
              ? Container(
                  color: ext.surface,
                  child: TabBar(
                    controller: _orderTab,
                    isScrollable: true,
                    tabAlignment: TabAlignment.start,
                    indicatorColor: AppColors.blue,
                    labelColor: AppColors.blue,
                    unselectedLabelColor: ext.textMuted,
                    labelStyle: const TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600),
                    unselectedLabelStyle: const TextStyle(fontSize: 12),
                    dividerColor: ext.border,
                    tabs: _orderTabs
                        .map((t) => Tab(text: t, height: 36))
                        .toList(),
                  ),
                )
              : const SizedBox.shrink(),
        ),
      ),
      body: Column(
        children: [
          Expanded(
            child: TabBarView(
              controller: _sectionTab,
              children: [
                _OrdersSectionBody(orderTab: _orderTab),
                const _PositionsTab(),
                const _HoldingsTab(),
                const _PortfolioTab(),
              ],
            ),
          ),
        ],
      ),
      floatingActionButton: _onOrders
          ? FloatingActionButton.extended(
              onPressed: () {},
              backgroundColor: AppColors.blue,
              elevation: 4,
              icon: const Icon(Icons.add, color: Colors.white, size: 20),
              label: const Text('New Order',
                  style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 14)),
            )
          : null,
    );
  }
}

// ── Orders section body ────────────────────────────────────────────────────────

class _OrdersSectionBody extends StatelessWidget {
  final TabController orderTab;
  const _OrdersSectionBody({required this.orderTab});

  @override
  Widget build(BuildContext context) {
    final orders = context.watch<OrdersProvider>();
    final open      = orders.orders.where((o) =>
        o.status == OrderStatus.open || o.status == OrderStatus.pending).toList();
    final traded    = orders.orders.where((o) =>
        o.status == OrderStatus.complete).toList();
    final cancelled = orders.orders.where((o) =>
        o.status == OrderStatus.cancelled).toList();
    final rejected  = orders.orders.where((o) =>
        o.status == OrderStatus.rejected).toList();

    return TabBarView(
      controller: orderTab,
      children: [
        _OrdersListTab(orders: open,      loading: orders.loading,
            emptyMsg: 'No open orders',      emptySubMsg: 'Your active orders will appear here',      showFooter: true),
        _OrdersListTab(orders: traded,    loading: orders.loading,
            emptyMsg: 'No traded orders',    emptySubMsg: 'Completed orders will appear here'),
        _OrdersListTab(orders: cancelled, loading: orders.loading,
            emptyMsg: 'No cancelled orders', emptySubMsg: 'Cancelled orders will appear here'),
        _OrdersListTab(orders: rejected,  loading: orders.loading,
            emptyMsg: 'No rejected orders',  emptySubMsg: 'Rejected orders will appear here'),
      ],
    );
  }
}

// ── Order list tab (with search + filter + cards) ──────────────────────────────

class _OrdersListTab extends StatefulWidget {
  final List<Order> orders;
  final bool loading;
  final String emptyMsg;
  final String emptySubMsg;
  final bool showFooter;

  const _OrdersListTab({
    required this.orders,
    required this.loading,
    required this.emptyMsg,
    required this.emptySubMsg,
    this.showFooter = false,
  });

  @override
  State<_OrdersListTab> createState() => _OrdersListTabState();
}

class _OrdersListTabState extends State<_OrdersListTab> {
  final _ctrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  List<Order> get _filtered {
    if (_query.isEmpty) return widget.orders;
    final q = _query.toUpperCase();
    return widget.orders
        .where((o) => o.symbol.toUpperCase().contains(q))
        .toList();
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    if (widget.loading) {
      return const Center(
          child: CircularProgressIndicator(color: AppColors.blue, strokeWidth: 2));
    }
    final shown = _filtered;
    return Column(
      children: [
        // Filter bar
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: Row(
            children: [
              Expanded(
                child: SizedBox(
                  height: 38,
                  child: TextField(
                    controller: _ctrl,
                    style: TextStyle(color: ext.textPrimary, fontSize: 13),
                    decoration: InputDecoration(
                      hintText: 'Search orders',
                      hintStyle: TextStyle(color: ext.textMuted, fontSize: 13),
                      prefixIcon: Icon(Icons.search, color: ext.textMuted, size: 18),
                      filled: true,
                      fillColor: ext.card,
                      contentPadding: EdgeInsets.zero,
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: ext.border)),
                      enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: BorderSide(color: ext.border)),
                      focusedBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(8),
                          borderSide: const BorderSide(color: AppColors.blue)),
                    ),
                    onChanged: (v) => setState(() => _query = v.trim()),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              _FChip(label: 'All (${widget.orders.length})',
                  icon: Icons.keyboard_arrow_down_rounded),
              const SizedBox(width: 6),
              _FChip(label: 'Filter', icon: Icons.filter_list_rounded),
            ],
          ),
        ),
        // List
        Expanded(
          child: shown.isEmpty
              ? _EmptyOrders(
                  message: _query.isEmpty ? widget.emptyMsg : 'No results for "$_query"',
                  subMessage: _query.isEmpty ? widget.emptySubMsg : 'Try a different symbol',
                )
              : ListView.separated(
                  padding: const EdgeInsets.fromLTRB(12, 4, 12, 100),
                  itemCount: shown.length + 1,
                  separatorBuilder: (_, i) => i < shown.length - 1
                      ? const SizedBox(height: 8)
                      : const SizedBox.shrink(),
                  itemBuilder: (_, i) => i == shown.length
                      ? const _TrustBadge()
                      : _OrderCard(order: shown[i]),
                ),
        ),
        if (widget.showFooter && widget.orders.isNotEmpty)
          _OrdersFooter(orders: widget.orders),
      ],
    );
  }
}

// ── Order card ─────────────────────────────────────────────────────────────────

class _OrderCard extends StatelessWidget {
  final Order order;
  const _OrderCard({required this.order});

  static final _fmt = NumberFormat('#,##,##0.00');

  String get _typeLabel {
    switch (order.orderType) {
      case OrderType.limit:  return 'LIMIT';
      case OrderType.sl:     return 'SL';
      case OrderType.slm:    return 'SL-M';
      case OrderType.market: return 'MARKET';
    }
  }

  String get _productLabel {
    switch (order.productType) {
      case ProductType.mis:  return 'INTRADAY';
      case ProductType.cnc:  return 'DELIVERY';
      case ProductType.nrml: return 'NORMAL';
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext      = context.appColors;
    final isBuy    = order.side == OrderSide.buy;
    final isFull   = order.filledQty == order.quantity && order.quantity > 0;
    final isPartial = order.filledQty > 0 && !isFull;
    final qtyColor = (isFull || isPartial) ? AppColors.green : AppColors.red;

    return Container(
      decoration: BoxDecoration(
        color: ext.card,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ext.border),
      ),
      padding: const EdgeInsets.fromLTRB(14, 12, 10, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: Symbol + exchange + qty/total + ⋮
          Row(children: [
            Text(order.symbol,
                style: TextStyle(color: ext.textPrimary,
                    fontSize: 15, fontWeight: FontWeight.w800)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
              decoration: BoxDecoration(
                  color: ext.bg, borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: ext.border)),
              child: Text(order.exchange,
                  style: TextStyle(color: ext.textMuted, fontSize: 9,
                      fontWeight: FontWeight.w700)),
            ),
            const Spacer(),
            Text('${order.filledQty} / ${order.quantity}',
                style: TextStyle(color: qtyColor, fontSize: 14,
                    fontWeight: FontWeight.w700)),
            const SizedBox(width: 4),
            Icon(Icons.more_vert_rounded, color: ext.textMuted, size: 18),
          ]),
          const SizedBox(height: 8),
          // Row 2: Side + type + product + price
          Row(children: [
            _Tag(label: isBuy ? 'BUY' : 'SELL',
                textColor: Colors.white,
                bgColor: isBuy ? const Color(0xFF1A7A45) : const Color(0xFF8B1A1A)),
            const SizedBox(width: 6),
            _Tag(label: _typeLabel, textColor: ext.textSecondary,
                bgColor: ext.bg, bordered: true),
            const SizedBox(width: 6),
            _Tag(label: _productLabel, textColor: ext.textSecondary,
                bgColor: ext.bg, bordered: true),
            const Spacer(),
            Text('₹${_fmt.format(order.price)}',
                style: TextStyle(color: ext.textPrimary, fontSize: 15,
                    fontWeight: FontWeight.w700)),
          ]),
          const SizedBox(height: 6),
          // Row 3: LTP + Order ID
          Row(children: [
            Text('LTP ', style: TextStyle(color: ext.textMuted, fontSize: 11)),
            Text('₹${_fmt.format(order.avgPrice > 0 ? order.avgPrice : order.price)}',
                style: TextStyle(color: ext.textSecondary, fontSize: 11,
                    fontWeight: FontWeight.w600)),
            const Spacer(),
            Text('Order ID  ',
                style: TextStyle(color: ext.textMuted, fontSize: 11)),
            Text(order.id.length > 14 ? order.id.substring(0, 14) : order.id,
                style: TextStyle(color: ext.textSecondary, fontSize: 11,
                    fontWeight: FontWeight.w500)),
          ]),
        ],
      ),
    );
  }
}

// ── Small widgets ──────────────────────────────────────────────────────────────

class _Tag extends StatelessWidget {
  final String label;
  final Color textColor;
  final Color bgColor;
  final bool bordered;
  const _Tag({required this.label, required this.textColor,
      required this.bgColor, this.bordered = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: bgColor,
        borderRadius: BorderRadius.circular(4),
        border: bordered
            ? Border.all(color: context.appColors.border, width: 0.8) : null,
      ),
      child: Text(label,
          style: TextStyle(color: textColor, fontSize: 10,
              fontWeight: FontWeight.w700)),
    );
  }
}

class _FChip extends StatelessWidget {
  final String label;
  final IconData icon;
  const _FChip({required this.label, required this.icon});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
          color: ext.card,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: ext.border)),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Text(label,
            style: TextStyle(color: ext.textSecondary, fontSize: 11,
                fontWeight: FontWeight.w600)),
        const SizedBox(width: 2),
        Icon(icon, color: ext.textMuted, size: 14),
      ]),
    );
  }
}

class _TrustBadge extends StatelessWidget {
  const _TrustBadge();

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 16),
      child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.lock_outline_rounded, size: 13, color: ext.textMuted),
        const SizedBox(width: 5),
        Text('Secure · Encrypted · Exchange Verified',
            style: TextStyle(color: ext.textMuted, fontSize: 11,
                fontWeight: FontWeight.w500)),
      ]),
    );
  }
}

class _EmptyOrders extends StatelessWidget {
  final String message;
  final String subMessage;
  const _EmptyOrders({required this.message, required this.subMessage});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Center(
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Container(
          width: 72, height: 72,
          decoration: BoxDecoration(
              color: AppColors.blueDim,
              borderRadius: BorderRadius.circular(20)),
          child: const Icon(Icons.receipt_long_outlined,
              color: AppColors.blue, size: 34),
        ),
        const SizedBox(height: 16),
        Text(message,
            style: context.isDark
                ? TextStyle(color: ext.textPrimary, fontSize: 16,
                    fontWeight: FontWeight.w700)
                : GoogleFonts.lora(color: ext.textPrimary, fontSize: 16,
                    fontWeight: FontWeight.w700)),
        const SizedBox(height: 6),
        Text(subMessage,
            style: TextStyle(color: ext.textMuted, fontSize: 13)),
      ]),
    );
  }
}

// ── Footer stats ───────────────────────────────────────────────────────────────

class _OrdersFooter extends StatelessWidget {
  final List<Order> orders;
  const _OrdersFooter({required this.orders});

  @override
  Widget build(BuildContext context) {
    final ext        = context.appColors;
    final fmt        = NumberFormat('#,##,##0.00');
    final totalQty   = orders.fold(0, (s, o) => s + o.quantity);
    final totalValue = orders.fold(0.0, (s, o) => s + o.price * o.quantity);

    return Container(
      decoration: BoxDecoration(
          color: ext.surface,
          border: Border(top: BorderSide(color: ext.border))),
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 16),
      child: Row(children: [
        _FooterCell(label: 'Total Open Orders', value: '${orders.length}'),
        VerticalDivider(color: ext.border, width: 1, thickness: 1,
            indent: 4, endIndent: 4),
        _FooterCell(label: 'Total Quantity', value: '$totalQty'),
        VerticalDivider(color: ext.border, width: 1, thickness: 1,
            indent: 4, endIndent: 4),
        _FooterCell(label: 'Total Value', value: '₹${fmt.format(totalValue)}'),
      ]),
    );
  }
}

class _FooterCell extends StatelessWidget {
  final String label;
  final String value;
  const _FooterCell({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Expanded(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Text(label,
            style: TextStyle(color: ext.textMuted, fontSize: 10,
                fontWeight: FontWeight.w500),
            textAlign: TextAlign.center),
        const SizedBox(height: 3),
        Text(value,
            style: TextStyle(color: ext.textPrimary, fontSize: 13,
                fontWeight: FontWeight.w800),
            textAlign: TextAlign.center),
      ]),
    );
  }
}

// ── Positions tab ──────────────────────────────────────────────────────────────

class _PositionsTab extends StatelessWidget {
  const _PositionsTab();

  @override
  Widget build(BuildContext context) {
    final ext  = context.appColors;
    final portfolio = context.watch<PortfolioProvider>();

    if (portfolio.loading) {
      return const Center(child: CircularProgressIndicator(
          color: AppColors.blue, strokeWidth: 2));
    }

    final entries = portfolio.holdings;
    if (entries.isEmpty) {
      return _EmptyOrders(
        message: 'No open positions',
        subMessage: 'Buy or sell from watchlist to build positions',
      );
    }
    return ListView.separated(
      padding: const EdgeInsets.fromLTRB(12, 8, 12, 24),
      itemCount: entries.length,
      separatorBuilder: (_, __) =>
          const SizedBox(height: 8),
      itemBuilder: (_, i) {
        final e      = entries[i];
        final isLong = e.quantity > 0;
        return Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
              color: ext.card,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: ext.border)),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(
                  horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                  color: isLong ? AppColors.greenDim : AppColors.redDim,
                  borderRadius: BorderRadius.circular(6)),
              child: Text(isLong ? 'LONG' : 'SHORT',
                  style: TextStyle(
                      color: isLong ? AppColors.green : AppColors.red,
                      fontSize: 10, fontWeight: FontWeight.w700)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(e.symbol,
                        style: TextStyle(color: ext.textPrimary,
                            fontSize: 14, fontWeight: FontWeight.w700)),
                    Text('${e.exchange}  ·  Equity',
                        style: TextStyle(
                            color: ext.textMuted, fontSize: 11)),
                  ]),
            ),
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Text('Qty: ${e.quantity.abs()}',
                  style: TextStyle(color: ext.textPrimary,
                      fontSize: 14, fontWeight: FontWeight.w600)),
            ]),
          ]),
        );
      },
    );
  }
}

// ── Holdings tab ───────────────────────────────────────────────────────────────

class _HoldingsTab extends StatelessWidget {
  const _HoldingsTab();

  @override
  Widget build(BuildContext context) {
    final ext       = context.appColors;
    final portfolio = context.watch<PortfolioProvider>();

    if (portfolio.loading) {
      return const Center(child: CircularProgressIndicator(
          color: AppColors.blue, strokeWidth: 2));
    }
    if (portfolio.holdings.isEmpty) {
      return _EmptyOrders(
        message: 'No holdings',
        subMessage: 'Your long-term holdings will appear here',
      );
    }

    final fmt           = NumberFormat('#,##,##0.00');
    final totalInvested = portfolio.totalInvested;
    final totalCurrent  = portfolio.totalCurrent;
    final totalPnl      = portfolio.totalPnl;
    final isPos         = totalPnl >= 0;

    return Column(children: [
      // Summary strip
      Container(
        color: ext.surface,
        padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 16),
        child: Row(children: [
          _FooterCell(label: 'Invested',
              value: '₹${fmt.format(totalInvested)}'),
          VerticalDivider(color: ext.border, width: 1, thickness: 1,
              indent: 4, endIndent: 4),
          _FooterCell(label: 'Current',
              value: '₹${fmt.format(totalCurrent)}'),
          VerticalDivider(color: ext.border, width: 1, thickness: 1,
              indent: 4, endIndent: 4),
          _FooterCell(
            label: 'P&L',
            value: '${isPos ? '+' : ''}₹${fmt.format(totalPnl.abs())}',
          ),
        ]),
      ),
      Divider(color: ext.border, height: 1),
      Expanded(
        child: ListView.separated(
          padding: const EdgeInsets.only(bottom: 24),
          itemCount: portfolio.holdings.length,
          separatorBuilder: (_, __) =>
              Divider(color: ext.border, height: 1, indent: 16),
          itemBuilder: (_, i) => HoldingRow(holding: portfolio.holdings[i]),
        ),
      ),
    ]);
  }
}

// ── Portfolio summary tab ──────────────────────────────────────────────────────

class _PortfolioTab extends StatelessWidget {
  const _PortfolioTab();

  @override
  Widget build(BuildContext context) {
    final ext       = context.appColors;
    final portfolio = context.watch<PortfolioProvider>();
    final mode      = context.watch<TradingModeProvider>();
    final fmt       = NumberFormat('#,##,##0.00');

    final totalVal = mode.isPaper ? mode.paperBalance : portfolio.totalCurrent;
    final totalPnl = mode.isPaper ? 0.0 : portfolio.totalPnl;
    final pnlPct   = mode.isPaper ? 0.0 : portfolio.totalPnlPct;
    final todayPnl = mode.isPaper ? 0.0 : portfolio.todayPnl;
    final isPos    = totalPnl >= 0;
    final pnlColor = isPos ? AppColors.green : AppColors.red;

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 24),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Value card
        Container(
          width: double.infinity,
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: LinearGradient(
              colors: mode.isPaper
                  ? [const Color(0xFF2D1A00), const Color(0xFF1A1000)]
                  : [const Color(0xFF0A1628), const Color(0xFF0D1B2E)],
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
            ),
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: ext.border),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Total Portfolio Value',
                style: context.isDark
                    ? TextStyle(color: ext.textSecondary, fontSize: 13)
                    : GoogleFonts.lora(color: ext.textSecondary, fontSize: 13)),
            const SizedBox(height: 4),
            Text('₹${fmt.format(totalVal)}',
                style: context.isDark
                    ? TextStyle(color: ext.textPrimary, fontSize: 28,
                        fontWeight: FontWeight.w800)
                    : GoogleFonts.lora(color: ext.textPrimary, fontSize: 28,
                        fontWeight: FontWeight.w800)),
            if (!mode.isPaper) ...[
              const SizedBox(height: 8),
              Wrap(spacing: 8, children: [
                _PnlPill(
                  label: '${isPos ? '+' : ''}₹${fmt.format(totalPnl.abs())} (${pnlPct.toStringAsFixed(2)}%)',
                  color: pnlColor,
                ),
                _PnlPill(
                  label: 'Today ${todayPnl >= 0 ? '+' : ''}₹${fmt.format(todayPnl.abs())}',
                  color: todayPnl >= 0 ? AppColors.green : AppColors.red,
                ),
              ]),
            ],
          ]),
        ),
        const SizedBox(height: 12),
        // Stat cards
        Row(children: [
          _StatCard(label: 'Invested',
              value: '₹${fmt.format(mode.isPaper ? AppConstants.paperBalance : portfolio.totalInvested)}'),
          const SizedBox(width: 10),
          _StatCard(
            label: "Today's P&L",
            value: mode.isPaper ? '–'
                : '${todayPnl >= 0 ? '+' : ''}₹${fmt.format(todayPnl.abs())}',
            valueColor: todayPnl >= 0 ? AppColors.green : AppColors.red,
          ),
          const SizedBox(width: 10),
          _StatCard(label: 'Holdings', value: '${portfolio.holdings.length}'),
        ]),
        const SizedBox(height: 16),
        Divider(color: ext.border),
        if (portfolio.holdings.isNotEmpty) ...[
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Row(children: [
              Text('Holdings',
                  style: context.isDark
                      ? TextStyle(color: ext.textPrimary, fontSize: 14,
                          fontWeight: FontWeight.w700)
                      : GoogleFonts.lora(color: ext.textPrimary, fontSize: 14,
                          fontWeight: FontWeight.w700)),
              const Spacer(),
              Text('${portfolio.holdings.length} stocks',
                  style: TextStyle(color: ext.textMuted, fontSize: 12)),
            ]),
          ),
          ...portfolio.holdings
              .take(5)
              .map((h) => HoldingRow(holding: h)),
          if (portfolio.holdings.length > 5)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12),
              child: Text(
                '+ ${portfolio.holdings.length - 5} more holdings',
                style: const TextStyle(color: AppColors.blue,
                    fontSize: 13, fontWeight: FontWeight.w600),
              ),
            ),
        ],
      ]),
    );
  }
}

class _PnlPill extends StatelessWidget {
  final String label;
  final Color color;
  const _PnlPill({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
          color: color.withValues(alpha: 0.15),
          borderRadius: BorderRadius.circular(8)),
      child: Text(label,
          style: TextStyle(color: color, fontSize: 12,
              fontWeight: FontWeight.w700)),
    );
  }
}

class _StatCard extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;
  const _StatCard({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
            color: ext.card,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: ext.border)),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label,
              style: TextStyle(color: ext.textMuted, fontSize: 11,
                  fontWeight: FontWeight.w500)),
          const SizedBox(height: 4),
          Text(value,
              style: TextStyle(color: valueColor ?? ext.textPrimary,
                  fontSize: 13, fontWeight: FontWeight.w700),
              maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      ),
    );
  }
}
