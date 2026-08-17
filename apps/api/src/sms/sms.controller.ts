import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { SmsService } from './sms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthTokenPayload } from '../auth/auth.service';
import { RbacService } from '../rbac/rbac.service';
import { requireAdmin } from '../common/access.util';
import {
  SendTestSmsDto,
  BroadcastSmsDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto/sms.dto';

// Every route here either costs real money (a paid SMS gateway dispatch)
// or reads phone numbers + message content — admin-gated uniformly, same
// bar as settlement-account/payout-policy elsewhere in this codebase.
// SmsModule already imported RbacModule for this from the start; it just
// never actually injected RbacService anywhere, so nothing was enforced.
@Controller('sms')
@UseGuards(JwtAuthGuard)
export class SmsController {
  constructor(
    private readonly smsService: SmsService,
    private readonly rbac: RbacService,
  ) {}

  @Get('balances')
  async getBalances(@CurrentUser() user: AuthTokenPayload) {
    await requireAdmin(this.rbac, user);
    return this.smsService.getGatewaySummary();
  }

  @Get('logs')
  async getLogs(
    @CurrentUser() user: AuthTokenPayload,
    @Query('limit') limit?: string,
  ) {
    await requireAdmin(this.rbac, user);
    const take = limit ? Math.min(Number(limit), 100) : 50;
    return this.smsService.getLogs(user.organisationId, take);
  }

  @Post('test-send')
  async testSend(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: SendTestSmsDto,
  ) {
    await requireAdmin(this.rbac, user);
    return this.smsService.sendSms({
      to: dto.phoneNumber,
      message: dto.message,
      type: 'TRANSACTIONAL',
      organisationId: user.organisationId,
    });
  }

  @Post('broadcast')
  async broadcast(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: BroadcastSmsDto,
  ) {
    await requireAdmin(this.rbac, user);
    return this.smsService.broadcastSms(
      user.organisationId,
      dto.message,
      dto.recipientGroup,
    );
  }

  // Previously unauthenticated entirely — no guard, and organisationId
  // came from an unauthenticated query param (defaulting to the literal
  // string 'default-org' if omitted), meaning anyone on the internet
  // could trigger a real, billed SMS to any number and attribute the
  // cost/log entry to any organisation. Nothing in the actual app calls
  // this today (OTP login stays disabled — see AuthService), so locking
  // it to an authenticated admin closes the hole without breaking any
  // real caller.
  @Post('send-otp')
  async sendOtp(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: SendOtpDto,
  ) {
    await requireAdmin(this.rbac, user);
    return this.smsService.sendOtp(user.organisationId, dto.phoneNumber);
  }

  @Post('verify-otp')
  async verifyOtp(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: VerifyOtpDto,
  ) {
    await requireAdmin(this.rbac, user);
    const valid = this.smsService.verifyOtp(dto.phoneNumber, dto.code);
    return { valid };
  }
}
