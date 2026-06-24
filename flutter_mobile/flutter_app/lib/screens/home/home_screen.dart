import 'dart:math';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/widgets.dart';
import '../chart/chart_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _chartRange = '1D';

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    await Future.wait([
      context.read<MarketProvider>().fetch(),
      context.read<PortfolioProvider>().fetch(
          context.read<TradingModeProvider>().mode),
    ]);
  }

  Future<void> _refresh() async {
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final auth      = context.watch<AuthProvider>();
    final market    = context.watch<MarketProvider>();
    final portfolio = context.watch<PortfolioProvider>();
    final trading   = context.watch<TradingModeProvider>();

    final firstName = auth.user?.name.split(' ').first ?? 'Trader';
    final totalPnl  = trading.isPaper ? 0.0 : portfolio.totalPnl;
    final todayPnl  = trading.isPaper ? 0.0 : portfolio.todayPnl;
    final totalVal  = trading.isPaper
        ? trading.paperBalance
        : portfolio.totalCurrent;

    return Scaffold(
      backgroundColor: ext.bg,
      body: RefreshIndicator(
        onRefresh: _refresh,
        color: AppColors.blue,
        backgroundColor: ext.surface,
        child: CustomScrollView(
          slivers: [
            // ── App bar ──────────────────────────────────────────────────────
            SliverAppBar(
              floating: true,
              snap: true,
              backgroundColor: ext.surface,
              surfaceTintColor: Colors.transparent,
              elevation: 0,
              leading: Padding(
                padding: const EdgeInsets.only(left: 12),
                child: Row(
                  children: [
                    Container(
                      width: 32,
                      height: 32,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppColors.teal, AppColors.green],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      alignment: Alignment.center,
                      child: const Text('AT',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 11,
                              fontWeight: FontWeight.w900)),
                    ),
                  ],
                ),
              ),
              title: Text.rich(TextSpan(children: [
                TextSpan(
                    text: 'Abhi',
                    style: TextStyle(
                        color: ext.textPrimary,
                        fontSize: 18,
                        fontWeight: FontWeight.w900)),
                const TextSpan(
                    text: 'Trade',
                    style: TextStyle(
                        color: AppColors.teal,
                        fontSize: 18,
                        fontWeight: FontWeight.w900)),
              ])),
              actions: [
                IconButton(
                  icon: Icon(Icons.search, color: ext.textSecondary),
                  onPressed: () {},
                ),
                IconButton(
                  icon: Stack(
                    clipBehavior: Clip.none,
                    children: [
                      Icon(Icons.notifications_outlined,
                          color: ext.textSecondary),
                      Positioned(
                        top: -2,
                        right: -2,
                        child: Container(
                          width: 8,
                          height: 8,
                          decoration: const BoxDecoration(
                              color: AppColors.red,
                              shape: BoxShape.circle),
                        ),
                      ),
                    ],
                  ),
                  onPressed: () {},
                ),
                Padding(
                  padding: const EdgeInsets.only(right: 12),
                  child: CircleAvatar(
                    radius: 17,
                    backgroundColor: AppColors.blueDim,
                    child: Text(
                      auth.user?.initials ?? 'T',
                      style: const TextStyle(
                          color: AppColors.teal,
                          fontSize: 13,
                          fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              ],
              bottom: PreferredSize(
                preferredSize: const Size.fromHeight(1),
                child: Divider(color: ext.border, height: 1),
              ),
            ),

            // ── Market ticker row ─────────────────────────────────────────────
            SliverToBoxAdapter(
              child: _MarketTickerRow(indices: market.indices, loading: market.loading),
            ),

            // ── Paper mode banner ─────────────────────────────────────────────
            if (trading.isPaper)
              SliverToBoxAdapter(
                child: PaperModeBanner(balance: trading.paperBalance),
              ),

            // ── Greeting ──────────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                child: Row(
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _greeting(firstName),
                          style: TextStyle(
                              color: ext.textPrimary,
                              fontSize: 17,
                              fontWeight: FontWeight.w700),
                        ),
                        Text(
                          _marketStatusLabel(),
                          style: TextStyle(
                              color: ext.textMuted,
                              fontSize: 12),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // ── Portfolio summary card ─────────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
                child: portfolio.loading
                    ? _PortfolioCardSkeleton()
                    : _PortfolioCard(
                        totalValue: totalVal,
                        todayPnl: todayPnl,
                        totalPnl: totalPnl,
                        chartRange: _chartRange,
                        onRangeChange: (r) => setState(() => _chartRange = r),
                        isPaper: trading.isPaper,
                      ),
              ),
            ),

            // ── Quick actions ─────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 0),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    QuickActionBtn(
                      icon: Icons.account_balance_wallet_outlined,
                      label: 'Funds\nAdd Money',
                      color: AppColors.green,
                    ),
                    QuickActionBtn(
                      icon: Icons.auto_graph_outlined,
                      label: 'IPO\nApply Now',
                      color: AppColors.amber,
                    ),
                    QuickActionBtn(
                      icon: Icons.repeat_outlined,
                      label: 'SIP\nStart SIP',
                      color: AppColors.blue,
                    ),
                    QuickActionBtn(
                      icon: Icons.people_outline,
                      label: 'Refer\n& Earn',
                      color: AppColors.teal,
                    ),
                  ],
                ),
              ),
            ),

            // ── Market indices ─────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: SectionHeader(
                title: 'Market Indices',
                action: 'VIEW ALL',
                onAction: () {},
              ),
            ),
            SliverToBoxAdapter(
              child: SizedBox(
                height: 92,
                child: market.loading
                    ? const Center(
                        child: CircularProgressIndicator(
                            color: AppColors.blue, strokeWidth: 2))
                    : ListView.separated(
                        padding: const EdgeInsets.symmetric(horizontal: 16),
                        scrollDirection: Axis.horizontal,
                        itemCount: market.indices.length,
                        separatorBuilder: (_, __) =>
                            const SizedBox(width: 10),
                        itemBuilder: (_, i) {
                          final idx = market.indices[i];
                          return GestureDetector(
                            onTap: () => Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) => ChartScreen(
                                  symbol: idx.symbol,
                                  exchange: 'NSE',
                                  token: _indexToken(idx.symbol),
                                  name: idx.symbol,
                                ),
                              ),
                            ),
                            child: IndexChip(index: idx),
                          );
                        },
                      ),
              ),
            ),

            // ── Top gainers ────────────────────────────────────────────────────
            SliverToBoxAdapter(
              child: SectionHeader(
                title: 'Top Gainers',
                action: 'NIFTY 50 ›',
                onAction: () {},
              ),
            ),
            SliverList(
              delegate: SliverChildBuilderDelegate(
                (_, i) {
                  if (market.loading) {
                    return const Padding(
                      padding:
                          EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: _ShimmerRow(),
                    );
                  }
                  if (i >= market.gainers.length) return null;
                  final gainer = market.gainers[i];
                  return Column(
                    children: [
                      InkWell(
                        onTap: () => Navigator.push(
                          context,
                          MaterialPageRoute(
                            builder: (_) => ChartScreen(
                              symbol: gainer.symbol,
                              exchange: gainer.exchange,
                              token: gainer.symbol,
                              name: gainer.tradingSymbol,
                            ),
                          ),
                        ),
                        child: GainerLoserRow(item: gainer),
                      ),
                      if (i < market.gainers.length - 1)
                        Divider(
                            indent: 16,
                            endIndent: 16,
                            color: ext.border,
                            height: 1),
                    ],
                  );
                },
                childCount: market.loading ? 3 : market.gainers.length,
              ),
            ),

            // ── Top losers ─────────────────────────────────────────────────────
            if (!market.loading && market.losers.isNotEmpty) ...[
              SliverToBoxAdapter(
                child: SectionHeader(
                  title: 'Top Losers',
                  action: 'NIFTY 50 ›',
                  onAction: () {},
                ),
              ),
              SliverList(
                delegate: SliverChildBuilderDelegate(
                  (_, i) {
                    if (i >= market.losers.length) return null;
                    final loser = market.losers[i];
                    return Column(
                      children: [
                        InkWell(
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (_) => ChartScreen(
                                symbol: loser.symbol,
                                exchange: loser.exchange,
                                token: loser.symbol,
                                name: loser.tradingSymbol,
                              ),
                            ),
                          ),
                          child: GainerLoserRow(item: loser),
                        ),
                        if (i < market.losers.length - 1)
                          Divider(
                              indent: 16,
                              endIndent: 16,
                              color: ext.border,
                              height: 1),
                      ],
                    );
                  },
                  childCount: market.losers.length,
                ),
              ),
            ],

            const SliverToBoxAdapter(child: SizedBox(height: 100)),
          ],
        ),
      ),
    );
  }

  String _greeting(String name) {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning, $name';
    if (h < 17) return 'Good afternoon, $name';
    return 'Good evening, $name';
  }

  String _marketStatusLabel() {
    final now = DateTime.now();
    final h = now.hour;
    final m = now.minute;
    final mins = h * 60 + m;
    // IST market hours: 9:15 to 15:30
    if (mins >= 555 && mins < 930) {
      return 'Market is OPEN  •  Live prices';
    } else if (mins >= 540 && mins < 555) {
      return 'Pre-market session';
    } else {
      return 'Market is closed  •  As of last close';
    }
  }

  /// Returns a known Religare-compatible token for index symbols
  String _indexToken(String symbol) {
    switch (symbol.toUpperCase()) {
      case 'NIFTY 50':
      case 'NIFTY50':
      case 'NIFTY':
        return '99926000';
      case 'SENSEX':
        return '99919000';
      case 'BANKNIFTY':
      case 'NIFTY BANK':
        return '99926009';
      case 'FINNIFTY':
        return '99926037';
      default:
        return symbol;
    }
  }
}

