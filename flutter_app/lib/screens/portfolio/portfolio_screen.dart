import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/widgets.dart';
import 'package:google_fonts/google_fonts.dart';

class PortfolioScreen extends StatefulWidget {
  const PortfolioScreen({super.key});

  @override
  State<PortfolioScreen> createState() => _PortfolioScreenState();
}

class _PortfolioScreenState extends State<PortfolioScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tab;
  static const _tabs = ['Holdings', 'P&L', 'Allocation'];

  @override
  void initState() {
    super.initState();
    _tab = TabController(length: _tabs.length, vsync: this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final mode = context.read<TradingModeProvider>().mode;
      context.read<PortfolioProvider>().fetch(mode);
    });
  }

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ext       = context.appColors;
    final portfolio = context.watch<PortfolioProvider>();
    final mode      = context.watch<TradingModeProvider>();

    final hasHoldings = portfolio.holdings.isNotEmpty;
    final totalVal = hasHoldings ? portfolio.totalCurrent : mode.paperBalance;
    final totalPnl = hasHoldings ? portfolio.totalPnl : 0.0;
    final pnlPct   = hasHoldings ? portfolio.totalPnlPct : 0.0;
    final todayPnl = hasHoldings ? portfolio.todayPnl : 0.0;
    final isPos    = totalPnl >= 0;
    final color    = isPos ? AppColors.green : AppColors.red;
    final fmt      = NumberFormat('#,##,##0.00');

    return Scaffold(
      backgroundColor: ext.bg,
      appBar: AppBar(
        backgroundColor: ext.surface,
        surfaceTintColor: Colors.transparent,
        title: Text('Portfolio',
            style: context.isDark
                ? TextStyle(
                    color: ext.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700)
                : GoogleFonts.lora(
                    color: ext.textPrimary,
                    fontSize: 18,
                    fontWeight: FontWeight.w700)),
        actions: [
          IconButton(
            icon: Icon(Icons.visibility_outlined, color: ext.textSecondary),
            onPressed: () {},
          ),
          IconButton(
            icon: Icon(Icons.refresh_outlined, color: ext.textSecondary),
            onPressed: () =>
                portfolio.fetch(context.read<TradingModeProvider>().mode),
          ),
        ],
        bottom: TabBar(
          controller: _tab,
          tabs: _tabs.map((t) => Tab(text: t)).toList(),
        ),
      ),
      body: Column(
        children: [
          // Summary card
          Container(
            padding: const EdgeInsets.all(16),
            color: ext.surface,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Total Portfolio Value',
                    style: context.isDark
                        ? TextStyle(color: ext.textSecondary, fontSize: 13)
                        : GoogleFonts.lora(color: ext.textSecondary, fontSize: 13)),
                const SizedBox(height: 4),
                Text('₹${fmt.format(totalVal)}',
                    style: context.isDark
                        ? TextStyle(
                            color: ext.textPrimary,
                            fontSize: 26,
                            fontWeight: FontWeight.w800)
                        : GoogleFonts.lora(
                            color: ext.textPrimary,
                            fontSize: 26,
                            fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Row(
                  children: [
                    _Pill(
                      label: 'Total: ${fmtChange(totalPnl)} (${fmtChange(pnlPct)}%)',
                      color: color,
                      dimColor: isPos
                          ? (context.isDark ? AppColors.greenDim : AppColors.greenDimLight)
                          : (context.isDark ? AppColors.redDim : AppColors.redDimLight),
                    ),
                    const SizedBox(width: 8),
                    _Pill(
                      label: "Today: ${fmtChange(todayPnl)}",
                      color: todayPnl >= 0 ? AppColors.green : AppColors.red,
                      dimColor: todayPnl >= 0
                          ? (context.isDark ? AppColors.greenDim : AppColors.greenDimLight)
                          : (context.isDark ? AppColors.redDim : AppColors.redDimLight),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    _StatBox(
                        label: 'Invested',
                        value: '₹${fmtCompact(hasHoldings ? portfolio.totalInvested : mode.paperBalance)}'),
                    const SizedBox(width: 12),
                    _StatBox(
                        label: "Today's P&L",
                        value: fmtChange(todayPnl),
                        valueColor: todayPnl >= 0 ? AppColors.green : AppColors.red),
                    const SizedBox(width: 12),
                    _StatBox(
                        label: 'Holdings',
                        value: '${portfolio.holdings.length}'),
                  ],
                ),
              ],
            ),
          ),
          Divider(color: ext.border, height: 1),
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                // Holdings tab
                portfolio.loading
                    ? const Center(
                        child: CircularProgressIndicator(
                            color: AppColors.blue, strokeWidth: 2))
                    : portfolio.holdings.isEmpty
                        ? _EmptyPortfolio()
                        : ListView.separated(
                            itemCount: portfolio.holdings.length,
                            separatorBuilder: (_, __) => Divider(
                                indent: 16,
                                endIndent: 16,
                                color: ext.border,
                                height: 1),
                            itemBuilder: (_, i) =>
                                HoldingRow(holding: portfolio.holdings[i]),
                          ),
                // P&L tab
                _PnLTab(holdings: portfolio.holdings),
                // Allocation tab
                _AllocationTab(holdings: portfolio.holdings),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  final String label;
  final Color color;
  final Color dimColor;

  const _Pill({required this.label, required this.color, required this.dimColor});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
        color: dimColor, borderRadius: BorderRadius.circular(6)),
    child: Text(label,
        style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600)),
  );
}

