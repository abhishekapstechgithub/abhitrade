import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/app_provider.dart';
import '../../theme/app_theme.dart';
import '../../widgets/widgets.dart';

class MenuScreen extends StatelessWidget {
  const MenuScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final ext     = context.appColors;
    final auth    = context.watch<AuthProvider>();
    final theme   = context.watch<ThemeProvider>();
    final trading = context.watch<TradingModeProvider>();

    return Scaffold(
      backgroundColor: ext.bg,
      appBar: AppBar(
        backgroundColor: ext.surface,
        surfaceTintColor: Colors.transparent,
        title: Text('Menu',
            style: TextStyle(
                color: ext.textPrimary,
                fontSize: 18,
                fontWeight: FontWeight.w700)),
      ),
      body: ListView(
        children: [
          // ── User card ───────────────────────────────────────────────────────
          Container(
            margin: const EdgeInsets.all(16),
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF1E3A8A), Color(0xFF0D1B2E)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: ext.border),
            ),
            child: Row(
              children: [
                CircleAvatar(
                  radius: 24,
                  backgroundColor: AppColors.blueDim,
                  child: Text(
                    auth.user?.initials ?? 'T',
                    style: const TextStyle(
                        color: AppColors.teal,
                        fontSize: 18,
                        fontWeight: FontWeight.w700),
                  ),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        auth.user?.name ?? 'Trader',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 16,
                            fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        auth.user?.email ?? '',
                        style: TextStyle(
                            color: Colors.white.withOpacity(0.7), fontSize: 13),
                      ),
                    ],
                  ),
                ),
                Icon(Icons.chevron_right, color: Colors.white.withOpacity(0.5)),
              ],
            ),
          ),

          // ── Trading mode toggle ─────────────────────────────────────────────
          _Section(
            title: 'Trading Mode',
            children: [
              _ToggleRow(
                icon: Icons.science_outlined,
                iconColor: AppColors.amber,
                title: 'Paper Trading',
                subtitle: trading.isPaper
                    ? 'Balance: ${fmtRupee(trading.paperBalance)}'
                    : 'Practice without real money',
                value: trading.isPaper,
                onChanged: (_) async {
                  trading.toggle();
                  ScaffoldMessenger.of(context).showSnackBar(SnackBar(
                    content: Text(trading.isPaper
                        ? '🧪 Switched to paper trading'
                        : '📈 Switched to live trading'),
                    duration: const Duration(seconds: 2),
                  ));
                },
              ),
              if (trading.isPaper)
                ListTile(
                  leading: Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.redDim,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.restart_alt, color: AppColors.red, size: 20),
                  ),
                  title: Text('Reset Paper Balance',
                      style: TextStyle(color: ext.textPrimary, fontSize: 14)),
                  subtitle: Text('Reset to ₹10,00,000',
                      style: TextStyle(color: ext.textMuted, fontSize: 12)),
                  onTap: () => _confirmReset(context, trading),
                ),
            ],
          ),

          // ── Appearance ──────────────────────────────────────────────────────
          _Section(
            title: 'Appearance',
            children: [
              _ToggleRow(
                icon: theme.isDark ? Icons.dark_mode : Icons.light_mode,
                iconColor: theme.isDark ? AppColors.amber : AppColors.blue,
                title: theme.isDark ? 'Dark Theme' : 'Light Theme',
                subtitle: 'Toggle light / dark mode',
                value: theme.isDark,
                onChanged: (_) => theme.toggle(),
              ),
            ],
          ),

          // ── Markets ─────────────────────────────────────────────────────────
          _Section(
            title: 'Markets',
            children: [
              _NavRow(icon: Icons.bar_chart_outlined, iconColor: AppColors.blue, title: 'Option Chain'),
              _NavRow(icon: Icons.candlestick_chart_outlined, iconColor: AppColors.teal, title: 'Charts'),
              _NavRow(icon: Icons.pie_chart_outline, iconColor: AppColors.green, title: 'Stock Composition'),
              _NavRow(icon: Icons.auto_awesome_outlined, iconColor: AppColors.amber, title: 'Favourite Strategies'),
            ],
          ),

          // ── Tools ───────────────────────────────────────────────────────────
          _Section(
            title: 'Tools & Analysis',
            children: [
              _NavRow(icon: Icons.calculate_outlined, iconColor: AppColors.blue, title: 'Options Calculator'),
              _NavRow(icon: Icons.trending_up, iconColor: AppColors.green, title: 'Brokerage Calculator'),
              _NavRow(icon: Icons.event_outlined, iconColor: AppColors.amber, title: 'IPO & Events'),
              _NavRow(icon: Icons.newspaper_outlined, iconColor: AppColors.teal, title: 'Market News'),
              _NavRow(icon: Icons.school_outlined, iconColor: Color(0xFF8B5CF6), title: 'Paper Trading Guide'),
            ],
          ),

          // ── Account ─────────────────────────────────────────────────────────
          _Section(
            title: 'Account',
            children: [
              _NavRow(icon: Icons.person_outline, iconColor: AppColors.blue, title: 'Profile'),
              _NavRow(icon: Icons.security_outlined, iconColor: AppColors.green, title: 'Security'),
              _NavRow(icon: Icons.notifications_outlined, iconColor: AppColors.amber, title: 'Notifications'),
              _NavRow(icon: Icons.help_outline, iconColor: AppColors.teal, title: 'Help & Support'),
            ],
          ),

          // ── Logout ──────────────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
            child: OutlinedButton.icon(
              onPressed: () => _confirmLogout(context, auth),
              style: OutlinedButton.styleFrom(
                foregroundColor: AppColors.red,
                side: const BorderSide(color: AppColors.red),
                padding: const EdgeInsets.symmetric(vertical: 14),
              ),
              icon: const Icon(Icons.logout, size: 18),
              label: const Text('Sign Out', style: TextStyle(fontWeight: FontWeight.w600)),
            ),
          ),
        ],
      ),
    );
  }

  void _confirmReset(BuildContext ctx, TradingModeProvider trading) {
    showDialog(
      context: ctx,
      builder: (_) => AlertDialog(
        backgroundColor: ctx.appColors.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: ctx.appColors.border)),
        title: Text('Reset Paper Balance',
            style: TextStyle(
                color: ctx.appColors.textPrimary, fontWeight: FontWeight.w700)),
        content: Text('Reset paper balance to ₹10,00,000 and clear all paper orders?',
            style: TextStyle(color: ctx.appColors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: TextStyle(color: ctx.appColors.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.amber),
            onPressed: () {
              trading.resetPaper();
              Navigator.pop(ctx);
            },
            child: const Text('Reset'),
          ),
        ],
      ),
    );
  }

  void _confirmLogout(BuildContext ctx, AuthProvider auth) {
    showDialog(
      context: ctx,
      builder: (_) => AlertDialog(
        backgroundColor: ctx.appColors.surface,
        shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: BorderSide(color: ctx.appColors.border)),
        title: Text('Sign Out',
            style: TextStyle(
                color: ctx.appColors.textPrimary, fontWeight: FontWeight.w700)),
        content: Text('Are you sure you want to sign out?',
            style: TextStyle(color: ctx.appColors.textSecondary)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text('Cancel', style: TextStyle(color: ctx.appColors.textSecondary)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.red),
            onPressed: () {
              Navigator.pop(ctx);
              auth.logout();
            },
            child: const Text('Sign Out'),
          ),
        ],
      ),
    );
  }
}

