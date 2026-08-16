import {
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  CreateTransferRecipientParams,
  CreateTransferRecipientResult,
  InitiateTransferParams,
  InitiateTransferResult,
  TransferProvider,
} from './transfer-provider.interface';

const PAYSTACK_RESOLVE_URL = 'https://api.paystack.co/bank/resolve';
const PAYSTACK_RECIPIENT_URL = 'https://api.paystack.co/transferrecipient';
const PAYSTACK_TRANSFER_URL = 'https://api.paystack.co/transfer';

// Ghana mobile money network codes Paystack's Transfer Recipient API
// expects as bank_code when type is 'mobile_money' — confirmed against
// Paystack's docs, not guessed.
const MOMO_BANK_CODES: Record<'mtn' | 'vod' | 'atl', string> = {
  mtn: 'MTN',
  vod: 'VOD',
  atl: 'ATL',
};

interface PaystackResolveResponse {
  status: boolean;
  data?: { account_name: string };
}

interface PaystackRecipientResponse {
  status: boolean;
  message: string;
  data?: { recipient_code: string };
}

interface PaystackTransferResponse {
  status: boolean;
  message: string;
  data?: { reference: string; status: string };
}

// Real integration for sending money OUT to a group's own MoMo number —
// Paystack's Transfers API, a genuinely different product from the
// Charge API PaystackPaymentProvider uses to collect contributions (see
// that file's own comment on why "subaccounts" were the wrong tool here:
// they only settle to a bank account, never a MoMo wallet). Selected via
// TRANSFER_PROVIDER=paystack in PaymentsModule; requires
// PAYSTACK_SECRET_KEY, checked at module load — same fail-fast pattern.
//
// A live Paystack merchant account must have "OTP on transfers" disabled
// in their dashboard for POST /transfer to complete without a manual OTP
// step this code doesn't handle — a one-time account setting, not
// something fixable in code.
@Injectable()
export class PaystackTransferProvider implements TransferProvider {
  private readonly logger = new Logger(PaystackTransferProvider.name);
  private readonly secretKey: string;

  constructor() {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        'PAYSTACK_SECRET_KEY environment variable is required when TRANSFER_PROVIDER=paystack',
      );
    }
    this.secretKey = secretKey;
  }

  private async fetchPaystack(
    url: string,
    body: Record<string, unknown>,
  ): Promise<Response> {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Unable to reach the payment provider right now. Check your connection and try again.',
      );
    }
  }

  async createRecipient(
    params: CreateTransferRecipientParams,
  ): Promise<CreateTransferRecipientResult> {
    const bankCode = MOMO_BANK_CODES[params.momoProvider];

    // Best-effort account-name verification — advisory only. Paystack's
    // resolve endpoint isn't confirmed to support every mobile_money
    // bank_code in every case, so a failure here is logged and swallowed
    // rather than blocking registration; the recipient-creation call
    // below is the real, authoritative check.
    try {
      const resolveUrl = `${PAYSTACK_RESOLVE_URL}?account_number=${encodeURIComponent(params.accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`;
      const resolveRes = await fetch(resolveUrl, {
        headers: { Authorization: `Bearer ${this.secretKey}` },
      });
      const resolveBody = (await resolveRes.json()) as PaystackResolveResponse;
      if (!resolveRes.ok || !resolveBody.status) {
        this.logger.warn(
          `Account-name resolve did not confirm ${params.accountNumber} (${bankCode}) — proceeding to recipient creation anyway`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Account-name resolve failed for ${params.accountNumber} (${bankCode}): ${(err as Error).message}`,
      );
    }

    const response = await this.fetchPaystack(PAYSTACK_RECIPIENT_URL, {
      type: 'mobile_money',
      name: params.name,
      account_number: params.accountNumber,
      bank_code: bankCode,
      currency: params.currency,
    });
    const body = (await response.json()) as PaystackRecipientResponse;
    if (!response.ok || !body.status || !body.data) {
      throw new InternalServerErrorException(
        `Unable to register the settlement account with the payment provider: ${body.message ?? response.statusText}`,
      );
    }

    return { recipientCode: body.data.recipient_code, verified: true };
  }

  async initiateTransfer(
    params: InitiateTransferParams,
  ): Promise<InitiateTransferResult> {
    const amountInPesewas = Math.round(
      Number.parseFloat(params.amountValue) * 100,
    );

    const response = await this.fetchPaystack(PAYSTACK_TRANSFER_URL, {
      source: 'balance',
      amount: amountInPesewas,
      recipient: params.recipientCode,
      reference: params.reference,
      reason: params.reason,
      metadata: params.metadata,
    });
    const body = (await response.json()) as PaystackTransferResponse;
    if (!response.ok || !body.status || !body.data) {
      throw new InternalServerErrorException(
        `Paystack transfer failed: ${body.message ?? response.statusText}`,
      );
    }

    // Paystack always returns "pending" here — the real outcome only
    // ever arrives via the transfer.success/transfer.failed webhook, see
    // this interface's own comment on InitiateTransferResult.status.
    return { providerReference: body.data.reference, status: 'pending' };
  }
}
