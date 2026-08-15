import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth_controller.dart';

/// Founding a brand-new organisation from the mobile app — the mobile
/// counterpart to the admin console's "create organisation" flow. See
/// AuthRepository.registerOrganisation for why this isn't web-only
/// anymore.
///
/// Same "don't re-collect what we already know" phone check as JoinScreen:
/// a phone number that already has an account skips the Name field and
/// founds the new organisation under that existing account (password
/// verified) instead of trying to create a second identity — see
/// AuthService.registerOrganisation's existing/new account branching.
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
  final _phoneFocusNode = FocusNode();
  String _organisationType = 'voluntary';
  bool _isSubmitting = false;
  // null = not checked yet, true/false = result of the last check-phone
  // call. Drives whether the Name field shows, same as JoinScreen.
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
    _legalNameController.dispose();
    _nameController.dispose();
    _phoneController.dispose();
    _passwordController.dispose();
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
    await auth.registerOrganisation(
      legalName: _legalNameController.text.trim(),
      organisationType: _organisationType,
      phoneNumber: _phoneController.text.trim(),
      password: _passwordController.text,
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
                  _accountExists == true
                      ? "This number already has an account — enter its password to found this group with it."
                      : "You'll be the founding administrator.",
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
                  controller: _phoneController,
                  focusNode: _phoneFocusNode,
                  keyboardType: TextInputType.phone,
                  onSubmitted: (_) => _checkPhone(),
                  decoration: InputDecoration(
                    labelText: 'Phone number',
                    hintText: '+233 20 000 0000',
                    suffixIcon: _isCheckingPhone
                        ? const Padding(
                            padding: EdgeInsets.all(14),
                            child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                          )
                        : null,
                  ),
                ),
                if (_accountExists != true) ...[
                  const SizedBox(height: 12),
                  TextField(
                    controller: _nameController,
                    textCapitalization: TextCapitalization.words,
                    decoration: const InputDecoration(labelText: 'Your name', hintText: 'e.g. Kofi Mensah'),
                  ),
                ],
                const SizedBox(height: 12),
                TextField(
                  controller: _passwordController,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    helperText: _accountExists == true ? null : 'At least 8 characters.',
                  ),
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
                      : Text(_accountExists == true ? 'Create with this account' : 'Create organisation'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
