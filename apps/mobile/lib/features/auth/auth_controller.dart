import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/api/api_client.dart';
import '../../core/models/auth_identity.dart';
import '../../core/models/my_organisation_membership.dart';
import '../../core/providers.dart';
import 'auth_repository.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  return AuthRepository(ref.watch(apiClientProvider), ref.watch(tokenStorageProvider));
});

/// A plain ChangeNotifier, not a Riverpod AsyncNotifier — it doubles as
/// go_router's `refreshListenable` (see core/router/app_router.dart),
/// which needs a Listenable, not a Riverpod stream. Still exposed via a
/// Provider below so the rest of the app gets it through normal Riverpod
/// DI rather than a global singleton.
class AuthController extends ChangeNotifier {
  AuthController(this._repository);

  final AuthRepository _repository;

  AuthIdentity? identity;
  bool isCheckingSession = true;
  String? lastError;
  // Drives app_router.dart's hard gate to /complete-profile — only
  // meaningful once identity is set; see _refreshProfileCompletion.
  bool needsProfileCompletion = false;

  bool get isLoggedIn => identity != null;

  Future<void> checkSession() async {
    identity = await _repository.tryRestoreSession();
    await _refreshProfileCompletion();
    isCheckingSession = false;
    notifyListeners();
  }

  // /auth/me (what `identity` comes from) is just the decoded JWT — it
  // can't know whether this account has ever set a name, so this is a
  // deliberate second call after every place `identity` gets set. Fails
  // open (never blocks on a transient network error) rather than risk
  // locking someone out of the whole app over a flaky request.
  Future<void> _refreshProfileCompletion() async {
    if (identity == null) {
      needsProfileCompletion = false;
      return;
    }
    try {
      final name = await _repository.fetchOwnName();
      needsProfileCompletion = name == null || name.trim().isEmpty;
    } catch (_) {
      needsProfileCompletion = false;
    }
  }

  Future<bool> completeProfile(String name, {String? avatarUrl}) async {
    try {
      await _repository.updateOwnProfile(name, avatarUrl: avatarUrl);
      needsProfileCompletion = false;
      notifyListeners();
      return true;
    } on DioException catch (error) {
      lastError = error.toApiException().message;
      notifyListeners();
      return false;
    } catch (_) {
      lastError = 'Something went wrong. Please try again.';
      notifyListeners();
      return false;
    }
  }

  Future<bool> login({
    required String phoneNumber,
    required String password,
    String? organisationId,
  }) => _attempt(() => _repository.login(
        phoneNumber: phoneNumber,
        password: password,
        organisationId: organisationId,
      ));

  Future<bool> joinOrganisation({
    required String phoneNumber,
    required String password,
    required String joinCode,
    required String name,
  }) => _attempt(() => _repository.joinOrganisation(
        phoneNumber: phoneNumber,
        password: password,
        joinCode: joinCode,
        name: name,
      ));

  // Side-effect free — does not go through _attempt (no identity change,
  // no lastError semantics). Callers handle their own failure UI since a
  // failed lookup here just means "assume new account" rather than a
  // fatal auth error.
  Future<bool> checkPhoneExists(String phoneNumber) => _repository.checkPhoneExists(phoneNumber);

  Future<bool> joinAdditionalOrganisation({required String joinCode}) =>
      _attempt(() => _repository.joinAdditionalOrganisation(joinCode: joinCode));

  // Side-effect free like checkPhoneExists — doesn't touch `identity`, so
  // the switcher screen owns its own loading/error state around this call
  // rather than going through _attempt/lastError.
  Future<List<MyOrganisationMembership>> listMyOrganisations() =>
      _repository.listMyOrganisations();

  // Goes through _attempt like every other call that replaces `identity`
  // — switching orgs changes memberId/role/organisationId all at once, so
  // the rest of the app (home, profile, claims) needs to refetch against
  // the new scope exactly like a fresh login would.
  Future<bool> switchOrganisation({required String organisationId}) =>
      _attempt(() => _repository.switchOrganisation(organisationId: organisationId));

  Future<bool> createAdditionalOrganisation({
    required String legalName,
    required String organisationType,
  }) => _attempt(() => _repository.createAdditionalOrganisation(
        legalName: legalName,
        organisationType: organisationType,
      ));

  Future<bool> registerOrganisation({
    required String legalName,
    required String organisationType,
    required String phoneNumber,
    required String password,
    required String name,
  }) => _attempt(() => _repository.registerOrganisation(
        legalName: legalName,
        organisationType: organisationType,
        phoneNumber: phoneNumber,
        password: password,
        name: name,
      ));

  Future<bool> _attempt(Future<AuthIdentity> Function() action) async {
    lastError = null;
    try {
      identity = await action();
      await _refreshProfileCompletion();
      notifyListeners();
      return true;
    } on DioException catch (error) {
      lastError = error.toApiException().message;
      notifyListeners();
      return false;
    } catch (_) {
      lastError = 'Something went wrong. Please try again.';
      notifyListeners();
      return false;
    }
  }

  Future<void> logout() async {
    await _repository.logout();
    identity = null;
    needsProfileCompletion = false;
    notifyListeners();
  }
}

final authControllerProvider = ChangeNotifierProvider<AuthController>((ref) {
  final controller = AuthController(ref.watch(authRepositoryProvider));
  controller.checkSession();
  return controller;
});
