import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/payout_request.dart';
import '../../core/providers.dart';

class PayoutsRepository {
  PayoutsRepository(this._api);

  final ApiClient _api;

  Future<List<PayoutRecipientModel>> listRecipients() async {
    final res = await _api.dio.get('/payouts/recipients');
    return (res.data as List)
        .map((e) => PayoutRecipientModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<PayoutRequestModel>> listRequests() async {
    final res = await _api.dio.get('/payouts/requests');
    return (res.data as List)
        .map((e) => PayoutRequestModel.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<PayoutRequestModel> createRequest({
    required String amountValue,
    required String fundId,
    required String recipientId,
    required String purpose,
  }) async {
    final res = await _api.dio.post('/payouts/requests', data: {
      'amountValue': amountValue,
      'fundId': fundId,
      'recipientId': recipientId,
      'purpose': purpose,
    });
    return PayoutRequestModel.fromJson(res.data as Map<String, dynamic>);
  }

  Future<PayoutRequestModel> approveRequest({
    required String requestId,
    required String decision,
    required String comment,
  }) async {
    final res = await _api.dio.post('/payouts/requests/$requestId/approve', data: {
      'decision': decision,
      'comment': comment,
    });
    return PayoutRequestModel.fromJson(res.data as Map<String, dynamic>);
  }
}

final payoutsRepositoryProvider = Provider<PayoutsRepository>((ref) {
  return PayoutsRepository(ref.watch(apiClientProvider));
});