class _StatBox extends StatelessWidget {
  final String label;
  final String value;
  final Color? valueColor;

  const _StatBox({required this.label, required this.value, this.valueColor});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: ext.card,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: ext.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: context.isDark
                  ? TextStyle(color: ext.textMuted, fontSize: 11)
                  : GoogleFonts.lora(color: ext.textMuted, fontSize: 11),
            ),
            const SizedBox(height: 4),
            Text(value,
                style: TextStyle(
                    color: valueColor ?? ext.textPrimary,
                    fontSize: 13,
                    fontWeight: FontWeight.w700)),
          ],
        ),
      ),
    );
  }
}

class _PnLTab extends StatelessWidget {
  final List holdings;
  const _PnLTab({required this.holdings});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    if (holdings.isEmpty) return _EmptyPortfolio();

    final sorted = [...holdings]
      ..sort((a, b) => b.pnl.compareTo(a.pnl));

    return ListView.separated(
      itemCount: sorted.length,
      separatorBuilder: (_, __) =>
          Divider(indent: 16, endIndent: 16, color: ext.border, height: 1),
      itemBuilder: (_, i) {
        final h = sorted[i];
        final color = h.isProfit ? AppColors.green : AppColors.red;
        return Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(
            children: [
              Expanded(
                child: Text(h.symbol,
                    style: TextStyle(
                        color: ext.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700)),
              ),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  Text('${fmtChange(h.pnl)}',
                      style: TextStyle(
                          color: color,
                          fontSize: 14,
                          fontWeight: FontWeight.w700)),
                  Text('${fmtChange(h.pnlPct)}%',
                      style: TextStyle(color: color, fontSize: 12)),
                ],
              ),
            ],
          ),
        );
      },
    );
  }
}

class _AllocationTab extends StatelessWidget {
  final List holdings;
  const _AllocationTab({required this.holdings});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    if (holdings.isEmpty) return _EmptyPortfolio();

    final total =
        holdings.fold<double>(0, (s, h) => s + (h.currentValue as double));
    if (total == 0) return _EmptyPortfolio();

    // Group by sector
    final Map<String, double> sectors = {};
    for (final h in holdings) {
      sectors[h.sector] = (sectors[h.sector] ?? 0) + (h.currentValue as double);
    }
    final sections = sectors.entries.toList()
      ..sort((a, b) => b.value.compareTo(a.value));

    const colors = [
      AppColors.blue, AppColors.teal, AppColors.green, AppColors.amber,
      AppColors.red, Color(0xFF8B5CF6), Color(0xFFEC4899),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        SizedBox(
          height: 220,
          child: PieChart(
            PieChartData(
              sections: sections.asMap().entries.map((e) {
                final pct = e.value.value / total * 100;
                return PieChartSectionData(
                  value: e.value.value,
                  color: colors[e.key % colors.length],
                  radius: 80,
                  title: '${pct.toStringAsFixed(1)}%',
                  titleStyle: const TextStyle(
                      color: Colors.white, fontSize: 11, fontWeight: FontWeight.w700),
                );
              }).toList(),
              centerSpaceRadius: 48,
              sectionsSpace: 2,
            ),
          ),
        ),
        const SizedBox(height: 24),
        ...sections.asMap().entries.map((e) {
          final pct = e.value.value / total * 100;
          final color = colors[e.key % colors.length];
          return Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Row(
              children: [
                Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                        color: color, borderRadius: BorderRadius.circular(3))),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(e.value.key,
                      style: TextStyle(
                          color: ext.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w500)),
                ),
                Text('${pct.toStringAsFixed(1)}%',
                    style: TextStyle(
                        color: ext.textSecondary,
                        fontSize: 13,
                        fontWeight: FontWeight.w600)),
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _EmptyPortfolio extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(Icons.account_balance_wallet_outlined, size: 52, color: ext.textMuted),
          const SizedBox(height: 16),
          Text('No holdings yet',
              style: TextStyle(
                  color: ext.textSecondary,
                  fontSize: 16,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 8),
          Text('Buy stocks to start building your portfolio',
              style: TextStyle(color: ext.textMuted, fontSize: 13)),
        ],
      ),
    );
  }
}
