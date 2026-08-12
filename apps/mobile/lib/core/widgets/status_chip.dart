import 'package:flutter/material.dart';

import '../theme/app_colors.dart';

enum StatusTone { good, warn, bad, neutral }

/// The mobile equivalent of the admin console's StatusBadge — same tone
/// vocabulary, same "one mapping per domain enum kept beside the widget"
/// principle. See lib/core/models for where MemberStatus/ObligationStatus
/// string values actually come from (the API, not an enum on this side —
/// Dart has no cheap way to share a TS union type across the language
/// boundary, so this stays a plain `Map<String, ...>` lookup).
class StatusChip extends StatelessWidget {
  const StatusChip({required this.label, required this.tone, super.key});

  final String label;
  final StatusTone tone;

  static const _memberStatusMeta = {
    'ACTIVE': (StatusTone.good, 'Good standing'),
    'PROBATION': (StatusTone.warn, 'Probation'),
    'GRACE': (StatusTone.warn, 'Grace period'),
    'PENDING': (StatusTone.neutral, 'Pending'),
    'DEFAULTER': (StatusTone.bad, 'Defaulter'),
    'SUSPENDED': (StatusTone.bad, 'Suspended'),
    'EXITED': (StatusTone.neutral, 'Exited'),
    'DECEASED': (StatusTone.neutral, 'Deceased'),
  };

  factory StatusChip.memberStatus(String status) {
    final (tone, label) = _memberStatusMeta[status] ?? (StatusTone.neutral, status);
    return StatusChip(label: label, tone: tone);
  }

  static const _claimStatusMeta = {
    'SUBMITTED': (StatusTone.warn, 'Awaiting decision'),
    'APPROVED': (StatusTone.good, 'Approved'),
    'REJECTED': (StatusTone.bad, 'Rejected'),
    'PAID': (StatusTone.good, 'Paid'),
  };

  factory StatusChip.claimStatus(String status) {
    final (tone, label) = _claimStatusMeta[status] ?? (StatusTone.neutral, status);
    return StatusChip(label: label, tone: tone);
  }

  static const _obligationStatusMeta = {
    'UPCOMING': (StatusTone.neutral, 'Upcoming'),
    'DUE': (StatusTone.warn, 'Due'),
    'PAID': (StatusTone.good, 'Paid'),
    'PARTIALLY_PAID': (StatusTone.warn, 'Partially paid'),
    'OVERDUE': (StatusTone.bad, 'Overdue'),
    'DEFAULTED': (StatusTone.bad, 'Defaulted'),
    'WAIVED': (StatusTone.neutral, 'Waived'),
    'EXEMPTED': (StatusTone.neutral, 'Exempted'),
    'WRITTEN_OFF': (StatusTone.neutral, 'Written off'),
    'CANCELLED': (StatusTone.neutral, 'Cancelled'),
  };

  factory StatusChip.obligationStatus(String status) {
    final (tone, label) = _obligationStatusMeta[status] ?? (StatusTone.neutral, status);
    return StatusChip(label: label, tone: tone);
  }

  // Exposes just the tone's foreground color — for callers (like a
  // timeline's dot marker) that want the same color a chip would use
  // without rendering the chip's pill shape itself.
  Color dotColor(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return _colors(context, isDark).$1;
  }

  (Color, Color) _colors(BuildContext context, bool isDark) {
    switch (tone) {
      case StatusTone.good:
        final c = isDark ? AppColors.statusGoodDark : AppColors.statusGoodLight;
        return (c, c.withValues(alpha: 0.14));
      case StatusTone.warn:
        final c = isDark ? AppColors.statusWarnDark : AppColors.statusWarnLight;
        return (c, c.withValues(alpha: 0.14));
      case StatusTone.bad:
        final c = isDark ? AppColors.statusBadDark : AppColors.statusBadLight;
        return (c, c.withValues(alpha: 0.14));
      case StatusTone.neutral:
        final fg = Theme.of(context).colorScheme.onSurfaceVariant;
        return (fg, fg.withValues(alpha: 0.12));
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final (fg, bg) = _colors(context, isDark);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(999)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(width: 6, height: 6, decoration: BoxDecoration(color: fg, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(color: fg, fontSize: 12, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
