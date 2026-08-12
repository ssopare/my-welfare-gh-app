/// POST /payments/contribution/initiate and GET /payment-intents/:id.
/// Status stays INITIATED until the provider's webhook confirms an
/// outcome — see PaymentsRepository for why the pending screen polls
/// rather than expecting an immediate result.
class PaymentIntentModel {
  const PaymentIntentModel({
    required this.id,
    required this.status,
    required this.amountValue,
    required this.currency,
    required this.channel,
    required this.providerReference,
  });

  factory PaymentIntentModel.fromJson(Map<String, dynamic> json) => PaymentIntentModel(
        id: json['id'] as String,
        status: json['status'] as String,
        amountValue: json['amountValue'] as String,
        currency: json['currency'] as String,
        channel: json['channel'] as String,
        providerReference: json['providerReference'] as String,
      );

  final String id;
  final String status; // INITIATED | SUCCEEDED | FAILED
  final String amountValue;
  final String currency;
  final String channel;
  // The provider's own transaction id (MockPaymentProvider issues
  // "mock_..." ones) — shown as the receipt number once a payment
  // succeeds, since it's the one identifier a member could reference if
  // they ever needed to ask about this specific payment.
  final String providerReference;
}
