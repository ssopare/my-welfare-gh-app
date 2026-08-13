import '../../core/api/api_client.dart';
import '../../core/models/auth_identity.dart';
import '../../core/storage/token_storage.dart';

class AuthRepository {
  AuthRepository(this._api, this._tokenStorage);

  final ApiClient _api;
  final TokenStorage _tokenStorage;

  Future<AuthIdentity> login({
    required String phoneNumber,
    required String password,
    String? organisationId,
  }) async {
    final res = await _api.dio.post('/auth/login', data: {
      'phoneNumber': phoneNumber,
      'password': password,
      if (organisationId != null && organisationId.isNotEmpty) 'organisationId': organisationId,
    });
    await _tokenStorage.save(res.data['accessToken'] as String);
    return me();
  }

  // joinCode is the normal path — the short, human-shareable code an
  // admin hands out (see the backend's organisation_join_code migration).
  // The raw organisationId is still accepted by the API but isn't
  // exposed here; nothing in this app should hand a member a UUID to
  // type.
  Future<AuthIdentity> joinOrganisation({
    required String phoneNumber,
    required String password,
    required String joinCode,
    // Only actually persisted server-side when this phone number has no
    // existing account yet — an existing account joining a second org
    // already has a name from before. See UpdateOwnProfileDto's backend
    // comment for the "carries through every org" reasoning.
    required String name,
  }) async {
    final res = await _api.dio.post('/auth/join-organisation', data: {
      'phoneNumber': phoneNumber,
      'password': password,
      'joinCode': joinCode,
      'name': name,
    });
    await _tokenStorage.save(res.data['accessToken'] as String);
    return me();
  }

  // Public, side-effect free — lets the join screen decide whether to ask
  // for a name (new account) or just show a "welcome back" password
  // prompt (existing account) before the user commits to anything.
  Future<bool> checkPhoneExists(String phoneNumber) async {
    final res = await _api.dio.post('/auth/check-phone', data: {
      'phoneNumber': phoneNumber,
    });
    return res.data['exists'] as bool;
  }

  // Authenticated counterpart to joinOrganisation above — for a member
  // who's already logged in and just wants to join a second organisation.
  // Needs only a join code: the JWT already proves who they are, so no
  // phone/password/name re-entry.
  Future<AuthIdentity> joinAdditionalOrganisation({required String joinCode}) async {
    final res = await _api.dio.post('/auth/organisations/join', data: {
      'joinCode': joinCode,
    });
    await _tokenStorage.save(res.data['accessToken'] as String);
    return me();
  }

  // The mobile counterpart to the admin console's "create organisation"
  // flow — founds a brand-new organisation and becomes its admin. Not
  // technically web-only (the backend endpoint has never cared which app
  // calls it); onboarding now offers both paths on every platform rather
  // than the choice being implicit in which app you happened to install.
  Future<AuthIdentity> registerOrganisation({
    required String legalName,
    required String organisationType,
    required String phoneNumber,
    required String password,
    required String name,
  }) async {
    final res = await _api.dio.post('/auth/register-organisation', data: {
      'legalName': legalName,
      'organisationType': organisationType,
      'phoneNumber': phoneNumber,
      'password': password,
      'name': name,
    });
    await _tokenStorage.save(res.data['accessToken'] as String);
    return me();
  }

  Future<AuthIdentity> me() async {
    final res = await _api.dio.get('/auth/me');
    return AuthIdentity.fromJson(res.data as Map<String, dynamic>);
  }

  // /auth/me is deliberately just the decoded JWT (no DB read) — it has
  // no way to know whether this account has ever set a name, so that's a
  // second, separate call. Used to drive AuthController.needsProfileCompletion.
  Future<String?> fetchOwnName() async {
    final res = await _api.dio.get('/members/me');
    final account = res.data['account'] as Map<String, dynamic>;
    return account['name'] as String?;
  }

  Future<void> updateOwnName(String name) {
    return _api.dio.patch('/members/me/profile', data: {'name': name});
  }

  /// Never trusts a stored token's mere presence — same "always verify
  /// against a real endpoint" reasoning as the admin console's
  /// requireSession(). Returns null (not a thrown error) for the normal
  /// "nobody's logged in yet" case, so the startup check can treat it as
  /// a plain state read rather than exception-flow control.
  Future<AuthIdentity?> tryRestoreSession() async {
    final token = await _tokenStorage.read();
    if (token == null) return null;
    try {
      return await me();
    } catch (_) {
      await _tokenStorage.clear();
      return null;
    }
  }

  Future<void> logout() => _tokenStorage.clear();
}
