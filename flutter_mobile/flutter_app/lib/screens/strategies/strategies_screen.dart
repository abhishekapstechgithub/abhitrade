import 'dart:math';
import 'package:flutter/material.dart';
import 'package:fl_chart/fl_chart.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../providers/app_provider.dart';
import '../../services/strategy_calculator.dart';
import '../../theme/app_theme.dart';
import '../option_chain/option_chain_screen.dart';
import '../orders/place_order_sheet.dart';

// ─── Option Leg Model ─────────────────────────────────────────────────────────

enum OptionType { call, put }
enum LegSide { buy, sell }

class StrategyLeg {
  String underlying;
  DateTime expiry;
  double strike;
  OptionType optionType;
  LegSide side;
  int lots;
  double premium;
  int lotSize;
  OptionGreeks? greeks; // set when leg is added from option chain data

  StrategyLeg({
    required this.underlying,
    required this.expiry,
    required this.strike,
    required this.optionType,
    required this.side,
    this.lots = 1,
    required this.premium,
    required this.lotSize,
    this.greeks,
  });

  bool get isCall => optionType == OptionType.call;
  bool get isBuy  => side == LegSide.buy;

  String get typeLabel => isCall ? 'CE' : 'PE';
  String get sideLabel => isBuy  ? 'Buy' : 'Sell';
  String get legCode   => isBuy  ? 'B'   : 'S';

  String get expiryStr {
    const m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${expiry.day} ${m[expiry.month - 1]} ${expiry.year.toString().substring(2)}';
  }

  String get symbol => '${underlying.replaceAll(' ','').replaceAll('50','')} '
      '$expiryStr ${strike.toInt()} $typeLabel';

  String moneyness(double spot) {
    final d = (strike - spot).abs() / spot;
    if (d < 0.003) return 'ATM';
    if (isCall) return strike < spot ? 'ITM' : 'OTM';
    return strike > spot ? 'ITM' : 'OTM';
  }

  /// Expiry PnL at spot price [s] — per spec Section C
  double expiryPayoff(double s) {
    final intrinsic = isCall ? max(0.0, s - strike) : max(0.0, strike - s);
    return (isBuy ? 1.0 : -1.0) * (intrinsic - premium) * lots * lotSize;
  }

  /// Convert to the calculator's LegInput format
  LegInput toInput() => LegInput(
    strike:        strike,
    isCall:        isCall,
    ltp:           premium,
    lotSize:       lotSize,
    quantityLots:  lots,
    isBuy:         isBuy,
    greeks:        greeks,
  );
}

// ─── T0 P&L helper (uses Black-Scholes pricing for current-day PnL line) ─────

double _legT0Pnl(StrategyLeg leg, double spot, double iv, double dte) {
  final bs = bsCalc(spot, leg.strike, max(0.001, dte / 365), iv, leg.isCall);
  return (leg.isBuy ? 1.0 : -1.0) * (bs.price - leg.premium) * leg.lots * leg.lotSize;
}

// ─── Analyse wrapper ─────────────────────────────────────────────────────────

StrategyResult _analyze(List<StrategyLeg> legs, double spot, double iv, double dte) {
  return StrategyCalculator.calculate(
    legs.map((l) => l.toInput()).toList(),
    spot: spot,
    iv:   iv,
    dte:  dte,
  );
}

// ─── Constants ───────────────────────────────────────────────────────────────

const _underlyings = ['NIFTY 50', 'BANKNIFTY', 'SENSEX', 'FINNIFTY', 'MIDCPNIFTY'];
const _lotSizes = {
  'NIFTY 50': 65, 'BANKNIFTY': 30, 'SENSEX': 20,
  'FINNIFTY': 65, 'MIDCPNIFTY': 120,
};

// ─── Screen ──────────────────────────────────────────────────────────────────

class StrategiesScreen extends StatefulWidget {
  const StrategiesScreen({super.key});
  @override
  State<StrategiesScreen> createState() => _StrategiesScreenState();
}

class _StrategiesScreenState extends State<StrategiesScreen> {
  // Strategy params
  String _underlying = 'NIFTY 50';
  double _spot       = 24567.80;
  double _iv         = 0.1245;
  double _dte        = 32;
  bool   _spotLocked = false;
  String _name       = 'Bull Call Spread';
  String _sentiment  = 'Bullish';
  bool   _isSaved    = false;

  // Tabs
  int _tab      = 0; // main: 0=Payoff 1=Legs 2=Greeks 3=Chain
  int _eParamTab = 0; // edit: 0=General 1=IV/Vol 2=Time 3=Target

  // Legs
  late List<StrategyLeg> _legs;

  // Edit params (staged)
  late String   _eUnderlying;
  late double   _eSpot;
  late double   _eIv;
  late double   _eDte;
  late DateTime _eExpiry;

  // IV/Vol tab extras
  int _ivQuickIdx = -1; // which quick-select IV button is active

  // Time tab extras
  int _dteQuickIdx = -1; // which quick-select DTE button is active

  // Target tab
  int    _targetMode  = 0;   // 0=Price 1=P&L 2=%Return
  double _targetPrice = 25500;
  bool   _targetAbove = true;
  double _targetPnl   = 25000;
  int    _pnlQuickIdx = 1;   // +25K selected by default

  // Greeks tab
  bool _greeksPerLot = false;

  // Chain tab
  int _chainView    = 0; // 0=Both 1=Calls 2=Puts
  int _chainStrikes = 10;

  // Build tab
  String _buildIndex     = 'NIFTY 50';
  String _buildType      = 'Bullish';
  String _buildLegsCount = '2 Legs';
  String _buildMaxRisk   = 'Any';
  String _buildPop       = 'Any';
  String _buildMaxPrice  = 'Any';

  // Expiries
  late List<DateTime> _expiries;
  late DateTime _expiry;

  // Chart touch
  double? _touchX;
  Offset? _touchPos;
  double _touchExpiryPnl = 0;
  double _touchT0Pnl     = 0;
  double _touchDelta     = 0;
  double _touchTheta     = 0;
  double _touchVega      = 0;
  double _touchGamma     = 0;

  @override
  void initState() {
    super.initState();
    _expiries = _upcomingExpiries(_underlying);
    _expiry   = _expiries.first;
    _dte      = _expiry.difference(DateTime.now()).inDays.toDouble().clamp(1, 365);
    final ls  = _lotSizes[_underlying] ?? 75;
    _legs = [
      StrategyLeg(underlying: 'NIFTY', expiry: _expiry, strike: 24500,
          optionType: OptionType.call, side: LegSide.buy,  lots: 1,
          premium: 310.25, lotSize: ls),
      StrategyLeg(underlying: 'NIFTY', expiry: _expiry, strike: 25000,
          optionType: OptionType.call, side: LegSide.sell, lots: 1,
          premium: 135.25, lotSize: ls),
    ];
    _eUnderlying = _underlying;
    _eSpot       = _spot;
    _eIv         = _iv;
    _eDte        = _dte;
    _eExpiry     = _expiry;
  }

  // Returns upcoming expiry dates for the given underlying.
  // NSE weekly: NIFTY 50 (Thursday), SENSEX (Friday).
  // Monthly-only (SEBI post-Oct 2024): BankNifty (last Wed), FinNifty (last Tue), MidcpNifty (last Mon).
  List<DateTime> _upcomingExpiries(String underlying) {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);

    // Underlyings with monthly-only expiry and their weekday
    const monthlyWeekday = {
      'BANKNIFTY':   DateTime.wednesday,
      'FINNIFTY':    DateTime.tuesday,
      'MIDCPNIFTY':  DateTime.monday,
    };

    if (monthlyWeekday.containsKey(underlying)) {
      final wd = monthlyWeekday[underlying]!;
      final result = <DateTime>[];
      var month = today.month;
      var year  = today.year;
      while (result.length < 6) {
        // Find last occurrence of [wd] in [month/year]
        final lastDay = DateTime(year, month + 1, 0); // last day of month
        var d = lastDay;
        while (d.weekday != wd) d = d.subtract(const Duration(days: 1));
        if (!d.isBefore(today)) result.add(d);
        month++;
        if (month > 12) { month = 1; year++; }
      }
      return result;
    }

