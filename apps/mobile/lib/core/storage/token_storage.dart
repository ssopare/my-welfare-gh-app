import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// The mobile equivalent of the admin console's httpOnly session cookie —
/// there's no server-only trick available to a native app (the app *is*
/// the client), so the JWT lives here instead: Keychain on iOS, Keystore
/// on Android, encrypted at rest either way. Every API call reads it from
/// here to attach as a bearer token; nothing else in the app should touch
/// `FlutterSecureStorage` directly.
class TokenStorage {
  TokenStorage(this._storage);

  final FlutterSecureStorage _storage;
  static const _tokenKey = 'wf_access_token';

  Future<void> save(String token) => _storage.write(key: _tokenKey, value: token);

  Future<String?> read() => _storage.read(key: _tokenKey);

  Future<void> clear() => _storage.delete(key: _tokenKey);
}
