export interface CreateTransferRecipientParams {
  organisationId: string;
  name: string;
  accountNumber: string; // the MoMo phone number
  momoProvider: 'mtn' | 'vod' | 'atl';
  currency: string;
}

export interface CreateTransferRecipientResult {
  recipientCode: string;
  // True only once the provider has genuinely confirmed recipient
  // creation — never hardcoded, unlike the dead subaccount code this
  // replaces (see SettlementAccount's schema comment).
  verified: boolean;
}

export interface InitiateTransferParams {
  organisationId: string;
  recipientCode: string;
  amountValue: string; // GHS decimal string; smallest-unit conversion happens inside the provider
  currency: string;
  reference: string; // our own idempotency key
  reason: string;
  metadata: { organisationId: string; autoDisbursementId: string };
}

export interface InitiateTransferResult {
  providerReference: string;
  // Always 'pending': a real transfer is asynchronous by design — the
  // initiate call never confirms success itself, only a later
  // transfer.success/transfer.failed webhook does (see
  // PayoutService.handleTransferWebhook). Kept as a literal type, not a
  // boolean, so a provider can't accidentally claim a synchronous result.
  status: 'pending';
}

// Real Paystack Transfers integration implements this same shape —
// swapping the provider is implementing this interface, not a redesign.
// Deliberately separate from PaymentProvider/PAYMENT_PROVIDER: collecting
// a contribution (a charge) and disbursing one back out (a transfer) are
// different Paystack products with different credentials/eligibility
// requirements, not variants of the same call.
export const TRANSFER_PROVIDER = Symbol('TRANSFER_PROVIDER');

export interface TransferProvider {
  createRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<CreateTransferRecipientResult>;
  initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<InitiateTransferResult>;
}
