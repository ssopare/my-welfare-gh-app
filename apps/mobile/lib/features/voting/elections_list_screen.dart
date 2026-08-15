import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';
import 'nomination_dialog.dart';
import 'election_results_dialog.dart';

final electionsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.dio.get('/elections');
  return res.data as List<dynamic>;
});

class ElectionsListScreen extends ConsumerWidget {
  const ElectionsListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final electionsAsync = ref.watch(electionsProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Elections & Polls'),
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(electionsProvider.future),
        child: electionsAsync.when(
          data: (elections) {
            if (elections.isEmpty) {
              return Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.how_to_vote, size: 64, color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight),
                    const SizedBox(height: 16),
                    Text('No elections set up yet.', style: theme.textTheme.titleMedium),
                  ],
                ),
              );
            }

            return ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: elections.length,
              separatorBuilder: (context, index) => const SizedBox(height: 12),
              itemBuilder: (context, index) {
                final election = elections[index];
                final String status = election['status'] as String;
                final String type = election['type'] as String;
                final String title = election['title'] as String;
                final String electionId = election['id'] as String;

                Color statusColor;
                IconData statusIcon;
                switch (status) {
                  case 'ACTIVE':
                    statusColor = Colors.green;
                    statusIcon = Icons.play_circle_fill_outlined;
                    break;
                  case 'NOMINATION':
                    statusColor = Colors.blue;
                    statusIcon = Icons.people_outline;
                    break;
                  case 'VETTING':
                    statusColor = Colors.purple;
                    statusIcon = Icons.fact_check_outlined;
                    break;
                  case 'COMPLETED':
                    statusColor = Colors.indigo;
                    statusIcon = Icons.check_circle_outline;
                    break;
                  default:
                    statusColor = Colors.grey;
                    statusIcon = Icons.hourglass_empty;
                }

                return Card(
                  elevation: 2,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              type == 'OFFICER' ? 'OFFICER SELECTION' : 'REFERENDUM',
                              style: theme.textTheme.labelSmall?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: statusColor.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                children: [
                                  Icon(statusIcon, color: statusColor, size: 14),
                                  const SizedBox(width: 4),
                                  Text(
                                    status,
                                    style: TextStyle(color: statusColor, fontWeight: FontWeight.bold, fontSize: 10),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 8),
                        Text(
                          title,
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                        ),
                        if (election['description'] != null) ...[
                          const SizedBox(height: 4),
                          Text(
                            election['description'] as String,
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                            ),
                          ),
                        ],
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.end,
                          children: [
                            if (status == 'ACTIVE')
                              ElevatedButton.icon(
                                icon: const Icon(Icons.how_to_vote, size: 16),
                                label: const Text('Cast Ballot'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: theme.colorScheme.primary,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                onPressed: () {
                                  context.push('/elections/$electionId');
                                },
                              )
                            else if (status == 'NOMINATION' && type == 'OFFICER')
                              ElevatedButton.icon(
                                icon: const Icon(Icons.person_add_alt_1, size: 16),
                                label: const Text('Nominate / Second'),
                                style: ElevatedButton.styleFrom(
                                  backgroundColor: Colors.blue.shade600,
                                  foregroundColor: Colors.white,
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                onPressed: () {
                                  showDialog(
                                    context: context,
                                    builder: (_) => NominationDialog(
                                      electionId: electionId,
                                      minSeconders: election['minSecondersRequired'] as int? ?? 0,
                                    ),
                                  );
                                },
                              )
                            else if (status == 'COMPLETED')
                              OutlinedButton.icon(
                                icon: const Icon(Icons.bar_chart, size: 16),
                                label: const Text('View Results'),
                                style: OutlinedButton.styleFrom(
                                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                ),
                                onPressed: () {
                                  showDialog(
                                    context: context,
                                    builder: (_) => ElectionResultsDialog(electionId: electionId),
                                  );
                                },
                              )
                            else
                              Text(
                                'Awaiting Next Phase',
                                style: theme.textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
                              ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.error_outline, size: 48, color: Colors.red),
                const SizedBox(height: 8),
                Text('Error: $err', style: const TextStyle(color: Colors.red)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