// ── Market Ticker Row ─────────────────────────────────────────────────────────
class _MarketTickerRow extends StatelessWidget {
  final List<dynamic> indices;
  final bool loading;

  const _MarketTickerRow({required this.indices, required this.loading});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;

    return Container(
      height: 36,
      color: ext.surface,
      child: loading
          ? Row(
              children: List.generate(
                3,
                (i) => Expanded(
                  child: Container(
                    margin: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 10),
                    decoration: BoxDecoration(
                      color: ext.border,
                      borderRadius: BorderRadius.circular(4),
                    ),
                  ),
                ),
              ),
            )
          : Row(
              children: indices
                  .take(3)
                  .map((idx) {
                    final color =
                        idx.isPositive ? AppColors.green : AppColors.red;
                    return Expanded(
                      child: Container(
                        padding:
                            const EdgeInsets.symmetric(horizontal: 10),
                        decoration: BoxDecoration(
                          border: Border(
                            right: BorderSide(
                                color: ext.border, width: 0.5),
                          ),
                        ),
                        child: Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              _shortName(idx.symbol),
                              style: TextStyle(
                                color: ext.textMuted,
                                fontSize: 11,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            Row(
                              children: [
                                Text(
                                  NumberFormat('#,##,##0.00')
                                      .format(idx.ltp),
                                  style: TextStyle(
                                    color: ext.textPrimary,
                                    fontSize: 11,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                const SizedBox(width: 4),
                                Icon(
                                  idx.isPositive
                                      ? Icons.arrow_drop_up
                                      : Icons.arrow_drop_down,
                                  color: color,
                                  size: 14,
                                ),
                                Text(
                                  '${fmtChange(idx.changePct)}%',
                                  style: TextStyle(
                                    color: color,
                                    fontSize: 10,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  })
                  .toList(),
            ),
    );
  }

  String _shortName(String symbol) {
    if (symbol.contains('NIFTY 50') || symbol == 'NIFTY') return 'NIFTY';
    if (symbol.contains('SENSEX')) return 'SENSEX';
    if (symbol.contains('BANK')) return 'BANKNIFTY';
    if (symbol.contains('FIN')) return 'FINNIFTY';
    return symbol.length > 8 ? symbol.substring(0, 8) : symbol;
  }
}

// ── Portfolio Card Skeleton ────────────────────────────────────────────────────
class _PortfolioCardSkeleton extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ext.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ext.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Bone(width: 140, height: 12, ext: ext),
          const SizedBox(height: 10),
          _Bone(width: 200, height: 28, ext: ext),
          const SizedBox(height: 8),
          _Bone(width: 120, height: 14, ext: ext),
          const SizedBox(height: 16),
          _Bone(width: double.infinity, height: 80, ext: ext),
          const SizedBox(height: 12),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(
              6,
              (_) => _Bone(width: 32, height: 20, ext: ext),
            ),
          ),
        ],
      ),
    );
  }
}

class _Bone extends StatelessWidget {
  final double width;
  final double height;
  final AppThemeExtension ext;
  const _Bone({required this.width, required this.height, required this.ext});

