import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../core/api/api_client.dart';
import '../../core/models/fund.dart';
import '../../core/models/obligation.dart';
import '../../core/models/organisation.dart';
import '../../core/widgets/money_text.dart';
import '../auth/auth_controller.dart';
import 'payment_pending_screen.dart';
import 'payments_repository.dart';

final _fundsProvider = FutureProvider.autoDispose((ref) {
  return ref.watch(paymentsRepositoryProvider).listFunds();
});

// Badge colors are per-channel — the backend only distinguishes these
// three PaymentChannel values at that level.
const _channels = [
  ('MOBILE_MONEY', 'Mobile Money', Icons.phone_iphone, Color(0xFFF59E0B)),
  ('CARD', 'Card', Icons.credit_card, Color(0xFF3B82F6)),
  ('BANK_TRANSFER', 'Bank Transfer', Icons.account_balance, Color(0xFF64748B)),
];

// Which network to prompt for approval on — only meaningful for
// MOBILE_MONEY, and only actually required by a real gateway
// (MockPaymentProvider ignores it; PaystackPaymentProvider's Charge API
// needs it). See PaymentsRepository.initiate.
const _momoProviders = [
  ('mtn', 'MTN Mobile Money'),
  ('vod', 'Telecel Cash'),
  ('atl', 'AirtelTigo Money'),
];

class PayScreen extends ConsumerStatefulWidget {
  const PayScreen({
    required this.suggestedAmount,
    required this.currency,
    required this.organisation,
    required this.openObligations,
    super.key,
  });

  final double suggestedAmount;
  final String currency;
  final Organisation organisation;
  // Only actually used (as a picker) when organisation.memberSelectsObligations
  // is true — the default oldest_first org keeps today's single-amount flow,
  // where the backend auto-splits across everything open with no choice
  // needed here.
  final List<Obligation> openObligations;

  @override
  ConsumerState<PayScreen> createState() => _PayScreenState();
}

class _PayScreenState extends ConsumerState<PayScreen> {
  Fund? _selectedFund;
  String _channel = _channels.first.$1;
  String _momoProvider = _momoProviders.first.$1;
  late final TextEditingController _amountController;
  bool _isSubmitting = false;
  String? _error;
  final Set<String> _selectedObligationIds = {};

  // Selecting which contribution types to pay is available regardless of
  // the org's policy now — that policy only ever governs whether a
  // selection is *required*, not whether one is *allowed* (see
  // ObligationService.recordContributionPaymentInTx). member_selected
  // still requires picking something whenever there's more than one
  // open one-time/event item; oldest_first never requires it.
  bool get _selectionRequired =>
      widget.organisation.memberSelectsObligations && _otherObligations.isNotEmpty;

  List<Obligation> get _monthlyObligations =>
      widget.openObligations.where((o) => o.isMonthly).toList();
  List<Obligation> get _otherObligations =>
      widget.openObligations.where((o) => !o.isMonthly).toList();

  double get _monthlyTotal => _monthlyObligations.fold(0, (sum, o) => sum + o.outstanding);
  double get _selectedOtherTotal => _otherObligations
      .where((o) => _selectedObligationIds.contains(o.id))
      .fold(0, (sum, o) => sum + o.outstanding);
  double get _selectedTotal => _monthlyTotal + _selectedOtherTotal;

  @override
  void initState() {
    super.initState();
    // Starts at the monthly total (always covered, nothing to select
    // yet) — one-time items only add to it once checked. When there's
    // nothing open at all (paid up, advance payment), falls back to the
    // page's suggested amount instead of a bare 0.00.
    final openTotal = _monthlyTotal + _selectedOtherTotal;
    final initialAmount = openTotal > 0 ? openTotal : widget.suggestedAmount;
    _amountController = TextEditingController(text: initialAmount.toStringAsFixed(2));
  }

  @override
  void dispose() {
    _amountController.dispose();
    super.dispose();
  }

