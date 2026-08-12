import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { requireSelfOrAdmin } from '../common/access.util';
import { RbacService } from '../rbac/rbac.service';
import { ContributionPlanService } from './contribution-plan.service';
import { ActivateRuleDto } from './dto/activate-rule.dto';
import { ComputeObligationDto } from './dto/compute-obligation.dto';
import { CreateContributionPlanDto } from './dto/create-contribution-plan.dto';
import { UpdatePlanDefaultFundDto } from './dto/update-plan-default-fund.dto';
import { RuleEngineService } from './rule-engine.service';

@Controller('contribution-plans')
@UseGuards(JwtAuthGuard)
export class ContributionPlanController {
  constructor(
    private readonly plans: ContributionPlanService,
    private readonly ruleEngine: RuleEngineService,
    private readonly rbac: RbacService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateContributionPlanDto,
  ) {
    return this.plans.create(user, dto);
  }

  @Post(':id/activate')
  activate(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: ActivateRuleDto,
  ) {
    return this.plans.activate(user, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.plans.reject(user, id);
  }

  @Patch(':id/default-fund')
  setDefaultFund(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePlanDefaultFundDto,
  ) {
    return this.plans.setDefaultFund(user, id, dto);
  }

  @Get()
  listActive(
    @CurrentUser() user: AuthTokenPayload,
    @Query('asOf') asOf?: string,
  ) {
    return this.plans.listActive(user, asOf ? new Date(asOf) : new Date());
  }

  @Get('all')
  listAll(@CurrentUser() user: AuthTokenPayload) {
    return this.plans.listAll(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.plans.get(user, id);
  }

  @Post(':id/compute-obligation')
  async computeObligation(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: ComputeObligationDto,
  ) {
    await requireSelfOrAdmin(this.rbac, user, dto.memberId);
    return this.ruleEngine.computeContributionObligation(
      user.organisationId,
      id,
      dto.memberId,
      new Date(dto.periodDate),
    );
  }
}
