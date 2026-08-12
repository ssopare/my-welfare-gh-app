import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/member_detail.dart';
import '../../core/models/organisation.dart';
import '../../core/providers.dart';

class ProfileData {
  const ProfileData({required this.organisation, required this.member});

  final Organisation organisation;
  final MemberDetail member;
}

class ProfileRepository {
  ProfileRepository(this._api);

  final ApiClient _api;

  Future<ProfileData> load() async {
    final results = await Future.wait([
      _api.dio.get('/organisation'),
      _api.dio.get('/members/me'),
    ]);
    return ProfileData(
      organisation: Organisation.fromJson(results[0].data as Map<String, dynamic>),
      member: MemberDetail.fromJson(results[1].data as Map<String, dynamic>),
    );
  }
}

final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.watch(apiClientProvider));
});

final profileDataProvider = FutureProvider.autoDispose<ProfileData>((ref) {
  return ref.watch(profileRepositoryProvider).load();
});
