import '../../core/models/eligibility_check.dart';

/// Thrown by ClaimsRepository.submit when the API rejects a claim as
/// ineligible (400, `{message, checks}`) — kept distinct from a plain
/// ApiException so the submission screen can render the real explainable
/// trace instead of just an error string.
class ClaimIneligibleException implements Exception {
  ClaimIneligibleException(this.message, this.checks);

  final String message;
  final List<EligibilityCheck> checks;

  @override
  String toString() => message;
}
