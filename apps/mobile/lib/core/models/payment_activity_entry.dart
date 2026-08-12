/// GET /payments/activity — deliberately the one endpoint visible to any
/// authenticated member of the org, not just self/admin, reproducing the
/// real practice of a welfare group posting contribution payments to its
/// WhatsApp chat as they land. Sourced from the ledger's JournalLine, not
/// Obligation.amountPaid — see the backend's PaymentService.listActivity
/// for why (amountPaid/status are mutable running totals that collapse
/// multiple partial payments into one number; the ledger is the real
/// append-only record of when money moved).
class PaymentActivityEntry {
  const PaymentActivityEntry({
    required this.amount,
    required this.postedAt,
    required this.dueDate,
    required this.planName,
    required this.cadence,
    required this.memberName,
    required this.memberPhoneNumber,
  });

  factory PaymentActivityEntry.fromJson(Map<String, dynamic> json) {
    final obligation = json['obligation'] as Map<String, dynamic>;
    final plan = obligation['contributionPlan'] as Map<String, dynamic>;
    final member = obligation['member'] as Map<String, dynamic>;
    final account = member['account'] as Map<String, dynamic>;
    return PaymentActivityEntry(
      amount: json['credit'] as String,
      postedAt: DateTime.parse((json['journalEntry'] as Map<String, dynamic>)['postedAt'] as String),
      dueDate: DateTime.parse(obligation['dueDate'] as String),
      planName: plan['name'] as String,
      cadence: plan['cadence'] as String,
      memberName: account['name'] as String?,
      memberPhoneNumber: account['phoneNumber'] as String,
    );
  }

  final String amount;
  final DateTime postedAt;
  final DateTime dueDate;
  final String planName;
  final String cadence;
  final String? memberName;
  final String memberPhoneNumber;

  String get memberDisplayName => memberName ?? memberPhoneNumber;
}
