import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import '../../models/models.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';

class PlaceOrderSheet extends StatefulWidget {
  final String symbol;
  final String exchange;
  final double ltp;
  final bool isBuy; // initial side

  const PlaceOrderSheet._({
    required this.symbol, required this.exchange,
    required this.ltp, required this.isBuy,
  });

  static void show(BuildContext context, {
    required String symbol,
    required String exchange,
    double ltp = 0,
    bool isBuy = true,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => PlaceOrderSheet._(
        symbol: symbol, exchange: exchange, ltp: ltp, isBuy: isBuy,
      ),
    );
  }

  @override
  State<PlaceOrderSheet> createState() => _PlaceOrderSheetState();
}

class _PlaceOrderSheetState extends State<PlaceOrderSheet> {
  late bool  _isBuy;
  bool       _isMarket = true;
  int        _qty      = 1;
  double     _price    = 0;
  bool       _placing  = false;
  String     _error    = '';
  bool       _done     = false;

  final _priceCtrl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _isBuy = widget.isBuy;
    _price = widget.ltp;
    _priceCtrl.text = _price > 0 ? _price.toStringAsFixed(2) : '';
  }

  @override
  void dispose() { _priceCtrl.dispose(); super.dispose(); }

  Future<void> _place() async {
    if (_qty <= 0) { setState(() => _error = 'Quantity must be ≥ 1'); return; }
    final execPrice = _isMarket ? widget.ltp : _price;
    setState(() { _placing = true; _error = ''; });
    try {
      final trading = context.read<TradingModeProvider>();
      final err = await trading.placePaperOrder(
        symbol:   widget.symbol,
        side:     _isBuy ? OrderSide.buy : OrderSide.sell,
        quantity: _qty,
        price:    execPrice,
        exchange: widget.exchange,
      );
      if (!mounted) return;
      if (err.isEmpty) {
        // Sync to OrdersProvider so the order book shows it immediately
        context.read<OrdersProvider>().mergeLocalOrders(
            trading.localOrdersAsOrders);
        setState(() { _done = true; _placing = false; });
        await Future.delayed(const Duration(milliseconds: 800));
        if (mounted) Navigator.pop(context);
      } else {
        setState(() { _error = err; _placing = false; });
      }
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _placing = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ext      = context.appColors;
    final accent   = _isBuy ? AppColors.green : AppColors.red;
    final fmt      = NumberFormat('#,##,##0.00');
    final mq       = MediaQuery.of(context);
    final keyPad   = mq.viewInsets.bottom;
    final navBar   = mq.viewPadding.bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: keyPad),
      child: Container(
        decoration: BoxDecoration(
          color: ext.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(22)),
        ),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          // Handle
          Container(
            margin: const EdgeInsets.only(top: 10, bottom: 8),
            width: 36, height: 4,
            decoration: BoxDecoration(
                color: ext.border, borderRadius: BorderRadius.circular(2)),
          ),

          // Header: symbol + BUY/SELL toggle
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Row(children: [
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(widget.symbol, style: TextStyle(color: ext.textPrimary,
                    fontSize: 18, fontWeight: FontWeight.w800)),
                Text(widget.exchange, style: TextStyle(color: ext.textMuted, fontSize: 12)),
              ])),
              // BUY / SELL toggle
              Container(
                decoration: BoxDecoration(
                  color: ext.card, borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: ext.border),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  _ToggleBtn('BUY',  !_isBuy ? null : AppColors.green,
                      () => setState(() => _isBuy = true)),
                  _ToggleBtn('SELL', _isBuy ? null : AppColors.red,
                      () => setState(() => _isBuy = false)),
                ]),
              ),
            ]),
          ),

          Divider(color: ext.border, height: 1),

          Padding(
            padding: EdgeInsets.fromLTRB(16, 16, 16, 20 + navBar),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              // LTP
              if (widget.ltp > 0) ...[
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('Market Price', style: TextStyle(color: ext.textMuted, fontSize: 13)),
                  Text('₹${fmt.format(widget.ltp)}',
                      style: TextStyle(color: ext.textPrimary,
                          fontSize: 16, fontWeight: FontWeight.w700)),
                ]),
                const SizedBox(height: 14),
              ],

              // Market / Limit toggle
              Row(children: [
                Text('Order Type', style: TextStyle(color: ext.textMuted, fontSize: 13)),
                const Spacer(),
                Container(
                  decoration: BoxDecoration(
                    color: ext.card, borderRadius: BorderRadius.circular(8),
                    border: Border.all(color: ext.border),
                  ),
                  child: Row(mainAxisSize: MainAxisSize.min, children: [
                    _ToggleBtn('Market', _isMarket ? accent : null,
                        () => setState(() => _isMarket = true)),
                    _ToggleBtn('Limit', !_isMarket ? accent : null,
                        () => setState(() => _isMarket = false)),
                  ]),
                ),
              ]),
              const SizedBox(height: 14),

              // Price field (Limit only)
              if (!_isMarket) ...[
                Text('Price', style: TextStyle(color: ext.textMuted, fontSize: 13)),
                const SizedBox(height: 6),
                TextField(
                  controller: _priceCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[\d.]'))],
                  onChanged: (v) => _price = double.tryParse(v) ?? 0,
                  decoration: InputDecoration(
                    prefixText: '₹ ',
                    filled: true, fillColor: ext.card,
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: ext.border)),
                    enabledBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: ext.border)),
                    focusedBorder: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(10),
                        borderSide: BorderSide(color: accent, width: 1.5)),
                    contentPadding: const EdgeInsets.symmetric(
                        horizontal: 14, vertical: 12),
                  ),
                ),
                const SizedBox(height: 14),
              ],

              // Quantity
              Row(children: [
                Text('Quantity', style: TextStyle(color: ext.textMuted, fontSize: 13)),
                const Spacer(),
                Container(
                  decoration: BoxDecoration(
                    color: ext.card, borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: ext.border),
                  ),
                  child: Row(children: [
                    IconButton(
                      onPressed: _qty > 1 ? () => setState(() => _qty--) : null,
                      icon: const Icon(Icons.remove_rounded, size: 18),
                      color: ext.textSecondary, padding: const EdgeInsets.all(6),
                      constraints: const BoxConstraints(),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Text('$_qty', style: TextStyle(
                          color: ext.textPrimary, fontSize: 16,
                          fontWeight: FontWeight.w700)),
                    ),
                    IconButton(
                      onPressed: () => setState(() => _qty++),
                      icon: const Icon(Icons.add_rounded, size: 18),
                      color: accent, padding: const EdgeInsets.all(6),
                      constraints: const BoxConstraints(),
                    ),
                  ]),
                ),
              ]),

              if (_error.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(_error, style: const TextStyle(color: AppColors.red, fontSize: 12)),
              ],

              const SizedBox(height: 20),

              // Place order button
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  style: FilledButton.styleFrom(
                    backgroundColor: _done ? Colors.grey : accent,
                    padding: const EdgeInsets.symmetric(vertical: 16),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: _placing || _done ? null : _place,
                  child: _placing
                      ? const SizedBox(width: 20, height: 20,
                          child: CircularProgressIndicator(
                              strokeWidth: 2, color: Colors.white))
                      : _done
                          ? const Icon(Icons.check_rounded, color: Colors.white)
                          : Text(
                              '${_isBuy ? 'BUY' : 'SELL'} ${widget.symbol}',
                              style: const TextStyle(fontSize: 15,
                                  fontWeight: FontWeight.w800, letterSpacing: 0.5)),
                ),
              ),
            ]),
          ),
        ]),
      ),
    );
  }
}

class _ToggleBtn extends StatelessWidget {
  final String label;
  final Color? activeColor;
  final VoidCallback onTap;
  const _ToggleBtn(this.label, this.activeColor, this.onTap);

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final active = activeColor != null;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 140),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
        decoration: BoxDecoration(
          color: active ? activeColor!.withValues(alpha: 0.12) : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: Text(label, style: TextStyle(
          color: active ? activeColor : ext.textMuted,
          fontSize: 13, fontWeight: FontWeight.w700,
        )),
      ),
    );
  }
}
