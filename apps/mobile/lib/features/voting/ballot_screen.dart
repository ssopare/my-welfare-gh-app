import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';
import 'nomination_dialog.dart';
import 'elections_list_screen.dart';

class BallotScreen extends ConsumerStatefulWidget {
  const BallotScreen({required this.electionId, super.key});

  final String electionId;

  @override
  ConsumerState<BallotScreen> createState() => _BallotScreenState();
}

class _BallotScreenState extends ConsumerState<BallotScreen> {
  String? _selectedNomineeId;
  String? _selectedIssueOptionId;
  bool _isSubmitting = false;

  Future<void> _castVote() async {
    if (_selectedNomineeId == null && _selectedIssueOptionId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select an option to vote.')),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    final api = ref.read(apiClientProvider);

    try {
      await api.dio.post(
        '/elections/${widget.electionId}/vote',
        data: {
          if (_selectedNomineeId != null) 'nomineeId': _selectedNomineeId,
          if (_selectedIssueOptionId != null) 'issueOptionId': _selectedIssueOptionId,
        },
      );
      if (!mounted) return;
      ref.invalidate(electionsProvider);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Your vote was cast successfully!')),
      );
      context.go('/elections');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}')),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final electionDetailAsync = ref.watch(electionDetailProvider(widget.electionId));
    final membersAsync = ref.watch(membersListProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Cast Your Ballot')),
      body: electionDetailAsync.when(
        data: (election) {
          final String title = election['title'] as String;
          final String type = election['type'] as String;
          final bool isAnonymous = election['isAnonymous'] as bool? ?? true;
          final List nominees = election['nominees'] as List? ?? [];
          final List options = election['options'] as List? ?? [];

          return SafeArea(
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(20),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Title card
                  Card(
                    elevation: 1,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            type == 'OFFICER' ? 'OFFICER ELECTION' : 'ISSUE REFERENDUM',
                            style: theme.textTheme.labelSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Text(
                            title,
                            style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold),
                          ),
                          if (election['description'] != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              election['description'] as String,
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                              ),
                            ),
                          ],
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Privacy disclaimer
                  Container(
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: isAnonymous
                          ? Colors.teal.withValues(alpha: 0.1)
                          : Colors.amber.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(
                        color: isAnonymous
                            ? Colors.teal.withValues(alpha: 0.2)
                            : Colors.amber.withValues(alpha: 0.2),
                      ),
                    ),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(
                          isAnonymous ? Icons.shield_outlined : Icons.info_outline,
                          color: isAnonymous ? Colors.teal : Colors.amber.shade800,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                isAnonymous ? 'ANONYMOUS BALLOT' : 'PUBLIC BALLOT',
                                style: TextStyle(
                                  fontWeight: FontWeight.bold,
                                  fontSize: 12,
                                  color: isAnonymous ? Colors.teal : Colors.amber.shade900,
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                isAnonymous
                                    ? 'Your vote is private. To prevent double-voting, the system checks and registers your ID, but writes your choice into an unlinked ballot box.'
                                    : 'Your vote is open. Your selected option will be recorded and visible to organization administrators.',
                                style: theme.textTheme.bodySmall,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  // Selection Section
                  Text(
                    'MAKE YOUR SELECTION',
                    style: theme.textTheme.labelMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                      letterSpacing: 0.6,
                      color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                    ),
                  ),
                  const SizedBox(height: 12),

                  if (type == 'OFFICER')
                    // Nominees list
                    membersAsync.when(
                      data: (members) {
                        if (nominees.isEmpty) {
                          return const Center(child: Text('No approved candidates available.'));
                        }

                        return Column(
                          children: nominees.map((nominee) {
                            final String id = nominee['id'] as String;
                            final String memberId = nominee['memberId'] as String;
                            final String? manifesto = nominee['manifesto'] as String?;

                            // Resolve name from members list
                            final member = members.firstWhere((m) => m['id'] == memberId, orElse: () => null);
                            final String name = member != null
                                ? (member['account']['name'] as String? ?? member['account']['phoneNumber'] as String)
                                : 'Candidate';

                            return Card(
                              margin: const EdgeInsets.only(bottom: 8),
                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                              child: RadioListTile<String>(
                                value: id,
                                groupValue: _selectedNomineeId,
                                title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
                                subtitle: manifesto != null ? Text(manifesto) : null,
                                onChanged: (val) {
                                  setState(() => _selectedNomineeId = val);
                                },
                              ),
                            );
                          }).toList(),
                        );
                      },
                      loading: () => const Center(child: CircularProgressIndicator()),
                      error: (err, _) => Text('Error loading nominees: $err'),
                    )
                  else
                    // Issue Options list
                    Column(
                      children: options.map((option) {
                        final String id = option['id'] as String;
                        final String text = option['text'] as String;

                        return Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                          child: RadioListTile<String>(
                            value: id,
                            groupValue: _selectedIssueOptionId,
                            title: Text(text, style: const TextStyle(fontWeight: FontWeight.bold)),
                            onChanged: (val) {
                              setState(() => _selectedIssueOptionId = val);
                            },
                          ),
                        );
                      }).toList(),
                    ),

                  const SizedBox(height: 32),

                  // Submit Button
                  ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: theme.colorScheme.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                      elevation: 2,
                    ),
                    onPressed: _isSubmitting ? null : _castVote,
                    child: _isSubmitting
                        ? const SizedBox(
                            width: 24,
                            height: 24,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2.5),
                          )
                        : const Text(
                            'Cast Vote',
                            style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16, letterSpacing: 0.5),
                          ),
                  ),
                ],
              ),
            ),
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
    );
  }
}
