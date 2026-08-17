import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/models/member_statement.dart';
import '../../core/widgets/money_text.dart';
import '../auth/auth_controller.dart';
import 'statement_repository.dart';

final statementProvider = FutureProvider.autoDispose<MemberStatement>((ref) {
  final identity = ref.watch(authControllerProvider).identity;
  if (identity == null) {
    return Future.value(const MemberStatement(payments: [], paidThroughDate: null));
  }
  return ref.watch(statementRepositoryProvider).load(identity.memberId);
});

/// A member's own payment history — every posted contribution, newest
/// first, tagged the same "Verified" / "Recorded by admin" way the
/// org-wide activity feed already is (see StatementPayment.verified).
class StatementScreen extends ConsumerWidget {
  const StatementScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final statement = ref.watch(statementProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Payment History')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(statementProvider.future),
        child: statement.when(
          data: (data) {
            final payments = [...data.payments]
              ..sort((a, b) => b.postedAt.compareTo(a.postedAt));

            if (payments.isEmpty) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(32),
                    child: Center(
                      child: Text(
                        'No payments recorded yet.',
                        style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                      ),
                    ),
                  ),
                ],
              );
            }

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                if (data.paidThroughDate != null)
                  Card(
                    margin: const EdgeInsets.only(bottom: 16),
                    child: ListTile(
                      leading: Icon(Icons.check_circle_outline, color: theme.colorScheme.primary),
                      title: const Text('Paid through'),
                      subtitle: Text(DateFormat('MMM d, y').format(data.paidThroughDate!)),
                    ),
                  ),
                Card(
                  margin: EdgeInsets.zero,
                  child: Column(
                    children: [
                      for (final payment in payments)
                        ListTile(
                          title: Text(payment.description),
                          subtitle: Text(
                            payment.verified
                                ? DateFormat('MMM d, y').format(payment.postedAt)
                                : '${DateFormat('MMM d, y').format(payment.postedAt)} · Recorded by admin',
                            style: payment.verified ? null : TextStyle(color: theme.colorScheme.tertiary),
                          ),
                          trailing: MoneyText(
                            value: payment.isCredit ? payment.credit : payment.debit,
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('$error')),
        ),
      ),
    );
  }
}
