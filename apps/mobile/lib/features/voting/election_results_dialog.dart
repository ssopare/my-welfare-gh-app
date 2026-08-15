import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';

final electionResultsProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, electionId) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.dio.get('/elections/$electionId/results');
  return res.data as Map<String, dynamic>;
});

class ElectionResultsDialog extends ConsumerWidget {
  const ElectionResultsDialog({required this.electionId, super.key});

  final String electionId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final resultsAsync = ref.watch(electionResultsProvider(electionId));

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        padding: const EdgeInsets.all(20),
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 550),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Election Results', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const Divider(),
            Expanded(
              child: resultsAsync.when(
                data: (results) {
                  final String title = results['title'] as String;
                  final int totalVotesCast = results['totalVotesCast'] as int? ?? 0;
                  final double turnoutPercentage = (results['turnoutPercentage'] as num? ?? 0).toDouble();
                  final bool quorumMet = results['quorumMet'] as bool? ?? false;
                  final List resultsList = results['results'] as List? ?? [];

                  return SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(
                          title,
                          style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 16),

                        // Turnout Cards Grid
                        Row(
                          children: [
                            Expanded(
                              child: Card(
                                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                                  child: Column(
                                    children: [
                                      Text('Total Votes', style: theme.textTheme.bodySmall),
                                      const SizedBox(height: 4),
                                      Text('$totalVotesCast', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Card(
                                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
                                  child: Column(
                                    children: [
                                      Text('Turnout Rate', style: theme.textTheme.bodySmall),
                                      const SizedBox(height: 4),
                                      Text('${turnoutPercentage.toStringAsFixed(1)}%', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 12),

                        // Quorum indicator banner
                        Container(
                          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 12),
                          decoration: BoxDecoration(
                            color: quorumMet ? Colors.green.withValues(alpha: 0.1) : Colors.amber.withValues(alpha: 0.1),
                            borderRadius: BorderRadius.circular(12),
                          ),
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              Icon(
                                quorumMet ? Icons.check_circle : Icons.warning_amber_rounded,
                                color: quorumMet ? Colors.green : Colors.amber.shade800,
                                size: 18,
                              ),
                              const SizedBox(width: 8),
                              Text(
                                quorumMet
                                    ? 'Quorum Threshold Met (${(results['quorumPercentage'] as num? ?? 50).toDouble()}% target)'
                                    : 'Quorum Threshold Not Met (${(results['quorumPercentage'] as num? ?? 50).toDouble()}% target)',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 11,
                                  color: quorumMet ? Colors.green : Colors.amber.shade900,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),

                        // Results distributions list
                        Text(
                          'VOTE DISTRIBUTION',
                          style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold, letterSpacing: 0.6),
                        ),
                        const SizedBox(height: 12),
                        if (resultsList.isEmpty)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            child: Text(
                              'No votes recorded.',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          )
                        else
                          ...resultsList.map((res) {
                            final String label = res['label'] as String;
                            final int count = res['count'] as int? ?? 0;
                            final double percent = totalVotesCast > 0 ? (count / totalVotesCast) * 100 : 0.0;

                            return Padding(
                              padding: const EdgeInsets.only(bottom: 12),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Text(label, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 13)),
                                      Text('$count vote(s) (${percent.toStringAsFixed(1)}%)', style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold)),
                                    ],
                                  ),
                                  const SizedBox(height: 4),
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(4),
                                    child: LinearProgressIndicator(
                                      value: percent / 100,
                                      minHeight: 8,
                                      backgroundColor: isDark ? Colors.grey.shade900 : Colors.grey.shade100,
                                      color: theme.colorScheme.primary,
                                    ),
                                  ),
                                ],
                              ),
                            );
                          }),
                      ],
                    ),
                  );
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => Center(child: Text('Error loading results: $e', style: const TextStyle(color: Colors.red))),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
