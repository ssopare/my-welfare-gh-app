import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/payment_intent.dart';
import '../../core/theme/app_colors.dart';
import '../../core/widgets/money_text.dart';
import '../home/home_repository.dart';
import 'payments_repository.dart';

const _channelLabels = {
  'MOBILE_MONEY': 'Mobile Money',
  'CARD': 'Card',
  'BANK_TRANSFER': 'Bank Transfer',
};

/// A real payment is asynchronous — this screen genuinely doesn't know
/// the outcome the moment it opens, same as it wouldn't for an actual
/// Mobile Money/card provider. It polls GET /payment-intents/:id every 3s
/// until the status leaves INITIATED, exactly the mechanism a production
/// gateway integration would need, not a shortcut specific to the mock
/// provider standing in for one.
class PaymentPendingScreen extends ConsumerStatefulWidget {
  const PaymentPendingScreen({required this.intentId, super.key});

  final String intentId;

  @override
  ConsumerState<PaymentPendingScreen> createState() => _PaymentPendingScreenState();
}

class _PaymentPendingScreenState extends ConsumerState<PaymentPendingScreen> {
  PaymentIntentModel? _intent;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _poll();
    _timer = Timer.periodic(const Duration(seconds: 3), (_) => _poll());
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _poll() async {
    try {
      final intent = await ref.read(paymentsRepositoryProvider).getIntent(widget.intentId);
      if (!mounted) return;
      setState(() => _intent = intent);
      if (intent.status != 'INITIATED') {
        _timer?.cancel();
        ref.invalidate(homeDataProvider); // outstanding balance changed
      }
    } catch (_) {
      // A transient network blip mid-poll isn't worth surfacing — the
      // next tick tries again.
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final intent = _intent;

    return Scaffold(
      appBar: AppBar(
        title: const Text('Payment'),
        automaticallyImplyLeading: intent?.status != 'INITIATED',
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (intent == null) ...[
                const CircularProgressIndicator(),
              ] else if (intent.status == 'INITIATED') ...[
                const CircularProgressIndicator(),
                const SizedBox(height: 24),
                Text('Confirming with ${_channelLabels[intent.channel] ?? intent.channel}…', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(
                  'This can take a moment — you don\'t need to keep this screen open.',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 20),
                MoneyText(value: intent.amountValue, currency: intent.currency, style: theme.textTheme.headlineSmall),
              ] else if (intent.status == 'SUCCEEDED') ...[
                _SuccessBadge(theme: theme),
                const SizedBox(height: 20),
                Text('Payment successful', style: theme.textTheme.titleLarge),
                const SizedBox(height: 8),
                MoneyText(value: intent.amountValue, currency: intent.currency, style: theme.textTheme.headlineMedium),
                const SizedBox(height: 20),
                _ReceiptCard(intent: intent),
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
                  child: const Text('Done'),
                ),
              ] else ...[
                Icon(Icons.cancel, size: 56, color: theme.colorScheme.error),
                const SizedBox(height: 16),
                Text('Payment failed', style: theme.textTheme.titleLarge),
                const SizedBox(height: 8),
                Text(
                  'Nothing was charged. You can try again.',
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 24),
                OutlinedButton(
                  onPressed: () => Navigator.of(context).popUntil((route) => route.isFirst),
                  child: const Text('Back to home'),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// A real checkmark-in-a-circle moment, not just an icon — success is a
// semantic-good color (status green), deliberately not the brand primary,
// same separation the admin console keeps between "this is the brand" and
// "this specific thing succeeded".
class _SuccessBadge extends StatelessWidget {
  const _SuccessBadge({required this.theme});

  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    final isDark = theme.brightness == Brightness.dark;
    final good = isDark ? AppColors.statusGoodDark : AppColors.statusGoodLight;
    return Container(
      width: 88,
      height: 88,
      decoration: BoxDecoration(color: good.withValues(alpha: 0.12), shape: BoxShape.circle),
      child: Icon(Icons.check_circle, size: 56, color: good),
    );
  }
}

class _ReceiptCard extends StatelessWidget {
  const _ReceiptCard({required this.intent});

  final PaymentIntentModel intent;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Receipt number',
                  style: theme.textTheme.labelMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 2),
                Text(intent.providerReference, style: theme.textTheme.bodyMedium?.copyWith(fontFeatures: const [FontFeature.tabularFigures()])),
              ],
            ),
            IconButton(
              tooltip: 'Copy receipt number',
              icon: const Icon(Icons.copy_outlined, size: 18),
              onPressed: () {
                Clipboard.setData(ClipboardData(text: intent.providerReference));
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Receipt number copied')),
                );
              },
            ),
          ],
        ),
      ),
    );
  }
}
