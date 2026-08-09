import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { InitiateContributionPaymentDto } from './dto/initiate-contribution-payment.dto';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { PaymentService } from './payment.service';

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
  // user — there's no JWT to check. Real hardening (verifying the
  // provider's webhook signature) is deferred — see MockPaymentProvider's
  // comment; there's no live provider secret to verify against yet.
  @Post('payments/webhook')
  handleWebhook(@Body() dto: WebhookPayloadDto) {
    return this.payments.handleWebhook(dto);
  }

  @Get('payment-intents/:id')
  @UseGuards(JwtAuthGuard)
  findOne(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.payments.findOne(user, id);
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
