import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/theme/app_colors.dart';
import 'auth_controller.dart';
import 'auth_widgets.dart';

/// Authenticated counterpart to JoinScreen — for a member who's already
/// logged in and just wants to join a second welfare group. Deliberately
/// a separate screen rather than a third mode bolted onto JoinScreen:
/// no phone or password needed here, the JWT already proves identity, so
/// it's just a join code.
class JoinAdditionalOrganisationScreen extends ConsumerStatefulWidget {
  const JoinAdditionalOrganisationScreen({super.key});

  @override
  ConsumerState<JoinAdditionalOrganisationScreen> createState() =>
      _JoinAdditionalOrganisationScreenState();
}

class _JoinAdditionalOrganisationScreenState extends ConsumerState<JoinAdditionalOrganisationScreen> {
  final _joinCodeController = TextEditingController();
  bool _isSubmitting = false;

  @override
  void dispose() {
    _joinCodeController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _isSubmitting = true);
    final auth = ref.read(authControllerProvider);
    final success = await auth.joinAdditionalOrganisation(
      joinCode: _joinCodeController.text.trim(),
    );
    if (!mounted) return;
    setState(() => _isSubmitting = false);
    if (success && context.mounted) context.pop();
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
                Text('Join another welfare group',
                    style: theme.textTheme.headlineSmall?.copyWith(
                      fontWeight: FontWeight.bold,
                      color: isDark ? Colors.white : const Color(0xFF1C1A22),
                    )),
                const SizedBox(height: 4),
                Text("You're already signed in — just enter the join code for the new group.",
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
                AuthPrimaryButton(label: 'Join group', isLoading: _isSubmitting, onPressed: _submit),
                const SizedBox(height: 24),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
