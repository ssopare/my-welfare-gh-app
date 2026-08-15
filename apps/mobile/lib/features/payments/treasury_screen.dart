import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/fund.dart';
import '../../core/models/payout_request.dart';
import '../../core/widgets/money_text.dart';
import '../auth/auth_controller.dart';
import 'payouts_repository.dart';
import 'payments_repository.dart';

final payoutRecipientsProvider = FutureProvider.autoDispose<List<PayoutRecipientModel>>((ref) {
  return ref.watch(payoutsRepositoryProvider).listRecipients();
});

final payoutRequestsProvider = FutureProvider.autoDispose<List<PayoutRequestModel>>((ref) {
  return ref.watch(payoutsRepositoryProvider).listRequests();
});

final _fundsProvider = FutureProvider.autoDispose<List<Fund>>((ref) {
  return ref.watch(paymentsRepositoryProvider).listFunds();
});

class TreasuryScreen extends ConsumerStatefulWidget {
  const TreasuryScreen({super.key});

  @override
  ConsumerState<TreasuryScreen> createState() => _TreasuryScreenState();
}

class _TreasuryScreenState extends ConsumerState<TreasuryScreen> with SingleTickerProviderStateMixin {
  late TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    ref.invalidate(payoutRecipientsProvider);
    ref.invalidate(payoutRequestsProvider);
    ref.invalidate(_fundsProvider);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final greenColor = isDark ? const Color(0xFF00A884) : const Color(0xFF008069);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Treasury & Payouts'),
        bottom: TabBar(
          controller: _tabController,
          indicatorColor: greenColor,
          labelColor: greenColor,
          unselectedLabelColor: theme.colorScheme.onSurfaceVariant,
          tabs: const [
            Tab(text: 'Payout Queue', icon: Icon(Icons.compare_arrows)),
            Tab(text: 'Recipients', icon: Icon(Icons.people_outline)),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _PayoutQueueView(onRefresh: _refresh, greenColor: greenColor),
          _RecipientsView(onRefresh: _refresh, greenColor: greenColor),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _openRequestPayoutSheet(context),
        backgroundColor: greenColor,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.send),
        label: const Text('Request Payout', style: TextStyle(fontWeight: FontWeight.bold)),
      ),
    );
  }

  void _openRequestPayoutSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) => _RequestPayoutSheet(onSuccess: _refresh),
    );
  }
}

class _PayoutQueueView extends ConsumerWidget {
  const _PayoutQueueView({required this.onRefresh, required this.greenColor});

  final Future<void> Function() onRefresh;
  final Color greenColor;

