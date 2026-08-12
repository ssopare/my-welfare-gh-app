import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/benefit_rule.dart';
import '../../core/widgets/eligibility_checklist.dart';
import '../auth/auth_controller.dart';
import 'claim_ineligible_exception.dart';
import 'claims_repository.dart';

final _activeBenefitsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(claimsRepositoryProvider).listActiveBenefits();
});

class NewClaimScreen extends ConsumerStatefulWidget {
  const NewClaimScreen({super.key});

  @override
  ConsumerState<NewClaimScreen> createState() => _NewClaimScreenState();
}

class _NewClaimScreenState extends ConsumerState<NewClaimScreen> {
  BenefitRule? _selected;
  DateTime? _eventDate;
  bool _isSubmitting = false;
  ClaimIneligibleException? _ineligible;
  String? _genericError;

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 1),
    );
    if (picked != null) setState(() => _eventDate = picked);
  }

  Future<void> _submit() async {
    final identity = ref.read(authControllerProvider).identity;
    if (_selected == null || _eventDate == null || identity == null) return;

    setState(() {
      _isSubmitting = true;
      _ineligible = null;
      _genericError = null;
    });

    try {
      await ref.read(claimsRepositoryProvider).submit(
            benefitRuleId: _selected!.id,
            memberId: identity.memberId,
            eventDate: _eventDate!,
          );
      if (!mounted) return;
      Navigator.of(context).pop(true);
    } on ClaimIneligibleException catch (error) {
      setState(() => _ineligible = error);
    } catch (_) {
      setState(() => _genericError = 'Something went wrong. Please try again.');
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final benefits = ref.watch(_activeBenefitsProvider);
    final theme = Theme.of(context);

    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      appBar: AppBar(title: const Text('New claim')),
      body: Container(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: isDark
                ? [
                    theme.colorScheme.primary.withValues(alpha: 0.08),
                    theme.scaffoldBackgroundColor,
                    theme.colorScheme.secondary.withValues(alpha: 0.04),
                  ]
                : [
                    theme.colorScheme.primary.withValues(alpha: 0.04),
                    theme.scaffoldBackgroundColor,
                    theme.colorScheme.secondary.withValues(alpha: 0.02),
                  ],
          ),
        ),
        child: benefits.when(
          data: (rules) => SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Checked against the real eligibility rules immediately — an ineligible claim tells you exactly why.',
                      style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                    const SizedBox(height: 20),
                    DropdownButtonFormField<BenefitRule>(
                      initialValue: _selected,
                      decoration: const InputDecoration(labelText: 'Benefit'),
                      items: [
                        for (final rule in rules)
                          DropdownMenuItem(value: rule, child: Text(rule.name)),
                      ],
                      onChanged: (value) => setState(() => _selected = value),
                    ),
                    if (_selected != null && _selected!.evidenceRequired.isNotEmpty)
                      Padding(
                        padding: const EdgeInsets.only(top: 8),
                        child: Text(
                          'Requires evidence: ${_selected!.evidenceRequired.join(', ')}',
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ),
                    const SizedBox(height: 12),
                    InkWell(
                      onTap: _pickDate,
                      child: InputDecorator(
                        decoration: const InputDecoration(labelText: 'Event date'),
                        child: Text(
                          _eventDate == null
                              ? 'Choose a date'
                              : '${_eventDate!.year}-${_eventDate!.month.toString().padLeft(2, '0')}-${_eventDate!.day.toString().padLeft(2, '0')}',
                        ),
                      ),
                    ),
                    if (_genericError != null) ...[
                      const SizedBox(height: 12),
                      Text(_genericError!, style: TextStyle(color: theme.colorScheme.error)),
                    ],
                    if (_ineligible != null) ...[
                      const SizedBox(height: 16),
                      Container(
                        width: double.infinity,
                        padding: const EdgeInsets.all(12),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.error.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(10),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              _ineligible!.message,
                              style: TextStyle(color: theme.colorScheme.error, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 8),
                            EligibilityChecklist(checks: _ineligible!.checks),
                          ],
                        ),
                      ),
                    ],
                    const SizedBox(height: 24),
                    ElevatedButton(
                      onPressed: (_selected == null || _eventDate == null || _isSubmitting) ? null : _submit,
                      child: _isSubmitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                            )
                          : const Text('Submit claim'),
                    ),
                  ],
                ),
              ),
            ),
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('$error')),
        ),
      ),
    );
  }
}
