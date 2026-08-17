import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/dependant.dart';
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

  /// Uploads [imageFile] to [POST /upload/avatar] as multipart/form-data.
  /// Returns the relative URL of the stored file (e.g. /uploads/avatars/uuid.jpg).
  /// The caller is responsible for persisting the returned URL via
  /// [AuthController.completeProfile].
  Future<String> uploadAvatar(File imageFile) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(
        imageFile.path,
        filename: imageFile.path.split('/').last,
      ),
    });
    final response = await _api.dio.post<Map<String, dynamic>>(
      '/upload/avatar',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
    final url = response.data?['url'] as String?;
    if (url == null) throw Exception('Upload succeeded but no URL was returned');
    return url;
  }

  Future<Dependant> addDependant(String name, String relationship) async {
    final res = await _api.dio.post(
      '/members/me/dependants',
      data: {'name': name, 'relationship': relationship},
    );
    return Dependant.fromJson(res.data as Map<String, dynamic>);
  }

  Future<void> confirmDependant(String dependantId) {
    return _api.dio.patch('/members/me/dependants/$dependantId/confirm');
  }
}


final profileRepositoryProvider = Provider<ProfileRepository>((ref) {
  return ProfileRepository(ref.watch(apiClientProvider));
});

final profileDataProvider = FutureProvider.autoDispose<ProfileData>((ref) {
  return ref.watch(profileRepositoryProvider).load();
});
