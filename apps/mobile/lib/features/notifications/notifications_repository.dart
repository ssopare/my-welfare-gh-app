import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/app_notification.dart';
import '../../core/providers.dart';

class NotificationsRepository {
  NotificationsRepository(this._api);

  final ApiClient _api;

  Future<List<AppNotification>> listForMember(String memberId) async {
    final res = await _api.dio.get('/members/$memberId/notifications');
    return (res.data as List)
        .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> markRead(String notificationId) {
    return _api.dio.patch('/notifications/$notificationId/read');
  }
}

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) {
  return NotificationsRepository(ref.watch(apiClientProvider));
});
