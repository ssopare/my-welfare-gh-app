import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/models/payment_activity_entry.dart';
import '../../core/widgets/money_text.dart';
import 'activity_repository.dart';

/// Reproduces a real Ghanaian welfare-group practice: contributions get
/// posted to the group's WhatsApp chat as they come in, so everyone can
/// see who's current. Grouped by contribution plan ("Monthly Staff
/// Contribution", any one-time levy, etc.) rather than a flat chronological
/// list — closer to "who's paid this month" than a raw activity log, and
/// still reads freshest-first since each group's own entries are already
/// ordered newest-first by the backend, and groups themselves appear in
/// the order their most recent payment landed.
class ActivityScreen extends ConsumerWidget {
  const ActivityScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final activity = ref.watch(activityDataProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Contributions')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(activityDataProvider.future),
        child: activity.when(
          data: (entries) {
            if (entries.isEmpty) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Text(
                        'No contributions recorded yet.',
                        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ),
                  ),
                ],
              );
            }

            final grouped = <String, List<PaymentActivityEntry>>{};
            for (final entry in entries) {
              grouped.putIfAbsent(entry.planName, () => []).add(entry);
            }

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                for (final planName in grouped.keys) ...[
                  Text(planName, style: theme.textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Card(
                    margin: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (final entry in grouped[planName]!)
                          ListTile(
                            title: Text(entry.memberDisplayName),
                            subtitle: Text(
                              entry.verified
                                  ? '${DateFormat('MMM d, y').format(entry.dueDate)} · ${_relativeTime(entry.postedAt)}'
                                  : '${DateFormat('MMM d, y').format(entry.dueDate)} · ${_relativeTime(entry.postedAt)} · '
                                      'Recorded by ${entry.recordedByName ?? 'admin'}',
                              style: entry.verified
                                  ? null
                                  : TextStyle(color: theme.colorScheme.tertiary),
                            ),
                            trailing: MoneyText(value: entry.amount),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 20),
                ],
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('$error')),
        ),
      ),
    );
  }

  String _relativeTime(DateTime postedAt) {
    final diff = DateTime.now().difference(postedAt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return DateFormat('MMM d').format(postedAt);
  }
}
