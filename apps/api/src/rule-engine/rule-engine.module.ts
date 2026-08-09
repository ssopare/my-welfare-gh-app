import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BenefitRuleController } from './benefit-rule.controller';
import { BenefitRuleService } from './benefit-rule.service';
import { ContributionPlanController } from './contribution-plan.controller';
import { ContributionPlanService } from './contribution-plan.service';
import { RuleEngineService } from './rule-engine.service';

@Module({
  imports: [AuthModule], // for JwtAuthGuard, which AuthModule exports
  controllers: [ContributionPlanController, BenefitRuleController],
  providers: [ContributionPlanService, BenefitRuleService, RuleEngineService],
  exports: [RuleEngineService],
})
export class RuleEngineModule {}
