export interface InitiatePaymentParams {
  organisationId: string;
  amountValue: string;
  currency: string;
  channel: 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER';
  // Real aggregators (Paystack/Flutterwave/Hubtel) let you attach metadata
  // to a payment request that gets echoed back verbatim in the webhook
  // payload — that's how organisationId reaches handleWebhook without
  // needing any cross-tenant lookup. reference is our own idempotency
  // handle (PaymentIntent.id), also echoed back.
  metadata: { organisationId: string; reference: string };
}

export interface InitiatePaymentResult {
  providerReference: string;
}

// Real Paystack/Flutterwave/Hubtel integrations implement this same shape
// — swapping the provider is implementing this interface, not a redesign.
// No implementation here talks to a real gateway; there are no live
// aggregator credentials for this project. See MockPaymentProvider.
export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

export interface PaymentProvider {
  initiatePayment(
    params: InitiatePaymentParams,
  ): Promise<InitiatePaymentResult>;
}
