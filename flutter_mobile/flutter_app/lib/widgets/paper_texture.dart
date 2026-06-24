import 'dart:math';
import 'package:flutter/material.dart';

/// Wraps [child] with a realistic paper texture overlay (light mode only).
/// Includes grain, horizontal fibers, subtle stains, and edge wear.
class PaperBackground extends StatelessWidget {
  final Widget child;
  const PaperBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    if (isDark) return child;
    return CustomPaint(
      painter: _PaperTexturePainter(),
      child: child,
    );
  }
}

class _PaperTexturePainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final rng = Random(1337);
    final w   = size.width;
    final h   = size.height;

    // ── Fine grain dots ──────────────────────────────────────────────────────
    for (var i = 0; i < 14000; i++) {
      final x  = rng.nextDouble() * w;
      final y  = rng.nextDouble() * h;
      final r  = rng.nextDouble() * 0.8 + 0.1;
      final op = 0.015 + rng.nextDouble() * 0.030;
      canvas.drawCircle(
        Offset(x, y), r,
        Paint()..color = const Color(0xFF6B4E2A).withValues(alpha: op),
      );
    }

    // ── Larger occasional speckles ───────────────────────────────────────────
    for (var i = 0; i < 380; i++) {
      final x  = rng.nextDouble() * w;
      final y  = rng.nextDouble() * h;
      final r  = rng.nextDouble() * 2.2 + 0.3;
      final op = 0.025 + rng.nextDouble() * 0.025;
      canvas.drawCircle(
        Offset(x, y), r,
        Paint()..color = const Color(0xFF6B4E2A).withValues(alpha: op),
      );
    }

    // ── Horizontal paper fibers (very faint) ─────────────────────────────────
    final fiberPaint = Paint()..strokeWidth = 0.5;
    for (var i = 0; i < 80; i++) {
      final y      = rng.nextDouble() * h;
      final xStart = rng.nextDouble() * w * 0.3;
      final xEnd   = xStart + 40 + rng.nextDouble() * (w * 0.5);
      final op     = 0.012 + rng.nextDouble() * 0.018;
      fiberPaint.color = const Color(0xFF8B6840).withValues(alpha: op);
      canvas.drawLine(Offset(xStart, y), Offset(xEnd, y), fiberPaint);
    }

    // ── Subtle coffee stains (faint rings) ───────────────────────────────────
    final stainPositions = [
      Offset(w * 0.82, h * 0.12),
      Offset(w * 0.15, h * 0.68),
      Offset(w * 0.60, h * 0.88),
    ];
    for (final center in stainPositions) {
      final radius  = 18.0 + rng.nextDouble() * 14;
      final opacity = 0.018 + rng.nextDouble() * 0.016;
      // Outer ring
      canvas.drawCircle(
        center, radius,
        Paint()
          ..color   = const Color(0xFF8B5E3C).withValues(alpha: opacity)
          ..style   = PaintingStyle.stroke
          ..strokeWidth = 2.5 + rng.nextDouble() * 1.5,
      );
      // Inner fill (very faint)
      canvas.drawCircle(
        center, radius - 1.5,
        Paint()
          ..color = const Color(0xFF8B5E3C).withValues(alpha: opacity * 0.25),
      );
    }

    // ── Subtle edge darkening (worn edges) ───────────────────────────────────
    final edgePaint = Paint()
      ..color = const Color(0xFF6B4E2A).withValues(alpha: 0.06);
    canvas.drawRect(Rect.fromLTWH(0, 0, 6, h), edgePaint);
    canvas.drawRect(Rect.fromLTWH(w - 6, 0, 6, h), edgePaint);
    canvas.drawRect(Rect.fromLTWH(0, 0, w, 4), edgePaint);
    canvas.drawRect(Rect.fromLTWH(0, h - 4, w, 4), edgePaint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter old) => false;
}
