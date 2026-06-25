import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import '../theme/app_theme.dart';
import 'home/home_screen.dart';
import 'orders/orders_screen.dart';
import 'strategies/strategies_screen.dart';
import 'watchlist/watchlist_screen.dart';
import 'menu/menu_screen.dart';

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});
  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _index = 0;

  static const _pages = [
    HomeScreen(),
    WatchlistScreen(),
    StrategiesScreen(),
    OrdersScreen(),
    MenuScreen(),
  ];

  static const _items = [
    _NavItem(icon: Icons.home_outlined,        activeIcon: Icons.home_rounded,         label: 'Home'),
    _NavItem(icon: Icons.star_border_outlined, activeIcon: Icons.star_rounded,         label: 'Watchlist'),
    _NavItem(icon: Icons.auto_awesome_outlined,activeIcon: Icons.auto_awesome_rounded, label: 'Strategies'),
    _NavItem(icon: Icons.receipt_long_outlined,activeIcon: Icons.receipt_long_rounded, label: 'Orders'),
    _NavItem(icon: Icons.grid_view_outlined,   activeIcon: Icons.grid_view_rounded,    label: 'More'),
  ];

  @override
  Widget build(BuildContext context) {
    final ext    = context.appColors;
    final isDark = context.isDark;

    return Scaffold(
      extendBody: true,
      backgroundColor: Colors.transparent,
      body: Container(
        decoration: BoxDecoration(
          gradient: isDark ? AppGradients.darkBg : AppGradients.lightBg,
        ),
        child: IndexedStack(index: _index, children: _pages),
      ),
      bottomNavigationBar: _PaperNavBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        items: _items,
        isDark: isDark,
        ext: ext,
      ),
    );
  }
}

class _NavItem {
  final IconData icon, activeIcon;
  final String label;
  const _NavItem({required this.icon, required this.activeIcon, required this.label});
}

// ── Paper dock navigation ─────────────────────────────────────────────────────
class _PaperNavBar extends StatelessWidget {
  final int currentIndex;
  final ValueChanged<int> onTap;
  final List<_NavItem> items;
  final bool isDark;
  final AppThemeExtension ext;

  const _PaperNavBar({
    required this.currentIndex, required this.onTap,
    required this.items, required this.isDark, required this.ext,
  });

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 22, sigmaY: 22),
        child: Container(
          decoration: BoxDecoration(
            gradient: isDark
                ? LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      const Color(0xFF050B18).withValues(alpha: 0.78),
                      const Color(0xFF0D1B2E).withValues(alpha: 0.92),
                    ],
                  )
                : LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [
                      const Color(0xFFFFFFFF).withValues(alpha: 0.72),
                      const Color(0xFFF5F0E4).withValues(alpha: 0.90),
                    ],
                  ),
            border: Border(
              top: BorderSide(
                color: isDark
                    ? const Color(0xFFFFFFFF).withValues(alpha: 0.10)
                    : const Color(0xFFFFFFFF).withValues(alpha: 0.75),
                width: 0.8,
              ),
            ),
            boxShadow: [
              BoxShadow(
                color: isDark
                    ? Colors.black.withValues(alpha: 0.35)
                    : const Color(0xFF5A4032).withValues(alpha: 0.06),
                blurRadius: 24,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: 72,
              child: Row(
                children: List.generate(items.length, (i) {
                  final sel      = i == currentIndex;
                  final item     = items[i];
                  final selClr   = isDark ? AppColors.blue : const Color(0xFF2C2318);
                  final unSelClr = ext.textSecondary;

                  return Expanded(
                    child: GestureDetector(
                      onTap: () => onTap(i),
                      behavior: HitTestBehavior.opaque,
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        curve: Curves.easeInOut,
                        margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                        decoration: sel ? BoxDecoration(
                          borderRadius: BorderRadius.circular(12),
                          color: isDark
                              ? AppColors.blue.withValues(alpha: 0.18)
                              : const Color(0xFFF5D76E).withValues(alpha: 0.50),
                          border: Border.all(
                            color: isDark
                                ? AppColors.blue.withValues(alpha: 0.25)
                                : const Color(0xFFF5D76E).withValues(alpha: 0.60),
                            width: 0.8,
                          ),
                        ) : null,
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              sel ? item.activeIcon : item.icon,
                              size: 26,
                              color: sel ? selClr : unSelClr,
                            ),
                            const SizedBox(height: 3),
                            Text(
                              item.label,
                              style: GoogleFonts.inter(
                                fontSize: 11,
                                fontWeight: sel ? FontWeight.w700 : FontWeight.w500,
                                color: sel ? selClr : unSelClr,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                }),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
