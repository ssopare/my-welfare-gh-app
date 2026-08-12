import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';

/// Shared "labeled glass field" used across every auth screen (login,
/// join, create-organisation) so they read as one consistent system
/// rather than each screen inventing its own input chrome.
class AuthInputCard extends StatelessWidget {
  const AuthInputCard({super.key, required this.label, required this.child, required this.isDark});

  final String label;
  final Widget child;
  final bool isDark;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E2132) : const Color(0xFFF7F6FB),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: isDark ? const Color(0xFF2E334D) : const Color(0xFFE7E4F6)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label,
              style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.bold, letterSpacing: 0.6,
                color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
              )),
          const SizedBox(height: 6),
          child,
        ],
      ),
    );
  }
}

/// The gradient "Login"/primary submit button shared across auth screens.
class AuthPrimaryButton extends StatelessWidget {
  const AuthPrimaryButton({super.key, required this.label, required this.isLoading, required this.onPressed});

  final String label;
  final bool isLoading;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        gradient: const LinearGradient(colors: [Color(0xFF8F6EFF), Color(0xFF5B48FA)]),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [BoxShadow(color: const Color(0xFF5B48FA).withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 6))],
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: isLoading ? null : onPressed,
          borderRadius: BorderRadius.circular(14),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 15),
            child: isLoading
                ? const Center(child: SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)))
                : Text(label, textAlign: TextAlign.center, style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white)),
          ),
        ),
      ),
    );
  }
}
