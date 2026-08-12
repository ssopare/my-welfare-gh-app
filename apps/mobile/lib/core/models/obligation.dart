/// GET /members/:id/obligations — includes the owning plan's name/cadence/
/// defaultFundId (see ObligationService.listForMember), which is what lets
/// the pay screen tell "always automatic" monthly obligations apart from
/// one-time/event ones, and suggest the right fund. Amounts stay strings
/// end-to-end, same "never a JS float" reasoning as the admin console's
/// MoneyDisplay.
class Obligation {
  const Obligation({
    required this.id,
    required this.dueDate,
    required this.amountValue,
    required this.currency,
    required this.amountPaid,
    required this.status,
    required this.cadence,
    required this.planName,
    required this.defaultFundId,
  });

  factory Obligation.fromJson(Map<String, dynamic> json) {
    final plan = json['contributionPlan'] as Map<String, dynamic>?;
    return Obligation(
      id: json['id'] as String,
      dueDate: DateTime.parse(json['dueDate'] as String),
      amountValue: json['amountValue'] as String,
      currency: json['currency'] as String,
      amountPaid: json['amountPaid'] as String,
      status: json['status'] as String,
      cadence: plan?['cadence'] as String?,
      planName: plan?['name'] as String?,
      defaultFundId: plan?['defaultFundId'] as String?,
    );
  }

  final String id;
  final DateTime dueDate;
  final String amountValue;
  final String currency;
  final String amountPaid;
  final String status;
  final String? cadence;
  final String? planName;
  final String? defaultFundId;

  double get outstanding => double.parse(amountValue) - double.parse(amountPaid);

  // Monthly dues are never individually pickable — always applied
  // automatically, oldest-first, with overpayment spreading into future
  // months. Only one-time/event obligations are ever selectable. See
  // ObligationService.recordContributionPaymentInTx's phase comments.
  bool get isMonthly => cadence == 'monthly';

  static const openStatuses = {'UPCOMING', 'DUE', 'PARTIALLY_PAID', 'OVERDUE'};
  bool get isOpen => openStatuses.contains(status);
}
