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

  Future<void> _editName(BuildContext context, WidgetRef ref, String? currentName, String? currentAvatarUrl) async {
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
    final success = await ref.read(authControllerProvider).completeProfile(
      newName,
      avatarUrl: currentAvatarUrl,
    );
    if (success) ref.invalidate(profileDataProvider);
  }

  Future<void> _editAvatar(BuildContext context, WidgetRef ref, String? currentName, String? currentAvatarUrl) async {
    final theme = Theme.of(context);
    final selectedUrl = await showModalBottomSheet<String>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (context) {
        return Container(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Profile Photo',
                style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 20),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  _AvatarOption(
                    label: 'Memoji 1',
                    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
                    isSelected: currentAvatarUrl == 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200',
                  ),
                  _AvatarOption(
                    label: 'Memoji 2',
                    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
                    isSelected: currentAvatarUrl == 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200',
                  ),
                  _AvatarOption(
                    label: 'Memoji 3',
                    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
                    isSelected: currentAvatarUrl == 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200',
                  ),
                ],
              ),
              const SizedBox(height: 24),
              if (currentAvatarUrl != null && currentAvatarUrl.isNotEmpty)
                TextButton.icon(
                  icon: const Icon(Icons.delete_outline, color: Colors.red),
                  label: const Text('Remove profile photo', style: TextStyle(color: Colors.red)),
                  onPressed: () => Navigator.of(context).pop('REMOVE'),
                ),
            ],
          ),
        );
      },
    );

    if (selectedUrl == null) return;
    final String newAvatarUrl = selectedUrl == 'REMOVE' ? '' : selectedUrl;
    final success = await ref.read(authControllerProvider).completeProfile(
      currentName ?? '',
      avatarUrl: newAvatarUrl,
    );
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
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final profile = ref.watch(profileDataProvider);
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(profileDataProvider.future),
        child: profile.when(
          data: (data) {
            final member = data.member;
            final avatarUrl = member.avatarUrl;
            final logoUrl = data.organisation.logoUrl;

            return ListView(
              padding: const EdgeInsets.all(16),
              children: [
                Row(
                  children: [
                    Stack(
                      children: [
                        GestureDetector(
                          onTap: () => _editAvatar(context, ref, member.name, avatarUrl),
                          child: CircleAvatar(
                            radius: 36,
                            backgroundImage: avatarUrl != null && avatarUrl.isNotEmpty
                                ? NetworkImage(avatarUrl)
                                : null,
                            backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.12),
                            child: avatarUrl == null || avatarUrl.isEmpty
                                ? Text(
                                    _avatarInitials(member.name, member.phoneNumber),
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      fontSize: 20,
                                      color: theme.colorScheme.primary,
                                    ),
                                  )
                                : null,
                          ),
                        ),
                        Positioned(
                          bottom: 0,
                          right: 0,
                          child: Container(
                            padding: const EdgeInsets.all(4),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF00A884) : const Color(0xFF008069),
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(Icons.camera_alt, size: 14, color: Colors.white),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(width: 16),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(member.name ?? member.phoneNumber, style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
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
                      onPressed: () => _editName(context, ref, member.name, avatarUrl),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Card(
                  elevation: 1,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  child: Column(
                    children: [
                      ListTile(
                        leading: CircleAvatar(
                          radius: 16,
                          backgroundImage: logoUrl != null && logoUrl.isNotEmpty
                              ? NetworkImage(logoUrl)
                              : null,
                          backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                          child: logoUrl == null || logoUrl.isEmpty
                              ? Icon(Icons.group, size: 16, color: theme.colorScheme.primary)
                              : null,
                        ),
                        title: const Text('Organisation', style: TextStyle(fontSize: 11, color: Colors.grey)),
                        subtitle: Text(data.organisation.legalName, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 14)),
                      ),
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
                Text('Dependants', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
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
                    elevation: 1,
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
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
                Text('Settings', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Card(
                  elevation: 1,
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
                  child: ListTile(
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
                if (ref.watch(authControllerProvider).identity?.isAdmin == true) ...[
                  OutlinedButton.icon(
                    onPressed: () => context.push('/treasury'),
                    icon: const Icon(Icons.account_balance_wallet_outlined),
                    label: const Text('Treasury & Payouts'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: theme.colorScheme.primary,
                      side: BorderSide(color: theme.colorScheme.primary.withValues(alpha: 0.4)),
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                OutlinedButton.icon(
                  onPressed: () => context.push('/switch-organisation'),
                  icon: const Icon(Icons.swap_horiz),
                  label: const Text('Switch welfare group'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => context.push('/join-additional-organisation'),
                  icon: const Icon(Icons.group_add_outlined),
                  label: const Text('Join another welfare group'),
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  onPressed: () => context.push('/create-additional-organisation'),
                  icon: const Icon(Icons.add_business_outlined),
                  label: const Text('Found another welfare group'),
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
          Flexible(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.bold))),
        ],
      ),
    );
  }
}

class _AvatarOption extends StatelessWidget {
  const _AvatarOption({
    required this.label,
    required this.url,
    required this.isSelected,
  });

  final String label;
  final String url;
  final bool isSelected;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: () => Navigator.of(context).pop(url),
      child: Column(
        children: [
          Container(
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(
                color: isSelected ? const Color(0xFF00A884) : Colors.transparent,
                width: 3,
              ),
            ),
            child: CircleAvatar(
              radius: 28,
              backgroundImage: NetworkImage(url),
            ),
          ),
          const SizedBox(height: 6),
          Text(label, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