    // Weekly expiry: NIFTY 50 = Thursday, SENSEX = Friday, default = Thursday
    final wd = underlying == 'SENSEX' ? DateTime.friday : DateTime.thursday;
    var d = today.add(const Duration(days: 1)); // start from tomorrow
    while (d.weekday != wd) d = d.add(const Duration(days: 1));
    return List.generate(8, (i) => d.add(Duration(days: i * 7)));
  }

  @override
  void dispose() {
    super.dispose();
  }

  // ─── Touch ─────────────────────────────────────────────────────────────────

  void _onChartTouch(double? x, Offset? pos) {
    if (x == null) {
      setState(() { _touchX = null; _touchPos = null; });
      return;
    }
    final T = max(0.001, _dte / 365);
    _touchExpiryPnl = _legs.fold(0.0, (s, l) => s + l.expiryPayoff(x));
    _touchT0Pnl     = _legs.fold(0.0, (s, l) => s + _legT0Pnl(l, x, _iv, _dte));
    double d = 0, g = 0, t = 0, v = 0;
    for (final l in _legs) {
      final bs = bsCalc(x, l.strike, T, _iv, l.isCall);
      final sign = l.isBuy ? 1.0 : -1.0;
      d += sign * bs.delta;
      g += sign * bs.gamma;
      t += sign * bs.theta;
      v += sign * bs.vega;
    }
    _touchDelta = d; _touchGamma = g; _touchTheta = t; _touchVega = v;
    setState(() { _touchX = x; _touchPos = pos; });
  }

  // ─── Apply ─────────────────────────────────────────────────────────────────

  void _applyChanges() {
    setState(() {
      final underlyingChanged = _eUnderlying != _underlying;
      _underlying = _eUnderlying;
      _spot       = _eSpot;
      _iv         = _eIv;
      _dte        = _eDte;
      _expiry     = _eExpiry;
      _spotLocked = _eSpot != _spot;
      if (underlyingChanged) {
        _expiries = _upcomingExpiries(_underlying);
        _expiry   = _expiries.first;
        _dte      = _expiry.difference(DateTime.now()).inDays.toDouble().clamp(1, 365);
      }
      final ls    = _lotSizes[_underlying] ?? 75;
      for (final l in _legs) {
        l.lotSize = ls;
        l.expiry  = _expiry;
      }
    });
  }

  // ─── Build ─────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final ext    = context.appColors;
    final market = context.watch<MarketProvider>();

    if (!_spotLocked) {
      final idx = market.indices.indexWhere((i) => i.symbol == _underlying);
      if (idx != -1 && market.indices[idx].ltp > 0) {
        _spot  = market.indices[idx].ltp;
        _eSpot = _spot;
      }
    }

    final analysis = _analyze(_legs, _spot, _iv, _dte);

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(ext, market),
            _buildTabBar(ext),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.only(bottom: 24),
                child: _tabContent(ext, analysis),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ─── Header ────────────────────────────────────────────────────────────────

  Widget _buildHeader(AppThemeExtension ext, MarketProvider market) {
    final idx     = market.indices.indexWhere((i) => i.symbol == _underlying);
    final liveIdx = idx != -1 ? market.indices[idx] : null;
    final price   = liveIdx?.ltp       ?? _spot;
    final change  = liveIdx?.change    ?? 0.0;
    final pct     = liveIdx?.changePct ?? 0.0;
    final isPos   = pct >= 0;
    final clr     = isPos ? AppColors.green : AppColors.red;
    final fmt     = NumberFormat('#,##,##0.00');

    return Container(
      color: ext.surface,
      padding: const EdgeInsets.fromLTRB(16, 8, 16, 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Row 1: title + spacer + bell + avatar
          Row(children: [
            Text(
              'Strategy Builder',
              style: context.isDark
                  ? TextStyle(color: ext.textPrimary, fontSize: 15,
                      fontWeight: FontWeight.w700)
                  : GoogleFonts.lora(color: ext.textPrimary, fontSize: 15,
                      fontWeight: FontWeight.w700),
            ),
            const Spacer(),
            Icon(Icons.notifications_none_outlined, size: 22,
                color: ext.textSecondary),
          ]),
          const SizedBox(height: 6),
          // Row 2: underlying selector
          GestureDetector(
            onTap: () => _showUnderlyingModal(ext, market),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Text(_underlying, style: TextStyle(color: ext.textSecondary,
                  fontSize: 12, fontWeight: FontWeight.w600)),
              const SizedBox(width: 3),
              Icon(Icons.keyboard_arrow_down, size: 14, color: ext.textMuted),
            ]),
          ),
          const SizedBox(height: 2),
          // Row 3: price + change
          Row(children: [
            Text(
              fmt.format(price),
              style: context.isDark
                  ? TextStyle(color: ext.textPrimary, fontSize: 18,
                      fontWeight: FontWeight.w800)
                  : GoogleFonts.lora(color: ext.textPrimary,
                      fontSize: 18, fontWeight: FontWeight.w800),
            ),
            const SizedBox(width: 6),
            Flexible(
              child: Text(
                '${isPos ? '+' : ''}${fmt.format(change)} '
                '(${isPos ? '+' : ''}${pct.toStringAsFixed(2)}%)',
                style: TextStyle(color: clr, fontSize: 11,
                    fontWeight: FontWeight.w600),
              ),
            ),
          ]),
        ],
      ),
    );
  }

  void _showUnderlyingModal(AppThemeExtension ext, MarketProvider market) {
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) {
        final fmt = NumberFormat('#,##,##0.00');
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 12),
              Container(width: 36, height: 4,
                  decoration: BoxDecoration(color: ext.border,
                      borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 16),
              ..._underlyings.map((u) {
                final i   = market.indices.indexWhere((e) => e.symbol == u);
                final ltp = i != -1 ? market.indices[i].ltp : 0.0;
                final pct = i != -1 ? market.indices[i].changePct : 0.0;
                return ListTile(
                  title: Text(u, style: TextStyle(color: ext.textPrimary,
                      fontWeight: FontWeight.w600)),
                  subtitle: ltp > 0
                      ? Text(fmt.format(ltp),
                            style: TextStyle(color: ext.textSecondary, fontSize: 12))
                      : null,
                  trailing: ltp > 0
                      ? Text('${pct >= 0 ? '+' : ''}${pct.toStringAsFixed(2)}%',
                            style: TextStyle(
                                color: pct >= 0 ? AppColors.green : AppColors.red,
                                fontWeight: FontWeight.w600))
                      : null,
                  onTap: () {
                    setState(() {
                      _underlying  = u;
                      _eUnderlying = u;
                      _spotLocked  = false;
                    });
                    Navigator.pop(context);
                  },
                );
              }),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );
  }

  // ─── Main Tab Bar ───────────────────────────────────────────────────────────

  Widget _buildTabBar(AppThemeExtension ext) {
    const tabs = ['Payoff', 'Legs', 'Greeks', 'Saved', 'Backtested', 'Custom'];
    return Container(
      decoration: BoxDecoration(
        color: ext.surface,
        border: Border(bottom: BorderSide(color: ext.border, width: 1)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        child: Row(
          children: List.generate(tabs.length, (i) {
            final sel = _tab == i;
            return GestureDetector(
              onTap: () => setState(() => _tab = i),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                decoration: BoxDecoration(
                  border: Border(bottom: BorderSide(
                    color: sel ? AppColors.green : Colors.transparent,
                    width: 2,
                  )),
                ),
                child: Text(
                  tabs[i],
                  style: TextStyle(
                    color: sel ? AppColors.green : ext.textSecondary,
                    fontSize: 13,
                    fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ),
            );
          }),
        ),
      ),
    );
  }

  // ─── Tab Content ───────────────────────────────────────────────────────────

  Widget _tabContent(AppThemeExtension ext, StrategyResult a) {
    switch (_tab) {
      case 0: return _payoffTab(ext, a);
      case 1: return _legsTab(ext, a);
      case 2: return _greeksTab(ext, a);
      case 3: return _savedTab(ext);
      case 4: return _comingSoonTab(ext, Icons.history_edu_outlined, 'Backtested');
      case 5: return _comingSoonTab(ext, Icons.tune_outlined, 'Custom');
      default: return const SizedBox();
    }
  }

  Widget _payoffTab(AppThemeExtension ext, StrategyResult a) {
    return Column(
      children: [
        _StrategyCard(
          ext: ext,
          legs: _legs,
          analysis: a,
          spot: _spot, iv: _iv, dte: _dte,
          isSaved: _isSaved,
          onSaveToggle: () {
            setState(() {
              _isSaved = !_isSaved;
            });
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(_isSaved ? 'Strategy saved' : 'Strategy removed from saved'),
                duration: const Duration(seconds: 2),
              ),
            );
          },
          expiry: _expiry, expiries: _expiries,
          touchX: _touchX, touchPos: _touchPos,
          touchExpiryPnl: _touchExpiryPnl,
          touchT0Pnl:     _touchT0Pnl,
          touchDelta:     _touchDelta,
          touchTheta:     _touchTheta,
          touchVega:      _touchVega,
          touchGamma:     _touchGamma,
          onTouch:        _onChartTouch,
          onExpiryChange: (e) => setState(() {
            _expiry = e;
            _dte    = e.difference(DateTime.now()).inDays.toDouble().clamp(1, 365);
            for (final l in _legs) l.expiry = e;
          }),
        ),
        Divider(height: 1, color: ext.border),
        _legsSection(ext),
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 8, 14, 16),
          child: SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              icon: const Icon(Icons.tune_rounded, size: 15),
              label: const Text('Edit Parameters'),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.blue,
                side: BorderSide(color: ext.border),
                padding: const EdgeInsets.symmetric(vertical: 9),
                textStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
              ),
              onPressed: () => _showEditParamsSheet(),
            ),
          ),
        ),
      ],
    );
  }

  Widget _legsTab(AppThemeExtension ext, StrategyResult a) {
    // Use calculator totals — totalPremiumCashFlow: +ve = debit, -ve = credit
    final netCashFlow = a.totalPremiumCashFlow;
    final isDebit = netCashFlow >= 0;
    int longLots = 0, shortLots = 0;
    for (final l in _legs) {
      if (l.isBuy) longLots += l.lots;
      else shortLots += l.lots;
    }
    final fmt = NumberFormat('#,##,##0');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _legsSection(ext),
        if (_legs.isNotEmpty) ...[
          Divider(color: ext.border, height: 1),
          Container(
            padding: const EdgeInsets.fromLTRB(14, 10, 14, 6),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(children: [
                  Expanded(child: _SummaryStatCol(
                    label: isDebit ? 'Net Debit' : 'Net Credit',
                    value: '${isDebit ? '-' : '+'}₹${fmt.format(netCashFlow.abs())}',
                    color: isDebit ? AppColors.red : AppColors.green,
                    ext: ext,
                  )),
                  Container(width: 1, height: 32, color: ext.border),
                  Expanded(child: _SummaryStatCol(
                    label: 'Max Profit (Cr.)',
                    value: a.maxProfit >= 1e7 ? 'Unlimited'
                        : '+₹${fmt.format(a.maxProfit.abs())}',
                    color: AppColors.green, ext: ext,
                  )),
                  Container(width: 1, height: 32, color: ext.border),
                  Expanded(child: _SummaryStatCol(
                    label: 'Max Loss (Cr.)',
                    value: a.maxLoss <= -1e7 ? 'Unlimited'
                        : '-₹${fmt.format(a.maxLoss.abs())}',
                    color: AppColors.red, ext: ext,
                  )),
                  Icon(Icons.unfold_more, size: 16, color: ext.textMuted),
                ]),
                const SizedBox(height: 6),
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.greenDimLight,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text('Long $longLots Lot (+)',
                        style: TextStyle(color: AppColors.green,
                            fontSize: 10, fontWeight: FontWeight.w600)),
                  ),
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.redDimLight,
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text('Short $shortLots Lot (-)',
                        style: TextStyle(color: AppColors.red,
                            fontSize: 10, fontWeight: FontWeight.w600)),
                  ),
                ]),
              ],
            ),
          ),
        ],
      ],
    );
  }

  Widget _greeksTab(AppThemeExtension ext, StrategyResult a) {
    final T   = max(0.001, _dte / 365);
    final sig = max(0.001, _iv);

    // Compute Rho, Charm, Vanna
    double rho = 0, charm = 0, vanna = 0;
    for (final l in _legs) {
      final sqT  = sqrt(T);
      final d1   = (log(_spot / l.strike) + (0.07 + sig * sig / 2) * T) / (sig * sqT);
      final d2   = d1 - sig * sqT;
      final df   = exp(-0.07 * T);
      final sign = l.isBuy ? 1.0 : -1.0;
      final n    = l.lots * l.lotSize;
      if (l.isCall) {
        rho += sign * n * l.strike * T * df * bsNcdf(d2) / 100;
      } else {
        rho += sign * n * (-l.strike) * T * df * bsNcdf(-d2) / 100;
      }
      charm += sign * n * (-bsNpdf(d1) * (2 * 0.07 * T - d2 * sig * sqT) / (2 * T * sig * sqT));
      final bs = bsCalc(_spot, l.strike, T, _iv, l.isCall);
      vanna += sign * n * (bs.vega / _spot) * (1 - d1 / (sig * sqT));
    }

    final totalLots = _legs.fold(0, (s, l) => s + l.lots);
    final div = (_greeksPerLot && totalLots > 0) ? totalLots.toDouble() : 1.0;

    final greeks = [
      (name: 'Delta', sym: 'Δ', val: a.delta / div, desc: 'Price Sensitivity',         fmt: (double v) => v.toStringAsFixed(4)),
      (name: 'Theta', sym: 'Θ', val: a.theta / div, desc: 'Time Decay (Per Day)',       fmt: (double v) => '₹${v.toStringAsFixed(1)}'),
      (name: 'Vega',  sym: 'V', val: a.vega  / div, desc: 'Volatility Sensitivity',     fmt: (double v) => v.toStringAsFixed(1)),
      (name: 'Gamma', sym: 'Γ', val: a.gamma / div, desc: 'Rate of Change of Delta',    fmt: (double v) => v.toStringAsFixed(4)),
      (name: 'Rho',   sym: 'ρ', val: rho     / div, desc: 'Interest Rate Sensitivity',  fmt: (double v) => v.toStringAsFixed(1)),
      (name: 'Charm', sym: 'C', val: charm   / div, desc: 'Delta Decay (Per Day)',       fmt: (double v) => v.toStringAsFixed(2)),
      (name: 'Vanna', sym: 'ν', val: vanna   / div, desc: 'Delta Volga Sensitivity',    fmt: (double v) => v.toStringAsFixed(1)),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
            Row(children: [
              Text('Overall Greeks', style: TextStyle(color: ext.textPrimary,
                  fontSize: 14, fontWeight: FontWeight.w700)),
              const SizedBox(width: 4),
              Icon(Icons.info_outline, size: 14, color: ext.textMuted),
            ]),
            // Total / Per Lot toggle
            Container(
              decoration: BoxDecoration(
                border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8),
                color: ext.card,
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                _GreekToggleBtn(label: 'Total',   sel: !_greeksPerLot, ext: ext,
                    onTap: () => setState(() => _greeksPerLot = false)),
                _GreekToggleBtn(label: 'Per Lot', sel:  _greeksPerLot, ext: ext,
                    onTap: () => setState(() => _greeksPerLot = true)),
              ]),
            ),
          ]),
          const SizedBox(height: 14),
          ...greeks.map((g) => _GreekRow(
            name: g.name, sym: g.sym, val: g.val,
            desc: g.desc, fmtVal: g.fmt(g.val), ext: ext,
          )),
        ],
      ),
    );
  }

  // Opens the full OptionChainScreen and auto-redirects when tab is selected
  // kept for reference but no longer reachable (Chain tab removed)
  Widget _chainTabRedirect(AppThemeExtension ext) => const SizedBox.shrink();

  Widget _chainTab(AppThemeExtension ext) {
    final atm    = ((_spot / 50).round() * 50).toDouble();
    final half   = _chainStrikes ~/ 2;
    final strikes = List.generate(_chainStrikes, (i) => atm + (i - half) * 50.0);
    final T      = max(0.001, _dte / 365);
    final ivPct  = _iv * 100;

    Widget _viewBtn(String label, int idx) {
      final sel = _chainView == idx;
      return GestureDetector(
        onTap: () => setState(() => _chainView = idx),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
          decoration: BoxDecoration(
            color: sel ? AppColors.green : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(label, style: TextStyle(
            color: sel ? Colors.white : ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // Controls
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 6),
          child: Row(children: [
            // Expiry dropdown
            GestureDetector(
              onTap: () => _showExpiryPicker(ext),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                decoration: BoxDecoration(
                  border: Border.all(color: ext.border),
                  borderRadius: BorderRadius.circular(8), color: ext.card,
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Text(_fmtDate(_expiry), style: TextStyle(
                      color: ext.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
                  const SizedBox(width: 4),
                  Icon(Icons.keyboard_arrow_down, size: 14, color: ext.textMuted),
                ]),
              ),
            ),
            const SizedBox(width: 8),
            // View toggle
            Expanded(child: Container(
              padding: const EdgeInsets.all(3),
              decoration: BoxDecoration(
                border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8), color: ext.card,
              ),
              child: Row(children: [
                Expanded(child: _viewBtn('Both',  0)),
                Expanded(child: _viewBtn('Calls', 1)),
                Expanded(child: _viewBtn('Puts',  2)),
              ]),
            )),
            const SizedBox(width: 8),
            // Strikes count
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
              decoration: BoxDecoration(
                border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8), color: ext.card,
              ),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text('$_chainStrikes', style: TextStyle(
                    color: ext.textPrimary, fontSize: 12, fontWeight: FontWeight.w600)),
                const SizedBox(width: 3),
                Icon(Icons.keyboard_arrow_down, size: 13, color: ext.textMuted),
              ]),
            ),
          ]),
        ),
        // Subheader
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
          child: Row(children: [
            Text(_underlying, style: TextStyle(color: ext.textSecondary,
                fontSize: 12, fontWeight: FontWeight.w600)),
            Container(width: 1, height: 12, color: ext.border,
                margin: const EdgeInsets.symmetric(horizontal: 8)),
            Text(NumberFormat('#,##,##0.00').format(_spot),
                style: TextStyle(color: ext.textPrimary, fontSize: 12,
                    fontWeight: FontWeight.w700)),
          ]),
        ),
        // Table header
        Container(
          color: ext.card,
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          child: Row(children: [
            if (_chainView != 2) ...[
              Expanded(child: Text('LTP (₹)', style: TextStyle(color: AppColors.green,
                  fontSize: 10, fontWeight: FontWeight.w700), textAlign: TextAlign.right)),
              Expanded(child: Text('IV (%)', style: TextStyle(color: AppColors.green,
                  fontSize: 10, fontWeight: FontWeight.w700), textAlign: TextAlign.right)),
            ],
            Expanded(child: Text('STRIKE', style: TextStyle(color: ext.textMuted,
                fontSize: 10, fontWeight: FontWeight.w700), textAlign: TextAlign.center)),
            if (_chainView != 1) ...[
              Expanded(child: Text('IV (%)', style: TextStyle(color: AppColors.red,
                  fontSize: 10, fontWeight: FontWeight.w700), textAlign: TextAlign.left)),
              Expanded(child: Text('LTP (₹)', style: TextStyle(color: AppColors.red,
                  fontSize: 10, fontWeight: FontWeight.w700), textAlign: TextAlign.left)),
            ],
          ]),
        ),
        Divider(height: 1, color: ext.border),
        // Table rows
        ...strikes.map((strike) {
          final isAtm = strike == atm;
          final callBs = bsCalc(_spot, strike, T, _iv, true);
          final putBs  = bsCalc(_spot, strike, T, _iv, false);
          return Container(
            color: isAtm ? AppColors.greenDimLight.withOpacity(0.4) : Colors.transparent,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
            child: Row(children: [
              if (_chainView != 2) ...[
                Expanded(child: Text(callBs.price.toStringAsFixed(2),
                    style: TextStyle(color: ext.textPrimary, fontSize: 11,
                        fontWeight: FontWeight.w600), textAlign: TextAlign.right)),
                Expanded(child: Text(ivPct.toStringAsFixed(1),
                    style: TextStyle(color: ext.textSecondary, fontSize: 11),
                    textAlign: TextAlign.right)),
              ],
              Expanded(child: Text(strike.toInt().toString(),
                  style: TextStyle(
                      color: isAtm ? AppColors.green : ext.textMuted,
                      fontSize: 11, fontWeight: FontWeight.w700),
                  textAlign: TextAlign.center)),
              if (_chainView != 1) ...[
                Expanded(child: Text(ivPct.toStringAsFixed(1),
                    style: TextStyle(color: ext.textSecondary, fontSize: 11),
                    textAlign: TextAlign.left)),
                Expanded(child: Text(putBs.price.toStringAsFixed(2),
                    style: TextStyle(color: ext.textPrimary, fontSize: 11,
                        fontWeight: FontWeight.w600), textAlign: TextAlign.left)),
              ],
            ]),
          );
        }),
        Padding(
          padding: const EdgeInsets.all(10),
          child: Text('IV is Implied Volatility',
              style: TextStyle(color: ext.textMuted, fontSize: 10)),
        ),
      ],
    );
  }

  void _showRenameDialog() {
    final ctrl = TextEditingController(text: _name);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Rename Strategy'),
        content: TextField(
          controller: ctrl,
          decoration: const InputDecoration(hintText: 'Strategy name'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
          ElevatedButton(
            onPressed: () {
              final t = ctrl.text.trim();
              if (t.isNotEmpty) setState(() => _name = t);
              Navigator.pop(ctx);
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  // ─── Legs Section ──────────────────────────────────────────────────────────

  Widget _legsSection(AppThemeExtension ext) {
    return Container(
      padding: const EdgeInsets.fromLTRB(14, 10, 14, 10),
      child: Column(
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Strategy Legs',
                  style: TextStyle(color: ext.textPrimary, fontSize: 13,
                      fontWeight: FontWeight.w700)),
              GestureDetector(
                onTap: _addLeg,
                child: Row(
                  children: [
                    Icon(Icons.add, size: 14, color: AppColors.green),
                    const SizedBox(width: 2),
                    Text('Add Leg',
                        style: TextStyle(color: AppColors.green, fontSize: 12,
                            fontWeight: FontWeight.w600)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ..._legs.asMap().entries.map((e) => _LegRow(
            leg: e.value,
            spot: _spot,
            iv: _iv,
            dte: _dte,
            ext: ext,
            onPremiumChange: (p) => setState(() => _legs[e.key].premium = p),
            onLotsChange: (l) => setState(() => _legs[e.key].lots = l),
            onDelete: () => setState(() => _legs.removeAt(e.key)),
            showDivider: e.key < _legs.length - 1,
          )),
          if (_legs.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Text('No legs added yet.',
                  style: TextStyle(color: ext.textMuted, fontSize: 13)),
            ),
        ],
      ),
    );
  }

  // ─── Saved Tab ──────────────────────────────────────────────────────────────

  Widget _savedTab(AppThemeExtension ext) {
    final saved = [
      (icon: Icons.bar_chart_outlined,    name: 'Bull Call Spread',  sent: 'Bullish',  underlying: 'NIFTY 50',  date: '26 Jun 2024', chg: '+4.25%', mp: '+₹4,25,000', ml: '-₹1,25,000',  isPos: true),
      (icon: Icons.grid_on_outlined,      name: 'Iron Condor',       sent: 'Neutral',  underlying: 'BANKNIFTY', date: '27 Jun 2024', chg: '+2.13%', mp: '+₹2,80,000', ml: '-₹2,80,000',  isPos: true),
      (icon: Icons.add_circle_outline,    name: 'Long Straddle',     sent: 'Neutral',  underlying: 'NIFTY 50',  date: '20 Jun 2024', chg: '-1.42%', mp: 'Unlimited',   ml: '-₹1,10,000',  isPos: false),
      (icon: Icons.trending_down,         name: 'Bear Put Spread',   sent: 'Bearish',  underlying: 'FINNIFTY',  date: '25 Jun 2024', chg: '+3.78%', mp: '+₹3,00,000', ml: '-₹1,20,000',  isPos: true),
    ];
    Color sentColor(String s) => s == 'Bullish' ? AppColors.green : s == 'Bearish' ? AppColors.red : AppColors.blue;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 8),
          child: Row(children: [
            Text('Saved Strategies', style: TextStyle(color: ext.textPrimary,
                fontSize: 14, fontWeight: FontWeight.w700)),
            const Spacer(),
            Icon(Icons.search, size: 20, color: ext.textSecondary),
            const SizedBox(width: 12),
            Icon(Icons.tune, size: 20, color: ext.textSecondary),
          ]),
        ),
        ...saved.map((s) => Column(children: [
          Divider(height: 1, color: ext.border),
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 36, height: 36,
                  decoration: BoxDecoration(
                    color: sentColor(s.sent).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  alignment: Alignment.center,
                  child: Icon(s.icon, size: 18, color: sentColor(s.sent)),
                ),
                const SizedBox(width: 10),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Row(children: [
                    Text(s.name, style: TextStyle(color: ext.textPrimary,
                        fontSize: 13, fontWeight: FontWeight.w700)),
                    const SizedBox(width: 6),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                      decoration: BoxDecoration(
                        color: sentColor(s.sent).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(s.sent, style: TextStyle(color: sentColor(s.sent),
                          fontSize: 10, fontWeight: FontWeight.w600)),
                    ),
                  ]),
                  const SizedBox(height: 2),
                  Text('${s.underlying} · ${s.date}',
                      style: TextStyle(color: ext.textMuted, fontSize: 11)),
                ])),
                Text(s.chg, style: TextStyle(
                    color: s.isPos ? AppColors.green : AppColors.red,
                    fontSize: 12, fontWeight: FontWeight.w700)),
                const SizedBox(width: 8),
                Icon(Icons.more_vert, size: 18, color: ext.textMuted),
              ]),
              const SizedBox(height: 8),
              Row(children: [
                Text('Max Profit: ', style: TextStyle(color: ext.textMuted, fontSize: 11)),
                Text(s.mp, style: TextStyle(color: AppColors.green,
                    fontSize: 11, fontWeight: FontWeight.w600)),
                const SizedBox(width: 16),
                Text('Max Loss: ', style: TextStyle(color: ext.textMuted, fontSize: 11)),
                Text(s.ml, style: TextStyle(color: AppColors.red,
                    fontSize: 11, fontWeight: FontWeight.w600)),
              ]),
            ]),
          ),
        ])),
      ],
    );
  }

  // ─── Build Tab ───────────────────────────────────────────────────────────────

  Widget _buildTab(AppThemeExtension ext) {
    Widget _label(String text) => Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Text(text, style: TextStyle(color: ext.textSecondary,
          fontSize: 12, fontWeight: FontWeight.w600)),
    );

    Widget _dropdown(String val, List<String> opts, void Function(String) onSel) =>
        GestureDetector(
          onTap: () => showModalBottomSheet(
            context: context,
            backgroundColor: ext.surface,
            shape: const RoundedRectangleBorder(
                borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
            builder: (_) => SafeArea(child: Column(mainAxisSize: MainAxisSize.min,
              children: [
                const SizedBox(height: 12),
                Container(width: 36, height: 4, decoration: BoxDecoration(
                    color: ext.border, borderRadius: BorderRadius.circular(2))),
                const SizedBox(height: 12),
                ...opts.map((o) => ListTile(
                  title: Text(o, style: TextStyle(color: ext.textPrimary)),
                  trailing: o == val ? const Icon(Icons.check, color: AppColors.green) : null,
                  onTap: () { setState(() => onSel(o)); Navigator.pop(context); },
                )),
                const SizedBox(height: 8),
              ])),
          ),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              border: Border.all(color: ext.border),
              borderRadius: BorderRadius.circular(8), color: ext.card,
            ),
            child: Row(children: [
              Expanded(child: Text(val, style: TextStyle(color: ext.textPrimary,
                  fontSize: 13, fontWeight: FontWeight.w600))),
              Icon(Icons.keyboard_arrow_down, size: 16, color: ext.textMuted),
            ]),
          ),
        );

    const templates = [
      (icon: Icons.trending_up,    name: 'Bull Call Spread'),
      (icon: Icons.trending_up,    name: 'Bull Put Spread'),
      (icon: Icons.grid_on,        name: 'Iron Condor'),
      (icon: Icons.add_circle,     name: 'Long Straddle'),
    ];

    return Padding(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Strategy Builder', style: TextStyle(color: ext.textPrimary,
              fontSize: 14, fontWeight: FontWeight.w700)),
          GestureDetector(
            onTap: () => setState(() {
              _buildIndex = 'NIFTY 50'; _buildType = 'Bullish';
              _buildLegsCount = '2 Legs'; _buildMaxRisk = 'Any';
              _buildPop = 'Any'; _buildMaxPrice = 'Any';
            }),
            child: Text('Reset', style: TextStyle(color: AppColors.blue,
                fontSize: 13, fontWeight: FontWeight.w600)),
          ),
        ]),
        const SizedBox(height: 16),
        _label('Select Index'),
        _dropdown(_buildIndex, _underlyings.toList(), (v) => _buildIndex = v),
        const SizedBox(height: 12),
        _label('Strategy Type'),
        _dropdown(_buildType, ['Bullish', 'Bearish', 'Neutral', 'Volatile'],
            (v) => _buildType = v),
        const SizedBox(height: 12),
        _label('Expiry'),
        GestureDetector(
          onTap: () => _showExpiryPicker(ext),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(
              border: Border.all(color: ext.border),
              borderRadius: BorderRadius.circular(8), color: ext.card,
            ),
            child: Row(children: [
              Icon(Icons.calendar_today_outlined, size: 14, color: ext.textMuted),
              const SizedBox(width: 8),
              Expanded(child: Text(_fmtDate(_expiry), style: TextStyle(
                  color: ext.textPrimary, fontSize: 13, fontWeight: FontWeight.w600))),
              Icon(Icons.keyboard_arrow_down, size: 16, color: ext.textMuted),
            ]),
          ),
        ),
        const SizedBox(height: 12),
        // 4 small dropdowns
        Row(children: [
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Legs', style: TextStyle(color: ext.textMuted, fontSize: 10)),
            const SizedBox(height: 4),
            GestureDetector(
              onTap: () {},
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
                decoration: BoxDecoration(border: Border.all(color: ext.border),
                    borderRadius: BorderRadius.circular(6), color: ext.card),
                child: Row(children: [
                  Expanded(child: Text(_buildLegsCount, style: TextStyle(
                      color: ext.textPrimary, fontSize: 11))),
                  Icon(Icons.keyboard_arrow_down, size: 12, color: ext.textMuted),
                ]),
              ),
            ),
          ])),
          const SizedBox(width: 6),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Max Risk', style: TextStyle(color: ext.textMuted, fontSize: 10)),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
              decoration: BoxDecoration(border: Border.all(color: ext.border),
                  borderRadius: BorderRadius.circular(6), color: ext.card),
              child: Row(children: [
                Expanded(child: Text(_buildMaxRisk, style: TextStyle(
                    color: ext.textPrimary, fontSize: 11))),
                Icon(Icons.keyboard_arrow_down, size: 12, color: ext.textMuted),
              ]),
            ),
          ])),
          const SizedBox(width: 6),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('POP', style: TextStyle(color: ext.textMuted, fontSize: 10)),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
              decoration: BoxDecoration(border: Border.all(color: ext.border),
                  borderRadius: BorderRadius.circular(6), color: ext.card),
              child: Row(children: [
                Expanded(child: Text(_buildPop, style: TextStyle(
                    color: ext.textPrimary, fontSize: 11))),
                Icon(Icons.keyboard_arrow_down, size: 12, color: ext.textMuted),
              ]),
            ),
          ])),
          const SizedBox(width: 6),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Max Price', style: TextStyle(color: ext.textMuted, fontSize: 10)),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 7),
              decoration: BoxDecoration(border: Border.all(color: ext.border),
                  borderRadius: BorderRadius.circular(6), color: ext.card),
              child: Row(children: [
                Expanded(child: Text(_buildMaxPrice, style: TextStyle(
                    color: ext.textPrimary, fontSize: 11))),
                Icon(Icons.keyboard_arrow_down, size: 12, color: ext.textMuted),
              ]),
            ),
          ])),
        ]),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: () {},
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.green,
              padding: const EdgeInsets.symmetric(vertical: 14),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            child: const Text('Build Strategy', style: TextStyle(color: Colors.white,
                fontSize: 14, fontWeight: FontWeight.w700)),
          ),
        ),
        const SizedBox(height: 18),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Quick Templates', style: TextStyle(color: ext.textPrimary,
              fontSize: 13, fontWeight: FontWeight.w700)),
          Text('View All ›', style: TextStyle(color: AppColors.blue,
              fontSize: 12, fontWeight: FontWeight.w600)),
        ]),
        const SizedBox(height: 10),
        GridView.count(
          crossAxisCount: 2, shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          crossAxisSpacing: 10, mainAxisSpacing: 10, childAspectRatio: 3.2,
          children: templates.map((t) => Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              border: Border.all(color: ext.border),
              borderRadius: BorderRadius.circular(10), color: ext.card,
            ),
            child: Row(children: [
              Icon(t.icon, size: 16, color: AppColors.green),
              const SizedBox(width: 6),
              Flexible(child: Text(t.name, style: TextStyle(color: ext.textPrimary,
                  fontSize: 11, fontWeight: FontWeight.w600),
                  overflow: TextOverflow.ellipsis)),
            ]),
          )).toList(),
        ),
      ]),
    );
  }

  // ─── Coming Soon Tab ─────────────────────────────────────────────────────────

  Widget _comingSoonTab(AppThemeExtension ext, IconData icon, String title) => Padding(
    padding: const EdgeInsets.all(32),
    child: Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 48, color: ext.textSecondary),
        const SizedBox(height: 12),
        Text(title, style: TextStyle(color: ext.textPrimary,
            fontSize: 16, fontWeight: FontWeight.w600)),
        const SizedBox(height: 6),
        Text('Coming soon', style: TextStyle(color: ext.textMuted, fontSize: 13)),
      ]),
    ),
  );

  void _addLeg() {
    final symbol = _underlying.replaceAll(' 50', '').replaceAll(' ', '');
    final ls = _lotSizes[_underlying] ?? 75;
    OptionChainScreen.show(context,
      symbol: symbol,
      exchange: _underlying == 'SENSEX' ? 'BSE' : 'NSE',
      lotSize: ls,
      onLegsSelected: (selections) {
        setState(() {
          for (final sel in selections) {
            _legs.add(StrategyLeg(
              underlying: symbol,
              expiry: _expiry,
              strike: sel.strike,
              optionType: sel.isCall ? OptionType.call : OptionType.put,
              side: sel.isBuy ? LegSide.buy : LegSide.sell,
              lots: sel.qtyLots,
              premium: sel.ltp,
              lotSize: ls,
            ));
          }
        });
      },
    );
  }

  // ─── Edit Parameters Modal ───────────────────────────────────────────────────

  void _showEditParamsSheet() {
    final ext = context.appColors;
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      useSafeArea: true,
      builder: (_) => StatefulBuilder(
        builder: (ctx, setModal) {
          return Container(
            height: MediaQuery.of(ctx).size.height * 0.88,
            decoration: BoxDecoration(
              color: ext.surface,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
            ),
            child: Column(children: [
              const SizedBox(height: 10),
              Center(child: Container(width: 36, height: 4,
                  decoration: BoxDecoration(color: ext.border,
                      borderRadius: BorderRadius.circular(2)))),
              const SizedBox(height: 10),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('Edit Parameters',
                      style: TextStyle(color: ext.textPrimary, fontSize: 15,
                          fontWeight: FontWeight.w700)),
                  GestureDetector(
                    onTap: () {
                      setState(() {
                        _eUnderlying = _underlying;
                        _eSpot       = _spot;
                        _eIv         = _iv;
                        _eDte        = _dte;
                        _eExpiry     = _expiry;
                        _spotLocked  = false;
                      });
                      setModal(() {});
                    },
                    child: Text('Reset',
                        style: TextStyle(color: AppColors.blue, fontSize: 13,
                            fontWeight: FontWeight.w600)),
                  ),
                ]),
              ),
              const SizedBox(height: 8),
              _eParamTabBar(ext, onTabChange: (i) {
                setState(() => _eParamTab = i);
                setModal(() {});
              }),
              Divider(height: 1, color: ext.border),
              Expanded(
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  children: [
                    ..._eParamContent(ext),
                    const SizedBox(height: 14),
                    SizedBox(
                      width: double.infinity,
                      child: ElevatedButton(
                        onPressed: () {
                          _applyChanges();
                          Navigator.pop(ctx);
                        },
                        style: ElevatedButton.styleFrom(
                          backgroundColor: AppColors.green,
                          padding: const EdgeInsets.symmetric(vertical: 14),
                          shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12)),
                        ),
                        child: const Text('Apply Changes',
                            style: TextStyle(color: Colors.white, fontSize: 15,
                                fontWeight: FontWeight.w700)),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            ]),
          );
        },
      ),
    );
  }

  Widget _eParamTabBar(AppThemeExtension ext, {void Function(int)? onTabChange}) {
    const labels = ['General', 'IV / Vol', 'Time', 'Target'];
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: labels.asMap().entries.map((e) {
          final sel = _eParamTab == e.key;
          return Expanded(
            child: GestureDetector(
              onTap: () {
                setState(() => _eParamTab = e.key);
                onTabChange?.call(e.key);
              },
              child: Column(
                children: [
                  Text(e.value,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                          color: sel ? AppColors.green : ext.textSecondary,
                          fontSize: 12,
                          fontWeight:
                              sel ? FontWeight.w700 : FontWeight.w500)),
                  const SizedBox(height: 4),
                  Container(
                      height: 2,
                      color: sel ? AppColors.green : Colors.transparent),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }

  List<Widget> _eParamContent(AppThemeExtension ext) {
    switch (_eParamTab) {
      case 0: return _eGeneral(ext);
      case 1: return _eIvContent(ext);
      case 2: return _eTime(ext);
      default: return _eTarget(ext);
    }
  }

  List<Widget> _eGeneral(AppThemeExtension ext) => [
    // Row 1: Underlying + Spot Price
    Row(children: [
      Expanded(child: _EField(label: 'Underlying', ext: ext,
          child: GestureDetector(
            onTap: () => _showUnderlyingPicker(ext),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_eUnderlying, style: TextStyle(color: ext.textPrimary,
                    fontSize: 13, fontWeight: FontWeight.w600)),
                Icon(Icons.keyboard_arrow_down, size: 16, color: ext.textMuted),
              ],
            ),
          ))),
      const SizedBox(width: 10),
      Expanded(child: _EField(label: 'Spot Price', ext: ext,
          child: Text(NumberFormat('#,##,##0.00').format(_eSpot),
              style: TextStyle(color: ext.textPrimary, fontSize: 13,
                  fontWeight: FontWeight.w600)))),
    ]),
    const SizedBox(height: 10),
    // Row 2: Expiry Date + DTE
    Row(children: [
      Expanded(child: _EField(label: 'Expiry Date', ext: ext,
          child: GestureDetector(
            onTap: () => _showExpiryPicker(ext),
            child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(_fmtDate(_eExpiry), style: TextStyle(color: ext.textPrimary,
                    fontSize: 13, fontWeight: FontWeight.w600)),
                Icon(Icons.keyboard_arrow_down, size: 16, color: ext.textMuted),
              ],
            ),
          ))),
      const SizedBox(width: 10),
      Expanded(child: _EField(label: 'DTE', ext: ext,
          child: Row(mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${_eDte.toInt()} Days', style: TextStyle(
                  color: ext.textPrimary, fontSize: 13,
                  fontWeight: FontWeight.w600)),
              Icon(Icons.keyboard_arrow_down, size: 16, color: ext.textMuted),
            ],
          ))),
    ]),
  ];

  List<Widget> _eIvContent(AppThemeExtension ext) {
    final ivPct    = _eIv * 100;
    final ivRank   = 45.0; // placeholder
    final ivPctile = 62.0; // placeholder
    final m1sd     = ivPct * 0.66;
    final p1sd     = ivPct * 1.34;
    const quickIvs = [5.0, 10.0, 15.0, 20.0, 25.0];
    return [
      // ── Implied Volatility header ──
      Row(children: [
        Text('Implied Volatility', style: TextStyle(color: ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        Icon(Icons.info_outline, size: 13, color: ext.textMuted),
      ]),
      const SizedBox(height: 6),
      Row(children: [
        Text('${ivPct.toStringAsFixed(2)}%', style: TextStyle(
            color: ext.textPrimary, fontSize: 22, fontWeight: FontWeight.w800)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
          decoration: BoxDecoration(color: AppColors.greenDimLight,
              borderRadius: BorderRadius.circular(5),
              border: Border.all(color: AppColors.green.withOpacity(0.4))),
          child: Text('Live IV', style: TextStyle(color: AppColors.green,
              fontSize: 10, fontWeight: FontWeight.w700)),
        ),
      ]),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('IV Rank', style: TextStyle(color: ext.textMuted, fontSize: 11)),
            Text('${ivRank.toInt()}%', style: TextStyle(color: ext.textPrimary,
                fontSize: 13, fontWeight: FontWeight.w700)),
          ])),
        Container(width: 1, height: 28, color: ext.border),
        Expanded(child: Padding(
          padding: const EdgeInsets.only(left: 14),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('IV Percentile', style: TextStyle(color: ext.textMuted, fontSize: 11)),
              Text('${ivPctile.toInt()}%', style: TextStyle(color: ext.textPrimary,
                  fontSize: 13, fontWeight: FontWeight.w700)),
            ]),
        )),
      ]),
      Divider(color: ext.border, height: 20),
      // ── Adjust IV ──
      Row(children: [
        Text('Adjust IV', style: TextStyle(color: ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        Icon(Icons.info_outline, size: 13, color: ext.textMuted),
      ]),
      const SizedBox(height: 8),
      Center(
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
          decoration: BoxDecoration(border: Border.all(color: ext.border),
              borderRadius: BorderRadius.circular(8)),
          child: Text('${ivPct.toStringAsFixed(2)}%', style: TextStyle(
              color: ext.textPrimary, fontSize: 16, fontWeight: FontWeight.w700)),
        ),
      ),
      const SizedBox(height: 6),
      Row(children: [
        Text('5%', style: TextStyle(color: ext.textMuted, fontSize: 11)),
        Expanded(child: SliderTheme(
          data: SliderThemeData(
            activeTrackColor: AppColors.green,
            inactiveTrackColor: ext.border,
            thumbColor: AppColors.green,
            overlayColor: AppColors.green.withOpacity(0.15),
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
            trackHeight: 3,
          ),
          child: Slider(
            value: (_eIv * 100).clamp(5, 50),
            min: 5, max: 50, divisions: 90,
            onChanged: (v) => setState(() { _eIv = v / 100; _ivQuickIdx = -1; }),
          ),
        )),
        Text('50%', style: TextStyle(color: ext.textMuted, fontSize: 11)),
      ]),
      const SizedBox(height: 8),
      // Quick Select IV
      Text('Quick Select', style: TextStyle(color: ext.textSecondary,
          fontSize: 11, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      Row(children: quickIvs.asMap().entries.map((e) {
        final sel = _ivQuickIdx == e.key;
        return Expanded(child: Padding(
          padding: EdgeInsets.only(right: e.key < quickIvs.length - 1 ? 6 : 0),
          child: GestureDetector(
            onTap: () => setState(() {
              _ivQuickIdx = e.key; _eIv = e.value / 100;
            }),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: BoxDecoration(
                color: sel ? AppColors.greenDimLight : ext.card,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: sel ? AppColors.green : ext.border),
              ),
              alignment: Alignment.center,
              child: Text('${e.value.toInt()}%', style: TextStyle(
                color: sel ? AppColors.green : ext.textSecondary,
                fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ),
        ));
      }).toList()),
      Divider(color: ext.border, height: 20),
      // ── IV Scenario ──
      Row(children: [
        Text('IV Scenario', style: TextStyle(color: ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        Icon(Icons.info_outline, size: 13, color: ext.textMuted),
      ]),
      const SizedBox(height: 8),
      Row(children: [
        _IvScenarioBox(label: '-1 SD', value: '${m1sd.toStringAsFixed(1)}%',
            color: AppColors.red, bg: ext.card, border: ext.border,
            textPrimary: AppColors.red, ext: ext),
        const SizedBox(width: 8),
        _IvScenarioBox(label: 'Current', value: '${ivPct.toStringAsFixed(2)}%',
            color: AppColors.green, bg: AppColors.greenDimLight,
            border: AppColors.green, textPrimary: AppColors.green, ext: ext),
        const SizedBox(width: 8),
        _IvScenarioBox(label: '+1 SD', value: '${p1sd.toStringAsFixed(1)}%',
            color: AppColors.blue, bg: ext.card, border: ext.border,
            textPrimary: AppColors.blue, ext: ext),
      ]),
      const SizedBox(height: 12),
      // Info tip
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: AppColors.greenDimLight.withOpacity(0.5),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.green.withOpacity(0.3))),
        child: Row(children: [
          Icon(Icons.lightbulb_outline, size: 14, color: AppColors.green),
          const SizedBox(width: 8),
          Expanded(child: Text(
            'Changing IV will update option prices and the payoff curve.',
            style: TextStyle(color: ext.textSecondary, fontSize: 11))),
        ]),
      ),
    ];
  }

  List<Widget> _eTime(AppThemeExtension ext) {
    const quickDtes = [7, 15, 30, 45, 60];
    // Compute theta from legs
    final T       = max(0.001, _eDte / 365);
    double theta  = 0;
    for (final l in _legs) {
      final bs   = bsCalc(_eSpot, l.strike, T, _eIv, l.isCall);
      final sign = l.isBuy ? 1.0 : -1.0;
      theta += sign * bs.theta * l.lots * l.lotSize;
    }
    final thetaTotal = theta * _eDte;
    return [
      // ── DTE header ──
      Row(children: [
        Text('Days to Expiry (DTE)', style: TextStyle(color: ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        Icon(Icons.info_outline, size: 13, color: ext.textMuted),
      ]),
      const SizedBox(height: 6),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('${_eDte.toInt()} Days', style: TextStyle(color: ext.textPrimary,
            fontSize: 22, fontWeight: FontWeight.w800)),
        GestureDetector(
          onTap: () => _showExpiryPicker(ext),
          child: Container(
            padding: const EdgeInsets.all(7),
            decoration: BoxDecoration(border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8)),
            child: Icon(Icons.calendar_today_outlined, size: 16, color: ext.textSecondary),
          ),
        ),
      ]),
      const SizedBox(height: 6),
      Row(children: [
        Text('1 Day', style: TextStyle(color: ext.textMuted, fontSize: 10)),
        Expanded(child: SliderTheme(
          data: SliderThemeData(
            activeTrackColor: AppColors.blue,
            inactiveTrackColor: ext.border,
            thumbColor: AppColors.blue,
            overlayColor: AppColors.blue.withOpacity(0.15),
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 8),
            trackHeight: 3,
          ),
          child: Slider(
            value: _eDte.clamp(1, 365),
            min: 1, max: 365, divisions: 364,
            onChanged: (v) => setState(() { _eDte = v; _dteQuickIdx = -1; }),
          ),
        )),
        Text('365 Days', style: TextStyle(color: ext.textMuted, fontSize: 10)),
      ]),
      const SizedBox(height: 8),
      // Quick Select
      Text('Quick Select', style: TextStyle(color: ext.textSecondary,
          fontSize: 11, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      Row(children: quickDtes.asMap().entries.map((e) {
        final sel = _dteQuickIdx == e.key;
        return Expanded(child: Padding(
          padding: EdgeInsets.only(right: e.key < quickDtes.length - 1 ? 6 : 0),
          child: GestureDetector(
            onTap: () => setState(() { _dteQuickIdx = e.key; _eDte = e.value.toDouble(); }),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: BoxDecoration(
                color: sel ? AppColors.blue.withOpacity(0.1) : ext.card,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: sel ? AppColors.blue : ext.border),
              ),
              alignment: Alignment.center,
              child: Text('${e.value}D', style: TextStyle(
                color: sel ? AppColors.blue : ext.textSecondary,
                fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ),
        ));
      }).toList()),
      Divider(color: ext.border, height: 20),
      // Expiry Date
      Text('Expiry Date', style: TextStyle(color: ext.textSecondary,
          fontSize: 12, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      GestureDetector(
        onTap: () => _showExpiryPicker(ext),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(border: Border.all(color: ext.border),
              borderRadius: BorderRadius.circular(8), color: ext.card),
          child: Row(children: [
            Icon(Icons.calendar_today_outlined, size: 14, color: ext.textMuted),
            const SizedBox(width: 8),
            Expanded(child: Text(_fmtDate(_eExpiry), style: TextStyle(
                color: ext.textPrimary, fontSize: 13, fontWeight: FontWeight.w600))),
            Icon(Icons.keyboard_arrow_down, size: 16, color: ext.textMuted),
          ]),
        ),
      ),
      Divider(color: ext.border, height: 20),
      // Time Decay Preview
      Row(children: [
        Text('Time Decay Preview', style: TextStyle(color: ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        Icon(Icons.info_outline, size: 13, color: ext.textMuted),
      ]),
      const SizedBox(height: 8),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('Theta (Daily)', style: TextStyle(color: ext.textSecondary, fontSize: 12)),
        Text(theta.toStringAsFixed(1), style: TextStyle(
            color: theta < 0 ? AppColors.red : AppColors.green,
            fontSize: 13, fontWeight: FontWeight.w700)),
      ]),
      const SizedBox(height: 4),
      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
        Text('Theta (Total)', style: TextStyle(color: ext.textSecondary, fontSize: 12)),
        Text(thetaTotal.toStringAsFixed(1), style: TextStyle(
            color: thetaTotal < 0 ? AppColors.red : AppColors.green,
            fontSize: 13, fontWeight: FontWeight.w700)),
      ]),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: AppColors.blue.withOpacity(0.07),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.blue.withOpacity(0.25))),
        child: Row(children: [
          Icon(Icons.access_time, size: 14, color: AppColors.blue),
          const SizedBox(width: 8),
          Expanded(child: Text(
            'Increasing DTE reduces time decay but usually increases premiums.',
            style: TextStyle(color: ext.textSecondary, fontSize: 11))),
        ]),
      ),
    ];
  }

  List<Widget> _eTarget(AppThemeExtension ext) {
    const pnlQuicks = [10000.0, 25000.0, 50000.0, 100000.0];
    const pnlLabels = ['+10K', '+25K', '+50K', '+1L'];
    // Probability = % of price range above/below target
    final lo = _eSpot * 0.75, hi = _eSpot * 1.25;
    final prob = _targetAbove
        ? ((hi - _targetPrice) / (hi - lo) * 100).clamp(0.0, 100.0)
        : ((_targetPrice - lo) / (hi - lo) * 100).clamp(0.0, 100.0);

    return [
      // ── Price Target ──
      Row(children: [
        Text('Price Target', style: TextStyle(color: ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        Icon(Icons.info_outline, size: 13, color: ext.textMuted),
      ]),
      const SizedBox(height: 8),
      // Mode toggle: Price / P&L / % Return
      Container(
        decoration: BoxDecoration(border: Border.all(color: ext.border),
            borderRadius: BorderRadius.circular(8)),
        child: Row(children: ['Price', 'P&L', '% Return'].asMap().entries.map((e) {
          final sel = _targetMode == e.key;
          return Expanded(child: GestureDetector(
            onTap: () => setState(() => _targetMode = e.key),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: BoxDecoration(
                color: sel ? AppColors.amber.withOpacity(0.15) : Colors.transparent,
                borderRadius: BorderRadius.circular(7),
                border: sel ? Border.all(color: AppColors.amber) : null,
              ),
              alignment: Alignment.center,
              child: Text(e.value, style: TextStyle(
                  color: sel ? AppColors.amber : ext.textSecondary,
                  fontSize: 12, fontWeight: sel ? FontWeight.w700 : FontWeight.w500)),
            ),
          ));
        }).toList()),
      ),
      const SizedBox(height: 14),
      // Target Price stepper
      Text('Target Price', style: TextStyle(color: ext.textSecondary,
          fontSize: 12, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      Row(children: [
        GestureDetector(
          onTap: () => setState(() => _targetPrice = max(0, _targetPrice - 50)),
          child: Container(
            width: 36, height: 36,
            decoration: BoxDecoration(border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8), color: ext.card),
            alignment: Alignment.center,
            child: Icon(Icons.remove, size: 16, color: ext.textPrimary),
          ),
        ),
        Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 8),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8), color: ext.card),
            alignment: Alignment.center,
            child: Text(NumberFormat('#,##,##0').format(_targetPrice),
                style: TextStyle(color: ext.textPrimary, fontSize: 15,
                    fontWeight: FontWeight.w700)),
          ),
        ),
        GestureDetector(
          onTap: () => setState(() => _targetPrice += 50),
          child: Container(
            width: 36, height: 36,
            decoration: BoxDecoration(border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8), color: ext.card),
            alignment: Alignment.center,
            child: Icon(Icons.add, size: 16, color: ext.textPrimary),
          ),
        ),
      ]),
      const SizedBox(height: 4),
      Center(child: Text('Current: ${NumberFormat('#,##,##0.00').format(_eSpot)}',
          style: TextStyle(color: ext.textMuted, fontSize: 11))),
      const SizedBox(height: 14),
      // Target Type: Above / Below
      Text('Target Type', style: TextStyle(color: ext.textSecondary,
          fontSize: 12, fontWeight: FontWeight.w600)),
      const SizedBox(height: 6),
      Row(children: [
        Expanded(child: GestureDetector(
          onTap: () => setState(() => _targetAbove = true),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: _targetAbove ? AppColors.amber.withOpacity(0.12) : ext.card,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: _targetAbove ? AppColors.amber : ext.border),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.trending_up, size: 14,
                  color: _targetAbove ? AppColors.amber : ext.textSecondary),
              const SizedBox(width: 4),
              Text('Above', style: TextStyle(
                  color: _targetAbove ? AppColors.amber : ext.textSecondary,
                  fontSize: 12, fontWeight: FontWeight.w600)),
            ]),
          ),
        )),
        const SizedBox(width: 8),
        Expanded(child: GestureDetector(
          onTap: () => setState(() => _targetAbove = false),
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 9),
            decoration: BoxDecoration(
              color: !_targetAbove ? AppColors.amber.withOpacity(0.12) : ext.card,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: !_targetAbove ? AppColors.amber : ext.border),
            ),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.trending_down, size: 14,
                  color: !_targetAbove ? AppColors.amber : ext.textSecondary),
              const SizedBox(width: 4),
              Text('Below', style: TextStyle(
                  color: !_targetAbove ? AppColors.amber : ext.textSecondary,
                  fontSize: 12, fontWeight: FontWeight.w600)),
            ]),
          ),
        )),
      ]),
      Divider(color: ext.border, height: 20),
      // ── P&L Target ──
      Row(children: [
        Text('P&L Target (At Expiry)', style: TextStyle(color: ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        Icon(Icons.info_outline, size: 13, color: ext.textMuted),
      ]),
      const SizedBox(height: 6),
      Row(children: [
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
          decoration: BoxDecoration(border: Border.all(color: ext.border),
              borderRadius: BorderRadius.circular(8), color: ext.card),
          child: Text('₹', style: TextStyle(color: ext.textMuted, fontSize: 13)),
        ),
        Expanded(
          child: Container(
            margin: const EdgeInsets.symmetric(horizontal: 6),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8), color: ext.card),
            alignment: Alignment.center,
            child: Text('+${NumberFormat('#,##,##0').format(_targetPnl)}',
                style: TextStyle(color: ext.textPrimary, fontSize: 14,
                    fontWeight: FontWeight.w700)),
          ),
        ),
        GestureDetector(
          onTap: () => setState(() => _targetPnl = max(0, _targetPnl - 1000)),
          child: Container(
            width: 32, height: 36,
            decoration: BoxDecoration(border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8), color: ext.card),
            alignment: Alignment.center,
            child: Icon(Icons.remove, size: 14, color: ext.textPrimary),
          ),
        ),
        const SizedBox(width: 4),
        GestureDetector(
          onTap: () => setState(() => _targetPnl += 1000),
          child: Container(
            width: 32, height: 36,
            decoration: BoxDecoration(border: Border.all(color: ext.border),
                borderRadius: BorderRadius.circular(8), color: ext.card),
            alignment: Alignment.center,
            child: Icon(Icons.add, size: 14, color: ext.textPrimary),
          ),
        ),
      ]),
      const SizedBox(height: 8),
      Row(children: pnlQuicks.asMap().entries.map((e) {
        final sel = _pnlQuickIdx == e.key;
        return Expanded(child: Padding(
          padding: EdgeInsets.only(right: e.key < pnlQuicks.length - 1 ? 6 : 0),
          child: GestureDetector(
            onTap: () => setState(() { _pnlQuickIdx = e.key; _targetPnl = e.value; }),
            child: Container(
              padding: const EdgeInsets.symmetric(vertical: 7),
              decoration: BoxDecoration(
                color: sel ? AppColors.amber.withOpacity(0.15) : ext.card,
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: sel ? AppColors.amber : ext.border),
              ),
              alignment: Alignment.center,
              child: Text(pnlLabels[e.key], style: TextStyle(
                  color: sel ? AppColors.amber : ext.textSecondary,
                  fontSize: 11, fontWeight: sel ? FontWeight.w700 : FontWeight.w500)),
            ),
          ),
        ));
      }).toList()),
      Divider(color: ext.border, height: 20),
      // ── Probability at Target ──
      Row(children: [
        Text('Probability at Target', style: TextStyle(color: ext.textSecondary,
            fontSize: 12, fontWeight: FontWeight.w600)),
        const SizedBox(width: 4),
        Icon(Icons.info_outline, size: 13, color: ext.textMuted),
      ]),
      const SizedBox(height: 6),
      Text('${prob.toStringAsFixed(0)}%', style: TextStyle(color: ext.textPrimary,
          fontSize: 22, fontWeight: FontWeight.w800)),
      const SizedBox(height: 6),
      Row(children: [
        Text('0%', style: TextStyle(color: ext.textMuted, fontSize: 10)),
        Expanded(child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 6),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: prob / 100,
              minHeight: 6,
              backgroundColor: ext.border,
              valueColor: AlwaysStoppedAnimation(AppColors.amber),
            ),
          ),
        )),
        Text('100%', style: TextStyle(color: ext.textMuted, fontSize: 10)),
      ]),
      const SizedBox(height: 12),
      Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(color: AppColors.amber.withOpacity(0.08),
            borderRadius: BorderRadius.circular(8),
            border: Border.all(color: AppColors.amber.withOpacity(0.3))),
        child: Row(children: [
          Icon(Icons.gps_fixed, size: 14, color: AppColors.amber),
          const SizedBox(width: 8),
          Expanded(child: Text(
            'Targets are evaluated at expiry based on current assumptions.',
            style: TextStyle(color: ext.textSecondary, fontSize: 11))),
        ]),
      ),
    ];
  }

  void _showUnderlyingPicker(AppThemeExtension ext) {
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(width: 36, height: 4,
                decoration: BoxDecoration(color: ext.border,
                    borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 16),
            ..._underlyings.map((u) => ListTile(
              title: Text(u, style: TextStyle(color: ext.textPrimary,
                  fontWeight: FontWeight.w600)),
              trailing: _eUnderlying == u
                  ? const Icon(Icons.check, color: AppColors.green) : null,
              onTap: () {
                setState(() => _eUnderlying = u);
                Navigator.pop(context);
              },
            )),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  void _showExpiryPicker(AppThemeExtension ext) {
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(width: 36, height: 4,
                decoration: BoxDecoration(color: ext.border,
                    borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 16),
            ..._expiries.map((e) {
              final dte = e.difference(DateTime.now()).inDays;
              return ListTile(
                title: Text(_fmtDate(e), style: TextStyle(color: ext.textPrimary,
                    fontWeight: FontWeight.w600)),
                subtitle: Text('$dte days',
                    style: TextStyle(color: ext.textMuted, fontSize: 12)),
                trailing: _eExpiry == e
                    ? const Icon(Icons.check, color: AppColors.green) : null,
                onTap: () {
                  setState(() { _eExpiry = e; _eDte = dte.toDouble(); });
                  Navigator.pop(context);
                },
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  String _fmtDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]} ${d.year}';
  }
}

// ─── Strategy Card ────────────────────────────────────────────────────────────

class _StrategyCard extends StatelessWidget {
  final AppThemeExtension ext;
  final List<StrategyLeg> legs;
  final StrategyResult analysis;
  final double spot, iv, dte;
  final bool isSaved;
  final VoidCallback onSaveToggle;
  final DateTime expiry;
  final List<DateTime> expiries;
  final void Function(DateTime) onExpiryChange;
  final double? touchX;
  final Offset? touchPos;
  final double touchExpiryPnl, touchT0Pnl;
  final double touchDelta, touchTheta, touchVega, touchGamma;
  final void Function(double? x, Offset? pos) onTouch;

  const _StrategyCard({
    required this.ext, required this.legs, required this.analysis,
    required this.spot, required this.iv, required this.dte,
    required this.isSaved, required this.onSaveToggle,
    required this.expiry, required this.expiries,
    required this.onExpiryChange,
    required this.touchX, required this.touchPos,
    required this.touchExpiryPnl, required this.touchT0Pnl,
    required this.touchDelta, required this.touchTheta,
    required this.touchVega, required this.touchGamma,
    required this.onTouch,
  });

  @override
  Widget build(BuildContext context) {
    final fmt = NumberFormat('#,##,##0');
    final cashFlow = analysis.totalPremiumCashFlow;
    final isDebit  = cashFlow >= 0;
    final premiumColor = isDebit ? AppColors.red : AppColors.green;
    final premiumLabel = isDebit ? 'Net Debit' : 'Net Credit';

    return Container(
      padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header row
          Row(children: [
            const Spacer(),
            GestureDetector(
              onTap: onSaveToggle,
              child: Icon(
                isSaved ? Icons.bookmark : Icons.bookmark_border,
                size: 24,
                color: isSaved ? AppColors.green : ext.textSecondary,
              ),
            ),
          ]),
          const SizedBox(height: 10),
          // Premium banner
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: premiumColor.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: premiumColor.withValues(alpha: 0.25)),
            ),
            child: Row(children: [
              Text('$premiumLabel:',
                  style: TextStyle(color: premiumColor, fontSize: 11,
                      fontWeight: FontWeight.w600)),
              const SizedBox(width: 5),
              Text('${isDebit ? '-' : '+'}₹${fmt.format(cashFlow.abs())}',
                  style: TextStyle(color: premiumColor, fontSize: 13,
                      fontWeight: FontWeight.w800)),
              Container(width: 1, height: 14, color: premiumColor.withValues(alpha: 0.3),
                  margin: const EdgeInsets.symmetric(horizontal: 8)),
              Text('₹${analysis.netPremiumPerUnit.abs().toStringAsFixed(2)}/unit',
                  style: TextStyle(color: ext.textSecondary, fontSize: 11)),
              const Spacer(),
              // Breakeven chips
              ...analysis.breakevens.take(2).map((be) => Container(
                margin: const EdgeInsets.only(left: 4),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.amber.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: AppColors.amber.withValues(alpha: 0.4)),
                ),
                child: Text('BE ${fmt.format(be)}',
                    style: const TextStyle(color: AppColors.amber,
                        fontSize: 9, fontWeight: FontWeight.w700)),
              )),
            ]),
          ),
          const SizedBox(height: 10),
          // Stats row
          IntrinsicHeight(
            child: Row(children: [
              _StatCol(
                label: 'Max Profit',
                value: analysis.maxProfit >= 1e7
                    ? 'Unlimited'
                    : '+₹${fmt.format(analysis.maxProfit.abs())}',
                color: AppColors.green),
              _VDivider(ext: ext),
              _StatCol(
                label: 'Max Loss',
                value: analysis.maxLoss <= -1e7
                    ? 'Unlimited'
                    : '-₹${fmt.format(analysis.maxLoss.abs())}',
                color: AppColors.red),
              _VDivider(ext: ext),
              _StatCol(label: 'RR Ratio',
                  value: '1:${analysis.rrRatio.toStringAsFixed(1)}',
                  color: ext.textPrimary),
              _VDivider(ext: ext),
              _StatCol(label: 'POP',
                  value: '${analysis.pop.toStringAsFixed(0)}%',
                  color: ext.textPrimary),
            ]),
          ),
          const SizedBox(height: 14),
          // Chart — pass StrategyResult for payoff data + breakeven lines
          _PayoffChart(
            legs: legs, result: analysis,
            spot: spot, iv: iv, dte: dte, ext: ext,
            touchX: touchX, touchPos: touchPos,
            touchExpiryPnl: touchExpiryPnl, touchT0Pnl: touchT0Pnl,
            touchDelta: touchDelta, touchTheta: touchTheta,
            touchVega: touchVega, touchGamma: touchGamma,
            onTouch: onTouch,
            expiry: expiry, expiries: expiries,
            onExpiryChange: onExpiryChange,
          ),
          const SizedBox(height: 12),
          // Bottom stats
          IntrinsicHeight(
            child: Row(children: [
              _BStat(label: 'Spot',     value: NumberFormat('#,##,##0.00').format(spot), ext: ext),
              VerticalDivider(color: ext.border, width: 20, thickness: 1),
              _BStat(label: 'IV',       value: '${(iv * 100).toStringAsFixed(1)}%', ext: ext),
              VerticalDivider(color: ext.border, width: 20, thickness: 1),
              _BStat(label: 'DTE',      value: '${dte.toInt()} days', ext: ext),
              VerticalDivider(color: ext.border, width: 20, thickness: 1),
              _BStat(label: 'Lot Size', value: '${legs.isNotEmpty ? legs.first.lotSize : 75}', ext: ext),
            ]),
          ),
        ],
      ),
    );
  }
}

