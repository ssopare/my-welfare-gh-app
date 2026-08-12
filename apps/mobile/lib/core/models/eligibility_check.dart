/// The FR-RULE-05 explainable trace — a 400 response from
/// POST /benefit-rules/:id/claims carries `{message, checks: [...]}` when
/// the member isn't eligible. Same shape the admin console's
/// EligibilityChecklist renders; this is the mobile equivalent, shown
/// inline on a failed claim submission rather than a separate preview
/// tool (members don't have a reason to check eligibility except by
/// actually trying to file the claim).
class EligibilityCheck {
  const EligibilityCheck({required this.description, required this.passed, required this.detail});

  factory EligibilityCheck.fromJson(Map<String, dynamic> json) => EligibilityCheck(
        description: json['description'] as String,
        passed: json['passed'] as bool,
        detail: json['detail'] as String,
      );

  final String description;
  final bool passed;
  final String detail;
}
