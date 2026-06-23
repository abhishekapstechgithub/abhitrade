import 'dart:math';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import '../theme/app_theme.dart';
import '../models/models.dart';
import 'package:google_fonts/google_fonts.dart';

// ─── Formatters ───────────────────────────────────────────────────────────────
final _rupee = NumberFormat.currency(locale: 'en_IN', symbol: '₹', decimalDigits: 2);
final _compact = NumberFormat.compact(locale: 'en_IN');
final _pct = NumberFormat('+##0.00;-##0.00');

String fmtRupee(double v) => _rupee.format(v);
String fmtCompact(double v) => '₹${_compact.format(v)}';
String fmtPct(double v) => '${_pct.format(v)}%';
String fmtChange(double v) => v >= 0 ? '+${v.toStringAsFixed(2)}' : v.toStringAsFixed(2);
Color gainColor(double v, BuildContext ctx) =>
    v >= 0 ? AppColors.green : AppColors.red;

// ─── Sparkline Painter ────────────────────────────────────────────────────────
class SparklinePainter extends CustomPainter {
  final List<double> data;
  final Color color;
  final bool fill;

  SparklinePainter(this.data, {required this.color, this.fill = true});

  @override
  void paint(Canvas canvas, Size size) {
    if (data.length < 2) return;
    final minV = data.reduce(min);
    final maxV = data.reduce(max);
    final range = (maxV - minV).abs();
    if (range == 0) return;

    final pts = List.generate(data.length, (i) {
      final x = i / (data.length - 1) * size.width;
      final y = size.height - ((data[i] - minV) / range) * size.height;
      return Offset(x, y);
    });

    final path = Path()..moveTo(pts[0].dx, pts[0].dy);
    for (var i = 1; i < pts.length; i++) {
      final cp = Offset((pts[i - 1].dx + pts[i].dx) / 2, pts[i - 1].dy);
      path.quadraticBezierTo(cp.dx, cp.dy, pts[i].dx, pts[i].dy);
    }

    if (fill) {
      final fillPath = Path.from(path)
        ..lineTo(pts.last.dx, size.height)
        ..lineTo(pts.first.dx, size.height)
        ..close();
      canvas.drawPath(
        fillPath,
        Paint()
          ..shader = LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [color.withValues(alpha: 0.35), color.withValues(alpha: 0.0)],
          ).createShader(Rect.fromLTWH(0, 0, size.width, size.height)),
      );
    }

    canvas.drawPath(
      path,
      Paint()
        ..color = color
        ..strokeWidth = 1.5
        ..style = PaintingStyle.stroke
        ..strokeCap = StrokeCap.round
        ..strokeJoin = StrokeJoin.round,
    );
  }

  @override
  bool shouldRepaint(SparklinePainter old) => old.data != data || old.color != color;
}

class Sparkline extends StatelessWidget {
  final List<double> data;
  final bool isPositive;
  final double width;
  final double height;

  const Sparkline({
    super.key,
    required this.data,
    required this.isPositive,
    this.width = 60,
    this.height = 28,
  });

  @override
  Widget build(BuildContext context) {
    final color = isPositive ? AppColors.green : AppColors.red;
    final seed = data.isNotEmpty ? data : _fakeSparkline(isPositive);
    return SizedBox(
      width: width,
      height: height,
      child: CustomPaint(painter: SparklinePainter(seed, color: color)),
    );
  }

  List<double> _fakeSparkline(bool positive) {
    final rng = Random(42);
    var v = 100.0;
    return List.generate(15, (_) {
      v += (rng.nextDouble() - (positive ? 0.4 : 0.6)) * 3;
      return v;
    });
  }
}

// ─── Index Chip ───────────────────────────────────────────────────────────────
class IndexChip extends StatelessWidget {
  final IndexPrice index;
  final VoidCallback? onTap;