// ─── Payoff Chart ─────────────────────────────────────────────────────────────

class _PayoffChart extends StatelessWidget {
  final List<StrategyLeg> legs;
  final StrategyResult result;    // provides payoffData + breakevens
  final double spot, iv, dte;
  final AppThemeExtension ext;
  final double? touchX;
  final Offset? touchPos;
  final double touchExpiryPnl, touchT0Pnl;
  final double touchDelta, touchTheta, touchVega, touchGamma;
  final void Function(double? x, Offset? pos) onTouch;
  final DateTime expiry;
  final List<DateTime> expiries;
  final void Function(DateTime) onExpiryChange;

  const _PayoffChart({
    required this.legs, required this.result,
    required this.spot, required this.iv, required this.dte,
    required this.ext, required this.touchX, required this.touchPos,
    required this.touchExpiryPnl, required this.touchT0Pnl,
    required this.touchDelta, required this.touchTheta,
    required this.touchVega, required this.touchGamma,
    required this.onTouch, required this.expiry,
    required this.expiries, required this.onExpiryChange,
  });

  @override
  Widget build(BuildContext context) {
    if (legs.isEmpty || result.payoffData.isEmpty) {
      return SizedBox(
        height: 200,
        child: Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Add legs to see payoff',
                style: TextStyle(color: ext.textMuted, fontSize: 13)),
            const SizedBox(height: 14),
            GestureDetector(
              onTap: () {
                final state = context.findAncestorStateOfType<_StrategiesScreenState>();
                state?._addLeg();
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 9),
                decoration: BoxDecoration(
                  color: AppColors.green,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  const Icon(Icons.add, color: Colors.white, size: 16),
                  const SizedBox(width: 6),
                  const Text('Add Leg',
                      style: TextStyle(color: Colors.white, fontSize: 13,
                          fontWeight: FontWeight.w700)),
                ]),
              ),
            ),
          ]),
        ),
      );
    }

    // Use the calculator's payoff data (strike-based range, 25/50 step)
    final pd = result.payoffData;
    final lo = pd.first.spot;
    final hi = pd.last.spot;

    // Convert PayoffPoint list → FlSpot for expiry line
    final expirySpots = pd.map((p) => FlSpot(p.spot, p.pnl)).toList();

    // T+0 line: BS pricing over same x range (n=80 for performance)
    const n = 80;
    final t0Spots = List.generate(n, (i) {
      final s = lo + i * (hi - lo) / (n - 1);
      return FlSpot(s, legs.fold(0.0, (sum, l) => sum + _legT0Pnl(l, s, iv, dte)));
    });

    final allY     = [...expirySpots, ...t0Spots].map((s) => s.y).toList();
    final maxAbs   = allY.map((y) => y.abs()).fold(0.0, max) * 1.3;
    final chartMax = max(maxAbs, 10000.0);

    String fmtY(double v) {
      if (v == 0) return '0';
      final abs = v.abs();
      String s;
      if (abs >= 100000) s = '${(abs / 100000).toStringAsFixed(1)}L';
      else if (abs >= 1000) s = '${(abs / 1000).toStringAsFixed(0)}K';
      else s = abs.toStringAsFixed(0);
      return v > 0 ? '+$s' : '-$s';
    }

    // Breakeven vertical lines (amber dashed)
    final beLines = result.breakevens.map((be) => VerticalLine(
      x: be,
      color: AppColors.amber.withValues(alpha: 0.65),
      strokeWidth: 1.2,
      dashArray: [4, 4],
      label: VerticalLineLabel(
        show: true,
        alignment: Alignment.topRight,
        labelResolver: (_) => NumberFormat('#,##0').format(be),
        style: TextStyle(color: AppColors.amber, fontSize: 8,
            fontWeight: FontWeight.w700),
      ),
    )).toList();

    // Spot price vertical line
    final spotLine = VerticalLine(
      x: spot,
      color: ext.textMuted.withValues(alpha: 0.35),
      strokeWidth: 1,
      dashArray: [3, 3],
    );

    return Stack(
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Padding(
              padding: const EdgeInsets.only(left: 2, bottom: 2),
              child: Text('P&L',
                  style: TextStyle(color: ext.textMuted, fontSize: 10,
                      fontWeight: FontWeight.w600)),
            ),
            SizedBox(
              height: 230,
              child: LineChart(
                LineChartData(
                  minX: lo, maxX: hi,
                  minY: -chartMax, maxY: chartMax,
                  clipData: const FlClipData.all(),
                  extraLinesData: ExtraLinesData(
                    verticalLines: [spotLine, ...beLines],
                  ),
                  gridData: FlGridData(
                    show: true,
                    drawVerticalLine: false,
                    drawHorizontalLine: true,
                    horizontalInterval: chartMax / 3,
                    getDrawingHorizontalLine: (v) => FlLine(
                      color: v == 0
                          ? ext.textMuted.withValues(alpha: 0.5)
                          : ext.border.withValues(alpha: 0.5),
                      strokeWidth: v == 0 ? 1 : 0.5,
                      dashArray: v == 0 ? null : [4, 4],
                    ),
                  ),
                  titlesData: FlTitlesData(
                    topTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
                    leftTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        reservedSize: 44,
                        interval: chartMax / 3,
                        getTitlesWidget: (v, _) => Padding(
                          padding: const EdgeInsets.only(right: 4),
                          child: Text(fmtY(v),
                              style: TextStyle(color: ext.textMuted, fontSize: 9),
                              textAlign: TextAlign.right),
                        ),
                      ),
                    ),
                    bottomTitles: AxisTitles(
                      sideTitles: SideTitles(
                        showTitles: true,
                        interval: (hi - lo) / 4,
                        getTitlesWidget: (v, _) => Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(NumberFormat('#,##0').format(v),
                              style: TextStyle(color: ext.textMuted, fontSize: 9)),
                        ),
                      ),
                    ),
                  ),
                  borderData: FlBorderData(show: false),
                  lineTouchData: LineTouchData(
                    enabled: true,
                    touchCallback: (event, response) {
                      if (!event.isInterestedForInteractions) {
                        onTouch(null, null);
                        return;
                      }
                      final spots = response?.lineBarSpots;
                      if (spots != null && spots.isNotEmpty) {
                        final s = spots.firstWhere(
                          (s) => s.barIndex == 0,
                          orElse: () => spots.first,
                        );
                        onTouch(s.x, event.localPosition);
                      }
                    },
                    touchTooltipData: LineTouchTooltipData(
                      getTooltipItems: (_) => [],
                      getTooltipColor: (_) => Colors.transparent,
                    ),
                    getTouchedSpotIndicator: (barData, spotIndexes) =>
                        spotIndexes.map((_) {
                          if (barData.dashArray != null) return null;
                          return TouchedSpotIndicatorData(
                            FlLine(color: ext.textMuted.withValues(alpha: 0.4),
                                strokeWidth: 1, dashArray: [3, 3]),
                            FlDotData(
                              getDotPainter: (s, pct, bd, idx) =>
                                  FlDotCirclePainter(
                                    radius: 4, color: AppColors.green,
                                    strokeWidth: 2, strokeColor: Colors.white,
                                  ),
                            ),
                          );
                        }).toList(),
                  ),
                  lineBarsData: [
                    // 0: Expiry P&L — solid green (from calculator payoffData)
                    LineChartBarData(
                      spots: expirySpots,
                      color: AppColors.green,
                      barWidth: 2,
                      dotData: const FlDotData(show: false),
                      isCurved: true,
                      curveSmoothness: 0.1,
                      belowBarData: BarAreaData(
                        show: true,
                        color: AppColors.green.withValues(alpha: 0.15),
                        applyCutOffY: true,
                        cutOffY: 0,
                      ),
                      aboveBarData: BarAreaData(
                        show: true,
                        color: AppColors.red.withValues(alpha: 0.12),
                        applyCutOffY: true,
                        cutOffY: 0,
                      ),
                    ),
                    // 1: T+0 P&L — red dashed (BS pricing)
                    LineChartBarData(
                      spots: t0Spots,
                      color: AppColors.red.withValues(alpha: 0.8),
                      barWidth: 1.5,
                      dotData: const FlDotData(show: false),
                      isCurved: true,
                      curveSmoothness: 0.1,
                      dashArray: [5, 4],
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 6),
            Row(children: [
              Container(width: 18, height: 2, color: AppColors.green),
              const SizedBox(width: 4),
              Text('Expiry P&L', style: TextStyle(color: ext.textMuted, fontSize: 11)),
              const SizedBox(width: 12),
              _DashLegend(color: AppColors.red),
              const SizedBox(width: 4),
              Text('T+0 P&L', style: TextStyle(color: ext.textMuted, fontSize: 11)),
              if (result.breakevens.isNotEmpty) ...[
                const SizedBox(width: 12),
                _DashLegend(color: AppColors.amber),
                const SizedBox(width: 4),
                Text('Breakeven', style: TextStyle(color: ext.textMuted, fontSize: 11)),
              ],
            ]),
          ],
        ),
        // Expiry selector
        Positioned(
          top: 6, right: 6,
          child: GestureDetector(
            onTap: () => _showExpiryModal(context),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
              decoration: BoxDecoration(
                  color: ext.bg,
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(color: ext.border)),
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Text('Expiry ', style: TextStyle(color: ext.textMuted, fontSize: 10)),
                Text(_shortDate(expiry),
                    style: TextStyle(color: ext.textPrimary, fontSize: 11,
                        fontWeight: FontWeight.w700)),
                const SizedBox(width: 2),
                Icon(Icons.keyboard_arrow_down, size: 13, color: ext.textMuted),
              ]),
            ),
          ),
        ),
        if (touchX != null && touchPos != null)
          _buildTooltip(context),
      ],
    );
  }

  void _showExpiryModal(BuildContext context) {
    showModalBottomSheet(
      context: context,
      backgroundColor: ext.surface,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const SizedBox(height: 12),
            Container(width: 36, height: 4,
                decoration: BoxDecoration(color: ext.border,
                    borderRadius: BorderRadius.circular(2))),
            const SizedBox(height: 16),
            ...expiries.map((e) {
              final dte = e.difference(DateTime.now()).inDays;
              return ListTile(
                title: Text(_shortDate(e), style: TextStyle(color: ext.textPrimary,
                    fontWeight: FontWeight.w600)),
                subtitle: Text('$dte days',
                    style: TextStyle(color: ext.textMuted, fontSize: 12)),
                trailing: e == expiry
                    ? const Icon(Icons.check, color: AppColors.green) : null,
                onTap: () {
                  onExpiryChange(e);
                  Navigator.pop(context);
                },
              );
            }),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _buildTooltip(BuildContext context) {
    final px    = touchPos!.dx;
    final py    = touchPos!.dy;
    final w     = MediaQuery.of(context).size.width - 24 - 12 * 2;

    // Keep tooltip within chart width
    double left = px - 72;
    double top  = py - 180;
    left = left.clamp(0.0, max(0.0, w - 150.0));
    top  = top.clamp(0.0, 180.0);

    String fmtPnl(double v) {
      final abs = NumberFormat('#,##,##0').format(v.abs());
      return v >= 0 ? '+₹$abs' : '-₹$abs';
    }

    return Positioned(
      left: left, top: top,
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: ext.card,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: ext.border),
          boxShadow: [BoxShadow(
              color: Colors.black.withOpacity(0.1), blurRadius: 8)],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'NIFTY  ${NumberFormat('#,##,##0.00').format(touchX)}',
              style: TextStyle(color: ext.textPrimary, fontSize: 11,
                  fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 5),
            _TipRow('P&L (Expiry)', fmtPnl(touchExpiryPnl),
                touchExpiryPnl >= 0 ? AppColors.green : AppColors.red, ext),
            _TipRow('P&L (T+0)',    fmtPnl(touchT0Pnl),
                touchT0Pnl >= 0    ? AppColors.green : AppColors.red, ext),
            _TipRow('Delta',  touchDelta.toStringAsFixed(3), ext.textSecondary, ext),
            _TipRow('Theta',  '₹${touchTheta.toStringAsFixed(1)}', ext.textSecondary, ext),
            _TipRow('Vega',   '₹${touchVega.toStringAsFixed(1)}',  ext.textSecondary, ext),
            _TipRow('Gamma',  touchGamma.toStringAsFixed(5), ext.textSecondary, ext),
          ],
        ),
      ),
    );
  }

  String _shortDate(DateTime d) {
    const m = ['Jan','Feb','Mar','Apr','May','Jun',
                'Jul','Aug','Sep','Oct','Nov','Dec'];
    return '${d.day} ${m[d.month - 1]}';
  }
}

