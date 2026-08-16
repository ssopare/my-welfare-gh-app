// Smoke test: the app boots, resolves "nobody is signed in yet" (secure
// storage's platform channel is mocked to return no token, since real
// Keychain/Keystore access isn't available under `flutter test`), and
// lands on the login screen — proving the provider wiring, router
// redirect logic, and theme all construct without throwing.
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/app.dart';

void main() {
  const secureStorageChannel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');

  setUp(() {
    TestWidgetsFlutterBinding.ensureInitialized()
        .defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, (call) async {
      if (call.method == 'read') return null;
      return null;
    });
  });

  tearDown(() {
    TestWidgetsFlutterBinding.ensureInitialized()
        .defaultBinaryMessenger
        .setMockMethodCallHandler(secureStorageChannel, null);
  });

  testWidgets('boots with no stored session and lands on the login screen', (tester) async {
    await tester.pumpWidget(const ProviderScope(child: WelfareApp()));
    await tester.pumpAndSettle();

    expect(find.text('Login'), findsWidgets);
  });
}
