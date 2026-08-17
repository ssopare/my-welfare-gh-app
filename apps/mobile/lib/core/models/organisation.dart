class Organisation {
  const Organisation({
    required this.id,
    required this.legalName,
    required this.currency,
    required this.status,
    required this.paymentAllocationPolicy,
    required this.logoUrl,
    required this.includedModules,
  });

  factory Organisation.fromJson(Map<String, dynamic> json) => Organisation(
        id: json['id'] as String,
        legalName: json['legalName'] as String,
        currency: json['currency'] as String,
        status: json['status'] as String,
        paymentAllocationPolicy: json['paymentAllocationPolicy'] as String,
        logoUrl: json['logoUrl'] as String?,
        includedModules: (json['includedModules'] as List?)?.cast<String>() ?? const [],
      );

  final String id;
  final String legalName;
  final String currency;
  final String status;
  // 'oldest_first' (the default — a payment auto-splits across every open
  // obligation, oldest-due first) or 'member_selected' (the member picks
  // which open obligations a payment covers). See PayScreen.
  final String paymentAllocationPolicy;
  final String? logoUrl;
  // Optional feature modules this org's plan entitles it to — see
  // ModuleAccessGuard on the backend. 'voting' is the only key that
  // currently means anything.
  final List<String> includedModules;

  bool get memberSelectsObligations => paymentAllocationPolicy == 'member_selected';
  bool get hasVoting => includedModules.contains('voting');
}
