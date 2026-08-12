import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

class AppTheme {
  AppTheme._();

  static ThemeData light() => _build(Brightness.light);
  static ThemeData dark() => _build(Brightness.dark);

  static ThemeData _build(Brightness brightness) {
    final isDark = brightness == Brightness.dark;

    final colorScheme = ColorScheme(
      brightness: brightness,
      primary: isDark ? AppColors.primaryDark : AppColors.primaryLight,
      onPrimary: Colors.white,
      secondary: isDark ? AppColors.secondaryDark : AppColors.secondaryLight,
      onSecondary: isDark ? const Color(0xFF2A1B02) : Colors.white,
      error: isDark ? AppColors.statusBadDark : AppColors.statusBadLight,
      onError: Colors.white,
      surface: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
      onSurface: isDark ? AppColors.foregroundDark : AppColors.foregroundLight,
      surfaceContainerHighest:
          isDark ? const Color(0xFF1A1F2E) : const Color(0xFFF1F5F9),
      onSurfaceVariant:
          isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
      outline: isDark ? AppColors.borderDark : AppColors.borderLight,
    );

    final baseTextTheme = isDark ? ThemeData.dark().textTheme : ThemeData.light().textTheme;
    // Matches the admin console's general-UI typeface swap (Geist Sans ->
    // Plus Jakarta Sans) — the one visual element shared verbatim across
    // both apps' design tokens, not just the color palette.
    final textTheme = GoogleFonts.plusJakartaSansTextTheme(baseTextTheme).apply(
      bodyColor: isDark ? AppColors.foregroundDark : AppColors.foregroundLight,
      displayColor: isDark ? AppColors.foregroundDark : AppColors.foregroundLight,
    );

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      colorScheme: colorScheme,
      textTheme: textTheme,
      scaffoldBackgroundColor:
          isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
      appBarTheme: AppBarTheme(
        backgroundColor:
            isDark ? AppColors.backgroundDark : AppColors.backgroundLight,
        foregroundColor:
            isDark ? AppColors.foregroundDark : AppColors.foregroundLight,
        elevation: 0,
        scrolledUnderElevation: 1,
        centerTitle: false,
      ),
      cardTheme: CardThemeData(
        color: isDark
            ? AppColors.surfaceDark.withOpacity(0.6)
            : AppColors.surfaceLight.withOpacity(0.55),
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(
            color: isDark ? AppColors.glassBorderDark : AppColors.glassBorderLight,
            width: 1.0,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide.none,
        ),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
      ),
      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: isDark ? AppColors.surfaceDark : AppColors.surfaceLight,
        indicatorColor: colorScheme.primary.withValues(alpha: 0.14),
        elevation: 0,
      ),
    );
  }
}
