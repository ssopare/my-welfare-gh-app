import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/widgets/status_chip.dart';
import '../auth/auth_controller.dart';
import 'profile_repository.dart';
import '../../core/theme/theme_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  String _formatDate(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}';

  // Falls back to the phone's last two digits for any account that
  // hasn't set a name — same convention as the admin console's
  // MemberAvatar, mirrored here now that a name usually exists.
  String _avatarInitials(String? name, String phoneNumber) {
    final trimmed = name?.trim();
    if (trimmed != null && trimmed.isNotEmpty) {
      final parts = trimmed.split(RegExp(r'\s+'));
      final first = parts.first.isNotEmpty ? parts.first[0] : '';
      final last = parts.length > 1 && parts.last.isNotEmpty ? parts.last[0] : '';
      final initials = (first + last).toUpperCase();
      if (initials.isNotEmpty) return initials;
    }
    final digits = phoneNumber.replaceAll(RegExp(r'\D'), '');
    if (digits.length < 2) return digits.isEmpty ? '?' : digits;
    return digits.substring(digits.length - 2);
  }

  Future<void> _editName(BuildContext context, WidgetRef ref, String? currentName) async {
    final controller = TextEditingController(text: currentName ?? '');
    final newName = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Your name'),
        content: TextField(
          controller: controller,
          autofocus: true,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(hintText: 'e.g. Kofi Mensah'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('Cancel')),
          FilledButton(
            onPressed: () => Navigator.of(context).pop(controller.text.trim()),
            child: const Text('Save'),
          ),
        ],
      ),
    );
    controller.dispose();
    if (newName == null || newName.isEmpty || newName == currentName) return;
    final success = await ref.read(authControllerProvider).completeProfile(newName);
    if (success) ref.invalidate(profileDataProvider);
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text('You can sign back in any time with your phone number and password.'),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
          FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Sign out')),
        ],
      ),
    );
    if (confirmed == true) {
      await ref.read(authControllerProvider).logout();
      // No manual navigation — logout() notifies AuthController's
      // listeners, go_router's refreshListenable picks it up, and the
      // redirect callback sends us to /login on its own.
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileDataProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(profileDataProvider.future),
        child: profile.when(
          data: (data) {
            final member = data.member;
            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    CircleAvatar(
                      radius: 28,
                      backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.12),
                      child: Text(
                        _avatarInitials(member.name, member.phoneNumber),
                        style: TextStyle(fontWeight: FontWeight.w700, color: theme.colorScheme.primary),
                      ),
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(member.name ?? member.phoneNumber, style: theme.textTheme.titleMedium),
                          if (member.name != null)
                            Text(
                              member.phoneNumber,
                              style: theme.textTheme.bodySmall?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                            ),
                          const SizedBox(height: 4),
                          StatusChip.memberStatus(member.status),
                        ],
                      ),
                    ),
                    IconButton(
                      icon: const Icon(Icons.edit_outlined),
                      tooltip: 'Edit name',
                      onPressed: () => _editName(context, ref, member.name),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Card(
                  child: Column(
                    children: [
                      _InfoRow(label: 'Organisation', value: data.organisation.legalName),
                      const Divider(height: 1),
                      _InfoRow(label: 'Category', value: member.category),
                      const Divider(height: 1),
                      _InfoRow(label: 'Chapter', value: member.chapterName ?? 'Unassigned'),
                      const Divider(height: 1),
                      _InfoRow(label: 'Joined', value: _formatDate(member.joinDate)),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Text('Dependants', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                if (member.dependants.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'No dependants registered.',
                      style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  )
                else
                  Card(
                    child: Column(
                      children: [
                        for (final dependant in member.dependants)
                          ListTile(
                            title: Text(dependant.name),
                            subtitle: Text(dependant.relationship),
                            trailing: dependant.confirmed
                                ? Icon(Icons.check_circle, size: 18, color: theme.colorScheme.primary)
                                : Text('Pending', style: theme.textTheme.labelSmall),
                          ),
                      ],
                    ),
                  ),
                const SizedBox(height: 24),
                Text('Status history', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                if (member.statusChanges.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(
                      'No status changes recorded.',
                      style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                    ),
                  )
                else
                  Card(
                    child: Column(
                      children: [
                        for (final change in member.statusChanges)
                          ListTile(
                            title: Text(
                              change.fromStatus == null ? change.toStatus : '${change.fromStatus} → ${change.toStatus}',
                            ),
                            subtitle: Text(change.reason ?? _formatDate(change.changedAt)),
                          ),
                      ],
                    ),
                  ),
                const SizedBox(height: 24),
                Text('Settings', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.palette_outlined),
                    title: const Text('Theme Mode'),
                    subtitle: Text(
                      ref.watch(themeModeProvider).name.toUpperCase(),
                    ),
                    trailing: DropdownButton<ThemeMode>(
                      value: ref.watch(themeModeProvider),
                      underline: const SizedBox(),
                      onChanged: (mode) {
                        if (mode != null) {
                          ref.read(themeModeProvider.notifier).state = mode;
                        }
                      },
                      items: const [
                        DropdownMenuItem(
                          value: ThemeMode.system,
                          child: Text('System'),
                        ),
                        DropdownMenuItem(
                          value: ThemeMode.light,
                          child: Text('Light'),
                        ),
                        DropdownMenuItem(
                          value: ThemeMode.dark,
                          child: Text('Dark'),
                        ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(height: 32),
                OutlinedButton.icon(
                  onPressed: () => context.push('/join-additional-organisation'),
                  icon: const Icon(Icons.group_add_outlined),
                  label: const Text('Join another welfare group'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => _confirmSignOut(context, ref),
                  icon: const Icon(Icons.logout),
                  label: const Text('Sign out'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: theme.colorScheme.error,
                    side: BorderSide(color: theme.colorScheme.error.withValues(alpha: 0.4)),
                  ),
                ),
              ],
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('$error')),
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)),
          Flexible(child: Text(value, textAlign: TextAlign.end)),
        ],
      ),
    );
  }
}
