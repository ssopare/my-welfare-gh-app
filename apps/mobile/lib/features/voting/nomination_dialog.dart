import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/providers.dart';
import '../../core/theme/app_colors.dart';

final membersListProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.dio.get('/members');
  return res.data as List<dynamic>;
});

final electionDetailProvider = FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, electionId) async {
  final api = ref.watch(apiClientProvider);
  final res = await api.dio.get('/elections/$electionId');
  return res.data as Map<String, dynamic>;
});

class NominationDialog extends ConsumerStatefulWidget {
  const NominationDialog({
    required this.electionId,
    required this.minSeconders,
    super.key,
  });

  final String electionId;
  final int minSeconders;

  @override
  ConsumerState<NominationDialog> createState() => _NominationDialogState();
}

class _NominationDialogState extends ConsumerState<NominationDialog> {
  String? _selectedMemberId;
  final _statementController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _statementController.dispose();
    super.dispose();
  }

  Future<void> _submitNomination() async {
    if (_selectedMemberId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select a member to nominate.')),
      );
      return;
    }

    setState(() => _isSubmitting = true);
    final api = ref.read(apiClientProvider);

    try {
      await api.dio.post(
        '/elections/${widget.electionId}/nominations',
        data: {
          'nomineeMemberId': _selectedMemberId,
          'statement': _statementController.text.trim(),
        },
      );
      if (!mounted) return;
      ref.invalidate(electionDetailProvider(widget.electionId));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nomination submitted successfully.')),
      );
      _statementController.clear();
      setState(() => _selectedMemberId = null);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: ${e.toString()}')),
      );
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  Future<void> _secondNomination(String nominationId) async {
    final api = ref.read(apiClientProvider);
    try {
      await api.dio.post('/elections/nominations/$nominationId/second');
      if (!mounted) return;
      ref.invalidate(electionDetailProvider(widget.electionId));
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nomination seconded successfully.')),
      );
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('You have already seconded this candidate or an error occurred.')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final membersAsync = ref.watch(membersListProvider);
    final electionDetailAsync = ref.watch(electionDetailProvider(widget.electionId));

    return Dialog(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
      child: Container(
        padding: const EdgeInsets.all(20),
        constraints: const BoxConstraints(maxWidth: 500, maxHeight: 600),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Nominations Board', style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
                IconButton(
                  icon: const Icon(Icons.close),
                  onPressed: () => Navigator.of(context).pop(),
                ),
              ],
            ),
            const Divider(),
            Expanded(
              child: SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    // Subtitle/Info
                    Text(
                      'Requires at least ${widget.minSeconders} seconder(s) to progress to vetting.',
                      style: theme.textTheme.bodySmall?.copyWith(fontStyle: FontStyle.italic),
                    ),
                    const SizedBox(height: 16),

                    // List of existing nominations
                    electionDetailAsync.when(
                      data: (detail) {
                        final List nominations = detail['nominations'] as List? ?? [];
                        if (nominations.isEmpty) {
                          return Padding(
                            padding: const EdgeInsets.symmetric(vertical: 16),
                            child: Text(
                              'No nominations yet. Be the first to nominate a leader!',
                              style: theme.textTheme.bodyMedium?.copyWith(
                                color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          );
                        }

                        return Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              'CURRENT NOMINEES',
                              style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold),
                            ),
                            const SizedBox(height: 8),
                            ...nominations.map((nom) {
                              final List seconders = nom['seconders'] as List? ?? [];
                              final String status = nom['status'] as String;
                              
                              return Card(
                                margin: const EdgeInsets.only(bottom: 8),
                                color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.3),
                                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                                child: Padding(
                                  padding: const EdgeInsets.all(12),
                                  child: Row(
                                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                                    children: [
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Text(
                                              'Candidate ID: ${nom['nomineeMemberId'].substring(0, 8)}...',
                                              style: theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.bold),
                                            ),
                                            if (nom['statement'] != null) ...[
                                              const SizedBox(height: 2),
                                              Text(
                                                nom['statement'] as String,
                                                style: theme.textTheme.bodySmall,
                                              ),
                                            ],
                                            const SizedBox(height: 4),
                                            Text(
                                              '${seconders.length} seconder(s) • Status: $status',
                                              style: theme.textTheme.bodySmall?.copyWith(fontWeight: FontWeight.bold),
                                            ),
                                          ],
                                        ),
                                      ),
                                      if (status == 'PENDING')
                                        IconButton(
                                          icon: const Icon(Icons.thumb_up_alt_outlined, color: Colors.blue),
                                          tooltip: 'Second this nominee',
                                          onPressed: () => _secondNomination(nom['id'] as String),
                                        ),
                                    ],
                                  ),
                                ),
                              );
                            }),
                            const Divider(height: 24),
                          ],
                        );
                      },
                      loading: () => const Center(child: CircularProgressIndicator()),
                      error: (e, _) => Text('Error loading nominees: $e'),
                    ),

                    // Submit new nomination form
                    Text(
                      'SUBMIT NEW NOMINATION',
                      style: theme.textTheme.labelSmall?.copyWith(fontWeight: FontWeight.bold),
                    ),
                    const SizedBox(height: 12),
                    membersAsync.when(
                      data: (members) {
                        return DropdownButtonFormField<String>(
                          value: _selectedMemberId,
                          decoration: InputDecoration(
                            labelText: 'Select Nominee',
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          ),
                          items: members.map((m) {
                            final String name = m['account']['name'] as String? ?? m['account']['phoneNumber'] as String;
                            return DropdownMenuItem<String>(
                              value: m['id'] as String,
                              child: Text(name),
                            );
                          }).toList(),
                          onChanged: (value) {
                            setState(() => _selectedMemberId = value);
                          },
                        );
                      },
                      loading: () => const Center(child: CircularProgressIndicator()),
                      error: (e, _) => Text('Error loading members: $e'),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _statementController,
                      maxLines: 2,
                      decoration: InputDecoration(
                        labelText: 'Statement / Manifesto',
                        hintText: 'Describe why this candidate is fit for the role...',
                        border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                    ),
                    const SizedBox(height: 16),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(
                        backgroundColor: theme.colorScheme.primary,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                      ),
                      onPressed: _isSubmitting ? null : _submitNomination,
                      child: _isSubmitting
                          ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                          : const Text('Submit Nomination'),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
