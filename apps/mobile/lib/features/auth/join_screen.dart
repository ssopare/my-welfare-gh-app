import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import 'auth_controller.dart';
import 'auth_widgets.dart';

/// Joining an *existing* organisation with a code from whoever invited
/// them — the "join as a member" half of the onboarding chooser
/// (OnboardingScreen), the counterpart to CreateOrganisationScreen's
/// "create a welfare group" half. Same shared field/button chrome as
/// LoginScreen (auth_widgets.dart) so the whole auth flow reads as one
/// system, light/dark aware the same way.
class JoinScreen extends ConsumerStatefulWidget {
  const JoinScreen({super.key});

  @override
  ConsumerState<JoinScreen> createState() => _JoinScreenState();
}

class _JoinScreenState extends ConsumerState<JoinScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  final _joinCodeController = TextEditingController();
  bool _isSubmitting = false;
  bool _obscurePassword = true;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _joinCodeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _isSubmitting = true);
    final auth = ref.read(authControllerProvider);
    await auth.joinOrganisation(
      phoneNumber: _phoneController.text.trim(),
      password: _passwordController.text,
      joinCode: _joinCodeController.text.trim(),
      name: _nameController.text.trim(),
    );
    if (!mounted) return;
    setState(() => _isSubmitting = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final muted = isDark ? AppColors.mutedForegroundDark : AppColors.mutedForegroundLight;

    return Scaffold(
      backgroundColor: isDark ? AppColors.backgroundDark : Colors.white,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: BackButton(onPressed: () => context.pop()),
      ),
      body: isDark
          ? DecoratedBox(
              decoration: BoxDecoration(
                gradient: RadialGradient(
                  center: const Alignment(-0.5, -0.9),
                  radius: 1.2,
                  colors: [AppColors.primaryDark.withValues(alpha: 0.22), AppColors.backgroundDark],
                ),
              ),
              child: _body(context, theme, isDark, muted, auth.lastError),
            )
          : _body(context, theme, isDark, muted, auth.lastError),
    );
  }

  Widget _body(BuildContext context, ThemeData theme, bool isDark, Color muted, String? lastError) {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 400),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Join your organisation',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : const Color(0xFF1C1A22),
                  )),
              const SizedBox(height: 4),
              Text("Ask your welfare association's admin for the join code.",
                  style: theme.textTheme.bodyMedium?.copyWith(color: muted)),
              const SizedBox(height: 24),
              AuthInputCard(
                label: 'JOIN CODE',
                isDark: isDark,
                child: TextField(
                  controller: _joinCodeController,
                  textCapitalization: TextCapitalization.characters,
                  decoration: const InputDecoration(hintText: 'e.g. SJ-4K7P2', border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
                ),
              ),
              const SizedBox(height: 12),
              AuthInputCard(
                label: 'YOUR NAME',
                isDark: isDark,
                child: TextField(
                  controller: _nameController,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(hintText: 'e.g. Kofi Mensah', border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
                ),
              ),
              const SizedBox(height: 12),
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
              if (lastError != null && !_isSubmitting) ...[
                const SizedBox(height: 14),
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: theme.colorScheme.error.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Text(lastError, style: TextStyle(color: theme.colorScheme.error, fontSize: 13)),
                ),
              ],
              const SizedBox(height: 20),
              AuthPrimaryButton(label: 'Join organisation', isLoading: _isSubmitting, onPressed: _submit),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
