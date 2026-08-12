import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/models/app_notification.dart';
import '../auth/auth_controller.dart';
import 'notifications_repository.dart';

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) {
  final identity = ref.watch(authControllerProvider).identity;
  if (identity == null) return Future.value(const []);
  return ref.watch(notificationsRepositoryProvider).listForMember(identity.memberId);
});

const _typeLabels = {
  'CONTRIBUTION_DUE_REMINDER': 'Contribution due',
  'DEFAULTER_RISK_ALERT': 'Standing alert',
  'CLAIM_STAGE_ENTERED': 'Claim update',
  'CLAIM_STATUS_CHANGED': 'Claim update',
  'SUBSCRIPTION_LAPSED': 'Subscription',
};

const _typeIcons = {
  'CONTRIBUTION_DUE_REMINDER': Icons.event_outlined,
  'DEFAULTER_RISK_ALERT': Icons.warning_amber_outlined,
  'CLAIM_STAGE_ENTERED': Icons.gavel_outlined,
  'CLAIM_STATUS_CHANGED': Icons.gavel_outlined,
  'SUBSCRIPTION_LAPSED': Icons.credit_card_outlined,
};

class NotificationsScreen extends ConsumerWidget {
  const NotificationsScreen({super.key});

  String _timeAgo(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'just now';
    if (diff.inHours < 1) return '${diff.inMinutes}m ago';
    if (diff.inDays < 1) return '${diff.inHours}h ago';
    return '${diff.inDays}d ago';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final notifications = ref.watch(notificationsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Notifications')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(notificationsProvider.future),
        child: notifications.when(
          data: (items) {
            if (items.isEmpty) {
              return ListView(
                children: [
                  Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      children: [
                        const SizedBox(height: 80),
                        Icon(Icons.notifications_none, size: 40, color: theme.colorScheme.onSurfaceVariant),
                        const SizedBox(height: 12),
                        Text(
                          'Nothing here yet.',
                          style: theme.textTheme.bodyMedium?.copyWith(color: theme.colorScheme.onSurfaceVariant),
                        ),
                      ],
                    ),
                  ),
                ],
              );
            }
            return ListView.separated(
              itemCount: items.length,
              separatorBuilder: (_, _) => const Divider(height: 1),
              itemBuilder: (context, index) {
                final n = items[index];
                return ListTile(
                  leading: CircleAvatar(
                    backgroundColor: theme.colorScheme.primary.withValues(alpha: 0.1),
                    child: Icon(_typeIcons[n.type] ?? Icons.notifications_outlined, color: theme.colorScheme.primary, size: 20),
                  ),
                  title: Text(
                    _typeLabels[n.type] ?? n.type,
                    style: TextStyle(fontWeight: n.isUnread ? FontWeight.w700 : FontWeight.w500),
                  ),
                  subtitle: Text(n.message),
                  trailing: n.isUnread
                      ? Container(width: 8, height: 8, decoration: BoxDecoration(color: theme.colorScheme.primary, shape: BoxShape.circle))
                      : Text(_timeAgo(n.createdAt), style: theme.textTheme.labelSmall),
                  onTap: n.isUnread
                      ? () async {
                          await ref.read(notificationsRepositoryProvider).markRead(n.id);
                          ref.invalidate(notificationsProvider);
                        }
                      : null,
                );
              },
            );
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('$error')),
        ),
      ),
    );
  }
}