  String _formatDate(String iso) {
    final d = DateTime.parse(iso).toLocal();
    return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')} ${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(payoutRequestsProvider);
    final identity = ref.watch(authControllerProvider).identity;
    final theme = Theme.of(context);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: requests.when(
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              children: [
                SizedBox(height: MediaQuery.of(context).size.height * 0.25),
                const Icon(Icons.receipt_long, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                const Text(
                  'No payout requests yet',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.bold, color: Colors.grey),
                ),
              ],
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: items.length,
            itemBuilder: (context, index) {
              final request = items[index];
              final isMaker = request.requesterId == identity?.memberId;
              final hasApproved = request.approvals?.any((a) => a.officerId == identity?.memberId && a.decision == 'APPROVED') ?? false;
              final canEvaluate = request.status == 'PENDING' && !isMaker && !hasApproved;

              Color statusColor = Colors.orange;
              if (request.status == 'SUCCEEDED') statusColor = Colors.green;
              if (request.status == 'FAILED' || request.status == 'REJECTED') statusColor = Colors.red;

              return Card(
                margin: const EdgeInsets.only(bottom: 12),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                elevation: 1,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            _formatDate(request.createdAt),
                            style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: statusColor.withValues(alpha: 0.1),
                              borderRadius: BorderRadius.circular(12),
                              border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                            ),
                            child: Text(
                              request.status,
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: statusColor),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 8),
                      Text(
                        request.recipient?.name ?? 'Unknown Beneficiary',
                        style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      if (request.recipient != null)
                        Text(
                          '${request.recipient!.bankCode} · ${request.recipient!.accountNumber}',
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      const SizedBox(height: 12),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text('Amount:', style: TextStyle(color: theme.colorScheme.onSurfaceVariant, fontSize: 13)),
                          MoneyText(
                            value: request.amountValue,
                            currency: request.currency,
                            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        'Purpose: ${request.purpose}',
                        style: theme.textTheme.bodyMedium?.copyWith(fontStyle: FontStyle.italic),
                      ),
                      const SizedBox(height: 12),
                      const Divider(height: 1),
                      const SizedBox(height: 8),
                      if (request.status == 'PENDING') ...[
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Approvals given: ${request.approvals?.where((a) => a.decision == 'APPROVED').length ?? 0}',
                              style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 12),
                            ),
                            if (isMaker)
                              const Text(
                                'Maker limit restriction',
                                style: TextStyle(color: Colors.red, fontSize: 11, fontStyle: FontStyle.italic),
                              )
                            else if (hasApproved)
                              const Text(
                                'Already approved by you',
                                style: TextStyle(color: Colors.green, fontSize: 11, fontStyle: FontStyle.italic),
                              ),
                          ],
                        ),
                      ],
                      if (canEvaluate) ...[
                        const SizedBox(height: 12),
                        Row(
                          children: [
                            Expanded(
                              child: OutlinedButton.icon(
                                icon: const Icon(Icons.close, size: 16),
                                label: const Text('Reject'),
                                style: OutlinedButton.styleFrom(foregroundColor: Colors.red),
                                onPressed: () => _evaluateRequest(context, ref, request.id, 'REJECTED'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: FilledButton.icon(
                                icon: const Icon(Icons.check, size: 16),
                                label: const Text('Approve'),
                                style: FilledButton.styleFrom(backgroundColor: greenColor),
                                onPressed: () => _evaluateRequest(context, ref, request.id, 'APPROVED'),
                              ),
                            ),
                          ],
                        ),
                      ]
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
    );
  }

  Future<void> _evaluateRequest(
    BuildContext context,
    WidgetRef ref,
    String requestId,
    String decision,
  ) async {
    final commentController = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(decision == 'APPROVED' ? 'Approve Payout' : 'Reject Payout'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Add an optional evaluation comment/note:'),
            const SizedBox(height: 12),
            TextField(
              controller: commentController,
              decoration: const InputDecoration(
                hintText: 'e.g. Valid medical payout support',
                border: OutlineInputBorder(),
              ),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(true),
            style: FilledButton.styleFrom(
              backgroundColor: decision == 'APPROVED' ? greenColor : Colors.red,
            ),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      try {
        await ref.read(payoutsRepositoryProvider).approveRequest(
              requestId: requestId,
              decision: decision,
              comment: commentController.text.trim(),
            );
        onRefresh();
      } catch (e) {
        if (!context.mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString()), backgroundColor: Colors.red),
        );
      }
    }
    commentController.dispose();
  }
}

class _RecipientsView extends ConsumerWidget {
  const _RecipientsView({required this.onRefresh, required this.greenColor});

  final Future<void> Function() onRefresh;
  final Color greenColor;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final recipients = ref.watch(payoutRecipientsProvider);

