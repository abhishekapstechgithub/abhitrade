import 'dart:math';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../search/search_screen.dart';
import '../stock_chart/stock_chart_screen.dart';

// ── Paper palette (home screen) ───────────────────────────────────────────────
const _kBg         = Color(0xFFF5F0E4);
const _kCard       = Color(0xFFF2EBD8);
const _kCardAlt    = Color(0xFFEDE2CC);
const _kInk        = Color(0xFF2C2318);
const _kInkMid     = Color(0xFF5A4A38);
const _kInkFaded   = Color(0xFF8A7A68);
const _kBorder     = Color(0xFFC4B49A);
const _kGreen      = Color(0xFF2E7D32);
const _kRed        = Color(0xFFB23A3A);
const _kBlue       = Color(0xFF4A6B8A);
const _kAmberTape  = Color(0xFFF5D76E);
const _kBlueTape   = Color(0xFFADCDE8);
const _kGreenTint  = Color(0xFFE8F5E9);
const _kRedTint    = Color(0xFFFCECEC);

// ── Text style helpers ────────────────────────────────────────────────────────
TextStyle _playfair({double size = 14, FontWeight weight = FontWeight.w600,
    Color color = _kInk, FontStyle style = FontStyle.normal}) =>
    GoogleFonts.lora(fontSize: size, fontWeight: weight,
        color: color, fontStyle: style);

TextStyle _baskerville({double size = 14, FontWeight weight = FontWeight.w700,
    Color color = _kInk}) =>
    GoogleFonts.lora(fontSize: size, fontWeight: weight, color: color);

TextStyle _inter({double size = 13, FontWeight weight = FontWeight.w400,
    Color color = _kInkMid, FontStyle style = FontStyle.normal}) =>
    GoogleFonts.inter(fontSize: size, fontWeight: weight, color: color, fontStyle: style);

// ── Paper card decoration ─────────────────────────────────────────────────────
BoxDecoration _card({bool hero = false}) => BoxDecoration(
  color: _kCard,
  borderRadius: const BorderRadius.only(
    topLeft:     Radius.circular(3),
    topRight:    Radius.circular(11),
    bottomLeft:  Radius.circular(9),
    bottomRight: Radius.circular(3),
  ),
  boxShadow: [
    BoxShadow(
      color: const Color(0xFF5A4032).withValues(alpha: hero ? 0.20 : 0.13),
      blurRadius: hero ? 14 : 8,
      offset: Offset(hero ? 3 : 2, hero ? 5 : 3),
    ),
    BoxShadow(
      color: const Color(0xFF5A4032).withValues(alpha: 0.06),
      blurRadius: 2, offset: const Offset(0, 1),
    ),
  ],
  border: Border.all(color: _kBorder.withValues(alpha: 0.52), width: 0.8),
);

// ── Screen ────────────────────────────────────────────────────────────────────
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _load());
  }

  Future<void> _load() async {
    await Future.wait([
      context.read<MarketProvider>().fetch(),
      context.read<PortfolioProvider>().fetch(context.read<TradingModeProvider>().mode),
    ]);
  }

  @override
  Widget build(BuildContext context) {
    final auth      = context.watch<AuthProvider>();
    final market    = context.watch<MarketProvider>();
    final portfolio = context.watch<PortfolioProvider>();
    final trading   = context.watch<TradingModeProvider>();

    final totalVal = trading.isPaper ? trading.paperBalance : portfolio.totalCurrent;
    final totalPnl = trading.isPaper ? 0.0 : portfolio.totalPnl;
    final todayPnl = trading.isPaper ? 0.0 : portfolio.todayPnl;
    final invested = trading.isPaper ? trading.paperBalance : portfolio.totalInvested;

    return Scaffold(
      backgroundColor: _kBg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          color: _kGreen,
          backgroundColor: _kCard,
          child: CustomScrollView(
            slivers: [
              SliverToBoxAdapter(child: _PaperSearchHeader(auth: auth)),
              SliverToBoxAdapter(
                  child: _PaperIndexCardsRow(
                      indices: market.indices, loading: market.loading)),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: portfolio.loading
                      ? const _PaperSkeleton()
                      : _PaperPortfolioCard(
                          totalValue: totalVal, todayPnl: todayPnl,
                          totalPnl: totalPnl, invested: invested,
                          isPaper: trading.isPaper),
                ),
              ),
              SliverToBoxAdapter(
                  child: _PaperSectionHeader(
                      title: 'AI Trade Opportunities', onViewAll: () {})),
              const SliverToBoxAdapter(child: _PaperAIOpportunities()),
              SliverToBoxAdapter(
                  child: _PaperSectionHeader(
                      title: 'Market Breadth', onViewAll: () {})),
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 0),
                  child: _PaperMarketBreadth(breadth: market.breadth),
                ),
              ),
              const SliverToBoxAdapter(child: SizedBox(height: 100)),
            ],
          ),
        ),
      ),
    );
  }
}