// ─── Leg Row ──────────────────────────────────────────────────────────────────

class _LegRow extends StatefulWidget {
  final StrategyLeg leg;
  final double spot, iv, dte;
  final AppThemeExtension ext;
  final ValueChanged<double> onPremiumChange;
  final ValueChanged<int> onLotsChange;
  final VoidCallback onDelete;
  final bool showDivider;

  const _LegRow({
    required this.leg, required this.spot, required this.iv, required this.dte,
    required this.ext, required this.onPremiumChange,
    required this.onLotsChange, required this.onDelete,
    required this.showDivider,
  });

  @override
  State<_LegRow> createState() => _LegRowState();
}

class _LegRowState extends State<_LegRow> {
  bool _editing = false;
  late final TextEditingController _ctrl;

  @override
  void initState() {
    super.initState();
    _ctrl = TextEditingController(text: widget.leg.premium.toStringAsFixed(2));
  }

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  @override
  Widget build(BuildContext context) {
    final ext    = widget.ext;
    final leg    = widget.leg;
    final accent = leg.isBuy ? AppColors.green : AppColors.red;
    final mn     = leg.moneyness(widget.spot);

    // Use input greeks when available; else fall back to Black-Scholes
    final T  = max(0.001, widget.dte / 365);
    final bs = bsCalc(widget.spot, leg.strike, T, widget.iv, leg.isCall);
    final greeks = leg.greeks ?? OptionGreeks(
        delta: bs.delta, theta: bs.theta, gamma: bs.gamma, vega: bs.vega);
    final ltp    = bs.price;
    final delta  = greeks.delta.abs();
    final ivPct  = widget.iv * 100;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 10),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // Top row: badge + symbol + moneyness + delete
            Row(children: [
              Container(
                width: 28, height: 28,
                decoration: BoxDecoration(color: accent,
                    borderRadius: BorderRadius.circular(7)),
                alignment: Alignment.center,
                child: Text(leg.legCode, style: const TextStyle(color: Colors.white,
                    fontSize: 12, fontWeight: FontWeight.w900)),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(leg.symbol, style: TextStyle(color: ext.textPrimary,
                    fontSize: 11, fontWeight: FontWeight.w700),
                    overflow: TextOverflow.ellipsis),
              ),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                decoration: BoxDecoration(color: ext.bg,
                    borderRadius: BorderRadius.circular(4),
                    border: Border.all(color: ext.border)),
                child: Text(mn, style: TextStyle(color: ext.textMuted,
                    fontSize: 10, fontWeight: FontWeight.w600)),
              ),
              const SizedBox(width: 8),
              GestureDetector(
                onTap: widget.onDelete,
                child: Container(
                  padding: const EdgeInsets.all(5),
                  decoration: BoxDecoration(color: AppColors.redDimLight,
                      borderRadius: BorderRadius.circular(6)),
                  child: Icon(Icons.delete_outline, size: 14, color: AppColors.red),
                ),
              ),
            ]),
            const SizedBox(height: 3),
            // Sub-text: side · lots · @premium
            Text('${leg.sideLabel}  ·  ${leg.lots} Lot  ·  @₹${leg.premium.toStringAsFixed(2)}',
                style: TextStyle(color: ext.textSecondary, fontSize: 11)),
            const SizedBox(height: 4),
            // LTP / Delta / IV row
            Row(children: [
              Text('LTP ', style: TextStyle(color: ext.textMuted, fontSize: 10)),
              Text('₹${ltp.toStringAsFixed(2)}',
                  style: TextStyle(color: ext.textPrimary,
                      fontSize: 11, fontWeight: FontWeight.w700)),
              Container(width: 1, height: 10, color: ext.border,
                  margin: const EdgeInsets.symmetric(horizontal: 8)),
              Text('Δ ', style: TextStyle(color: ext.textMuted, fontSize: 10)),
              Text(delta.toStringAsFixed(2),
                  style: TextStyle(color: ext.textPrimary,
                      fontSize: 11, fontWeight: FontWeight.w600)),
              Container(width: 1, height: 10, color: ext.border,
                  margin: const EdgeInsets.symmetric(horizontal: 8)),
              Text('IV ', style: TextStyle(color: ext.textMuted, fontSize: 10)),
              Text('${ivPct.toStringAsFixed(1)}%',
                  style: TextStyle(color: ext.textPrimary,
                      fontSize: 11, fontWeight: FontWeight.w600)),
            ]),
            Divider(color: ext.border, height: 16),
            // Qty + Premium row
            Row(children: [
              // Qty stepper
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Qty (Lots)', style: TextStyle(color: ext.textMuted, fontSize: 10)),
                  const SizedBox(height: 4),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    _QtyBtn(icon: Icons.remove, onTap: () {
                      if (leg.lots > 1) widget.onLotsChange(leg.lots - 1);
                    }, ext: ext),
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 6),
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(border: Border.all(color: ext.border),
                          borderRadius: BorderRadius.circular(6), color: ext.bg),
                      child: Text('${leg.lots}', style: TextStyle(
                          color: ext.textPrimary, fontSize: 12,
                          fontWeight: FontWeight.w700)),
                    ),
                    _QtyBtn(icon: Icons.add, onTap: () {
                      widget.onLotsChange(leg.lots + 1);
                    }, ext: ext),
                  ]),
                ])),
              const SizedBox(width: 12),
              // Premium edit
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Premium (₹)', style: TextStyle(color: ext.textMuted, fontSize: 10)),
                  const SizedBox(height: 4),
                  Container(
                    height: 34,
                    padding: const EdgeInsets.symmetric(horizontal: 8),
                    decoration: BoxDecoration(color: ext.bg,
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(color: ext.border)),
                    child: Row(children: [
                      Expanded(
                        child: _editing
                            ? TextField(
                                controller: _ctrl,
                                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                                style: TextStyle(color: ext.textPrimary,
                                    fontSize: 12, fontWeight: FontWeight.w700),
                                decoration: const InputDecoration(
                                    border: InputBorder.none, isDense: true,
                                    contentPadding: EdgeInsets.zero),
                                autofocus: true,
                                onSubmitted: (v) {
                                  final val = double.tryParse(v);
                                  if (val != null && val > 0) widget.onPremiumChange(val);
                                  setState(() => _editing = false);
                                },
                              )
                            : Text(leg.premium.toStringAsFixed(2),
                                style: TextStyle(color: ext.textPrimary,
                                    fontSize: 12, fontWeight: FontWeight.w700)),
                      ),
                      GestureDetector(
                        onTap: () => setState(() {
                          _ctrl.text = widget.leg.premium.toStringAsFixed(2);
                          _editing = !_editing;
                        }),
                        child: Icon(Icons.edit, size: 12, color: ext.textMuted),
                      ),
                    ]),
                  ),
                ])),
            ]),
          ]),
        ),
        if (widget.showDivider) Divider(color: ext.border, height: 1),
      ],
    );
  }
}

