/// GET /members/:id/statement — a member's own payment history. Only
/// models `payments`/`paidThroughDate`, the fields the statement screen
/// actually displays, not every field the backend returns (same lean-model
/// convention as `Dependant`/`Obligation`).
class StatementPayment {
  const StatementPayment({
    required this.description,
    required this.postedAt,
    required this.debit,
    required this.credit,
    required this.verified,
  });

  factory StatementPayment.fromJson(Map<String, dynamic> json) {
    return StatementPayment(
      description: json['description'] as String,
      postedAt: DateTime.parse(json['postedAt'] as String),
      debit: json['debit'] as String,
      credit: json['credit'] as String,
      // Derived from sourceType, same distinction the activity feed
      // already surfaces (see PaymentService.listActivity on the backend)
      // — no extra backend field needed, sourceType is already returned.
      verified: json['sourceType'] != 'contribution_payment_manual',
    );
  }

  final String description;
  final DateTime postedAt;
  final String debit;
  final String credit;
  final bool verified;

  bool get isCredit => double.parse(credit) > 0;
}

class MemberStatement {
  const MemberStatement({required this.payments, required this.paidThroughDate});

  factory MemberStatement.fromJson(Map<String, dynamic> json) {
    return MemberStatement(
      payments: (json['payments'] as List)
          .map((e) => StatementPayment.fromJson(e as Map<String, dynamic>))
          .toList(),
      paidThroughDate: json['paidThroughDate'] != null
          ? DateTime.parse(json['paidThroughDate'] as String)
          : null,
    );
  }

  final List<StatementPayment> payments;
  final DateTime? paidThroughDate;
}