  @override
  Widget build(BuildContext context) => Container(
        width: width,
        height: height,
        decoration: BoxDecoration(
          color: ext.border,
          borderRadius: BorderRadius.circular(6),
        ),
      );
}

// ── Portfolio Card ─────────────────────────────────────────────────────────────
class _PortfolioCard extends StatelessWidget {
  final double totalValue;
  final double todayPnl;
  final double totalPnl;
  final String chartRange;
  final ValueChanged<String> onRangeChange;
  final bool isPaper;

  const _PortfolioCard({
    required this.totalValue,
    required this.todayPnl,
    required this.totalPnl,
    required this.chartRange,
    required this.onRangeChange,
    required this.isPaper,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final isPositive = totalPnl >= 0;
    final color = isPositive ? AppColors.green : AppColors.red;
    final fmt = NumberFormat('#,##,##0.00');
    const ranges = ['1D', '1W', '1M', '3M', '1Y', 'All'];

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ext.card,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ext.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(
                isPaper ? 'Paper Balance' : 'Total Portfolio Value',
                style: TextStyle(color: ext.textSecondary, fontSize: 13),
              ),
              const SizedBox(width: 6),
              Icon(Icons.visibility_outlined,
                  size: 16, color: ext.textMuted),
              const Spacer(),
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: ext.bg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: ext.border),
                ),
                child: Text(
                  'Today ›',
                  style: TextStyle(
                      color: ext.textSecondary,
                      fontSize: 12,
                      fontWeight: FontWeight.w500),
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '₹${fmt.format(totalValue)}',
            style: TextStyle(
                color: ext.textPrimary,
                fontSize: 28,
                fontWeight: FontWeight.w800),
          ),
          if (!isPaper) ...[
            const SizedBox(height: 4),
            Text(
              '${fmtChange(todayPnl > 0 ? todayPnl : totalPnl)} (${fmtChange(totalValue > 0 ? (totalPnl / totalValue) * 100 : 0)}%)',
              style: TextStyle(
                  color: color, fontSize: 14, fontWeight: FontWeight.w600),
            ),
          ],
          const SizedBox(height: 16),
          // Portfolio chart
          SizedBox(
            height: 80,
            child: _PortfolioChart(isPositive: isPositive),
          ),
          const SizedBox(height: 12),
          // Range selector
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: ranges.map((r) {
              final sel = chartRange == r;
              return GestureDetector(
                onTap: () => onRangeChange(r),
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 10, vertical: 4),
                  decoration: BoxDecoration(
                    color: sel ? AppColors.blueDim : Colors.transparent,
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(r,
                      style: TextStyle(
                        color: sel ? AppColors.blue : ext.textMuted,
                        fontSize: 12,
                        fontWeight:
                            sel ? FontWeight.w600 : FontWeight.w400,
                      )),
                ),
              );
            }).toList(),
          ),
        ],
      ),
    );
  }
}