// ── Search Header ─────────────────────────────────────────────────────────────
class _PaperSearchHeader extends StatelessWidget {
  final AuthProvider auth;
  const _PaperSearchHeader({required this.auth});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
      child: Row(children: [
        // Paper search strip
        Expanded(
          child: GestureDetector(
            onTap: () => SearchScreen.show(context),
            child: Container(
              height: 44,
              decoration: BoxDecoration(
                color: _kCard,
                borderRadius: const BorderRadius.only(
                  topLeft: Radius.circular(3), topRight: Radius.circular(9),
                  bottomLeft: Radius.circular(7), bottomRight: Radius.circular(2),
                ),
                border: Border.all(color: _kBorder, width: 1.1),
                boxShadow: [
                  BoxShadow(
                    color: const Color(0xFF5A4032).withValues(alpha: 0.10),
                    blurRadius: 4, offset: const Offset(1, 2),
                  ),
                ],
              ),
              child: Row(children: [
                const SizedBox(width: 12),
                const Icon(Icons.search_rounded, color: _kInkFaded, size: 18),
                const SizedBox(width: 8),
                Text('Search symbol, strategy…',
                    style: _inter(size: 13, color: _kInkFaded, style: FontStyle.italic)),
              ]),
            ),
          ),
        ),
        const SizedBox(width: 10),
        // Bell
        Stack(clipBehavior: Clip.none, children: [
          _PaperCircle(
            child: const Icon(Icons.notifications_outlined,
                color: _kInkMid, size: 20),
          ),
          Positioned(
            top: 5, right: 5,
            child: Container(
              width: 8, height: 8,
              decoration: BoxDecoration(
                color: _kRed, shape: BoxShape.circle,
                border: Border.all(color: _kCard, width: 1.2),
              ),
            ),
          ),
        ]),
        const SizedBox(width: 8),
        // Avatar
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            shape: BoxShape.circle, color: _kCardAlt,
            border: Border.all(color: _kBorder, width: 1.5),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF5A4032).withValues(alpha: 0.12),
                blurRadius: 4, offset: const Offset(1, 2),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Text(auth.user?.initials ?? 'A',
              style: _playfair(size: 14, weight: FontWeight.w800)),
        ),
      ]),
    );
  }
}

class _PaperCircle extends StatelessWidget {
  final Widget child;
  const _PaperCircle({required this.child});
  @override
  Widget build(BuildContext context) => Container(
    width: 40, height: 40,
    decoration: BoxDecoration(
      shape: BoxShape.circle, color: _kCard,
      border: Border.all(color: _kBorder, width: 1.1),
      boxShadow: [
        BoxShadow(
          color: const Color(0xFF5A4032).withValues(alpha: 0.10),
          blurRadius: 4, offset: const Offset(1, 2),
        ),
      ],
    ),
    child: Center(child: child),
  );
}

// ── Index Cards Row ───────────────────────────────────────────────────────────
class _PaperIndexCardsRow extends StatelessWidget {
  final List<dynamic> indices;
  final bool loading;
  const _PaperIndexCardsRow({required this.indices, required this.loading});

  static const _angles = [-0.007, 0.005, -0.004];

