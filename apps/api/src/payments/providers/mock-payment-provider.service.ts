import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentProvider,
} from './payment-provider.interface';

// Sandbox stand-in for a real aggregator (Paystack/Flutterwave/Hubtel — no
// live credentials exist for this project yet). Deliberately does NOT
// auto-complete the payment on initiate: a real gateway is asynchronous
// (initiate now, confirm later via webhook), and the whole point of this
// slice is proving that two-phase, idempotent-webhook architecture works —
// collapsing it to a synchronous success here would test nothing real.
// Completing a payment in dev/test means calling POST /payments/webhook
// yourself, exactly as a real provider's webhook delivery would.
@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  initiatePayment(
    params: InitiatePaymentParams,
  ): Promise<InitiatePaymentResult> {
    void params;
    return Promise.resolve({ providerReference: `mock_${randomUUID()}` });
  }
}
