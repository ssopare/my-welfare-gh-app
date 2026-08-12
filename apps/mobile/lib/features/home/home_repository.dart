import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/app_notification.dart';
import '../../core/models/member_profile.dart';
import '../../core/models/obligation.dart';
import '../../core/models/organisation.dart';
import '../../core/providers.dart';
import '../auth/auth_controller.dart';

class HomeData {
  const HomeData({
    required this.organisation,
    required this.profile,
    required this.obligations,
    required this.notifications,
  });

  final Organisation organisation;
  final MemberProfile profile;
  final List<Obligation> obligations;
  final List<AppNotification> notifications;

  List<Obligation> get openObligations => obligations.where((o) => o.isOpen).toList();
  double get totalOutstanding => openObligations.fold(0, (sum, o) => sum + o.outstanding);
  int get unreadNotificationCount => notifications.where((n) => n.isUnread).length;
}

class HomeRepository {
  HomeRepository(this._api);

  final ApiClient _api;

  Future<HomeData> load(String memberId) async {
    final results = await Future.wait([
      _api.dio.get('/organisation'),
      _api.dio.get('/members/me'),
      _api.dio.get('/members/$memberId/obligations'),
      _api.dio.get('/members/$memberId/notifications'),
    ]);

    return HomeData(
      organisation: Organisation.fromJson(results[0].data as Map<String, dynamic>),
      profile: MemberProfile.fromJson(results[1].data as Map<String, dynamic>),
      obligations: (results[2].data as List)
          .map((e) => Obligation.fromJson(e as Map<String, dynamic>))
          .toList(),
      notifications: (results[3].data as List)
          .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}

final homeRepositoryProvider = Provider<HomeRepository>((ref) {
  return HomeRepository(ref.watch(apiClientProvider));
});

final homeDataProvider = FutureProvider.autoDispose<HomeData>((ref) {
  final identity = ref.watch(authControllerProvider).identity;
  if (identity == null) {
    throw StateError('homeDataProvider read before a member is signed in');
  }
  return ref.watch(homeRepositoryProvider).load(identity.memberId);
});
