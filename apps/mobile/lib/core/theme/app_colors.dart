import 'package:flutter/material.dart';

/// The mobile app's own copy of the admin console's exact palette tokens
/// (apps/admin/src/app/globals.css) — purple/indigo primary, cool slate
/// neutrals. Kept as literal hex values here rather than shared code,
/// since there's no cross-package token system between the Dart and
/// TypeScript apps — this file is the single place to update if the
/// brand palette ever changes on either side.
class AppColors {
  AppColors._();

  // Brand
  static const primaryLight = Color(0xFF5B48FA);
  static const primaryDark = Color(0xFF7C5CFF);
  static const tertiary = Color(0xFFA096FF);

  static const secondaryLight = Color(0xFFF59E0B);
  static const secondaryDark = Color(0xFFFBBF24);

  // Semantic status — identical meaning to the admin console's
  // StatusBadge/MoneyDisplay tones, used the same way here.
  static const statusGoodLight = Color(0xFF16A34A);
  static const statusGoodDark = Color(0xFF4ADE80);
  static const statusWarnLight = Color(0xFFF59E0B);
  static const statusWarnDark = Color(0xFFFBBF24);
  static const statusBadLight = Color(0xFFEF4444);
  static const statusBadDark = Color(0xFFF87171);

  // Surfaces — cool slate light / near-black dark, not pure white/black.
  static const backgroundLight = Color(0xFFF8FAFC);
  static const backgroundDark = Color(0xFF0B0D14);
  static const surfaceLight = Color(0xFFFFFFFF);
  static const surfaceDark = Color(0xFF151827);

  static const foregroundLight = Color(0xFF0F1122);
  static const foregroundDark = Color(0xFFF1F1F6);
  static const mutedForegroundLight = Color(0xFF64748B);
  static const mutedForegroundDark = Color(0xFF94A3B8);

  static const borderLight = Color(0xFFE2E8F0);
  static const borderDark = Color(0xFF262B3D);

  // Translucent colors for glassmorphism
  static final glassWhite = Colors.white.withValues(alpha: 0.55);
  static final glassBorderLight = const Color(0xFFE2E8F0).withValues(alpha: 0.65);
  static final glassBorderDark = const Color(0xFF262B3D).withValues(alpha: 0.6);
}