  @override
  Widget build(BuildContext context) {
    if (loading) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
        child: Row(children: List.generate(3, (i) => Expanded(
          child: Container(
            margin: EdgeInsets.only(right: i < 2 ? 10 : 0),
            height: 88,
            decoration: _card(),
          ),
        ))),
      );
    }

    final shown = indices.take(3).toList();
    final fmt   = NumberFormat('#,##,##0.00');
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 6, 16, 0),
      child: Row(children: List.generate(shown.length, (i) {
        final idx   = shown[i];
        final isPos = idx.isPositive as bool;
        final clr   = isPos ? _kGreen : _kRed;
        return Expanded(
          child: GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(
              builder: (_) => StockChartScreen(
                symbol: idx.symbol, exchange: 'NSE',
                token: _idxToken(idx.symbol), name: idx.symbol,
              ))),
            child: Transform.rotate(
              angle: _angles[i],
              child: Container(
                margin: EdgeInsets.only(right: i < shown.length - 1 ? 10 : 0),
                padding: const EdgeInsets.fromLTRB(10, 11, 10, 11),
                decoration: _card(),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(_shortName(idx.symbol),
                      style: _inter(size: 9.5, color: _kInkFaded,
                          weight: FontWeight.w500)),
                  const SizedBox(height: 5),
                  FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      idx.ltp == 0 ? '—' : fmt.format(idx.ltp),
                      style: _baskerville(size: 15, weight: FontWeight.w700),
                    ),
                  ),
                  const SizedBox(height: 3),
                  if (idx.ltp == 0)
                    Text('Closed',
                        style: _inter(size: 9, color: clr, weight: FontWeight.w600))
                  else
                    Row(children: [
                      Text(
                        '${isPos ? '▲' : '▼'} ${_fmtChange(idx.change)}',
                        style: _inter(size: 9, color: clr, weight: FontWeight.w600),
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(width: 4),
                      Text(
                        '(${_fmtPct(idx.changePct)}%)',
                        style: _inter(size: 9, color: clr, weight: FontWeight.w500),
                        overflow: TextOverflow.ellipsis,
                      ),
                    ]),
                ]),
              ),
            ),
          ),
        );
      })),
    );
  }

  String _shortName(String s) {
    if (s.contains('NIFTY 50') || s == 'NIFTY') return 'NIFTY 50';
    if (s.contains('SENSEX'))  return 'SENSEX';
    if (s.contains('BANK'))    return 'BANKNIFTY';
    if (s.contains('FIN'))     return 'FINNIFTY';
    return s.length > 9 ? s.substring(0, 9) : s;
  }

  String _fmtPct(dynamic v) {
    final d = (v as num).toDouble();
    return '${d >= 0 ? '+' : ''}${d.toStringAsFixed(2)}';
  }

  String _fmtChange(double v) {
    return '${v >= 0 ? '+' : ''}${v.toStringAsFixed(2)}';
  }

  String _idxToken(String s) {
    switch (s.toUpperCase()) {
      case 'NIFTY 50': case 'NIFTY50': case 'NIFTY': return '99926000';
      case 'SENSEX': return '99919000';
      case 'BANKNIFTY': case 'NIFTY BANK': return '99926009';
      case 'FINNIFTY': return '99926037';
      default: return s;
    }
  }
}

// ── Section Header ─────────────────────────────────────────────────────────────
class _PaperSectionHeader extends StatelessWidget {
  final String title;
  final VoidCallback onViewAll;
  const _PaperSectionHeader({required this.title, required this.onViewAll});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 22, 16, 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Row(children: [
            // Ink rule mark
            Container(
              width: 3, height: 18,
              decoration: BoxDecoration(
                color: _kInk.withValues(alpha: 0.35),
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(width: 9),
            Text(title, style: _playfair(size: 16, weight: FontWeight.w700)),
          ]),
          GestureDetector(
            onTap: onViewAll,
            child: Text('View All →',
                style: _inter(size: 12, color: _kBlue, weight: FontWeight.w600)),
          ),
        ],
      ),
    );
  }
}

// ── Portfolio Card ─────────────────────────────────────────────────────────────
class _PaperPortfolioCard extends StatelessWidget {
  final double totalValue, todayPnl, totalPnl, invested;
  final bool isPaper;
  const _PaperPortfolioCard({
    required this.totalValue, required this.todayPnl,
    required this.totalPnl,  required this.invested,
    required this.isPaper,
  });

