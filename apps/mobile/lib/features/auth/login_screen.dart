import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import 'auth_controller.dart';
import 'auth_widgets.dart';

/// Two structurally different treatments picked to match the admin
/// console's /login (see that page's comment for the full reasoning):
/// light mode gets a real member photo + floating card ("Light Mode
/// Board"); dark mode gets the app's own dark glassmorphism, unchanged.
/// No Member/Officer toggle — that choice belongs on the onboarding
/// screen (OnboardingScreen), where it maps to something real
/// (register-organisation vs join-organisation), not here, where logging
/// in is just phone + password regardless of who you are.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _organisationIdController = TextEditingController();
  bool _needsOrganisationId = false;
  bool _isSubmitting = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _phoneController.dispose();
    _passwordController.dispose();
    _organisationIdController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _isSubmitting = true);
    final auth = ref.read(authControllerProvider);
    final ok = await auth.login(
      phoneNumber: _phoneController.text.trim(),
      password: _passwordController.text,
      organisationId: _organisationIdController.text.trim(),
    );
    if (!mounted) return;
    setState(() {
      _isSubmitting = false;
      _needsOrganisationId = !ok &&
          (auth.lastError?.toLowerCase().contains('multiple organisations') ?? false);
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      body: isDark ? _buildDark(context) : _buildLight(context),
    );
  }

  // ---------------- light: photo hero + floating card ----------------

  Widget _buildLight(BuildContext context) {
    return SafeArea(
      child: SingleChildScrollView(
        child: Column(
          children: [
            Stack(
              children: [
                Container(
                  height: 260,
                  decoration: const BoxDecoration(
                    image: DecorationImage(
                      image: AssetImage('assets/images/welfare_login_bg.png'),
                      fit: BoxFit.cover,
                      alignment: Alignment.topCenter,
                    ),
                  ),
                ),
                Positioned.fill(
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Colors.black.withValues(alpha: 0.32), Colors.transparent],
                        begin: Alignment.topCenter,
                        end: Alignment.bottomCenter,
                        stops: const [0, 0.55],
                      ),
                    ),
                  ),
                ),
                Positioned(
                  left: 20,
                  top: 16,
                  child: Row(children: [
                    Container(
                      width: 32, height: 32,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFF8F6EFF), Color(0xFF5B48FA)]),
                        borderRadius: BorderRadius.circular(9),
                      ),
                      child: const Icon(Icons.favorite, color: Colors.white, size: 16),
                    ),
                    const SizedBox(width: 8),
                    const Text('My Welfare',
                        style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: Colors.white,
                            shadows: [Shadow(color: Colors.black45, blurRadius: 4)])),
                  ]),
                ),
              ],
            ),
            Transform.translate(
              offset: const Offset(0, -22),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(24, 26, 24, 20),
                decoration: const BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.vertical(top: Radius.circular(26)),
                ),
                child: _formContent(isDark: false),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ---------------- dark: existing glassmorphism ----------------

  Widget _buildDark(BuildContext context) {
    return Stack(
      children: [
        Positioned.fill(
          child: DecoratedBox(
            decoration: BoxDecoration(
              gradient: RadialGradient(
                center: const Alignment(-0.5, -0.8),
                radius: 1.2,
                colors: [
                  AppColors.primaryDark.withValues(alpha: 0.28),
                  AppColors.backgroundDark,
                ],
              ),
            ),
          ),
        ),
        SafeArea(
          child: Center(
            child: SingleChildScrollView(
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 420),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 56, height: 56,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(colors: [Color(0xFF9C8CFF), Color(0xFF5B48FA)]),
                        borderRadius: BorderRadius.circular(16),
                        boxShadow: [BoxShadow(color: AppColors.primaryDark.withValues(alpha: 0.5), blurRadius: 36, spreadRadius: 1)],
                      ),
                      child: const Icon(Icons.favorite, color: Colors.white, size: 24),
                    ),
                    const SizedBox(height: 10),
                    const Text('My Welfare', style: TextStyle(fontWeight: FontWeight.w800, fontSize: 17, color: Colors.white)),
                    const SizedBox(height: 28),
                    Container(
                      padding: const EdgeInsets.all(24),
                      decoration: BoxDecoration(
                        color: AppColors.surfaceDark.withValues(alpha: 0.85),
                        borderRadius: BorderRadius.circular(24),
                        border: Border.all(color: Colors.white.withValues(alpha: 0.08)),
                        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.35), blurRadius: 24, offset: const Offset(0, 8))],
                      ),
                      child: _formContent(isDark: true),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  // ---------------- shared form (identical fields both themes) ----------------

  Widget _formContent({required bool isDark}) {
    final theme = Theme.of(context);
    final auth = ref.watch(authControllerProvider);
    final muted = isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Welcome back',
            style: theme.textTheme.titleLarge?.copyWith(fontWeight: FontWeight.bold, color: isDark ? Colors.white : const Color(0xFF1C1A22)),
            textAlign: TextAlign.center),
        const SizedBox(height: 4),
        Text('Sign in to continue', style: theme.textTheme.bodyMedium?.copyWith(color: muted), textAlign: TextAlign.center),
        const SizedBox(height: 22),
        AuthInputCard(
          label: 'PHONE NUMBER',
          isDark: isDark,
          child: TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(hintText: '+233 20 000 0000', border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
          ),
        ),
        const SizedBox(height: 12),
        AuthInputCard(
          label: 'PASSWORD',
          isDark: isDark,
          child: Row(children: [
            Expanded(
              child: TextField(
                controller: _passwordController,
                obscureText: _obscurePassword,
                decoration: const InputDecoration(hintText: '••••••••', border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
              ),
            ),
            GestureDetector(
              onTap: () => setState(() => _obscurePassword = !_obscurePassword),
              child: Icon(_obscurePassword ? Icons.visibility_off_outlined : Icons.visibility_outlined, color: muted, size: 20),
            ),
          ]),
        ),
        if (_needsOrganisationId) ...[
          const SizedBox(height: 12),
          AuthInputCard(
            label: 'ORGANISATION ID',
            isDark: isDark,
            child: TextField(
              controller: _organisationIdController,
              decoration: const InputDecoration(hintText: 'Org ID / Name', border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
            ),
          ),
        ],
        if (auth.lastError != null && !_isSubmitting) ...[
          const SizedBox(height: 14),
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: theme.colorScheme.error.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12)),
            child: Text(auth.lastError!, style: TextStyle(color: theme.colorScheme.error, fontSize: 13)),
          ),
        ],
        const SizedBox(height: 10),
        Align(
          alignment: Alignment.centerRight,
          child: TextButton(
            onPressed: () {},
            style: TextButton.styleFrom(padding: EdgeInsets.zero, minimumSize: Size.zero),
            child: const Text('Reset Password', style: TextStyle(fontSize: 12)),
          ),
        ),
        const SizedBox(height: 12),
        AuthPrimaryButton(label: 'Login', isLoading: _isSubmitting, onPressed: _submit),
        const SizedBox(height: 18),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text("New here?", style: TextStyle(color: muted)),
            TextButton(onPressed: () => context.push('/onboarding'), child: const Text('Get started')),
          ],
        ),
      ],
    );
  }
}