  void _toggleObligation(Obligation obligation, bool? selected) {
    setState(() {
      if (selected ?? false) {
        _selectedObligationIds.add(obligation.id);
      } else {
        _selectedObligationIds.remove(obligation.id);
      }
      // Selecting is what drives the amount here, not free typing — it's
      // always exactly what covers the chosen items, mirroring what the
      // backend will actually apply it to.
      _amountController.text = _selectedTotal.toStringAsFixed(2);
    });
  }

  Future<void> _submit() async {
    final identity = ref.read(authControllerProvider).identity;
    if (_selectedFund == null || identity == null) return;

    if (_selectionRequired && _selectedObligationIds.isEmpty) {
      setState(() => _error = 'Select at least one item to pay towards.');
      return;
    }

    final amount = double.tryParse(_amountController.text);
    if (amount == null || amount <= 0) {
      setState(() => _error = 'Enter a valid amount.');
      return;
    }
    // Only a ceiling once something's actually been picked — with
    // nothing selected, any amount is fair game (everything open gets
    // covered oldest-first, and overpayment spreads into future months).
    if (_selectedObligationIds.isNotEmpty && amount > _selectedTotal + 0.005) {
      setState(() => _error = 'Amount can\'t exceed the total of what you selected.');
      return;
    }

    setState(() {
      _isSubmitting = true;
      _error = null;
    });

    try {
      final intent = await ref.read(paymentsRepositoryProvider).initiate(
            memberId: identity.memberId,
            fundId: _selectedFund!.id,
            amountValue: amount.toStringAsFixed(2),
            currency: widget.currency,
            channel: _channel,
            momoProvider: _channel == 'MOBILE_MONEY' ? _momoProvider : null,
            obligationIds: _selectedObligationIds.isNotEmpty
                ? _selectedObligationIds.toList()
                : null,
          );
      if (!mounted) return;
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (_) => PaymentPendingScreen(intentId: intent.id)),
      );
    } catch (error) {
      setState(() {
        // Surfaces the API's real message (e.g. "Unable to reach the
        // payment provider right now...") instead of a fixed generic
        // string — this used to swallow the actual reason, which was
        // exactly why repeated failures never got clearer.
        _error = error is DioException
            ? error.toApiException().message
            : 'Something went wrong starting this payment. Please try again.';
        _isSubmitting = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final funds = ref.watch(_fundsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Make a payment')),
      body: funds.when(
        data: (items) {
          if (_selectedFund == null) {
            // Suggests the fund whichever plan is actually owed against —
            // without this, a routine monthly-dues payment could easily
            // land in an unrelated one-off fund by accident.
            final defaultFundIds = widget.openObligations.map((o) => o.defaultFundId).whereType<String>();
            Fund? suggested;
            if (defaultFundIds.isNotEmpty) {
              final suggestedFundId = defaultFundIds.first;
              for (final fund in items) {
                if (fund.id == suggestedFundId) {
                  suggested = fund;
                  break;
                }
              }
            }
            _selectedFund = suggested ?? (items.isNotEmpty ? items.first : null);
          }
          return SingleChildScrollView(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_monthlyObligations.isNotEmpty) ...[
                  Text('Monthly dues (applied automatically)', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    'Always covered first, oldest due date first — this isn\'t something you choose.',
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 8),
                  Card(
                    margin: EdgeInsets.zero,
                    color: theme.colorScheme.surfaceContainerHighest.withValues(alpha: 0.4),
                    child: Column(
                      children: [
                        for (final obligation in _monthlyObligations)
                          ListTile(
                            title: Text(DateFormat('MMM d, y').format(obligation.dueDate)),
                            trailing: MoneyText(
                              value: obligation.outstanding.toStringAsFixed(2),
                              currency: obligation.currency,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                if (_otherObligations.isNotEmpty) ...[
                  Text('Other contributions (choose which to pay)', style: theme.textTheme.titleMedium),
                  const SizedBox(height: 4),
                  Text(
                    _selectionRequired
                        ? 'Pick at least one — this organisation requires selecting what a payment covers.'
                        : 'Optional — leave nothing checked to pay everything open, oldest-due first.',
                    style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                  ),
                  const SizedBox(height: 8),
                  Card(
                    margin: EdgeInsets.zero,
                    child: Column(
                      children: [
                        for (final obligation in _otherObligations)
                          CheckboxListTile(
                            value: _selectedObligationIds.contains(obligation.id),
                            onChanged: (selected) => _toggleObligation(obligation, selected),
                            controlAffinity: ListTileControlAffinity.leading,
                            title: Text(obligation.planName ?? DateFormat('MMM d, y').format(obligation.dueDate)),
                            subtitle: Text('${obligation.status[0]}${obligation.status.substring(1).toLowerCase()}'),
                            secondary: MoneyText(
                              value: obligation.outstanding.toStringAsFixed(2),
                              currency: obligation.currency,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                ],
                TextField(
                  controller: _amountController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: InputDecoration(
                    labelText: 'Amount',
                    prefixText: '${widget.currency} ',
                  ),
                ),
                if (_selectedObligationIds.isNotEmpty)
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _amountController,
                    builder: (context, value, _) {
                      final typed = double.tryParse(value.text) ?? 0;
                      if (typed >= _selectedTotal - 0.005) return const SizedBox.shrink();
                      return Padding(
                        padding: const EdgeInsets.only(top: 6),
                        child: Text(
                          'This won\'t fully cover everything selected — it\'ll be applied '
                          'oldest-due first among what you picked (monthly dues are still '
                          'covered first, automatically).',
                          style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      );
                    },
                  ),
                const SizedBox(height: 16),
                DropdownButtonFormField<Fund>(
                  initialValue: _selectedFund,
                  decoration: const InputDecoration(labelText: 'Fund'),
                  items: [for (final fund in items) DropdownMenuItem(value: fund, child: Text(fund.name))],
                  onChanged: (value) => setState(() => _selectedFund = value),
                ),
                const SizedBox(height: 20),
                Text('Pay with', style: theme.textTheme.labelLarge),
                const SizedBox(height: 4),
                RadioGroup<String>(
                  groupValue: _channel,
                  onChanged: (v) => setState(() => _channel = v!),
                  child: Column(
                    children: [
                      for (final (value, label, icon, color) in _channels)
                        Card(
                          margin: const EdgeInsets.only(bottom: 8),
                          clipBehavior: Clip.antiAlias,
                          child: RadioListTile<String>(
                            value: value,
                            secondary: Container(
                              width: 36,
                              height: 36,
                              decoration: BoxDecoration(
                                color: color.withValues(alpha: 0.14),
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Icon(icon, size: 18, color: color),
                            ),
                            title: Text(label),
                          ),
                        ),
                    ],
                  ),
                ),
                if (_channel == 'MOBILE_MONEY') ...[
                  const SizedBox(height: 12),
                  DropdownButtonFormField<String>(
                    initialValue: _momoProvider,
                    decoration: const InputDecoration(labelText: 'Network'),
                    items: [
                      for (final (value, label) in _momoProviders)
                        DropdownMenuItem(value: value, child: Text(label)),
                    ],
                    onChanged: (value) => setState(() => _momoProvider = value!),
                  ),
                ],
                if (_error != null) ...[
                  const SizedBox(height: 8),
                  Text(_error!, style: TextStyle(color: theme.colorScheme.error)),
                ],
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: (_selectedFund == null ||
                          _isSubmitting ||
                          (_selectionRequired && _selectedObligationIds.isEmpty))
                      ? null
                      : _submit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Continue'),
                ),
              ],
            ),
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (error, _) => Center(child: Text('$error')),
      ),
    );
  }
}
