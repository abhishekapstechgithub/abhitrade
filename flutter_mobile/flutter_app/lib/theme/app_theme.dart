import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';

// ─── Dark palette ────────────────────────────────────────────────────────────
class DarkColors {
  DarkColors._();
  static const bg       = Color(0xFF050B18);
  static const surface  = Color(0xFF0D1B2E);
  static const card     = Color(0xFF0F2236);
  static const border   = Color(0xFF1A3A5C);
  static const primary  = Color(0xFFE8F0FF);
  static const secondary= Color(0xFF8BAAC8);
  static const muted    = Color(0xFF708CA6);
}

// ─── Light palette ───────────────────────────────────────────────────────────
class LightColors {
  LightColors._();
  static const bg       = Color(0xFFF5F0E4); // handmade paper
  static const surface  = Color(0xFFEFE6D3); // slightly aged paper
  static const card     = Color(0xFFF2EBD8); // warm paper card
  static const border   = Color(0xFFC4B49A); // ink-stained border
  static const primary  = Color(0xFF2C2318); // deep ink
  static const secondary= Color(0xFF5A4A38); // medium ink
  static const muted    = Color(0xFF8A7A68); // faded ink
}

// ─── Semantic colours (same in both themes) ──────────────────────────────────
class AppColors {
  AppColors._();
  static const green    = Color(0xFF168A43);
  static const greenDim = Color(0xFF0A3D20);
  static const greenDimLight = Color(0xFFDCFCE7);
  static const red      = Color(0xFFC62828);
  static const redDim   = Color(0xFF3D0A12);
  static const redDimLight   = Color(0xFFFFE4E6);
  static const blue     = Color(0xFF3B82F6);
  static const blueDim  = Color(0xFF1E3A8A);
  static const blueDimLight  = Color(0xFFDBEAFE);
  static const teal     = Color(0xFF3B82F6);
  static const amber    = Color(0xFFF59E0B);
  static const amberDim = Color(0xFF78350F);
  static const amberDimLight = Color(0xFFFEF3C7);

  // Paper trading indicator colour
  static const paper    = Color(0xFFF59E0B);
  static const paperDim = Color(0xFF78350F);
  static const paperDimLight = Color(0xFFFEF3C7);
}

class AppTheme {
  AppTheme._();

  static ThemeData dark = _build(
    brightness: Brightness.dark,
    bg:       DarkColors.bg,
    surface:  DarkColors.surface,
    card:     DarkColors.card,
    border:   DarkColors.border,
    textPrimary:   DarkColors.primary,
    textSecondary: DarkColors.secondary,
    textMuted:     DarkColors.muted,
    overlayStyle:  SystemUiOverlayStyle.light,
  );

  static ThemeData light = _build(
    brightness: Brightness.light,
    bg:       LightColors.bg,
    surface:  LightColors.surface,
    card:     LightColors.card,
    border:   LightColors.border,
    textPrimary:   LightColors.primary,
    textSecondary: LightColors.secondary,
    textMuted:     LightColors.muted,
    overlayStyle:  SystemUiOverlayStyle.dark,
  );

