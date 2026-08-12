/// GET /benefit-rules (listActive) — narrowed to what the claim-submission
/// picker needs: which benefit, and what evidence it requires.
class BenefitRule {
  const BenefitRule({
    required this.id,
    required this.name,
    required this.triggerEvent,
    required this.evidenceRequired,
  });

  factory BenefitRule.fromJson(Map<String, dynamic> json) => BenefitRule(
        id: json['id'] as String,
        name: json['name'] as String,
        triggerEvent: json['triggerEvent'] as String,
        evidenceRequired: (json['evidenceRequired'] as List).cast<String>(),
      );

  final String id;
  final String name;
  final String triggerEvent;
  final List<String> evidenceRequired;
}
