import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { SmsService } from './sms.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthTokenPayload } from '../auth/auth.service';
import {
  SendTestSmsDto,
  BroadcastSmsDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto/sms.dto';

@Controller('sms')
export class SmsController {
  constructor(private readonly smsService: SmsService) {}

  @Get('balances')
  @UseGuards(JwtAuthGuard)
  getBalances() {
    return this.smsService.getGatewaySummary();
  }

  @Get('logs')
  @UseGuards(JwtAuthGuard)
  getLogs(
    @CurrentUser() user: AuthTokenPayload,
    @Query('limit') limit?: string,
  ) {
    const take = limit ? Math.min(Number(limit), 100) : 50;
    return this.smsService.getLogs(user.organisationId, take);
  }

  @Post('test-send')
  @UseGuards(JwtAuthGuard)
  testSend(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: SendTestSmsDto,
  ) {
    return this.smsService.sendSms({
      to: dto.phoneNumber,
      message: dto.message,
      type: 'TRANSACTIONAL',
      organisationId: user.organisationId,
    });
  }

  @Post('broadcast')
  @UseGuards(JwtAuthGuard)
  broadcast(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: BroadcastSmsDto,
  ) {
    return this.smsService.broadcastSms(
      user.organisationId,
      dto.message,
      dto.recipientGroup,
    );
  }

  @Post('send-otp')
  sendOtp(
    @Body() dto: SendOtpDto,
    @Query('organisationId') organisationId?: string,
  ) {
    return this.smsService.sendOtp(
      organisationId || 'default-org',
      dto.phoneNumber,
    );
  }

  @Post('verify-otp')
  verifyOtp(@Body() dto: VerifyOtpDto) {
    const valid = this.smsService.verifyOtp(dto.phoneNumber, dto.code);
    return { valid };
  }
}