  static ThemeData _build({
    required Brightness brightness,
    required Color bg,
    required Color surface,
    required Color card,
    required Color border,
    required Color textPrimary,
    required Color textSecondary,
    required Color textMuted,
    required SystemUiOverlayStyle overlayStyle,
  }) {
    final baseTextTheme = TextTheme(
      displayLarge:  TextStyle(color: textPrimary, fontWeight: FontWeight.w800),
      displayMedium: TextStyle(color: textPrimary, fontWeight: FontWeight.w700),
      headlineLarge: TextStyle(color: textPrimary, fontWeight: FontWeight.w700, fontSize: 26),
      headlineMedium:TextStyle(color: textPrimary, fontWeight: FontWeight.w600, fontSize: 20),
      headlineSmall: TextStyle(color: textPrimary, fontWeight: FontWeight.w600, fontSize: 18),
      titleLarge:    TextStyle(color: textPrimary, fontWeight: FontWeight.w600, fontSize: 16),
      titleMedium:   TextStyle(color: textPrimary, fontWeight: FontWeight.w500, fontSize: 14),
      titleSmall:    TextStyle(color: textSecondary, fontWeight: FontWeight.w500, fontSize: 13),
      bodyLarge:     TextStyle(color: textPrimary, fontSize: 15),
      bodyMedium:    TextStyle(color: textSecondary, fontSize: 14),
      bodySmall:     TextStyle(color: textMuted, fontSize: 12),
      labelLarge:    TextStyle(color: textPrimary, fontWeight: FontWeight.w600, fontSize: 13),
      labelMedium:   TextStyle(color: textSecondary, fontSize: 12),
      labelSmall:    TextStyle(color: textMuted, fontSize: 11),
    );

    final TextTheme textTheme;
    if (brightness == Brightness.dark) {
      textTheme = GoogleFonts.interTextTheme(baseTextTheme);
    } else {
      final loraTheme = GoogleFonts.loraTextTheme(baseTextTheme);
      final interTheme = GoogleFonts.interTextTheme(baseTextTheme);
      textTheme = loraTheme.copyWith(
        bodyLarge: interTheme.bodyLarge,
        bodyMedium: interTheme.bodyMedium,
        bodySmall: interTheme.bodySmall,
        labelLarge: interTheme.labelLarge,
        labelMedium: interTheme.labelMedium,
        labelSmall: interTheme.labelSmall,
      );
    }

    return ThemeData(
        useMaterial3: true,
        brightness: brightness,
        scaffoldBackgroundColor: bg,
        colorScheme: ColorScheme(
          brightness: brightness,
          primary: AppColors.blue,
          secondary: AppColors.teal,
          surface: surface,
          error: AppColors.red,
          onPrimary: Colors.white,
          onSecondary: Colors.white,
          onSurface: textPrimary,
          onError: Colors.white,
        ),
        appBarTheme: AppBarTheme(
          backgroundColor: surface,
          foregroundColor: textPrimary,
          elevation: 0,
          shadowColor: Colors.transparent,
          surfaceTintColor: Colors.transparent,
          systemOverlayStyle: overlayStyle.copyWith(
            statusBarColor: Colors.transparent,
          ),
          titleTextStyle: brightness == Brightness.dark
              ? TextStyle(
                  color: textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                )
              : GoogleFonts.lora(
                  color: textPrimary,
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
          iconTheme: IconThemeData(color: textSecondary),
        ),
        bottomNavigationBarTheme: BottomNavigationBarThemeData(
          backgroundColor: surface,
          selectedItemColor: AppColors.blue,
          unselectedItemColor: textSecondary,
          selectedLabelStyle: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600),
          unselectedLabelStyle: const TextStyle(fontSize: 11),
          type: BottomNavigationBarType.fixed,
          elevation: 0,
        ),
        cardTheme: CardThemeData(
          color: card,
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide(color: border, width: 1),
          ),
        ),
        dividerTheme: DividerThemeData(color: border, thickness: 1),
        textTheme: textTheme,
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: card,
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: border),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: BorderSide(color: border),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(10),
            borderSide: const BorderSide(color: AppColors.blue, width: 1.5),
          ),
          hintStyle: TextStyle(color: textMuted),
          labelStyle: TextStyle(color: textSecondary),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.blue,
            foregroundColor: Colors.white,
            elevation: 0,
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
            textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
        ),
        tabBarTheme: TabBarThemeData(
          labelColor: AppColors.blue,
          unselectedLabelColor: textSecondary,
          indicatorColor: AppColors.blue,
          indicatorSize: TabBarIndicatorSize.label,
          dividerColor: border,
          labelStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
          unselectedLabelStyle: const TextStyle(fontSize: 13),
        ),
        chipTheme: ChipThemeData(
          backgroundColor: card,
          selectedColor: AppColors.blueDim,
          labelStyle: TextStyle(color: textPrimary, fontSize: 12),
          side: BorderSide(color: border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        ),
        switchTheme: SwitchThemeData(
          thumbColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? AppColors.blue : textSecondary,
          ),
          trackColor: WidgetStateProperty.resolveWith(
            (s) => s.contains(WidgetState.selected) ? AppColors.blueDim : card,
          ),
        ),
        extensions: [AppThemeExtension(
          bg: bg,
          surface: surface,
          card: card,
          border: border,
          textPrimary: textPrimary,
          textSecondary: textSecondary,
          textMuted: textMuted,
        )],
      );
  }
}