// ─── Small Helpers ────────────────────────────────────────────────────────────


class _StatCol extends StatelessWidget {
  final String label, value;
  final Color color;
  const _StatCol({required this.label, required this.value, required this.color});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Expanded(
      child: Column(children: [
        Text(label, style: TextStyle(color: ext.textMuted, fontSize: 10),
            textAlign: TextAlign.center),
        const SizedBox(height: 3),
        FittedBox(
          child: Text(value,
              style: TextStyle(color: color, fontSize: 11,
                  fontWeight: FontWeight.w700),
              textAlign: TextAlign.center),
        ),
      ]),
    );
  }
}

class _VDivider extends StatelessWidget {
  final AppThemeExtension ext;
  const _VDivider({required this.ext});

  @override
  Widget build(BuildContext context) =>
      Container(width: 1, height: 30, color: ext.border);
}

class _BStat extends StatelessWidget {
  final String label, value;
  final AppThemeExtension ext;
  const _BStat({required this.label, required this.value, required this.ext});

  @override
  Widget build(BuildContext context) => Expanded(
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(color: ext.textMuted, fontSize: 10)),
      const SizedBox(height: 2),
      Text(value, style: TextStyle(color: ext.textPrimary, fontSize: 12,
          fontWeight: FontWeight.w700)),
    ]),
  );
}

