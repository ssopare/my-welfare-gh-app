import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/claim.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/money_text.dart';
import '../auth/auth_controller.dart';
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
      body: Stack(
        children: [
          // Background Base (Solid Dark in Dark Mode for neon glow contrast, soft light wash in Light Mode)
          Container(
            color: isDark
                ? const Color(0xFF08090E) // Sleek near-black canvas
                : const Color(0xFFF3F4F6), // Clean light wash canvas
          ),
          // Ambient Glow Spot 1 (Top Right Purple Glow)
          Positioned(
            top: -100,
            right: -100,
            child: Container(
              width: 320,
              height: 320,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    theme.colorScheme.primary.withValues(alpha: isDark ? 0.16 : 0.08),
                    theme.colorScheme.primary.withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),
          // Ambient Glow Spot 2 (Bottom Left Green/Teal Glow)
          Positioned(
            bottom: 100,
            left: -150,
            child: Container(
              width: 380,
              height: 380,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                gradient: RadialGradient(
                  colors: [
                    const Color(0xFF4ADE80).withValues(alpha: isDark ? 0.12 : 0.06),
                    const Color(0xFF4ADE80).withValues(alpha: 0.0),
                  ],
                ),
              ),
            ),
          ),
          // Content Layout
          SafeArea(
            child: RefreshIndicator(
              onRefresh: () => ref.refresh(homeDataProvider.future),
              child: homeData.when(
                data: (data) {
                  if (data.profile.status == 'PENDING') {
                    return _PendingApprovalState(
                      organisationName: data.organisation.legalName,
                      memberName: data.profile.name ?? 'Member',
                      phoneNumber: data.profile.phoneNumber,
                      onRefresh: () => ref.refresh(homeDataProvider.future),
                      onSignOut: () {
                        ref.read(authControllerProvider.notifier).logout();
                      },
                    );
                  }
                  return _HomeContent(data: data);
                },
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (error, _) => _ErrorState(
                  message: error.toString(),
                  onRetry: () => ref.invalidate(homeDataProvider),
                ),
              ),
            ),
          ),
        ],
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

    // Calculate Wallet Balance as the sum of paid obligations. A fresh
    // member with no payment history genuinely has GHS 0.00 — show that,
    // not a stand-in number.
    final double walletBalance = data.obligations
        .where((o) => o.status == 'PAID')
        .fold(0.0, (sum, o) => sum + double.parse(o.amountValue));

    // Consistency Score is only meaningful once there's payment history to
    // score — an empty obligation list has no consistency to report.
    final bool hasObligationHistory = data.obligations.isNotEmpty;
    final double consistencyScore = hasObligationHistory
        ? (data.obligations.where((o) => o.status == 'PAID').length / data.obligations.length)
        : 0.0;

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
                  'Hello, ${data.profile.name ?? 'there'} 👋',
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
        ClipRRect(
          borderRadius: BorderRadius.circular(20),
          child: BackdropFilter(
            filter: ImageFilter.blur(sigmaX: 12, sigmaY: 12),
            child: Container(
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
                              _PulseDot(color: glowColor),
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
                            hasObligationHistory
                                ? Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Text(
                                        '${(consistencyScore * 100).toStringAsFixed(0)}%',
                                        style: theme.textTheme.titleMedium?.copyWith(
                                          fontWeight: FontWeight.bold,
                                        ),
                                      ),
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
                                  )
                                : Text(
                                    'No history yet',
                                    style: theme.textTheme.bodySmall?.copyWith(
                                      fontWeight: FontWeight.bold,
                                      color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                                    ),
                                  ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
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
                label: 'Statement',
                subtitle: 'View history',
                icon: Icons.assignment_outlined,
                iconColor: Colors.orange,
                onTap: () {
                  if (data.totalOutstanding > 0) {
                    Navigator.of(context).push(
                      MaterialPageRoute(
                        builder: (_) => PayScreen(
                          suggestedAmount: data.totalOutstanding,
                          currency: data.organisation.currency,
                          organisation: data.organisation,
                          openObligations: data.openObligations,
                        ),
                      ),
                    );
                  } else {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('No outstanding payments due.')),
                    );
                  }
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
              return _GlassCard(
                child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Text(
                    'No active benefit claims — tap File Claim to submit one.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                    ),
                  ),
                ),
              );
            }

            return Column(
              children: [
                for (final claim in activeClaims.take(3))
                  _GlassCard(
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

    // Merge transactions sorted by date
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
      return _GlassCard(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Text(
            'No transactions yet.',
            style: theme.textTheme.bodyMedium?.copyWith(
              color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
            ),
          ),
        ),
      );
    }

    return _GlassCard(
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
    return _GlassCard(
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
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
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 2),
                Text(
                  subtitle,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    fontSize: 10,
                    color: Theme.of(context).brightness == Brightness.dark
                        ? AppColors.mutedForegroundDark
                        : AppColors.mutedForegroundLight,
                  ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  const _PulseDot({required this.color});
  final Color color;

  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Stack(
          alignment: Alignment.center,
          children: [
            Container(
              width: 8 + (10 * _controller.value),
              height: 8 + (10 * _controller.value),
              decoration: BoxDecoration(
                color: widget.color.withValues(alpha: 0.35 * (1 - _controller.value)),
                shape: BoxShape.circle,
              ),
            ),
            Container(
              width: 6,
              height: 6,
              decoration: BoxDecoration(
                color: widget.color,
                shape: BoxShape.circle,
              ),
            ),
          ],
        );
      },
    );
  }
}

