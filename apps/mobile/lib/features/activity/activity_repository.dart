import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/payment_activity_entry.dart';
import '../../core/providers.dart';

class ActivityRepository {
  ActivityRepository(this._api);

  final ApiClient _api;

  Future<List<PaymentActivityEntry>> load() async {
    final res = await _api.dio.get('/payments/activity');
    return (res.data as List)
        .map((e) => PaymentActivityEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}

final activityRepositoryProvider = Provider<ActivityRepository>((ref) {
  return ActivityRepository(ref.watch(apiClientProvider));
});

final activityDataProvider = FutureProvider.autoDispose<List<PaymentActivityEntry>>((ref) {
  return ref.watch(activityRepositoryProvider).load();
});
