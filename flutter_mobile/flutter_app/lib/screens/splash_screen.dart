import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import 'main_screen.dart';
import 'login_screen.dart';

class SplashScreen extends StatefulWidget {
  const SplashScreen({super.key});
  @override
  State<SplashScreen> createState() => _SplashScreenState();
}

class _SplashScreenState extends State<SplashScreen>
    with SingleTickerProviderStateMixin {
  late final AnimationController _ctrl;
  late final Animation<double> _fade;
  late final Animation<double> _scale;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(vsync: this, duration: const Duration(milliseconds: 900));
    _fade  = CurvedAnimation(parent: _ctrl, curve: Curves.easeIn);
    _scale = Tween<double>(begin: 0.88, end: 1.0)
        .animate(CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic));
    _ctrl.forward();

    Future.delayed(const Duration(milliseconds: 2200), _navigate);
  }

  void _navigate() {
    if (!mounted) return;
    final auth = context.read<AuthProvider>();
    Navigator.pushReplacement(
      context,
      PageRouteBuilder(
        pageBuilder: (_, __, ___) =>
            auth.isLoggedIn ? const MainScreen() : const LoginScreen(),
        transitionDuration: const Duration(milliseconds: 400),
        transitionsBuilder: (_, anim, __, child) =>
            FadeTransition(opacity: anim, child: child),
      ),
    );
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final bg     = isDark ? const Color(0xFF111111) : const Color(0xFFF4F1EA);
    final fg     = isDark ? Colors.white : const Color(0xFF1A1A1A);

    return Scaffold(
      backgroundColor: bg,
      body: Center(
        child: FadeTransition(
          opacity: _fade,
          child: ScaleTransition(
            scale: _scale,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                // Logo
                SizedBox(
                  width: 160,
                  height: 107,
                  child: Image.asset(
                    'assets/images/logo.png',
                    fit: BoxFit.contain,
                    errorBuilder: (_, __, ___) => Icon(
                      Icons.candlestick_chart_rounded,
                      size: 80,
                      color: const Color(0xFF168A43),
                    ),
                  ),
                ),
                const SizedBox(height: 20),
                // App name
                Text(
                  'AbhiTrade',
                  style: GoogleFonts.lora(
                    color: fg,
                    fontSize: 34,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  'Trade Smart. Invest Better.',
                  style: TextStyle(
                    color: fg.withValues(alpha: 0.5),
                    fontSize: 13,
                    letterSpacing: 0.3,
                  ),
                ),
                const SizedBox(height: 60),
                // Loading dot
                SizedBox(
                  width: 24, height: 24,
                  child: CircularProgressIndicator(
                    strokeWidth: 2.5,
                    color: const Color(0xFF168A43),
                    backgroundColor: const Color(0xFF168A43).withValues(alpha: 0.15),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