class _GlassCard extends StatelessWidget {
  const _GlassCard({required this.child, this.margin});

  final Widget child;
  final EdgeInsetsGeometry? margin;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: margin ?? EdgeInsets.zero,
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 8, sigmaY: 8),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: isDark
                    ? Colors.white.withValues(alpha: 0.08)
                    : Colors.black.withValues(alpha: 0.05),
                width: 1,
              ),
              gradient: LinearGradient(
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
                colors: isDark
                    ? [
                        Colors.white.withValues(alpha: 0.05),
                        Colors.white.withValues(alpha: 0.01),
                      ]
                    : [
                        Colors.white.withValues(alpha: 0.65),
                        Colors.white.withValues(alpha: 0.35),
                      ],
              ),
            ),
            child: child,
          ),
        ),
      ),
    );
  }
}

class _PendingApprovalState extends StatelessWidget {
  const _PendingApprovalState({
    required this.organisationName,
    required this.memberName,
    required this.phoneNumber,
    required this.onRefresh,
    required this.onSignOut,
  });

  final String organisationName;
  final String memberName;
  final String phoneNumber;
  final VoidCallback onRefresh;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            // Pulsing hourglass/timer icon
            _PulseIcon(
              icon: Icons.hourglass_empty_rounded,
              color: isDark ? AppColors.statusWarnDark : AppColors.statusWarnLight,
            ),
            const SizedBox(height: 24),
            Text(
              'Awaiting Approval',
              style: theme.textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.bold,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 12),
            Text(
              'Your request to join $organisationName has been submitted. An administrator must approve your account before you can access the dashboard.',
              style: theme.textTheme.bodyMedium?.copyWith(
                color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                height: 1.5,
              ),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 32),
            // Profile details card (glassmorphic)
            _GlassCard(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _DetailRow(label: 'Name', value: memberName),
                    const Divider(height: 24),
                    _DetailRow(label: 'Phone Number', value: phoneNumber),
                    const Divider(height: 24),
                    _DetailRow(label: 'Status', value: 'Pending Approval', isWarning: true),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: onRefresh,
              style: ElevatedButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
                backgroundColor: theme.colorScheme.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
              ),
              child: const Text('Check Status', style: TextStyle(fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 12),
            TextButton(
              onPressed: onSignOut,
              style: TextButton.styleFrom(
                minimumSize: const Size.fromHeight(50),
              ),
              child: Text(
                'Sign Out',
                style: TextStyle(
                  color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
                  fontWeight: FontWeight.bold,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DetailRow extends StatelessWidget {
  const _DetailRow({
    required this.label,
    required this.value,
    this.isWarning = false,
  });

  final String label;
  final String value;
  final bool isWarning;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(
          label,
          style: theme.textTheme.bodySmall?.copyWith(
            color: isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight,
          ),
        ),
        Text(
          value,
          style: theme.textTheme.bodyMedium?.copyWith(
            fontWeight: FontWeight.bold,
            color: isWarning
                ? (isDark ? AppColors.statusWarnDark : AppColors.statusWarnLight)
                : null,
          ),
        ),
      ],
    );
  }
}

class _PulseIcon extends StatefulWidget {
  const _PulseIcon({required this.icon, required this.color});
  final IconData icon;
  final Color color;

  @override
  State<_PulseIcon> createState() => _PulseIconState();
}

class _PulseIconState extends State<_PulseIcon> with SingleTickerProviderStateMixin {
  late AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, child) {
        return Transform.scale(
          scale: 1.0 + (0.1 * _controller.value),
          child: Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: widget.color.withValues(alpha: 0.1),
              shape: BoxShape.circle,
              border: Border.all(
                color: widget.color.withValues(alpha: 0.2 + (0.2 * _controller.value)),
                width: 2,
              ),
            ),
            child: Icon(widget.icon, size: 36, color: widget.color),
          ),
        );
      },
    );
  }
}