  const IndexChip({super.key, required this.index, this.onTap});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final color = index.isPositive ? AppColors.green : AppColors.red;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 130,
        padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
        decoration: BoxDecoration(
          color: ext.card,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ext.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(index.symbol,
                style: TextStyle(
                    color: ext.textSecondary,
                    fontSize: 11,
                    fontWeight: FontWeight.w500)),
            const SizedBox(height: 3),
            Text(
              index.ltp == 0 ? '—' : NumberFormat('#,##,##0.00').format(index.ltp),
              style: TextStyle(
                  color: index.ltp == 0 ? ext.textMuted : ext.textPrimary,
                  fontSize: 15,
                  fontWeight: FontWeight.w800),
            ),
            const SizedBox(height: 2),
            Text(
              index.ltp == 0
                  ? 'Market Closed'
                  : '${index.isPositive ? '▲' : '▼'}${fmtChange(index.change).replaceAll('+', '').replaceAll('-', '')} (${fmtChange(index.changePct)}%)',
              style: TextStyle(
                  color: index.ltp == 0 ? ext.textMuted : color,
                  fontSize: 10,
                  fontWeight: FontWeight.w600),
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Watchlist Row ────────────────────────────────────────────────────────────
class WatchlistRow extends StatelessWidget {
  final WatchlistItem item;
  final VoidCallback? onTap;
  final VoidCallback? onBuy;
  final VoidCallback? onSell;

  const WatchlistRow({
    super.key,
    required this.item,
    this.onTap,
    this.onBuy,
    this.onSell,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final color = item.isPositive ? AppColors.green : AppColors.red;
    final dimColor = item.isPositive
        ? (context.isDark ? AppColors.greenDim : AppColors.greenDimLight)
        : (context.isDark ? AppColors.redDim : AppColors.redDimLight);

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        child: Row(
          children: [
            // Symbol + exchange
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(item.symbol,
                      style: TextStyle(
                          color: ext.textPrimary,
                          fontSize: 14,
                          fontWeight: FontWeight.w700)),
                  Text('${item.exchange} EQ',
                      style: TextStyle(color: ext.textMuted, fontSize: 12)),
                ],
              ),
            ),
            // Sparkline
            Sparkline(data: item.sparkline, isPositive: item.isPositive),
            const SizedBox(width: 12),
            // Price + change
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(
                  item.ltp > 0
                      ? '₹${NumberFormat('#,##,##0.00').format(item.ltp)}'
                      : '—',
                  style: TextStyle(
                      color: item.ltp > 0 ? ext.textPrimary : ext.textMuted,
                      fontSize: 14,
                      fontWeight: FontWeight.w700),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: item.ltp > 0 ? dimColor : context.appColors.card,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    item.ltp > 0 ? '${fmtChange(item.changePct)}%' : '—',
                    style: TextStyle(
                        color: item.ltp > 0 ? color : context.appColors.textMuted,
                        fontSize: 11,
                        fontWeight: FontWeight.w600),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

// ─── Holding Row ──────────────────────────────────────────────────────────────
class HoldingRow extends StatelessWidget {
  final Holding holding;
  const HoldingRow({super.key, required this.holding});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final color = holding.isProfit ? AppColors.green : AppColors.red;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(holding.symbol,
                    style: TextStyle(
                        color: ext.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w700)),
                Text(
                  '${holding.exchange} EQ  •  Qty: ${holding.quantity}  •  Avg: ₹${holding.avgPrice.toStringAsFixed(2)}',
                  style: TextStyle(color: ext.textMuted, fontSize: 12),
                ),
              ],
            ),
          ),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₹${NumberFormat('#,##,##0.00').format(holding.ltp)}',
                style: TextStyle(
                    color: ext.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w700),
              ),
              Text(
                '${fmtChange(holding.pnl.toDouble())}  (${fmtChange(holding.pnlPct)}%)',
                style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Order Card ───────────────────────────────────────────────────────────────
class OrderCard extends StatelessWidget {
  final Order order;
  final VoidCallback? onCancel;

  const OrderCard({super.key, required this.order, this.onCancel});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final sideColor = order.isBuy ? AppColors.green : AppColors.red;
    final sideLabel = order.isBuy ? 'BUY' : 'SELL';
    final statusLabel = order.status.name.toUpperCase();

    final statusColor = switch (order.status) {
      OrderStatus.open     => AppColors.blue,
      OrderStatus.pending  => AppColors.amber,
      OrderStatus.complete => AppColors.green,
      OrderStatus.rejected => AppColors.red,
      OrderStatus.cancelled=> ext.textMuted,
    };

    return Container(
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
              Expanded(
                child: Row(
                  children: [
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: order.isBuy ? AppColors.greenDim : AppColors.redDim,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(sideLabel,
                          style: TextStyle(
                              color: sideColor,
                              fontSize: 11,
                              fontWeight: FontWeight.w700)),
                    ),
                    const SizedBox(width: 8),
                    Text(order.symbol,
                        style: TextStyle(
                            color: ext.textPrimary,
                            fontSize: 15,
                            fontWeight: FontWeight.w700)),
                    if (order.isPaper) ...[
                      const SizedBox(width: 6),
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
                                fontWeight: FontWeight.w700)),
                      ),
                    ],
                  ],
                ),
              ),
              Text(statusLabel,
                  style: TextStyle(
                      color: statusColor,
                      fontSize: 12,
                      fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              _Detail('Qty', '${order.quantity}'),
              const SizedBox(width: 16),
              _Detail('Price', order.orderType == OrderType.market ? 'MKT' : '₹${order.price.toStringAsFixed(2)}'),
              const SizedBox(width: 16),
              _Detail('Type', order.orderType.name.toUpperCase()),
              const SizedBox(width: 16),
              _Detail(order.exchange, order.productType.name.toUpperCase()),
            ],
          ),
          if (order.isActive && onCancel != null) ...[
            const SizedBox(height: 10),
            Align(
              alignment: Alignment.centerRight,
              child: TextButton(
                onPressed: onCancel,
                style: TextButton.styleFrom(
                  foregroundColor: AppColors.red,
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  minimumSize: Size.zero,
                ),
                child: const Text('Cancel', style: TextStyle(fontSize: 13)),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _Detail extends StatelessWidget {
  final String label;
  final String value;
  const _Detail(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: ext.textMuted, fontSize: 11)),
        Text(value,
            style: TextStyle(
                color: ext.textSecondary,
                fontSize: 12,
                fontWeight: FontWeight.w600)),
      ],
    );
  }
}

// ─── Gainer/Loser Row ─────────────────────────────────────────────────────────
class GainerLoserRow extends StatelessWidget {
  final GainerLoser item;
  const GainerLoserRow({super.key, required this.item});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final color = item.isPositive ? AppColors.green : AppColors.red;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(item.symbol,
                    style: TextStyle(
                        color: ext.textPrimary,
                        fontSize: 14,
                        fontWeight: FontWeight.w600)),
                Text(item.exchange,
                    style: TextStyle(color: ext.textMuted, fontSize: 12)),
              ],
            ),
          ),
          // Sparkline
          Sparkline(
              data: const [], isPositive: item.isPositive, width: 55, height: 24),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text(
                '₹${NumberFormat('#,##,##0.00').format(item.ltp)}',
                style: TextStyle(
                    color: ext.textPrimary,
                    fontSize: 14,
                    fontWeight: FontWeight.w700),
              ),
              Text(
                '${fmtChange(item.percentChange)}%',
                style: TextStyle(
                    color: color, fontSize: 12, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

// ─── Section Header ───────────────────────────────────────────────────────────
class SectionHeader extends StatelessWidget {
  final String title;
  final String? action;
  final VoidCallback? onAction;

  const SectionHeader(
      {super.key, required this.title, this.action, this.onAction});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(title,
              style: context.isDark
                  ? TextStyle(
                      color: ext.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w700)
                  : GoogleFonts.lora(
                      color: ext.textPrimary,
                      fontSize: 16,
                      fontWeight: FontWeight.w700)),
          if (action != null)
            GestureDetector(
              onTap: onAction,
              child: Text(action!,
                  style: const TextStyle(
                      color: AppColors.blue,
                      fontSize: 13,
                      fontWeight: FontWeight.w600)),
            ),
        ],
      ),
    );
  }
}

