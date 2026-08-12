import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/fund.dart';
import '../../core/models/payment_intent.dart';
import '../../core/providers.dart';

class PaymentsRepository {
  PaymentsRepository(this._api);

  final ApiClient _api;

  Future<List<Fund>> listFunds() async {
    final res = await _api.dio.get('/funds');
    return (res.data as List).map((e) => Fund.fromJson(e as Map<String, dynamic>)).toList();
  }

  Future<PaymentIntentModel> initiate({
    required String memberId,
    required String fundId,
    required String amountValue,
    required String currency,
    required String channel,
    List<String>? obligationIds,
    // Which network to prompt for approval — required for MOBILE_MONEY
    // once a real gateway is behind PaymentProvider (MockPaymentProvider
    // ignores it, but Paystack's Charge API needs it). See
    // PaystackPaymentProvider on the API side.
    String? momoProvider,
  }) async {
    final res = await _api.dio.post('/payments/contribution/initiate', data: {
      'memberId': memberId,
      'fundId': fundId,
      'amountValue': amountValue,
      'currency': currency,
      'channel': channel,
      'obligationIds': ?obligationIds,
      'momoProvider': ?momoProvider,
    });
    return PaymentIntentModel.fromJson(res.data as Map<String, dynamic>);
  }

  // A real gateway confirms asynchronously via webhook — MockPaymentProvider
  // (no live aggregator credentials exist for this project yet) never
  // auto-completes one, by design, so this genuinely can stay INITIATED
  // indefinitely in this environment. The pending screen polls this exactly
  // the way it would need to for a real provider too; there's no shortcut
  // here that wouldn't also be honest in production.
  Future<PaymentIntentModel> getIntent(String id) async {
    final res = await _api.dio.get('/payment-intents/$id');
    return PaymentIntentModel.fromJson(res.data as Map<String, dynamic>);
  }
}

final paymentsRepositoryProvider = Provider<PaymentsRepository>((ref) {
  return PaymentsRepository(ref.watch(apiClientProvider));
});