class _EField extends StatelessWidget {
  final String label;
  final Widget child;
  final AppThemeExtension ext;
  const _EField({required this.label, required this.child, required this.ext});

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.fromLTRB(12, 8, 12, 10),
    decoration: BoxDecoration(
        color: ext.card,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: ext.border)),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(color: ext.textMuted, fontSize: 11)),
      const SizedBox(height: 4),
      child,
    ]),
  );
}

class _TipRow extends StatelessWidget {
  final String label, value;
  final Color color;
  final AppThemeExtension ext;
  const _TipRow(this.label, this.value, this.color, this.ext);

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(top: 3),
    child: Row(children: [
      SizedBox(width: 82,
          child: Text(label, style: TextStyle(color: ext.textMuted, fontSize: 10))),
      const SizedBox(width: 6),
      Text(value, style: TextStyle(color: color, fontSize: 10,
          fontWeight: FontWeight.w700)),
    ]),
  );
}

class _DashLegend extends StatelessWidget {
  final Color color;
  const _DashLegend({required this.color});

  @override
  Widget build(BuildContext context) => CustomPaint(
    size: const Size(20, 2),
    painter: _DashPainter(color: color),
  );
}

class _DashPainter extends CustomPainter {
  final Color color;
  const _DashPainter({required this.color});

