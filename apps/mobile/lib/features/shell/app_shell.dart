import 'dart:ui';
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// All four destinations are real now (Home, Claims, Notifications,
/// Profile) — the last "coming soon" placeholder (Profile) was replaced
/// once its screen actually existed, same discipline as the admin
/// console's nav-items comingSoon flag: never link to a screen that
/// doesn't exist yet, but don't leave the flag up once it does either.
class AppShell extends StatelessWidget {
  const AppShell({required this.child, super.key});

  final Widget child;

  static const _destinations = [
    (path: '/home', icon: Icons.home_outlined, selectedIcon: Icons.home, label: 'Home'),
    (path: '/claims', icon: Icons.gavel_outlined, selectedIcon: Icons.gavel, label: 'Claims'),
    (path: '/notifications', icon: Icons.notifications_outlined, selectedIcon: Icons.notifications, label: 'Alerts'),
    (path: '/profile', icon: Icons.person_outline, selectedIcon: Icons.person, label: 'Profile'),
  ];

  int _indexForLocation(String location) {
    final index = _destinations.indexWhere((d) => location.startsWith(d.path));
    return index == -1 ? 0 : index;
  }

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).matchedLocation;
    final selectedIndex = _indexForLocation(location);
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      body: child,
      bottomNavigationBar: ClipRRect(
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 16, sigmaY: 16),
          child: Container(
            decoration: BoxDecoration(
              border: Border(
                top: BorderSide(
                  color: isDark
                      ? Colors.white.withValues(alpha: 0.08)
                      : Colors.black.withValues(alpha: 0.05),
                  width: 1,
                ),
              ),
            ),
            child: NavigationBar(
              backgroundColor: Colors.transparent,
              selectedIndex: selectedIndex,
              onDestinationSelected: (index) => context.go(_destinations[index].path),
              destinations: [
                for (final d in _destinations)
                  NavigationDestination(
                    icon: Icon(d.icon),
                    selectedIcon: Icon(d.selectedIcon),
                    label: d.label,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
