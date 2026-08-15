import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/models/my_organisation_membership.dart';
import '../../core/widgets/status_chip.dart';
import 'auth_controller.dart';

/// autoDispose + family-free: this screen is the only consumer, and the
/// list is cheap/short (one account's own memberships — see the backend
/// comment on AuthService.hydrateMembershipOrganisations), so there's no
/// value caching it beyond this screen's lifetime.
final _myOrganisationsProvider =
    FutureProvider.autoDispose<List<MyOrganisationMembership>>((ref) {
  return ref.watch(authControllerProvider).listMyOrganisations();
});

/// Mobile counterpart to the admin console's sidebar org switcher —
/// GET /auth/organisations for the list, POST /auth/organisations/switch
/// to reissue the token. Unlike admin's dropdown (which only renders when
/// there's more than one org to switch to), this is a full screen reached
/// by explicit navigation from Profile, so it's shown even for a
/// single-organisation account — it just has nothing tappable in that case.
class SwitchOrganisationScreen extends ConsumerStatefulWidget {
  const SwitchOrganisationScreen({super.key});

  @override
  ConsumerState<SwitchOrganisationScreen> createState() => _SwitchOrganisationScreenState();
}

class _SwitchOrganisationScreenState extends ConsumerState<SwitchOrganisationScreen> {
  String? _switchingTo;

  Future<void> _switchTo(MyOrganisationMembership org) async {
    setState(() => _switchingTo = org.organisationId);
    final auth = ref.read(authControllerProvider);
    final success = await auth.switchOrganisation(organisationId: org.organisationId);
    if (!mounted) return;
    setState(() => _switchingTo = null);
    // Membership, role, and organisationId all changed at once — go_router
    // has no way to know every screen under /home needs a refetch, so this
    // replaces the stack rather than just popping back to a stale one.
    if (success && context.mounted) context.go('/home');
  }

  @override
  Widget build(BuildContext context) {
    final organisations = ref.watch(_myOrganisationsProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Switch welfare group')),
      body: RefreshIndicator(
        onRefresh: () => ref.refresh(_myOrganisationsProvider.future),
        child: organisations.when(
          data: (orgs) => ListView.separated(
            padding: const EdgeInsets.all(16),
            itemCount: orgs.length,
            separatorBuilder: (context, index) => const SizedBox(height: 8),
            itemBuilder: (context, index) {
              final org = orgs[index];
              final isBusy = _switchingTo == org.organisationId;
              return Card(
                child: ListTile(
                  enabled: !org.isCurrent && _switchingTo == null,
                  onTap: org.isCurrent ? null : () => _switchTo(org),
                  title: Text(org.legalName, style: theme.textTheme.titleSmall),
                  subtitle: Text(org.role == 'ADMIN' ? 'Admin' : 'Member'),
                  trailing: isBusy
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      : org.isCurrent
                          ? const Chip(label: Text('Current'), visualDensity: VisualDensity.compact)
                          : StatusChip.memberStatus(org.status),
                ),
              );
            },
          ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (error, _) => Center(child: Text('$error')),
        ),
      ),
    );
  }
}
