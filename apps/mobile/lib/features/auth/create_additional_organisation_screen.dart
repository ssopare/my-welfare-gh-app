import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import 'auth_controller.dart';
import 'auth_widgets.dart';

/// Authenticated counterpart to CreateOrganisationScreen — for a member
/// who's already logged in and wants to found a *second* welfare group.
/// Deliberately just org name + type: the JWT already proves who they
/// are, so re-collecting name/phone/password (like the unauthenticated
/// onboarding screen does) would be redundant, and worse, would collide
/// with the phone number this account already registered with — see
/// AuthService.registerOrganisation's ConflictException. Mirrors the
/// admin console's /organisations/new exactly.
class CreateAdditionalOrganisationScreen extends ConsumerStatefulWidget {
  const CreateAdditionalOrganisationScreen({super.key});

  @override
  ConsumerState<CreateAdditionalOrganisationScreen> createState() =>
      _CreateAdditionalOrganisationScreenState();
}

class _CreateAdditionalOrganisationScreenState extends ConsumerState<CreateAdditionalOrganisationScreen> {
  final _legalNameController = TextEditingController();
  String _organisationType = 'voluntary';
  bool _isSubmitting = false;

  @override
  void dispose() {
    _legalNameController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _isSubmitting = true);
    final auth = ref.read(authControllerProvider);
    final success = await auth.createAdditionalOrganisation(
      legalName: _legalNameController.text.trim(),
      organisationType: _organisationType,
    );
    if (!mounted) return;
    setState(() => _isSubmitting = false);
    // Same reasoning as SwitchOrganisationScreen: memberId/role/
    // organisationId all changed to the new org, so replace the stack
    // rather than popping back to a now-stale /home.
    if (success && context.mounted) context.go('/home');
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
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 8),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Found another welfare group',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF1C1A22),
                    )),
                const SizedBox(height: 4),
                Text("You're already signed in — you'll become this group's founding admin.",
                    style: theme.textTheme.bodyMedium?.copyWith(color: muted)),
                const SizedBox(height: 24),
                AuthInputCard(
                  label: 'ORGANISATION NAME',
                  isDark: isDark,
                  child: TextField(
                    controller: _legalNameController,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(
                      hintText: 'e.g. Kumasi Traders Welfare Group',
                      border: InputBorder.none,
                      isDense: true,
                      contentPadding: EdgeInsets.zero,
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                AuthInputCard(
                  label: 'ORGANISATION TYPE',
                  isDark: isDark,
                  child: DropdownButtonHideUnderline(
                    child: DropdownButton<String>(
                      value: _organisationType,
                      isExpanded: true,
                      onChanged: (value) => setState(() => _organisationType = value ?? 'voluntary'),
                      items: const [
                        DropdownMenuItem(value: 'voluntary', child: Text('Voluntary association')),
                        DropdownMenuItem(value: 'employer-linked', child: Text('Employer-linked scheme')),
                      ],
                    ),
                  ),
                ),
                if (auth.lastError != null && !_isSubmitting) ...[
                  const SizedBox(height: 14),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(auth.lastError!, style: TextStyle(color: theme.colorScheme.error, fontSize: 13)),
                  ),
                ],
                const SizedBox(height: 20),
                AuthPrimaryButton(label: 'Create organisation', isLoading: _isSubmitting, onPressed: _submit),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
