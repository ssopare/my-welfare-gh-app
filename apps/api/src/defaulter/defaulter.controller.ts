import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DefaulterService } from './defaulter.service';
import { SetDefaulterPolicyDto } from './dto/set-defaulter-policy.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class DefaulterController {
  constructor(private readonly defaulter: DefaulterService) {}

  @Post('defaulter-policy')
  setPolicy(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: SetDefaulterPolicyDto,
  ) {
    return this.defaulter.setPolicy(user, dto);
  }

  @Get('defaulter-policy')
  getPolicy(@CurrentUser() user: AuthTokenPayload) {
    return this.defaulter.getPolicy(user);
  }

  @Post('members/:memberId/contribution-plans/:planId/reassess-standing')
  reassess(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
    @Param('planId') planId: string,
  ) {
    return this.defaulter.reassess(user, memberId, planId);
  }
}