// ── Portfolio sparkline area chart ─────────────────────────────────────────────
class _PortfolioChart extends StatelessWidget {
  final bool isPositive;
  const _PortfolioChart({required this.isPositive});

  List<FlSpot> _spots() {
    final rng = Random(42);
    var v = 100.0;
    return List.generate(30, (i) {
      v += (rng.nextDouble() - (isPositive ? 0.42 : 0.58)) * 2.5;
      return FlSpot(i.toDouble(), v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final color = isPositive ? AppColors.green : AppColors.red;
    final spots = _spots();

    return LineChart(
      LineChartData(
        gridData: const FlGridData(show: false),
        titlesData: const FlTitlesData(show: false),
        borderData: FlBorderData(show: false),
        lineTouchData: const LineTouchData(enabled: false),
        lineBarsData: [
          LineChartBarData(
            spots: spots,
            isCurved: true,
            curveSmoothness: 0.35,
            color: color,
            barWidth: 2,
            dotData: const FlDotData(show: false),
            belowBarData: BarAreaData(
              show: true,
              gradient: LinearGradient(
                colors: [
                  color.withOpacity(0.35),
                  color.withOpacity(0.0),
                ],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ShimmerRow extends StatelessWidget {
  const _ShimmerRow();

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Row(
      children: [
        Container(
            width: 38,
            height: 38,
            decoration: BoxDecoration(
                color: ext.border,
                borderRadius: BorderRadius.circular(10))),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Container(
                  height: 12,
                  width: 80,
                  decoration: BoxDecoration(
                      color: ext.border,
                      borderRadius: BorderRadius.circular(4))),
              const SizedBox(height: 6),
              Container(
                  height: 10,
                  width: 50,
                  decoration: BoxDecoration(
                      color: ext.border,
                      borderRadius: BorderRadius.circular(4))),
            ],
          ),
        ),
        Container(
            height: 28,
            width: 60,
            decoration: BoxDecoration(
                color: ext.border,
                borderRadius: BorderRadius.circular(4))),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Container(
                height: 12,
                width: 70,
                decoration: BoxDecoration(
                    color: ext.border,
                    borderRadius: BorderRadius.circular(4))),
            const SizedBox(height: 6),
            Container(
                height: 10,
                width: 45,
                decoration: BoxDecoration(
                    color: ext.border,
                    borderRadius: BorderRadius.circular(4))),
          ],
        ),
      ],
    );
  }
}
