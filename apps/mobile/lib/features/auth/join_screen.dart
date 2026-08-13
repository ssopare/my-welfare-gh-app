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
  final _phoneFocusNode = FocusNode();
  bool _isSubmitting = false;
  bool _obscurePassword = true;
  // null = not checked yet, true/false = result of the last check-phone
  // call. Drives whether the Name field shows — see WhatsApp-style
  // reasoning in the join-flow plan: a returning phone number shouldn't
  // have to supply a name again.
  bool? _accountExists;
  bool _isCheckingPhone = false;
  String? _lastCheckedPhone;

  @override
  void initState() {
    super.initState();
    _phoneFocusNode.addListener(_onPhoneFocusChange);
  }

  @override
  void dispose() {
    _phoneFocusNode.removeListener(_onPhoneFocusChange);
    _phoneFocusNode.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    _joinCodeController.dispose();
    super.dispose();
  }

  void _onPhoneFocusChange() {
    if (_phoneFocusNode.hasFocus) return;
    _checkPhone();
  }

  Future<void> _checkPhone() async {
    final phone = _phoneController.text.trim();
    if (phone.isEmpty || phone == _lastCheckedPhone) return;
    setState(() => _isCheckingPhone = true);
    final auth = ref.read(authControllerProvider);
    final exists = await auth.checkPhoneExists(phone);
    if (!mounted) return;
    setState(() {
      _lastCheckedPhone = phone;
      _accountExists = exists;
      _isCheckingPhone = false;
    });
  }

  Future<void> _submit() async {
    setState(() => _isSubmitting = true);
    final auth = ref.read(authControllerProvider);
    await auth.joinOrganisation(
      phoneNumber: _phoneController.text.trim(),
      password: _passwordController.text,
      joinCode: _joinCodeController.text.trim(),
      // Ignored server-side when the account already exists, but harmless
      // to send even when the field is hidden.
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
              Text(_accountExists == true ? 'Welcome back' : 'Join your organisation',
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.bold,
                    color: isDark ? Colors.white : const Color(0xFF1C1A22),
                  )),
              const SizedBox(height: 4),
              Text(
                _accountExists == true
                    ? 'This number already has an account — enter your password to join with it.'
                    : "Ask your welfare association's admin for the join code.",
                style: theme.textTheme.bodyMedium?.copyWith(color: muted),
              ),
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
                label: 'PHONE NUMBER',
                isDark: isDark,
                child: Row(children: [
                  Expanded(
                    child: TextField(
                      controller: _phoneController,
                      focusNode: _phoneFocusNode,
                      keyboardType: TextInputType.phone,
                      onSubmitted: (_) => _checkPhone(),
                      decoration: const InputDecoration(hintText: '+233 20 000 0000', border: InputBorder.none, isDense: true, contentPadding: EdgeInsets.zero),
                    ),
                  ),
                  if (_isCheckingPhone)
                    const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                ]),
              ),
              const SizedBox(height: 12),
              if (_accountExists != true) ...[
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
              ],
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
              AuthPrimaryButton(
                label: _accountExists == true ? 'Join with this account' : 'Join organisation',
                isLoading: _isSubmitting,
                onPressed: _submit,
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ),
    );
  }
}
