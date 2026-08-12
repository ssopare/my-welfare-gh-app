import 'dart:io';

// Android emulators can't resolve the host machine's `localhost` as
// itself — 10.0.2.2 is the documented alias for it.
String resolveBaseUrl() {
  const override = String.fromEnvironment('API_BASE_URL');
  if (override.isNotEmpty) return override;
  if (Platform.isAndroid) return 'http://10.0.2.2:3000';
  return 'http://localhost:3000';
}
