import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/auth/auth_controller.dart';
import '../../features/auth/complete_profile_screen.dart';
import '../../features/auth/create_additional_organisation_screen.dart';
import '../../features/auth/create_organisation_screen.dart';
import '../../features/auth/join_additional_organisation_screen.dart';
import '../../features/auth/join_screen.dart';
import '../../features/auth/login_screen.dart';
import '../../features/auth/onboarding_screen.dart';
import '../../features/auth/splash_screen.dart';
import '../../features/auth/switch_organisation_screen.dart';
import '../../features/claims/claims_screen.dart';
import '../../features/shell/app_shell.dart';
import '../../features/home/home_screen.dart';
import '../../features/notifications/notifications_screen.dart';
import '../../features/profile/profile_screen.dart';
import '../../features/voting/elections_list_screen.dart';
import '../../features/voting/ballot_screen.dart';
import '../../features/payments/treasury_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authControllerProvider);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: auth,
    redirect: (context, state) {
      if (auth.isCheckingSession) return null; // stay on the splash route until resolved
      final onAuthPages = state.matchedLocation == '/login' ||
          state.matchedLocation == '/onboarding' ||
          state.matchedLocation == '/join' ||
          state.matchedLocation == '/create-organisation';

      if (!auth.isLoggedIn) {
        return onAuthPages ? null : '/login';
      }
      // Hard gate: a logged-in account with no name yet can't reach the
      // rest of the app — see AuthController.needsProfileCompletion.
      if (auth.needsProfileCompletion) {
        return state.matchedLocation == '/complete-profile' ? null : '/complete-profile';
      }
      if (onAuthPages || state.matchedLocation == '/' || state.matchedLocation == '/complete-profile') {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(path: '/', builder: (context, state) => const SplashScreen()),
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/onboarding', builder: (context, state) => const OnboardingScreen()),
      GoRoute(path: '/join', builder: (context, state) => const JoinScreen()),
      GoRoute(path: '/create-organisation', builder: (context, state) => const CreateOrganisationScreen()),
      GoRoute(path: '/complete-profile', builder: (context, state) => const CompleteProfileScreen()),
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/home', builder: (context, state) => const HomeScreen()),
          GoRoute(path: '/claims', builder: (context, state) => const ClaimsScreen()),
          GoRoute(path: '/notifications', builder: (context, state) => const NotificationsScreen()),
          GoRoute(path: '/profile', builder: (context, state) => const ProfileScreen()),
          GoRoute(
            path: '/join-additional-organisation',
            builder: (context, state) => const JoinAdditionalOrganisationScreen(),
          ),
          GoRoute(
            path: '/switch-organisation',
            builder: (context, state) => const SwitchOrganisationScreen(),
          ),
          GoRoute(
            path: '/create-additional-organisation',
            builder: (context, state) => const CreateAdditionalOrganisationScreen(),
          ),
          GoRoute(
            path: '/elections',
            builder: (context, state) => const ElectionsListScreen(),
          ),
          GoRoute(
            path: '/elections/:id',
            builder: (context, state) => BallotScreen(electionId: state.pathParameters['id']!),
          ),
          GoRoute(
            path: '/treasury',
            builder: (context, state) => const TreasuryScreen(),
          ),
        ],
      ),
    ],
  );
});