class _Section extends StatelessWidget {
  final String title;
  final List<Widget> children;

  const _Section({required this.title, required this.children});

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
          child: Text(title.toUpperCase(),
              style: TextStyle(
                  color: ext.textMuted,
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.8)),
        ),
        Container(
          margin: const EdgeInsets.symmetric(horizontal: 16),
          decoration: BoxDecoration(
            color: ext.card,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: ext.border),
          ),
          child: Column(
            children: children.asMap().entries.map((e) {
              final isLast = e.key == children.length - 1;
              return Column(
                children: [
                  e.value,
                  if (!isLast) Divider(indent: 56, endIndent: 0, color: ext.border, height: 1),
                ],
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}

class _NavRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String? subtitle;
  final VoidCallback? onTap;

  const _NavRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    this.subtitle,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: iconColor.withOpacity(0.15),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: iconColor, size: 20),
      ),
      title: Text(title,
          style: TextStyle(color: ext.textPrimary, fontSize: 14, fontWeight: FontWeight.w500)),
      subtitle: subtitle != null
          ? Text(subtitle!, style: TextStyle(color: ext.textMuted, fontSize: 12))
          : null,
      trailing: Icon(Icons.chevron_right, size: 18, color: ext.textMuted),
      onTap: onTap ?? () {},
    );
  }
}

class _ToggleRow extends StatelessWidget {
  final IconData icon;
  final Color iconColor;
  final String title;
  final String? subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  const _ToggleRow({
    required this.icon,
    required this.iconColor,
    required this.title,
    this.subtitle,
    required this.value,
    required this.onChanged,
  });

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: iconColor.withOpacity(0.15),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: iconColor, size: 20),
      ),
      title: Text(title,
          style: TextStyle(color: ext.textPrimary, fontSize: 14, fontWeight: FontWeight.w500)),
      subtitle: subtitle != null
          ? Text(subtitle!, style: TextStyle(color: ext.textMuted, fontSize: 12))
          : null,
      trailing: Switch(value: value, onChanged: onChanged),
    );
  }
}
