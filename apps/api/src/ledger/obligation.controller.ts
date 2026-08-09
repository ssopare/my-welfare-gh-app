import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateObligationDto } from './dto/create-obligation.dto';
import { RecordContributionPaymentDto } from './dto/record-contribution-payment.dto';
import { ObligationService } from './obligation.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class ObligationController {
  constructor(private readonly obligations: ObligationService) {}

  @Post('contribution-plans/:planId/obligations')
  create(
    @CurrentUser() user: AuthTokenPayload,
    @Param('planId') planId: string,
    @Body() dto: CreateObligationDto,
  ) {
    return this.obligations.create(user, planId, dto);
  }

  @Get('members/:memberId/obligations')
  listForMember(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.obligations.listForMember(user, memberId);
  }

  @Post('payments/contribution')
  recordPayment(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: RecordContributionPaymentDto,
  ) {
    return this.obligations.recordContributionPayment(user, dto);
  }
}