    return RefreshIndicator(
      onRefresh: onRefresh,
      child: recipients.when(
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              children: [
                SizedBox(height: MediaQuery.of(context).size.height * 0.25),
                const Icon(Icons.people_outline, size: 64, color: Colors.grey),
                const SizedBox(height: 16),
                const Text(
                  'No recipients allowlisted yet',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontWeight: FontWeight.bold, color: Colors.grey),
                ),
              ],
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: items.length + 1, // list item + helper card at top
            itemBuilder: (context, index) {
              if (index == 0) {
                return Card(
                  margin: const EdgeInsets.only(bottom: 16),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  color: greenColor.withValues(alpha: 0.05),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Row(
                      children: [
                        Icon(Icons.security, color: greenColor, size: 24),
                        const SizedBox(width: 12),
                        const Expanded(
                          child: Text(
                            'Allowlist security: Payouts are restricted strictly to the verified recipients below.',
                            style: TextStyle(fontSize: 12, fontWeight: FontWeight.w500),
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              }

              final recipient = items[index - 1];
              return Card(
                margin: const EdgeInsets.only(bottom: 8),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                elevation: 1,
                child: ListTile(
                  leading: CircleAvatar(
                    backgroundColor: greenColor.withValues(alpha: 0.1),
                    child: Icon(
                      recipient.type == 'momo' ? Icons.phone_iphone : Icons.account_balance,
                      color: greenColor,
                    ),
                  ),
                  title: Text(recipient.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                  subtitle: Text('${recipient.bankCode} · ${recipient.accountNumber}'),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: Colors.green.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Text(
                      'Verified',
                      style: TextStyle(fontSize: 9, color: Colors.green, fontWeight: FontWeight.bold),
                    ),
                  ),
                ),
              );
            },
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
      ),
    );
  }
}

class _RequestPayoutSheet extends ConsumerStatefulWidget {
  const _RequestPayoutSheet({required this.onSuccess});

  final Future<void> Function() onSuccess;

  @override
  ConsumerState<_RequestPayoutSheet> createState() => _RequestPayoutSheetState();
}

class _RequestPayoutSheetState extends ConsumerState<_RequestPayoutSheet> {
  PayoutRecipientModel? _selectedRecipient;
  Fund? _selectedFund;
  final _amountController = TextEditingController();
  final _purposeController = TextEditingController();
  bool _isSubmitting = false;
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _purposeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selectedRecipient == null || _selectedFund == null) {
      setState(() => _error = 'Select recipient and fund.');
      return;
    }
    final amount = double.tryParse(_amountController.text.trim());
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter a valid amount.');
      return;
    }
    final purpose = _purposeController.text.trim();
    if (purpose.isEmpty) {
      setState(() => _error = 'Enter a purpose.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      await ref.read(payoutsRepositoryProvider).createRequest(
            amountValue: amount.toStringAsFixed(2),
            fundId: _selectedFund!.id,
            recipientId: _selectedRecipient!.id,
            purpose: purpose,
          );
      widget.onSuccess();
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isSubmitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final recipients = ref.watch(payoutRecipientsProvider);
    final funds = ref.watch(_fundsProvider);
    final theme = Theme.of(context);
    final padding = MediaQuery.of(context).viewInsets;

    return Container(
      padding: EdgeInsets.only(
        left: 24,
        right: 24,
        top: 24,
        bottom: 24 + padding.bottom,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            'Request Payout',
            style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 20),
          recipients.when(
            data: (items) {
              if (items.isEmpty) {
                return const Text('Add a verified recipient first before requesting payouts.');
              }
              return DropdownButtonFormField<PayoutRecipientModel>(
                value: _selectedRecipient,
                decoration: const InputDecoration(
                  labelText: 'Recipient',
                  border: OutlineInputBorder(),
                ),
                onChanged: (val) => setState(() => _selectedRecipient = val),
                items: items.map((r) {
                  return DropdownMenuItem(
                    value: r,
                    child: Text('${r.name} (${r.bankCode})'),
                  );
                }).toList(),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Error loading recipients: $e'),
          ),
          const SizedBox(height: 16),
          funds.when(
            data: (items) {
              return DropdownButtonFormField<Fund>(
                value: _selectedFund,
                decoration: const InputDecoration(
                  labelText: 'Deduct From Fund',
                  border: OutlineInputBorder(),
                ),
                onChanged: (val) => setState(() => _selectedFund = val),
                items: items.map((f) {
                  return DropdownMenuItem(
                    value: f,
                    child: Text(f.name),
                  );
                }).toList(),
              );
            },
            loading: () => const Center(child: CircularProgressIndicator()),
            error: (e, _) => Text('Error loading funds: $e'),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _amountController,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            decoration: const InputDecoration(
              labelText: 'Amount (GHS)',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _purposeController,
            decoration: const InputDecoration(
              labelText: 'Purpose / Description',
              border: OutlineInputBorder(),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 16),
            Text(
              _error!,
              style: const TextStyle(color: Colors.red, fontSize: 13),
              textAlign: TextAlign.center,
            ),
          ],
          const SizedBox(height: 24),
          FilledButton(
            onPressed: _isSubmitting ? null : _submit,
            child: _isSubmitting
                ? const SizedBox(
                    height: 20,
                    width: 20,
                    child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                  )
                : const Text('Submit Request'),
          ),
        ],
      ),
    );
  }
}
