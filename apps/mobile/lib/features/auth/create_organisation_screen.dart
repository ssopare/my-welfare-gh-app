import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth_controller.dart';

/// Founding a brand-new organisation from the mobile app — the mobile
/// counterpart to the admin console's "create organisation" flow. See
/// AuthRepository.registerOrganisation for why this isn't web-only
/// anymore.
class CreateOrganisationScreen extends ConsumerStatefulWidget {
  const CreateOrganisationScreen({super.key});

  @override
  ConsumerState<CreateOrganisationScreen> createState() => _CreateOrganisationScreenState();
}

class _CreateOrganisationScreenState extends ConsumerState<CreateOrganisationScreen> {
  final _legalNameController = TextEditingController();
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  final _passwordController = TextEditingController();
  String _organisationType = 'voluntary';
  bool _isSubmitting = false;

  @override
  void dispose() {
    _legalNameController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _isSubmitting = true);
    final auth = ref.read(authControllerProvider);
    await auth.registerOrganisation(
      legalName: _legalNameController.text.trim(),
      organisationType: _organisationType,
      phoneNumber: _phoneController.text.trim(),
      password: _passwordController.text,
      name: _nameController.text.trim(),
    );
    if (!mounted) return;
    setState(() => _isSubmitting = false);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authControllerProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(leading: BackButton(onPressed: () => context.pop())),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 16),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 400),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Create your welfare group', style: theme.textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 4),
                Text(
                  "You'll be the founding administrator.",
                  style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                ),
                const SizedBox(height: 28),
                TextField(
                  controller: _legalNameController,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Organisation name', hintText: 'e.g. Sunset Teachers Co-operative'),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  initialValue: _organisationType,
                  decoration: const InputDecoration(labelText: 'Organisation type'),
                  items: const [
                    DropdownMenuItem(value: 'voluntary', child: Text('Voluntary association')),
                    DropdownMenuItem(value: 'employer-linked', child: Text('Employer-linked scheme')),
                  ],
                  onChanged: (value) => setState(() => _organisationType = value ?? 'voluntary'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _nameController,
                  textCapitalization: TextCapitalization.words,
                  decoration: const InputDecoration(labelText: 'Your name', hintText: 'e.g. Kofi Mensah'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _phoneController,
                  keyboardType: TextInputType.phone,
                  decoration: const InputDecoration(labelText: 'Phone number', hintText: '+233 20 000 0000'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: const InputDecoration(labelText: 'Password', helperText: 'At least 8 characters.'),
                ),
                if (auth.lastError != null && !_isSubmitting) ...[
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(
                      color: theme.colorScheme.error.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(auth.lastError!, style: TextStyle(color: theme.colorScheme.error)),
                  ),
                ],
                const SizedBox(height: 20),
                ElevatedButton(
                  onPressed: _isSubmitting ? null : _submit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : const Text('Create organisation'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