// Custom extension so widgets can access raw palette colours via Theme.of(ctx)
class AppThemeExtension extends ThemeExtension<AppThemeExtension> {
  const AppThemeExtension({
    required this.bg,
    required this.surface,
    required this.card,
    required this.border,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
  });

  final Color bg;
  final Color surface;
  final Color card;
  final Color border;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;

  @override
  ThemeExtension<AppThemeExtension> copyWith({
    Color? bg, Color? surface, Color? card, Color? border,
    Color? textPrimary, Color? textSecondary, Color? textMuted,
  }) => AppThemeExtension(
    bg: bg ?? this.bg,
    surface: surface ?? this.surface,
    card: card ?? this.card,
    border: border ?? this.border,
    textPrimary: textPrimary ?? this.textPrimary,
    textSecondary: textSecondary ?? this.textSecondary,
    textMuted: textMuted ?? this.textMuted,
  );

  @override
  ThemeExtension<AppThemeExtension> lerp(
    covariant ThemeExtension<AppThemeExtension>? other, double t,
  ) {
    if (other is! AppThemeExtension) return this;
    return AppThemeExtension(
      bg: Color.lerp(bg, other.bg, t)!,
      surface: Color.lerp(surface, other.surface, t)!,
      card: Color.lerp(card, other.card, t)!,
      border: Color.lerp(border, other.border, t)!,
      textPrimary: Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary: Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted: Color.lerp(textMuted, other.textMuted, t)!,
    );
  }
}

extension ThemeX on BuildContext {
  AppThemeExtension get appColors =>
    Theme.of(this).extension<AppThemeExtension>()!;
  bool get isDark => Theme.of(this).brightness == Brightness.dark;
}

// ─── App-wide gradient backgrounds ───────────────────────────────────────────
class AppGradients {
  AppGradients._();

  static const lightBg = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color(0xFFF5F0E4), // warm paper
      Color(0xFFECDFBF), // warm amber
      Color(0xFFF0EAD6), // soft cream
      Color(0xFFEEE5D0), // muted gold
    ],
    stops: [0.0, 0.35, 0.65, 1.0],
  );

  static const darkBg = LinearGradient(
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
    colors: [
      Color(0xFF050B18), // deep navy
      Color(0xFF081628), // slightly lighter
      Color(0xFF060D1E), // dark blue
      Color(0xFF050B18), // back to navy
    ],
    stops: [0.0, 0.4, 0.7, 1.0],
  );
}

// ─── Glassmorphism card ───────────────────────────────────────────────────────
class GlassCard extends StatelessWidget {
  const GlassCard({
    super.key,
    required this.child,
    this.padding,
    this.margin,
    this.borderRadius,
    this.blurSigma = 14.0,
  });

  final Widget child;
  final EdgeInsets? padding;
  final EdgeInsets? margin;
  final BorderRadius? borderRadius;
  final double blurSigma;

  @override
  Widget build(BuildContext context) {
    final isDark = context.isDark;
    final radius = borderRadius ?? BorderRadius.circular(16);
    return Container(
      margin: margin,
      child: ClipRRect(
        borderRadius: radius,
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: blurSigma, sigmaY: blurSigma),
          child: Container(
            padding: padding,
            decoration: BoxDecoration(
              borderRadius: radius,
              color: isDark
                  ? const Color(0xFFFFFFFF).withValues(alpha: 0.06)
                  : const Color(0xFFFFFFFF).withValues(alpha: 0.55),
              border: Border.all(
                color: isDark
                    ? const Color(0xFFFFFFFF).withValues(alpha: 0.10)
                    : const Color(0xFFFFFFFF).withValues(alpha: 0.65),
                width: 1.0,
              ),
              gradient: isDark
                  ? LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        const Color(0xFFFFFFFF).withValues(alpha: 0.07),
                        const Color(0xFFFFFFFF).withValues(alpha: 0.02),
                      ],
                    )
                  : LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [
                        const Color(0xFFFFFFFF).withValues(alpha: 0.75),
                        const Color(0xFFFFFFFF).withValues(alpha: 0.35),
                      ],
                    ),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}
