/// GET /members/:id/claims — the backend joins benefitRule.name for
/// display (see the admin console's Milestone 6 fix to
/// ClaimService.listForMember); evidence/stageActions detail is skipped
/// here, same "only what this screen renders" narrowing as MemberProfile.
class Claim {
  const Claim({
    required this.id,
    required this.benefitName,
    required this.eventDate,
    required this.amountValue,
    required this.currency,
    required this.status,
    required this.createdAt,
  });

  factory Claim.fromJson(Map<String, dynamic> json) => Claim(
        id: json['id'] as String,
        benefitName: (json['benefitRule'] as Map<String, dynamic>?)?['name'] as String? ?? 'Benefit claim',
        eventDate: DateTime.parse(json['eventDate'] as String),
        amountValue: json['amountValue'] as String,
        currency: json['currency'] as String,
        status: json['status'] as String,
        createdAt: DateTime.parse(json['createdAt'] as String),
      );

  final String id;
  final String benefitName;
  final DateTime eventDate;
  final String amountValue;
  final String currency;
  final String status; // SUBMITTED | APPROVED | REJECTED | PAID
  final DateTime createdAt;
}
