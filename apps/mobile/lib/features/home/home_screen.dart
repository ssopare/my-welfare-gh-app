import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/claim.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/money_text.dart';
import '../activity/activity_screen.dart';
import '../payments/pay_screen.dart';
import '../claims/claims_screen.dart';
import '../claims/new_claim_screen.dart';
import 'home_repository.dart';

/// The high-fidelity member home dashboard screen matching the mockup designs.
/// Features a continuous gradient background wash, custom greeting header,
/// dynamic glassmorphic health indicator, quick action widgets grid,
/// active claims list, and recent transactions history log.
class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final homeData = ref.watch(homeDataProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
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
        child: SafeArea(
          child: RefreshIndicator(
            onRefresh: () => ref.refresh(homeDataProvider.future),
            child: homeData.when(
              data: (data) => _HomeContent(data: data),
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (error, _) => _ErrorState(
                message: error.toString(),
                onRetry: () => ref.invalidate(homeDataProvider),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ErrorState extends StatelessWidget {
  const _ErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return ListView(
      children: [
        Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const SizedBox(height: 80),
              Icon(Icons.wifi_off, size: 40, color: Theme.of(context).colorScheme.onSurfaceVariant),
              const SizedBox(height: 12),
              Text(message, textAlign: TextAlign.center),
              const SizedBox(height: 16),
              OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
            ],
          ),
        ),
      ],
    );
  }
}

class _HomeContent extends ConsumerWidget {
  const _HomeContent({required this.data});

  final HomeData data;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final claims = ref.watch(claimsProvider);

    // Calculate Wallet Balance as the sum of paid obligations — a real
    // GHS 0.00 is a real state (nothing paid yet), never swapped for a
    // sample number. Same "no fabricated financial figures" rule as
    // Outstanding Contributions below.
    final double walletBalance = data.obligations
        .where((o) => o.status == 'PAID')
        .fold(0.0, (sum, o) => sum + double.parse(o.amountValue));

    // What Pay should suggest when nothing is currently due — advance
    // payment is a real feature now, so Pay has to stay reachable even at
    // GHS 0 outstanding. Suggests whatever the member's last paid monthly
    // due actually was, rather than 0.00, which would read as "nothing to
    // pay" even though paying ahead is exactly what this is for.
    final paidMonthly = data.obligations
        .where((o) => o.isMonthly && o.status == 'PAID')
        .toList()
      ..sort((a, b) => b.dueDate.compareTo(a.dueDate));
    final suggestedPayAmount = data.totalOutstanding > 0
        ? data.totalOutstanding
        : (paidMonthly.isNotEmpty ? double.parse(paidMonthly.first.amountValue) : 0.0);

    // Consistency score — the fraction of obligations paid. With zero
    // obligations there's nothing to have missed, so there's no real
    // percentage to show; null (rendered as "New member" below) rather
    // than a fabricated figure.
    final double? consistencyScore = data.obligations.isEmpty
        ? null
        : data.obligations.where((o) => o.status == 'PAID').length / data.obligations.length;

    // Status mapping for standing card glow
    Color glowColor;
    String statusText;
    switch (data.profile.status) {
      case 'ACTIVE':
        glowColor = isDark ? AppColors.statusGoodDark : AppColors.statusGoodLight;
        statusText = 'GOOD STANDING';
        break;
      case 'PROBATION':
      case 'GRACE':
        glowColor = isDark ? AppColors.statusWarnDark : AppColors.statusWarnLight;
        statusText = 'GRACE PERIOD';
        break;
      case 'DEFAULTER':
      case 'SUSPENDED':
        glowColor = isDark ? AppColors.statusBadDark : AppColors.statusBadLight;
        statusText = 'ARREARS';
        break;
      default:
        glowColor = theme.colorScheme.primary;
        statusText = data.profile.status;
    }

    return ListView(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 16),
      children: [
        // 1. Custom Header
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  data.profile.name != null ? 'Hello, ${data.profile.name} 👋' : 'Hello 👋',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: isDark ? AppColors.foregroundDark : AppColors.foregroundLight,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  data.organisation.legalName,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                  ),
                ),
              ],
            ),
            Stack(
              children: [
                IconButton(
                  icon: Icon(
                    Icons.notifications_outlined,
                    color: isDark ? AppColors.foregroundDark : AppColors.foregroundLight,
                  ),
                  onPressed: () {
                    // Action triggers notification feed
                  },
                ),
                if (data.unreadNotificationCount > 0)
                  Positioned(
                    right: 8,
                    top: 8,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(
                        color: Colors.red,
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(
                        minWidth: 8,
                        minHeight: 8,
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
        const SizedBox(height: 24),

        // 2. Glassmorphic Hero Card
        Container(
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: Border.all(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.12)
                  : Colors.black.withValues(alpha: 0.08),
              width: 1.5,
            ),
            boxShadow: [
              BoxShadow(
                color: glowColor.withValues(alpha: isDark ? 0.22 : 0.14),
                blurRadius: 28,
                spreadRadius: -2,
                offset: const Offset(0, 10),
              ),
            ],
            gradient: LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: isDark
                  ? [
                      Colors.white.withValues(alpha: 0.07),
                      Colors.white.withValues(alpha: 0.02),
                    ]
                  : [
                      Colors.white.withValues(alpha: 0.75),
                      Colors.white.withValues(alpha: 0.45),
                    ],
            ),
          ),
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Top row with status
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      'FINANCIAL HEALTH\n& STANDING',
                      style: theme.textTheme.labelMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        letterSpacing: 0.8,
                        color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                      decoration: BoxDecoration(
                        color: glowColor.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: glowColor.withValues(alpha: 0.3),
                          width: 1,
                        ),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: glowColor,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            statusText,
                            style: theme.textTheme.labelSmall?.copyWith(
                              fontWeight: FontWeight.bold,
                              color: glowColor,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 28),
                // Bottom row with Wallet Balance & Consistency Score
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Wallet Balance:',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                          ),
                        ),
                        const SizedBox(height: 4),
                        MoneyText(
                          value: walletBalance.toStringAsFixed(2),
                          currency: data.organisation.currency,
                          style: theme.textTheme.headlineMedium?.copyWith(
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ],
                    ),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          'Consistency Score:',
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              consistencyScore == null
                                  ? 'New member'
                                  : '${(consistencyScore * 100).toStringAsFixed(0)}%',
                              style: theme.textTheme.titleMedium?.copyWith(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            if (consistencyScore != null) ...[
                              const SizedBox(width: 8),
                              SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  value: consistencyScore,
                                  strokeWidth: 2.5,
                                  backgroundColor: isDark
                                      ? Colors.white.withValues(alpha: 0.1)
                                      : Colors.black.withValues(alpha: 0.05),
                                  valueColor: AlwaysStoppedAnimation<Color>(glowColor),
                                ),
                              ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 24),

        // 3. Quick Actions
        Text(
          'QUICK ACTIONS',
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.bold,
            letterSpacing: 0.6,
            color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
          ),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: _QuickActionCard(
                label: 'File Claim',
                subtitle: 'Submit new request',
                icon: Icons.description_outlined,
                iconColor: Colors.blue,
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const NewClaimScreen()),
                  );
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _QuickActionCard(
                label: 'Pay',
                subtitle: data.totalOutstanding > 0 ? 'Make a payment' : 'Pay ahead',
                icon: Icons.payments_outlined,
                iconColor: Colors.orange,
                onTap: () {
                  Navigator.of(context).push(
                    MaterialPageRoute(
                      builder: (_) => PayScreen(
                        suggestedAmount: suggestedPayAmount,
                        currency: data.organisation.currency,
                        organisation: data.organisation,
                        openObligations: data.openObligations,
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _QuickActionCard(
                label: 'Dependants',
                subtitle: 'Manage family',
                icon: Icons.people_outline,
                iconColor: Colors.purple,
                onTap: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text(
                        'You have ${data.profile.dependantCount} registered dependant(s).',
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
        const SizedBox(height: 28),

        // Outstanding contributions — every open obligation across every
        // plan a member belongs to, not just the aggregate wallet-balance
        // number above. Unlike the transactions section below, this never
        // falls back to mock rows when empty: fabricating unpaid dues
        // would misrepresent a real financial state, a different kind of
        // risk than a cosmetic sample transaction.
        Text(
          'OUTSTANDING CONTRIBUTIONS',
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.bold,
            letterSpacing: 0.6,
            color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
          ),
        ),
        const SizedBox(height: 12),
        if (data.openObligations.isEmpty)
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Icon(
                    Icons.check_circle_outline,
                    color: isDark ? AppColors.statusGoodDark : AppColors.statusGoodLight,
                  ),
                  const SizedBox(width: 10),
                  Text("You're all paid up", style: theme.textTheme.bodyMedium),
                ],
              ),
            ),
          )
        else
          Card(
            margin: EdgeInsets.zero,
            child: Column(
              children: [
                for (final obligation in data.openObligations)
                  ListTile(
                    onTap: () => Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => PayScreen(
                          suggestedAmount: suggestedPayAmount,
                          currency: data.organisation.currency,
                          organisation: data.organisation,
                          openObligations: data.openObligations,
                        ),
                      ),
                    ),
                    leading: Icon(
                      obligation.isMonthly ? Icons.calendar_month : Icons.receipt_long,
                      color: theme.colorScheme.primary,
                    ),
                    title: Text(obligation.planName ?? (obligation.isMonthly ? 'Monthly dues' : 'Contribution')),
                    subtitle: Text(_formatDate(obligation.dueDate)),
                    trailing: MoneyText(
                      value: obligation.outstanding.toStringAsFixed(2),
                      currency: obligation.currency,
                    ),
                  ),
              ],
            ),
          ),
        const SizedBox(height: 24),

        // Community activity entry point — see who's paid what recently,
        // the same way this member's welfare group already posts
        // contribution updates to its WhatsApp chat. No live preview here
        // deliberately; the full grouped-by-plan view lives in its own
        // screen.
        Card(
          margin: EdgeInsets.zero,
          child: ListTile(
            leading: Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: theme.colorScheme.primary.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Icon(Icons.groups_outlined, color: theme.colorScheme.primary),
            ),
            title: const Text('Community activity'),
            subtitle: const Text('See who has paid what, recently'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ActivityScreen()),
            ),
          ),
        ),
        const SizedBox(height: 24),

        // 4. Active Benefits Section
        Text(
          'ACTIVE BENEFITS',
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.bold,
            letterSpacing: 0.6,
            color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
          ),
        ),
        const SizedBox(height: 12),
        claims.when(
          data: (items) {
            final activeClaims = items
                .where((c) => c.status == 'SUBMITTED' || c.status == 'APPROVED')
                .toList();

            if (activeClaims.isEmpty) {
              return Card(
                margin: EdgeInsets.zero,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Row(
                    children: [
                      Icon(
                        Icons.info_outline,
                        color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                      ),
                      const SizedBox(width: 10),
                      const Expanded(child: Text('No active claims at the moment')),
                    ],
                  ),
                ),
              );
            }

            return Column(
              children: [
                for (final claim in activeClaims.take(3))
                  Card(
                    margin: const EdgeInsets.only(bottom: 10),
                    child: ListTile(
                      leading: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: theme.colorScheme.primary.withValues(alpha: 0.1),
                          shape: BoxShape.circle,
                        ),
                        child: Icon(
                          Icons.medical_services_outlined,
                          color: theme.colorScheme.primary,
                        ),
                      ),
                      title: Text(
                        claim.benefitName,
                        style: theme.textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      subtitle: Row(
                        children: [
                          Container(
                            width: 6,
                            height: 6,
                            decoration: BoxDecoration(
                              color: claim.status == 'APPROVED' ? Colors.green : Colors.amber,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 6),
                          Text(
                            claim.status == 'APPROVED' ? 'Approved' : 'Processing',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: claim.status == 'APPROVED' ? Colors.green : Colors.amber,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ],
                      ),
                      trailing: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          MoneyText(
                            value: claim.amountValue,
                            currency: claim.currency,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          const SizedBox(height: 4),
                          Text(
                            'due ${_formatDate(claim.eventDate)}',
                            style: theme.textTheme.bodySmall?.copyWith(
                              color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (err, _) => Center(child: Text('Error loading claims: $err')),
        ),
        const SizedBox(height: 24),

        // 5. Recent Transactions
        Text(
          'RECENT TRANSACTIONS',
          style: theme.textTheme.labelMedium?.copyWith(
            fontWeight: FontWeight.bold,
            letterSpacing: 0.6,
            color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
          ),
        ),
        const SizedBox(height: 12),
        _buildRecentTransactions(context, claims.value ?? []),
      ],
    );
  }

  String _formatDate(DateTime date) =>
      '${date.day} ${[
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec'
      ][date.month - 1]}';

  Widget _buildRecentTransactions(BuildContext context, List<Claim> claimsList) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    // Filter paid obligations
    final paidDues = data.obligations.where((o) => o.status == 'PAID').toList();
    // Filter paid claims
    final paidClaims = claimsList.where((c) => c.status == 'PAID').toList();

    // Merge transactions sorted by date — a genuinely empty history is a
    // real state (nothing paid yet), rendered as such below rather than
    // backfilled with sample rows.
    final List<_TransactionItem> txList = [];
    for (final due in paidDues) {
      txList.add(
        _TransactionItem(
          title: 'Monthly Dues - ${[
            'Jan',
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec'
          ][due.dueDate.month - 1]}',
          subtitle: 'Deduction',
          amount: '-${due.amountValue}',
          currency: due.currency,
          date: due.dueDate,
          isCredit: false,
        ),
      );
    }

    for (final claim in paidClaims) {
      txList.add(
        _TransactionItem(
          title: 'Claim Payment - ${claim.benefitName}',
          subtitle: 'Credit',
          amount: '+${claim.amountValue}',
          currency: claim.currency,
          date: claim.eventDate,
          isCredit: true,
        ),
      );
    }

    txList.sort((a, b) => b.date.compareTo(a.date));

    if (txList.isEmpty) {
      return Card(
        margin: EdgeInsets.zero,
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(
                Icons.receipt_long_outlined,
                color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
              ),
              const SizedBox(width: 10),
              const Expanded(child: Text('No transactions yet')),
            ],
          ),
        ),
      );
    }

    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          children: [
            for (final tx in txList.take(5))
              ListTile(
                leading: Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: tx.isCredit
                        ? Colors.green.withValues(alpha: 0.1)
                        : Colors.red.withValues(alpha: 0.1),
                    shape: BoxShape.circle,
                  ),
                  child: Icon(
                    tx.isCredit ? Icons.arrow_downward : Icons.arrow_upward,
                    color: tx.isCredit ? Colors.green : Colors.red,
                    size: 16,
                  ),
                ),
                title: Text(
                  tx.title,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                subtitle: Text(
                  '${tx.subtitle} • ${_formatDate(tx.date)}',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                  ),
                ),
                trailing: MoneyText(
                  value: tx.amount,
                  currency: tx.currency,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: tx.isCredit ? Colors.green : null,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _TransactionItem {
  _TransactionItem({
    required this.title,
    required this.subtitle,
    required this.amount,
    required this.currency,
    required this.date,
    required this.isCredit,
  });

  final String title;
  final String subtitle;
  final String amount;
  final String currency;
  final DateTime date;
  final bool isCredit;
}

class _QuickActionCard extends StatelessWidget {
  const _QuickActionCard({
    required this.label,
    required this.subtitle,
    required this.icon,
    required this.iconColor,
    required this.onTap,
  });

  final String label;
  final String subtitle;
  final IconData icon;
  final Color iconColor;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Card(
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 16),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(10),
                decoration: BoxDecoration(
                  color: iconColor.withValues(alpha: 0.1),
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, color: iconColor, size: 22),
              ),
              const SizedBox(height: 10),
              Text(
                label,
                style: theme.textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.bold,
                ),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 2),
              Text(
                subtitle,
                style: theme.textTheme.bodySmall?.copyWith(
                  fontSize: 10,
                  color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                ),
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