  @override
  Widget build(BuildContext context) {
    final isPos  = totalPnl >= 0;
    final clr    = isPos ? _kGreen : _kRed;
    final bgBadge = isPos ? _kGreenTint : _kRedTint;
    final fmt    = NumberFormat('#,##,##0.00');
    final pnlPct = invested > 0 ? (totalPnl / invested) * 100 : 0.0;

    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
      decoration: _card(hero: true),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header row
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Portfolio Value',
              style: _inter(size: 11, color: _kInkMid,
                  weight: FontWeight.w500, style: FontStyle.italic)),
          GestureDetector(
            onTap: () {},
            child: Text('View Portfolio →',
                style: _inter(size: 11, color: _kBlue, weight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: 8),
        // Big value + sparkline row
        Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                alignment: Alignment.centerLeft,
                child: Text('₹${fmt.format(totalValue)}',
                    style: _playfair(size: 32, weight: FontWeight.w700,
                        style: FontStyle.italic)),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: bgBadge,
                    borderRadius: const BorderRadius.only(
                      topLeft: Radius.circular(2), topRight: Radius.circular(6),
                      bottomLeft: Radius.circular(5), bottomRight: Radius.circular(2),
                    ),
                    border: Border.all(color: clr.withValues(alpha: 0.28), width: 0.8),
                  ),
                  child: Text(
                    '${totalPnl >= 0 ? '+' : ''}₹${fmt.format(totalPnl.abs())} '
                    '(${pnlPct.abs().toStringAsFixed(2)}%)',
                    style: _inter(size: 11, color: clr, weight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 8),
                Text('Overall', style: _inter(size: 11, color: _kInkFaded)),
              ]),
            ],
          )),
          SizedBox(
            width: 100, height: 60,
            child: _HandDrawnSparkline(isPositive: isPos),
          ),
        ]),
        const SizedBox(height: 12),
        // Ink rule
        Container(height: 0.8,
            color: _kBorder.withValues(alpha: 0.55)),
        const SizedBox(height: 10),
        // Today / Invested row
        Row(children: [
          Text('Today  ', style: _inter(size: 11, color: _kInkFaded,
              style: FontStyle.italic)),
          Text(
            '${todayPnl >= 0 ? '+' : ''}₹${fmt.format(todayPnl.abs())}',
            style: _inter(size: 11,
                color: todayPnl >= 0 ? _kGreen : _kRed,
                weight: FontWeight.w600),
          ),
          const SizedBox(width: 18),
          Text('Invested  ', style: _inter(size: 11, color: _kInkFaded,
              style: FontStyle.italic)),
          Text('₹${fmt.format(invested)}',
              style: _inter(size: 11, color: _kInkMid, weight: FontWeight.w600)),
        ]),
      ]),
    );
  }
}

// Hand-drawn style sparkline ──────────────────────────────────────────────────
class _HandDrawnSparkline extends StatelessWidget {
  final bool isPositive;
  const _HandDrawnSparkline({required this.isPositive});

  List<FlSpot> _spots() {
    final rng = Random(42);
    var v = 100.0;
    return List.generate(22, (i) {
      v += (rng.nextDouble() - (isPositive ? 0.38 : 0.62)) * 3.8;
      return FlSpot(i.toDouble(), v);
    });
  }

  @override
  Widget build(BuildContext context) {
    final clr = isPositive ? _kGreen : _kRed;
    return LineChart(LineChartData(
      gridData: const FlGridData(show: false),
      titlesData: const FlTitlesData(show: false),
      borderData: FlBorderData(show: false),
      lineTouchData: const LineTouchData(enabled: false),
      lineBarsData: [
        LineChartBarData(
          spots: _spots(),
          isCurved: true, curveSmoothness: 0.22,
          color: clr, barWidth: 1.6,
          dotData: const FlDotData(show: false),
          belowBarData: BarAreaData(
            show: true,
            gradient: LinearGradient(
              colors: [clr.withValues(alpha: 0.18), clr.withValues(alpha: 0.0)],
              begin: Alignment.topCenter, end: Alignment.bottomCenter,
            ),
          ),
        ),
      ],
    ));
  }
}

// Portfolio skeleton ──────────────────────────────────────────────────────────
class _PaperSkeleton extends StatelessWidget {
  const _PaperSkeleton();
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(16),
    decoration: _card(hero: true),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      _Bone(w: 110, h: 11),
      const SizedBox(height: 10),
      _Bone(w: 210, h: 26),
      const SizedBox(height: 8),
      _Bone(w: 155, h: 18),
      const SizedBox(height: 10),
      _Bone(w: 230, h: 11),
    ]),
  );
}