// ─── Quick Action Button ──────────────────────────────────────────────────────
class QuickActionBtn extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onTap;

  const QuickActionBtn({
    super.key,
    required this.icon,
    required this.label,
    required this.color,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: Column(
        children: [
          Container(
            width: 52,
            height: 52,
            decoration: BoxDecoration(
              color: color.withValues(alpha: context.isDark ? 0.15 : 0.1),
              borderRadius: BorderRadius.circular(14),
              border: Border.all(color: color.withValues(alpha: 0.3)),
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(height: 6),
          Text(label,
              style: TextStyle(
                  color: ext.textSecondary,
                  fontSize: 11,
                  fontWeight: FontWeight.w500),
              textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

// ─── Paper Mode Banner ────────────────────────────────────────────────────────
class PaperModeBanner extends StatelessWidget {
  final double balance;
  const PaperModeBanner({super.key, required this.balance});

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final bgColor = isDark
        ? AppColors.amber.withValues(alpha: 0.15)
        : AppColors.amberDimLight;
    final textColor = isDark ? AppColors.amber : AppColors.amberDim;

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      color: bgColor,
      child: Row(
        children: [
          Icon(Icons.science_outlined, color: textColor, size: 16),
          const SizedBox(width: 8),
          Text('PAPER TRADING',
              style: TextStyle(
                  color: textColor,
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 1)),
          const Spacer(),
          Text('Balance: ${fmtRupee(balance)}',
              style: TextStyle(
                  color: textColor, fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

// ─── Place Order Sheet ────────────────────────────────────────────────────────
class PlaceOrderSheet extends StatefulWidget {
  final WatchlistItem item;
  final bool isPaper;
  final void Function(OrderSide side, int qty, double price, String mode) onConfirm;

  const PlaceOrderSheet({
    super.key,
    required this.item,
    required this.isPaper,
    required this.onConfirm,
  });

  static Future<void> show(BuildContext context, WatchlistItem item,
      bool isPaper, void Function(OrderSide, int, double, String) onConfirm) {
    return showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PlaceOrderSheet(item: item, isPaper: isPaper, onConfirm: onConfirm),
    );
  }

  @override
  State<PlaceOrderSheet> createState() => _PlaceOrderSheetState();
}

class _PlaceOrderSheetState extends State<PlaceOrderSheet> {
  OrderSide _side = OrderSide.buy;
  int _qty = 1;
  String _orderType = 'MARKET';
  final _priceCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _priceCtrl.text = widget.item.ltp.toStringAsFixed(2);
  }

  @override
  void dispose() {
    _priceCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final isBuy = _side == OrderSide.buy;
    final price = double.tryParse(_priceCtrl.text) ?? widget.item.ltp;
    final total = price * _qty;

    return Container(
      decoration: BoxDecoration(
        color: ext.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
      ),
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: MediaQuery.of(context).viewInsets.bottom + 20,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Row(
            children: [
              Expanded(
                child: Text('${widget.item.symbol}  •  ₹${widget.item.ltp.toStringAsFixed(2)}',
                    style: TextStyle(color: ext.textPrimary, fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              IconButton(
                icon: Icon(Icons.close, color: ext.textMuted),
                onPressed: () => Navigator.pop(context),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Buy/Sell toggle
          Row(
            children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _side = OrderSide.buy),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: isBuy ? AppColors.green : ext.card,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: isBuy ? AppColors.green : ext.border),
                    ),
                    alignment: Alignment.center,
                    child: Text('BUY',
                        style: TextStyle(
                          color: isBuy ? Colors.white : ext.textSecondary,
                          fontWeight: FontWeight.w700,
                        )),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: GestureDetector(
                  onTap: () => setState(() => _side = OrderSide.sell),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    decoration: BoxDecoration(
                      color: !isBuy ? AppColors.red : ext.card,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: !isBuy ? AppColors.red : ext.border),
                    ),
                    alignment: Alignment.center,
                    child: Text('SELL',
                        style: TextStyle(
                          color: !isBuy ? Colors.white : ext.textSecondary,
                          fontWeight: FontWeight.w700,
                        )),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          // Order type chips
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: ['MARKET', 'LIMIT', 'SL', 'SL-M'].map((t) {
                final sel = _orderType == t;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () => setState(() => _orderType = t),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                      decoration: BoxDecoration(
                        color: sel ? AppColors.blueDim : ext.card,
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: sel ? AppColors.blue : ext.border),
                      ),
                      child: Text(t,
                          style: TextStyle(
                            color: sel ? AppColors.blue : ext.textSecondary,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          )),
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          const SizedBox(height: 16),
          // Qty + Price row
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('Quantity', style: TextStyle(color: ext.textSecondary, fontSize: 12)),
                    const SizedBox(height: 6),
                    Row(
                      children: [
                        _QtyBtn(icon: Icons.remove, onTap: () => setState(() => _qty = max(1, _qty - 1))),
                        const SizedBox(width: 12),
                        Text('$_qty',
                            style: TextStyle(
                                color: ext.textPrimary,
                                fontSize: 18,
                                fontWeight: FontWeight.w700)),
                        const SizedBox(width: 12),
                        _QtyBtn(icon: Icons.add, onTap: () => setState(() => _qty++)),
                      ],
                    ),
                  ],
                ),
              ),
              if (_orderType != 'MARKET') ...[
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Price', style: TextStyle(color: ext.textSecondary, fontSize: 12)),
                      const SizedBox(height: 6),
                      TextField(
                        controller: _priceCtrl,
                        keyboardType: const TextInputType.numberWithOptions(decimal: true),
                        style: TextStyle(color: ext.textPrimary, fontSize: 16, fontWeight: FontWeight.w600),
                        onChanged: (_) => setState(() {}),
                        decoration: InputDecoration(
                          contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                          prefixText: '₹  ',
                          prefixStyle: TextStyle(color: ext.textSecondary),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 16),
          // Order total
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: ext.card,
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: ext.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Order Total', style: TextStyle(color: ext.textSecondary, fontSize: 13)),
                Text('₹${NumberFormat('#,##,##0.00').format(total)}',
                    style: TextStyle(
                        color: ext.textPrimary,
                        fontSize: 15,
                        fontWeight: FontWeight.w700)),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // Confirm button
          SizedBox(
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: isBuy ? AppColors.green : AppColors.red,
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              onPressed: () {
                widget.onConfirm(
                  _side,
                  _qty,
                  _orderType == 'MARKET' ? widget.item.ltp : price,
                  widget.isPaper ? 'paper' : 'live',
                );
                Navigator.pop(context);
              },
              child: Text(
                '${isBuy ? "Buy" : "Sell"} ${widget.item.symbol}',
                style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _QtyBtn extends StatelessWidget {
  final IconData icon;
  final VoidCallback onTap;
  const _QtyBtn({required this.icon, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 32,
        height: 32,
        decoration: BoxDecoration(
          color: ext.card,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: ext.border),
        ),
        child: Icon(icon, size: 18, color: ext.textPrimary),
      ),
    );
  }
}
