import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/claim.dart';
import '../../core/widgets/money_text.dart';
import '../../core/widgets/status_chip.dart';
import '../auth/auth_controller.dart';
import 'claims_repository.dart';
import 'new_claim_screen.dart';

final claimsProvider = FutureProvider.autoDispose<List<Claim>>((ref) {
  final identity = ref.watch(authControllerProvider).identity;
  if (identity == null) return Future.value(const []);
  return ref.watch(claimsRepositoryProvider).listForMember(identity.memberId);
});

class ClaimsScreen extends ConsumerWidget {
  const ClaimsScreen({super.key});

  String _formatDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final claims = ref.watch(claimsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Claims')),
      floatingActionButton: FloatingActionButton.extended(
        icon: const Icon(Icons.add),
        label: const Text('New claim'),
        onPressed: () async {
          final submitted = await Navigator.of(context).push<bool>(
            MaterialPageRoute(builder: (_) => const NewClaimScreen()),
          );
          if (submitted == true) ref.invalidate(claimsProvider);
        },
      ),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(claimsProvider.future),
        child: claims.when(
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        const SizedBox(height: 80),
                        Icon(Icons.gavel_outlined, size: 40, color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(height: 12),
                        Text(
                          'No claims filed yet.',
                          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            }
            return ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
              itemCount: items.length,
              separatorBuilder: (_, _) => const SizedBox(height: 10),
              itemBuilder: (context, index) {
                final claim = items[index];
                return Card(
                  margin: EdgeInsets.zero,
                  child: ListTile(
                    leading: Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: theme.colorScheme.primary.withValues(alpha: 0.1),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(Icons.medical_services_outlined, color: theme.colorScheme.primary),
                    ),
                    title: Text(claim.benefitName, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    subtitle: Text(_formatDate(claim.eventDate)),
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        MoneyText(value: claim.amountValue, currency: claim.currency),
                        const SizedBox(height: 4),
                        StatusChip.claimStatus(claim.status),
                      ],
                    ),
                  ),
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('$error')),
        ),
      ),
    );
  }
}