class _Bone extends StatelessWidget {
  final double w, h;
  const _Bone({required this.w, required this.h});
  @override
  Widget build(BuildContext context) => Container(
    width: w, height: h,
    decoration: BoxDecoration(
      color: _kBorder.withValues(alpha: 0.38),
      borderRadius: BorderRadius.circular(3),
    ),
  );
}

// ── AI Trade Opportunities ─────────────────────────────────────────────────────
class _PaperAIOpportunities extends StatelessWidget {
  const _PaperAIOpportunities();
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16),
    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Expanded(child: _PaperStratCard(
        icon: Icons.trending_up_rounded,
        title: 'Bull Call Spread',
        subtitle: 'NIFTY · 26 Jun · 2 legs',
        sentiment: 'Bullish',
        sentimentColor: _kGreen,
        pop: 78, maxProfit: 4250, maxLoss: 1250,
        aiConfidence: 89, accentColor: _kGreen,
        tapeColor: _kAmberTape, tapeAngle: -0.05,
      )),
      const SizedBox(width: 12),
      Expanded(child: _PaperStratCard(
        icon: Icons.swap_vert_rounded,
        title: 'Iron Condor',
        subtitle: 'BANKNIFTY · 26 Jun · 4 legs',
        sentiment: 'Neutral',
        sentimentColor: const Color(0xFF9A6B0A),
        pop: 68, maxProfit: 820, maxLoss: 820,
        aiConfidence: 72, accentColor: const Color(0xFF9A6B0A),
        tapeColor: _kBlueTape, tapeAngle: 0.04,
      )),
    ]),
  );
}

class _PaperStratCard extends StatelessWidget {
  final IconData icon;
  final String title, subtitle, sentiment;
  final Color sentimentColor, accentColor, tapeColor;
  final int pop, aiConfidence;
  final double maxProfit, maxLoss, tapeAngle;

  const _PaperStratCard({
    required this.icon, required this.title, required this.subtitle,
    required this.sentiment, required this.sentimentColor,
    required this.pop, required this.maxProfit, required this.maxLoss,
    required this.aiConfidence, required this.accentColor,
    required this.tapeColor, required this.tapeAngle,
  });

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##,##0');
    return Stack(clipBehavior: Clip.none, children: [
      // Card body
      Container(
        padding: const EdgeInsets.fromLTRB(12, 20, 12, 12),
        decoration: BoxDecoration(
          color: _kCard,
          borderRadius: const BorderRadius.only(
            topLeft: Radius.circular(3), topRight: Radius.circular(11),
            bottomLeft: Radius.circular(9), bottomRight: Radius.circular(3),
          ),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF5A4032).withValues(alpha: 0.14),
              blurRadius: 9, offset: const Offset(2, 3),
            ),
            BoxShadow(
              color: const Color(0xFF5A4032).withValues(alpha: 0.05),
              blurRadius: 2, offset: const Offset(0, 1),
            ),
          ],
          border: Border.all(color: _kBorder.withValues(alpha: 0.50), width: 0.8),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Icon + title row
          Row(children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                color: accentColor.withValues(alpha: 0.11),
                shape: BoxShape.circle,
                border: Border.all(color: accentColor.withValues(alpha: 0.22), width: 0.8),
              ),
              child: Icon(icon, color: accentColor, size: 15),
            ),
            const SizedBox(width: 8),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title,
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                  style: _playfair(size: 12, weight: FontWeight.w700)),
              const SizedBox(height: 1),
              Text(subtitle,
                  maxLines: 2, overflow: TextOverflow.ellipsis,
                  style: _inter(size: 9, color: _kInkFaded, weight: FontWeight.w400)),
            ])),
          ]),
          const SizedBox(height: 9),
          // Sentiment badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
            decoration: BoxDecoration(
              color: accentColor.withValues(alpha: 0.09),
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(1), topRight: Radius.circular(5),
                bottomLeft: Radius.circular(4), bottomRight: Radius.circular(1),
              ),
              border: Border.all(color: accentColor.withValues(alpha: 0.28), width: 0.8),
            ),
            child: Text(sentiment,
                style: _inter(size: 10, color: accentColor, weight: FontWeight.w700)),
          ),
          const SizedBox(height: 9),
          // Stats
          _StatRow('POP', '$pop%', _kInk),
          const SizedBox(height: 3),
          _StatRow('Max Profit', '+₹${fmt.format(maxProfit)}', _kGreen),
          const SizedBox(height: 3),
          _StatRow('Max Loss',   '-₹${fmt.format(maxLoss)}',  _kRed),
          const SizedBox(height: 9),
          // AI confidence ring
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Text('AI Confidence',
                style: _inter(size: 10, color: _kInkFaded)),
            Row(children: [
              Text('$aiConfidence%',
                  style: _inter(size: 10, color: accentColor, weight: FontWeight.w700)),
              const SizedBox(width: 4),
              SizedBox(
                width: 20, height: 20,
                child: CircularProgressIndicator(
                  value: aiConfidence / 100,
                  strokeWidth: 2,
                  backgroundColor: _kBorder.withValues(alpha: 0.4),
                  color: accentColor,
                ),
              ),
            ]),
          ]),
          const SizedBox(height: 9),
          // Paper-label button
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(vertical: 7),
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.only(
                topLeft: Radius.circular(2), topRight: Radius.circular(7),
                bottomLeft: Radius.circular(6), bottomRight: Radius.circular(2),
              ),
              border: Border.all(color: accentColor.withValues(alpha: 0.42), width: 1.2),
            ),
            child: Center(
              child: Text('View Strategy →',
                  style: _inter(size: 11, color: accentColor, weight: FontWeight.w600)),
            ),
          ),
        ]),
      ),
      // Washi tape
      Positioned(
        top: -8, left: 18,
        child: Transform.rotate(
          angle: tapeAngle,
          child: Container(
            width: 50, height: 15,
            decoration: BoxDecoration(
              color: tapeColor.withValues(alpha: 0.70),
              borderRadius: BorderRadius.circular(2),
              boxShadow: [
                BoxShadow(
                  color: const Color(0xFF5A4032).withValues(alpha: 0.15),
                  blurRadius: 3, offset: const Offset(0, 2),
                ),
              ],
            ),
          ),
        ),
      ),
    ]);
  }
}

