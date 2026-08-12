import 'package:flutter/material.dart';

/// Shown only for the moment it takes checkSession() to resolve — the
/// router's redirect (see core/router/app_router.dart) bounces away from
/// here the instant AuthController notifies, so this never lingers.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
