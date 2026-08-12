import 'package:flutter/material.dart';

import '../models/eligibility_check.dart';
import '../theme/app_colors.dart';

/// FR-RULE-05's explainable trace, rendered — the mobile equivalent of
/// the admin console's EligibilityChecklist component. Every check gets
/// its own pass/fail icon and plain-language detail, never collapsed
/// down to just "not eligible."
class EligibilityChecklist extends StatelessWidget {
  const EligibilityChecklist({required this.checks, super.key});

  final List<EligibilityCheck> checks;

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final badColor = isDark ? AppColors.statusBadDark : AppColors.statusBadLight;
    final goodColor = isDark ? AppColors.statusGoodDark : AppColors.statusGoodLight;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        for (final check in checks)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(
                  check.passed ? Icons.check_circle : Icons.cancel,
                  size: 18,
                  color: check.passed ? goodColor : badColor,
                ),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(check.description, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                      Text(
                        check.detail,
                        style: TextStyle(fontSize: 12, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
      ],
    );
  }
}