  @override
  void paint(Canvas canvas, Size size) {
    final p = Paint()..color = color..strokeWidth = 1.5;
    double x = 0;
    while (x < size.width) {
      canvas.drawLine(Offset(x, 1), Offset(min(x + 4, size.width), 1), p);
      x += 8;
    }
  }

  @override
  bool shouldRepaint(_DashPainter old) => old.color != color;
}

// ─── IV Scenario Box ──────────────────────────────────────────────────────────

class _IvScenarioBox extends StatelessWidget {
  final String label, value;
  final Color color, bg, border, textPrimary;
  final AppThemeExtension ext;
  const _IvScenarioBox({
    required this.label, required this.value, required this.color,
    required this.bg, required this.border, required this.textPrimary,
    required this.ext,
  });

  @override
  Widget build(BuildContext context) => Expanded(
    child: Container(
      padding: const EdgeInsets.symmetric(vertical: 10),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8),
          border: Border.all(color: border)),
      child: Column(children: [
        Text(label, style: TextStyle(color: color, fontSize: 10,
            fontWeight: FontWeight.w600)),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: textPrimary, fontSize: 13,
            fontWeight: FontWeight.w700)),
      ]),
    ),
  );
}

// ─── Qty Button ───────────────────────────────────────────────────────────────

class _QtyBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  final AppThemeExtension ext;
  const _QtyBtn({required this.icon, required this.onTap, required this.ext});

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: 30, height: 30,
      decoration: BoxDecoration(
        border: Border.all(color: ext.border),
        borderRadius: BorderRadius.circular(6), color: ext.card,
      ),
      alignment: Alignment.center,
      child: Icon(icon, size: 14, color: ext.textPrimary),
    ),
  );
}

