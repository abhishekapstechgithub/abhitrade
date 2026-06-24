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
      body: IndexedStack(index: _index, children: _pages),
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
    return Container(
      decoration: BoxDecoration(
        color: ext.surface,
        border: Border(top: BorderSide(color: ext.border, width: isDark ? 0.5 : 0.8)),
        boxShadow: isDark ? [] : [
          BoxShadow(
            color: const Color(0xFF5A4032).withValues(alpha: 0.08),
            blurRadius: 8, offset: const Offset(0, -2),
          ),
        ],
      ),
      child: SafeArea(
        top: false,
        child: SizedBox(
          height: 60,
          child: Row(
            children: List.generate(items.length, (i) {
              final sel    = i == currentIndex;
              final item   = items[i];
              final selClr = isDark ? AppColors.blue : const Color(0xFF2C2318);
              final unSelClr = ext.textSecondary;

              return Expanded(
                child: GestureDetector(
                  onTap: () => onTap(i),
                  behavior: HitTestBehavior.opaque,
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 180),
                    curve: Curves.easeInOut,
                    margin: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
                    decoration: sel && !isDark ? BoxDecoration(
                      color: const Color(0xFFF5D76E).withValues(alpha: 0.45),
                      borderRadius: const BorderRadius.only(
                        topLeft: Radius.circular(2),
                        topRight: Radius.circular(8),
                        bottomLeft: Radius.circular(6),
                        bottomRight: Radius.circular(2),
                      ),
                    ) : null,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(
                          sel ? item.activeIcon : item.icon,
                          size: 21,
                          color: sel ? selClr : unSelClr,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          item.label,
                          style: GoogleFonts.inter(
                            fontSize: 9.5,
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
    );
  }
}
