import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../core/models/obligation.dart';
import '../../core/widgets/money_text.dart';

/// Which of the member's own obligations are actually overdue, and by how
/// much — takes an already-fetched obligations list (same
/// `PayScreen(openObligations: ...)` pattern) rather than a new
/// repository/endpoint, since there's no self-service "arrears aging"
/// endpoint on the backend (only an admin-only org-wide report computes
/// that) — this is the self-accessible /members/:id/obligations data,
/// filtered and aged client-side instead.
class ArrearsScreen extends StatelessWidget {
  const ArrearsScreen({required this.obligations, super.key});

  final List<Obligation> obligations;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final overdue = obligations
        .where((o) => o.status == 'OVERDUE' || o.status == 'DEFAULTED')
        .toList()
      ..sort((a, b) => a.dueDate.compareTo(b.dueDate));

    return Scaffold(
      appBar: AppBar(title: const Text('Arrears')),
      body: overdue.isEmpty
          ? ListView(
              children: [
                Padding(
                  padding: const EdgeInsets.all(32),
                  child: Center(
                    child: Column(
                      children: [
                        Icon(Icons.check_circle_outline, size: 40, color: theme.colorScheme.primary),
                        const SizedBox(height: 12),
                        Text(
                          'No overdue obligations — you\'re current.',
                          textAlign: TextAlign.center,
                          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            )
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: Text(
                    'These obligations are past due. Settle them from Home → Pay Dues.',
                    style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                ),
                Card(
                  margin: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (final obligation in overdue)
                        ListTile(
                          title: Text(obligation.planName ?? 'Contribution'),
                          subtitle: Text(
                            '${DateFormat('MMM d, y').format(obligation.dueDate)} · '
                            '${_daysLate(obligation.dueDate)} days late',
                            style: TextStyle(color: theme.colorScheme.error),
                          ),
                          trailing: MoneyText(
                            value: obligation.outstanding.toStringAsFixed(2),
                            currency: obligation.currency,
                            style: TextStyle(color: theme.colorScheme.error),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
    );
  }

  int _daysLate(DateTime dueDate) => DateTime.now().difference(dueDate).inDays.clamp(0, 100000);
}
