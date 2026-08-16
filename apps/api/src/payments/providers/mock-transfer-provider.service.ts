import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type {
  CreateTransferRecipientParams,
  CreateTransferRecipientResult,
  InitiateTransferParams,
  InitiateTransferResult,
  TransferProvider,
} from './transfer-provider.interface';

// Sandbox stand-in for a real Paystack Transfers integration — same
// reasoning as MockPaymentProvider. createRecipient returns verified:
// true immediately (there's no separate async confirmation step for
// recipient creation, real or mock). initiateTransfer deliberately does
// NOT auto-complete, for the same reason MockPaymentProvider doesn't: a
// real transfer only ever comes back "pending", confirmed later via
// webhook — completing one in dev/test means calling
// POST /payments/transfers/webhook yourself, proving the same two-phase
// architecture works here too.
@Injectable()
export class MockTransferProvider implements TransferProvider {
  createRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<CreateTransferRecipientResult> {
    void params;
    return Promise.resolve({
      recipientCode: `mock_rcp_${randomUUID()}`,
      verified: true,
    });
  }

  initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<InitiateTransferResult> {
    void params;
    return Promise.resolve({
      providerReference: `mock_transfer_${randomUUID()}`,
      status: 'pending',
    });
  }
}
