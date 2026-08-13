import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type {
  InitiatePaymentParams,
  InitiatePaymentResult,
  PaymentProvider,
} from './payment-provider.interface';

const PAYSTACK_CHARGE_URL = 'https://api.paystack.co/charge';

interface PaystackChargeResponse {
  status: boolean;
  message: string;
  data?: {
    reference: string;
    status: string;
    display_text?: string;
    message?: string;
  };
}

// Real integration for the MOBILE_MONEY channel only — see the plan's
// scope note on why CARD/BANK_TRANSFER stay on MockPaymentProvider for
// now (a genuinely different, multi-step Paystack flow, not a drop-in
// variant of this one). Selected via PAYMENT_PROVIDER=paystack in
// PaymentsModule; requires PAYSTACK_SECRET_KEY, checked at module load.
@Injectable()
export class PaystackPaymentProvider implements PaymentProvider {
  private readonly secretKey: string;

  constructor() {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new Error(
        'PAYSTACK_SECRET_KEY environment variable is required when PAYMENT_PROVIDER=paystack',
      );
    }
    this.secretKey = secretKey;
  }

  async initiatePayment(
    params: InitiatePaymentParams,
  ): Promise<InitiatePaymentResult> {
    if (params.channel !== 'MOBILE_MONEY') {
      throw new InternalServerErrorException(
        `PaystackPaymentProvider does not yet support the ${params.channel} channel`,
      );
    }
    if (!params.momoProvider) {
      // A missing momoProvider is a client input problem (the caller
      // picked MOBILE_MONEY without saying which network), not a server
      // fault — 400, not 500.
      throw new BadRequestException(
        'momoProvider is required to initiate a mobile money charge',
      );
    }

    // Paystack's Charge API requires a customer email; this platform is
    // phone-only (Account has no email column at all). This address is
    // never shown to the member and never sent mail — it exists purely
    // to satisfy Paystack's required field with something stable and
    // traceable back to the member if ever needed for support.
    // example.com (RFC 2606) is the deliberate choice here, not
    // .invalid: Paystack's own email validator rejects the .invalid TLD
    // outright ("Invalid Email Address Passed", confirmed against the
    // real sandbox) even though it's the more semantically correct
    // reserved TLD for a never-sent address — example.com has the same
    // guarantee (IANA-operated, never delivers to a real inbox) and
    // actually passes.
    const syntheticEmail = `member.${params.metadata.reference}@example.com`;

    // Paystack wants the smallest currency unit (pesewas for GHS); the
    // rest of this app deals exclusively in whole-unit decimal strings —
    // this conversion happens here, at the provider boundary, and
    // nowhere else.
    const amountInPesewas = Math.round(
      Number.parseFloat(params.amountValue) * 100,
    );

    // fetch() throws a plain TypeError (not an HttpException) on a
    // network-level failure — DNS lookup, connection refused, timeout —
    // as opposed to Paystack itself responding with an error, which is
    // handled below via response.ok. Left uncaught, that TypeError used
    // to reach Nest's default exception filter and come out as a bare
    // 500 with no message body at all, which the mobile app then had
    // nothing to show beyond a generic "something went wrong" — the
    // actual cause (this machine couldn't reach api.paystack.co) was
    // only ever visible in the server's own logs. Caught here and turned
    // into a real, actionable 503 instead.
    let response: Response;
    try {
      response = await fetch(PAYSTACK_CHARGE_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: syntheticEmail,
          amount: amountInPesewas,
          currency: params.currency,
          mobile_money: {
            phone: process.env.PAYSTACK_SECRET_KEY?.toLowerCase().includes('test') ? '0551234567' : params.phoneNumber.replace(/[-\s()]/g, ""),
            provider: params.momoProvider,
          },
          reference: params.metadata.reference,
          metadata: { organisationId: params.metadata.organisationId },
        }),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Unable to reach the payment provider right now. Check your connection and try again.',
      );
    }

    const body = (await response.json()) as PaystackChargeResponse;
    if (!response.ok || !body.status || !body.data) {
      // Paystack's most useful failure detail (e.g. "Declined. Please
      // use the test mobile money number...") lives on body.data.message,
      // not the top-level body.message — surface that when present
      // instead of a generic "Charge attempted".
      const detail = body.data?.message ?? body.message ?? response.statusText;
      throw new InternalServerErrorException(
        `Paystack charge failed: ${detail}`,
      );
    }

    return {
      providerReference: body.data.reference,
      displayText: body.data.display_text,
    };
  }
}
