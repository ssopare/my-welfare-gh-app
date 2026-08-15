import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RbacService } from '../rbac/rbac.service';
import { requireAdmin, requirePermission } from '../common/access.util';
import { CreateSettlementAccountDto } from './dto/create-settlement-account.dto';
import { CreatePayoutRecipientDto } from './dto/create-payout-recipient.dto';
import { CreatePayoutRequestDto } from './dto/create-payout-request.dto';
import { SubmitPayoutApprovalDto } from './dto/submit-payout-approval.dto';
import { UpdateFundControlPolicyDto } from './dto/update-fund-control-policy.dto';
import { PayoutService } from './payout.service';

@Controller('payouts')
@UseGuards(JwtAuthGuard)
export class PayoutController {
  constructor(
    private readonly payoutService: PayoutService,
    private readonly rbac: RbacService,
  ) {}

  @Post('settlement-account')
  async createSettlementAccount(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateSettlementAccountDto,
  ) {
    await requireAdmin(this.rbac, user);
    return this.payoutService.createSettlementAccount(user.organisationId, dto);
  }

  @Get('settlement-account')
  async getSettlementAccount(@CurrentUser() user: AuthTokenPayload) {
    await requireAdmin(this.rbac, user);
    return this.payoutService.getSettlementAccount(user.organisationId);
  }

  @Post('recipients')
  async createRecipient(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreatePayoutRecipientDto,
  ) {
    await requirePermission(this.rbac, user, 'ledger', 'disburse');
    return this.payoutService.createPayoutRecipient(user.organisationId, dto);
  }

  @Get('recipients')
  async listRecipients(@CurrentUser() user: AuthTokenPayload) {
    return this.payoutService.listPayoutRecipients(user.organisationId);
  }

  @Post('policy')
  async updatePolicy(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: UpdateFundControlPolicyDto,
  ) {
    await requireAdmin(this.rbac, user);
    return this.payoutService.updateFundControlPolicy(user.organisationId, dto);
  }

  @Get('policy')
  async getPolicy(@CurrentUser() user: AuthTokenPayload) {
    return this.payoutService.getFundControlPolicy(user.organisationId);
  }

  @Post('requests')
  async createPayoutRequest(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreatePayoutRequestDto,
  ) {
    await requirePermission(this.rbac, user, 'ledger', 'disburse');
    return this.payoutService.createPayoutRequest(user.organisationId, user.memberId, dto);
  }

  @Get('requests')
  async listPayoutRequests(@CurrentUser() user: AuthTokenPayload) {
    await requirePermission(this.rbac, user, 'ledger', 'disburse');
    return this.payoutService.listPayoutRequests(user.organisationId);
  }

  @Post('requests/:id/approve')
  async approvePayoutRequest(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: SubmitPayoutApprovalDto,
  ) {
    await requirePermission(this.rbac, user, 'ledger', 'disburse');
    return this.payoutService.approvePayoutRequest(user.organisationId, user.memberId, id, dto);
  }
}
