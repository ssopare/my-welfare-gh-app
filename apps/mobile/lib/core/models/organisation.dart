class Organisation {
  const Organisation({
    required this.id,
    required this.legalName,
    required this.currency,
    required this.status,
    required this.paymentAllocationPolicy,
  });

  factory Organisation.fromJson(Map<String, dynamic> json) => Organisation(
        id: json['id'] as String,
        legalName: json['legalName'] as String,
        currency: json['currency'] as String,
        status: json['status'] as String,
        paymentAllocationPolicy: json['paymentAllocationPolicy'] as String,
      );

  final String id;
  final String legalName;
  final String currency;
  final String status;
  // 'oldest_first' (the default — a payment auto-splits across every open
  // obligation, oldest-due first) or 'member_selected' (the member picks
  // which open obligations a payment covers). See PayScreen.
  final String paymentAllocationPolicy;

  bool get memberSelectsObligations => paymentAllocationPolicy == 'member_selected';
}
