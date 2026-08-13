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

  @Get('reports/fund-position-trend')
  fundPositionTrend(@CurrentUser() user: AuthTokenPayload) {
    return this.reporting.fundPositionTrend(user);
  }

  @Get('reports/contributions-vs-claims')
  contributionsVsClaims(@CurrentUser() user: AuthTokenPayload) {
    return this.reporting.contributionsVsClaimsMonthly(user);
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

  @Get('reports/income-expenditure')
  incomeExpenditureStatement(
    @CurrentUser() user: AuthTokenPayload,
    @Query('fundId') fundId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    return this.reporting.incomeExpenditureStatement(user, {
      fundId,
      from:
        parseDate(from) ??
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: parseDate(to) ?? now,
    });
  }

  @Get('reports/trial-balance')
  trialBalance(
    @CurrentUser() user: AuthTokenPayload,
    @Query('asOf') asOf?: string,
    @Query('fundId') fundId?: string,
  ) {
    return this.reporting.trialBalance(user, { asOf: parseDate(asOf), fundId });
  }

  @Get('reports/general-ledger/:ledgerAccountId')
  generalLedger(
    @CurrentUser() user: AuthTokenPayload,
    @Param('ledgerAccountId') ledgerAccountId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reporting.generalLedger(user, ledgerAccountId, {
      from: parseDate(from),
      to: parseDate(to),
    });
  }

  @Get('reports/advance-contributions')
  advanceContributions(@CurrentUser() user: AuthTokenPayload) {
    return this.reporting.advanceContributions(user);
  }

  @Get('reports/arrears-allocation')
  arrearsAllocation(
    @CurrentUser() user: AuthTokenPayload,
    @Query('memberId') memberId?: string,
  ) {
    return this.reporting.arrearsAllocation(user, { memberId });
  }

  @Get('reports/benefit-expenditure')
  benefitExpenditureAnalytics(
    @CurrentUser() user: AuthTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.reporting.benefitExpenditureAnalytics(user, {
      from: parseDate(from),
      to: parseDate(to),
    });
  }

  @Get('reports/financial-health')
  managementRatiosAndHealth(
    @CurrentUser() user: AuthTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    return this.reporting.managementRatiosAndHealth(user, {
      from:
        parseDate(from) ??
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: parseDate(to) ?? now,
    });
  }

  @Get('reports/cash-flow')
  cashFlowStatement(
    @CurrentUser() user: AuthTokenPayload,
    @Query('fundId') fundId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    return this.reporting.cashFlowStatement(user, {
      fundId,
      from:
        parseDate(from) ??
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: parseDate(to) ?? now,
    });
  }

  @Get('reports/fund-position')
  fundPositionReport(
    @CurrentUser() user: AuthTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    return this.reporting.fundPositionReport(user, {
      from:
        parseDate(from) ??
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: parseDate(to) ?? now,
    });
  }

  @Get('reports/reversals')
  reversalsAndAdjustments(
    @CurrentUser() user: AuthTokenPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const now = new Date();
    return this.reporting.reversalsAndAdjustments(user, {
      from:
        parseDate(from) ??
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
      to: parseDate(to) ?? now,
    });
  }
}
