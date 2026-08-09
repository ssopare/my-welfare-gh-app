import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportingService } from './reporting.service';

function parseDate(value?: string): Date | undefined {
  return value ? new Date(value) : undefined;
}

@Controller()
@UseGuards(JwtAuthGuard)
export class ReportingController {
  constructor(private readonly reporting: ReportingService) {}

  @Get('reports/contribution-summary')
  contributionSummary(
    @CurrentUser() user: AuthTokenPayload,
    @Query('planId') planId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reporting.contributionSummary(
      user,
      planId,
      parseDate(from),
      parseDate(to),
    );
  }

  @Get('members/:memberId/statement')
  memberStatement(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.reporting.memberStatement(user, memberId);
  }

  @Get('reports/defaulter-register')
  defaulterRegister(@CurrentUser() user: AuthTokenPayload) {
    return this.reporting.defaulterRegister(user);
  }

  @Get('reports/disbursements')
  disbursementReport(
    @CurrentUser() user: AuthTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reporting.disbursementReport(
      user,
      parseDate(from),
      parseDate(to),
    );
  }
}
