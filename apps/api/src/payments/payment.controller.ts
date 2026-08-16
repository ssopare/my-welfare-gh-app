import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InitiateContributionPaymentDto } from './dto/initiate-contribution-payment.dto';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { PaymentService } from './payment.service';
import { verifyPaystackSignature } from './paystack-webhook.util';

@Controller()
export class PaymentController {
  constructor(private readonly payments: PaymentService) {}

  @Post('payments/contribution/initiate')
  @UseGuards(JwtAuthGuard)
  initiate(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: InitiateContributionPaymentDto,
  ) {
    return this.payments.initiateContributionPayment(user, dto);
  }

  // No JwtAuthGuard: this is a provider callback, not an authenticated app
  // user — there's no JWT to check. This route has NO signature
  // verification of its own (see MockPaymentProvider's comment: it's how
  // dev/test flows and the e2e suite "complete" a mock payment) — which
  // means anyone who knows an organisationId + providerReference can mark
  // that payment SUCCEEDED and have it posted to the real ledger, no
  // actual payment required. A member gets their own providerReference
  // back from /payments/contribution/initiate, so left universally live
  // this would let any member pay off their own dues for free. Only
  // safe because it's disabled the moment a real provider is configured
  // below — a genuine deployment only ever trusts the cryptographically
  // signed /payments/webhook/paystack route.
  @Post('payments/webhook')
  handleWebhook(@Body() dto: WebhookPayloadDto) {
    if (process.env.PAYMENT_PROVIDER === 'paystack') {
      throw new UnauthorizedException(
        'This endpoint is disabled when a real payment provider is configured — use the signed provider webhook instead',
      );
    }
    return this.payments.handleWebhook(dto);
  }

  // The real Paystack callback — separate from the generic webhook above,
  // which stays exactly as the manual/mock-provider completion path (used
  // by dev flows and the e2e suite). This route is what a live
  // PAYMENT_PROVIDER=paystack deployment actually receives, and it's the
  // one place a request's authenticity has to be proven cryptographically
  // rather than just trusted, since there's no JWT here either. Always a
  // fast 200 once the signature checks out — Paystack retries on
  // non-200/timeout, so an event type this app doesn't act on still gets
  // acknowledged, not rejected.
  @Post('payments/webhook/paystack')
  @HttpCode(200)
  async handlePaystackWebhook(@Req() req: RawBodyRequest<Request>) {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey || !req.rawBody) {
      throw new UnauthorizedException();
    }
    const signature = req.headers['x-paystack-signature'] as string | undefined;
    if (!verifyPaystackSignature(req.rawBody, signature, secretKey)) {
      throw new UnauthorizedException('Invalid Paystack signature');
    }

    const payload = JSON.parse(req.rawBody.toString('utf8')) as {
      event: string;
      data: { reference: string; metadata?: { organisationId?: string } };
    };

    if (
      payload.event !== 'charge.success' &&
      payload.event !== 'charge.failed'
    ) {
      return { outcome: 'ignored' as const };
    }
    const organisationId = payload.data.metadata?.organisationId;
    if (!organisationId) {
      return { outcome: 'ignored' as const };
    }

    return this.payments.handleWebhook({
      organisationId,
      providerReference: payload.data.reference,
      status: payload.event === 'charge.success' ? 'succeeded' : 'failed',
    });
  }

  @Get('payment-intents/:id')
  @UseGuards(JwtAuthGuard)
  findOne(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.payments.findOne(user, id);
  }

  // No requireSelfOrAdmin/requireAdmin — see PaymentService.listActivity's
  // own comment on why this one is deliberately org-member-visible.
  @Get('payments/activity')
  @UseGuards(JwtAuthGuard)
  listActivity(@CurrentUser() user: AuthTokenPayload) {
    return this.payments.listActivity(user);
  }

  @Get('reconciliation-exceptions')
  @UseGuards(JwtAuthGuard)
  listExceptions(@CurrentUser() user: AuthTokenPayload) {
    return this.payments.listReconciliationExceptions(user);
  }

  @Patch('reconciliation-exceptions/:id/resolve')
  @UseGuards(JwtAuthGuard)
  resolveException(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
  ) {
    return this.payments.resolveReconciliationException(user, id);
  }
}