class _StatRow extends StatelessWidget {
  final String label, value;
  final Color color;
  const _StatRow(this.label, this.value, this.color);
  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.spaceBetween,
    children: [
      Text(label, style: _inter(size: 10, color: _kInkFaded)),
      Text(value,  style: _inter(size: 10, color: color, weight: FontWeight.w700)),
    ],
  );
}

// ── Market Breadth ─────────────────────────────────────────────────────────────
class _PaperMarketBreadth extends StatelessWidget {
  final MarketBreadthData? breadth;
  const _PaperMarketBreadth({required this.breadth});

  @override
  Widget build(BuildContext context) {
    final fmt      = NumberFormat('#,##,##0');
    final fmtCr    = NumberFormat('#,##,##0.00');
    final advances = breadth?.advances ?? 0;
    final declines = breadth?.declines ?? 0;
    final total    = advances + declines;
    final advRatio = total > 0 ? advances / total : 0.5;
    final vix      = breadth?.vix;
    final vixChange= breadth?.vixChange;
    final pcr      = breadth?.pcr;
    final fii      = breadth?.fiiCash;
    final dii      = breadth?.diiCash;
    final maxPain  = breadth?.maxPain;

    String vixChg() {
      if (vixChange == null) return '';
      return '${vixChange >= 0 ? '▲' : '▼'}${vixChange.abs().toStringAsFixed(2)}%';
    }

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // A/D | PCR | VIX row
      Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('Advance / Decline',
              style: _inter(size: 10, color: _kInkFaded, style: FontStyle.italic)),
          const SizedBox(height: 5),
          total == 0
              ? Text('—', style: _baskerville(size: 22))
              : Row(children: [
                  Text(fmt.format(advances),
                      style: _baskerville(size: 22, color: _kGreen)),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 6),
                    child: Text('/', style: _inter(size: 18, color: _kInkFaded)),
                  ),
                  Text(fmt.format(declines),
                      style: _baskerville(size: 22, color: _kRed)),
                ]),
        ])),
        _InkStat(
          label: 'PCR',
          value: pcr != null ? pcr.toStringAsFixed(2) : '—',
        ),
        const SizedBox(width: 20),
        Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('VIX',
              style: _inter(size: 10, color: _kInkFaded, style: FontStyle.italic)),
          const SizedBox(height: 5),
          Row(children: [
            Text(vix != null ? vix.toStringAsFixed(2) : '—',
                style: _baskerville(size: 22)),
            if (vixChange != null) ...[
              const SizedBox(width: 4),
              Text(vixChg(),
                  style: _inter(size: 10,
                      color: vixChange >= 0 ? _kGreen : _kRed,
                      weight: FontWeight.w700)),
            ],
          ]),
        ]),
      ]),
      const SizedBox(height: 12),
      // Brush-stroke progress bar
      _BrushBar(ratio: advRatio),
      const SizedBox(height: 14),
      Container(height: 0.8, color: _kBorder.withValues(alpha: 0.50)),
      const SizedBox(height: 14),
      // FII | DII | Max Pain
      Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('FII (Cash)',
              style: _inter(size: 10, color: _kInkFaded, style: FontStyle.italic)),
          const SizedBox(height: 2),
          Text(
            fii != null ? '₹${fmtCr.format(fii)} Cr' : '—',
            style: _inter(size: 11, weight: FontWeight.w700,
                color: fii != null ? (fii >= 0 ? _kGreen : _kRed) : _kInkMid),
          ),
        ])),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Text('DII (Cash)',
              style: _inter(size: 10, color: _kInkFaded, style: FontStyle.italic)),
          const SizedBox(height: 2),
          Text(
            dii != null ? '₹${fmtCr.format(dii)} Cr' : '—',
            style: _inter(size: 11, weight: FontWeight.w700,
                color: dii != null ? (dii >= 0 ? _kGreen : _kRed) : _kInkMid),
          ),
        ])),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
          Text('Max Pain (NIFTY)',
              style: _inter(size: 10, color: _kInkFaded, style: FontStyle.italic)),
          const SizedBox(height: 2),
          Text(
            maxPain != null ? fmt.format(maxPain) : '—',
            style: _inter(size: 11, color: _kInkMid, weight: FontWeight.w700),
          ),
        ])),
      ]),
    ]);
  }
}

