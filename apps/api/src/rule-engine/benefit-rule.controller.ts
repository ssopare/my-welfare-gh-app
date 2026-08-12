import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { requireSelfOrAdmin } from '../common/access.util';
import { RbacService } from '../rbac/rbac.service';
import { BenefitRuleService } from './benefit-rule.service';
import { ActivateRuleDto } from './dto/activate-rule.dto';
import { CreateBenefitRuleDto } from './dto/create-benefit-rule.dto';
import { EvaluateEligibilityDto } from './dto/evaluate-eligibility.dto';
import { RuleEngineService } from './rule-engine.service';

@Controller('benefit-rules')
@UseGuards(JwtAuthGuard)
export class BenefitRuleController {
  constructor(
    private readonly rules: BenefitRuleService,
    private readonly ruleEngine: RuleEngineService,
    private readonly rbac: RbacService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: CreateBenefitRuleDto,
  ) {
    return this.rules.create(user, dto);
  }

  @Post(':id/activate')
  activate(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: ActivateRuleDto,
  ) {
    return this.rules.activate(user, id, dto);
  }

  @Post(':id/reject')
  reject(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.rules.reject(user, id);
  }

  @Get()
  listActive(
    @CurrentUser() user: AuthTokenPayload,
    @Query('asOf') asOf?: string,
  ) {
    return this.rules.listActive(user, asOf ? new Date(asOf) : new Date());
  }

  @Get('all')
  listAll(@CurrentUser() user: AuthTokenPayload) {
    return this.rules.listAll(user);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.rules.get(user, id);
  }

  @Post(':id/evaluate-eligibility')
  async evaluateEligibility(
    @CurrentUser() user: AuthTokenPayload,
    @Param('id') id: string,
    @Body() dto: EvaluateEligibilityDto,
  ) {
    await requireSelfOrAdmin(this.rbac, user, dto.memberId);
    return this.ruleEngine.evaluateBenefitEligibility(
      user.organisationId,
      id,
      dto.memberId,
      new Date(dto.eventDate),
      dto.dependantId,
    );
  }
}