// ─── Summary Stat Col ─────────────────────────────────────────────────────────

class _SummaryStatCol extends StatelessWidget {
  final String label, value;
  final Color color;
  final AppThemeExtension ext;
  const _SummaryStatCol({
    required this.label, required this.value,
    required this.color, required this.ext,
  });

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 6),
    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(color: ext.textMuted, fontSize: 9)),
      const SizedBox(height: 2),
      FittedBox(child: Text(value, style: TextStyle(color: color,
          fontSize: 12, fontWeight: FontWeight.w700))),
    ]),
  );
}

// ─── Greek Toggle Button ──────────────────────────────────────────────────────

class _GreekToggleBtn extends StatelessWidget {
  final String label;
  final bool sel;
  final AppThemeExtension ext;
  final VoidCallback onTap;
  const _GreekToggleBtn({
    required this.label, required this.sel,
    required this.ext, required this.onTap,
  });

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: sel ? AppColors.green : Colors.transparent,
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(label, style: TextStyle(
          color: sel ? Colors.white : ext.textSecondary,
          fontSize: 12, fontWeight: FontWeight.w600)),
    ),
  );
}

// ─── Greek Row ────────────────────────────────────────────────────────────────

class _GreekRow extends StatelessWidget {
  final String name, sym, desc, fmtVal;
  final double val;
  final AppThemeExtension ext;
  const _GreekRow({
    required this.name, required this.sym, required this.val,
    required this.desc, required this.fmtVal, required this.ext,
  });

  @override
  Widget build(BuildContext context) {
    final isNeg  = val < 0;
    final color  = isNeg ? AppColors.red : AppColors.green;
    final barVal = (val.abs() / max(val.abs(), 1e-6)).clamp(0.0, 1.0);
    return Padding(
      padding: const EdgeInsets.only(bottom: 14),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text(name, style: TextStyle(color: ext.textPrimary,
              fontSize: 13, fontWeight: FontWeight.w700)),
          Text(fmtVal, style: TextStyle(color: color,
              fontSize: 15, fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 2),
        Text(desc, style: TextStyle(color: ext.textMuted, fontSize: 10)),
        const SizedBox(height: 5),
        // Progress bar: left half = negative (red), right half = positive (green)
        ClipRRect(
          borderRadius: BorderRadius.circular(3),
          child: SizedBox(
            height: 5,
            child: Row(children: [
              Expanded(child: Align(
                alignment: Alignment.centerRight,
                child: FractionallySizedBox(
                  widthFactor: isNeg ? barVal : 0,
                  child: Container(color: AppColors.red),
                ),
              )),
              Container(width: 1, color: ext.border),
              Expanded(child: FractionallySizedBox(
                widthFactor: isNeg ? 0 : barVal,
                child: Container(color: AppColors.green),
              )),
            ]),
          ),
        ),
        const SizedBox(height: 2),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Bearish', style: TextStyle(color: AppColors.red, fontSize: 9)),
          Text('+', style: TextStyle(color: ext.textMuted, fontSize: 9)),
          Text('Bullish', style: TextStyle(color: AppColors.green, fontSize: 9)),
        ]),
        Divider(color: ext.border, height: 12),
      ]),
    );
  }
}
