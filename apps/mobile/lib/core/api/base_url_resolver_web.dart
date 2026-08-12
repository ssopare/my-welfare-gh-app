// The web target's browser context runs on the same machine as the API
// during local development — no emulator-loopback-alias concern like
// Android has. Only used for previewing the app in a browser; the real
// shipped product is native iOS/Android, where this file never compiles
// in (see base_url_resolver.dart's conditional export).
String resolveBaseUrl() {
  const override = String.fromEnvironment('API_BASE_URL');
  if (override.isNotEmpty) return override;
  return 'http://localhost:3000';
}