class _InkStat extends StatelessWidget {
  final String label, value;
  const _InkStat({required this.label, required this.value});
  @override
  Widget build(BuildContext context) => Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
    Text(label,
        style: _inter(size: 10, color: _kInkFaded, style: FontStyle.italic)),
    const SizedBox(height: 5),
    Text(value, style: _baskerville(size: 22)),
  ]);
}

// ── Brush-stroke progress bar ─────────────────────────────────────────────────
class _BrushBar extends StatelessWidget {
  final double ratio;
  const _BrushBar({required this.ratio});
  @override
  Widget build(BuildContext context) => SizedBox(
    height: 12,
    child: CustomPaint(
      painter: _BrushPainter(ratio: ratio.clamp(0.05, 0.95)),
      size: const Size(double.infinity, 12),
    ),
  );
}

class _BrushPainter extends CustomPainter {
  final double ratio;
  const _BrushPainter({required this.ratio});

  @override
  void paint(Canvas canvas, Size size) {
    final rng   = Random(99);
    final w     = size.width;
    final h     = size.height;
    final split = w * ratio;
    final mid   = h / 2;

    void drawStroke(double x0, double x1, Color color) {
      final paint = Paint()
        ..style       = PaintingStyle.stroke
        ..strokeWidth = h * 0.80
        ..strokeCap   = StrokeCap.round
        ..color       = color;
      final path = Path()..moveTo(x0, mid + rng.nextDouble() * 1.2 - 0.6);
      for (double x = x0 + 5; x <= x1; x += 5) {
        path.lineTo(x, mid + rng.nextDouble() * 1.8 - 0.9);
      }
      path.lineTo(x1, mid);
      canvas.drawPath(path, paint);
    }

    drawStroke(0, split, _kGreen.withValues(alpha: 0.85));
    if (split < w) drawStroke(split, w, _kRed.withValues(alpha: 0.85));
  }

  @override
  bool shouldRepaint(covariant _BrushPainter o) => o.ratio != ratio;
}
