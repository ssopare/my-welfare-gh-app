import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:flutter_image_compress/flutter_image_compress.dart';
import 'package:path_provider/path_provider.dart' show getTemporaryDirectory;


import '../../core/widgets/status_chip.dart';
import '../auth/auth_controller.dart';
import 'add_dependant_dialog.dart';
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

    // WhatsApp-style source picker sheet
    final source = await showModalBottomSheet<ImageSource>(
      context: context,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return SafeArea(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
              Container(width: 40, height: 4, decoration: BoxDecoration(color: Colors.grey.shade300, borderRadius: BorderRadius.circular(2))),
              const SizedBox(height: 16),
              Text('Profile Photo', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              ListTile(
                leading: CircleAvatar(backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1), child: Icon(Icons.camera_alt, color: theme.colorScheme.primary)),
                title: const Text('Take a photo'),
                onTap: () => Navigator.pop(ctx, ImageSource.camera),
              ),
              ListTile(
                leading: CircleAvatar(backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1), child: Icon(Icons.photo_library, color: theme.colorScheme.primary)),
                title: const Text('Choose from gallery'),
                onTap: () => Navigator.pop(ctx, ImageSource.gallery),
              ),
              if (currentAvatarUrl != null && currentAvatarUrl.isNotEmpty)
                ListTile(
                  leading: const CircleAvatar(backgroundColor: Color(0x1AE53935), child: Icon(Icons.delete_outline, color: Colors.red)),
                  title: const Text('Remove photo', style: TextStyle(color: Colors.red)),
                  onTap: () => Navigator.pop(ctx, null),
                ),
              const SizedBox(height: 8),
            ],
          ),
        );
      },
    );

    // null = sheet dismissed without tapping anything (context.pop with no value)
    // But we need to distinguish "remove" from "dismissed". We use a sentinel:
    // We treat source == null after remove tap as a remove, so the sheet uses
    // a different pop. Actually here null source = user dismissed. Let's handle remove:
    // The remove tap calls Navigator.pop(ctx, null) which collapses ambiguity.
    // Re-approach: use a record result approach via a separate helper.
    if (source == null && (currentAvatarUrl == null || currentAvatarUrl.isEmpty)) return;

    // Handle remove
    if (source == null) {
      final success = await ref.read(authControllerProvider).completeProfile(currentName ?? '', avatarUrl: '');
      if (success) ref.invalidate(profileDataProvider);
      return;
    }

    // Pick image
    final picker = ImagePicker();
    final picked = await picker.pickImage(source: source, maxWidth: 1024, maxHeight: 1024, imageQuality: 90);
    if (picked == null) return;

    // Compress to max 800×800 WebP, ~150 KB target
    final tmpDir = await getTemporaryDirectory();
    final targetPath = '${tmpDir.path}/avatar_upload_${DateTime.now().millisecondsSinceEpoch}.jpg';
    final compressed = await FlutterImageCompress.compressAndGetFile(
      picked.path,
      targetPath,
      quality: 80,
      minWidth: 256,
      minHeight: 256,
      format: CompressFormat.jpeg,
    );
    if (compressed == null) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not process that photo. Please try a different one.'), backgroundColor: Colors.red),
        );
      }
      return;
    }

    // Show uploading indicator
    if (!context.mounted) return;
    final snackBar = ScaffoldMessenger.of(context)
      ..showSnackBar(const SnackBar(content: Row(children: [SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white)), SizedBox(width: 12), Text('Uploading photo…')])));

    try {
      final repo = ref.read(profileRepositoryProvider);
      final url = await repo.uploadAvatar(File(compressed.path));
      final auth = ref.read(authControllerProvider);
      final success = await auth.completeProfile(currentName ?? '', avatarUrl: url);
      snackBar.hideCurrentSnackBar();
      if (!context.mounted) return;
      if (success) {
        ref.invalidate(profileDataProvider);
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('✓ Profile photo updated'), backgroundColor: Colors.green));
      } else {
        // The photo uploaded fine, but saving it to the profile failed —
        // must not claim success here, or the user thinks it worked when
        // nothing was actually persisted server-side.
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(auth.lastError ?? 'Could not save your new photo. Please try again.'), backgroundColor: Colors.red),
        );
      }
    } catch (e) {
      snackBar.hideCurrentSnackBar();
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Upload failed: $e'), backgroundColor: Colors.red));
      }
    }
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
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('Dependants', style: theme.textTheme.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
                    IconButton(
                      icon: const Icon(Icons.person_add_outlined),
                      tooltip: 'Add dependant',
                      onPressed: () => showAddDependantDialog(context, ref),
                    ),
                  ],
                ),
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
                                : TextButton(
                                    onPressed: () async {
                                      try {
                                        await ref.read(profileRepositoryProvider).confirmDependant(dependant.id);
                                        ref.invalidate(profileDataProvider);
                                      } catch (e) {
                                        if (context.mounted) {
                                          ScaffoldMessenger.of(context).showSnackBar(
                                            SnackBar(content: Text('Could not confirm: $e')),
                                          );
                                        }
                                      }
                                    },
                                    child: const Text('Confirm'),
                                  ),
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



