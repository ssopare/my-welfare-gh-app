import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { FundController } from './fund.controller';
import { FundService } from './fund.service';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { ObligationController } from './obligation.controller';
import { ObligationService } from './obligation.service';

@Module({
  imports: [AuthModule, RuleEngineModule],
  controllers: [FundController, LedgerController, ObligationController],
  providers: [FundService, LedgerService, ObligationService],
  exports: [LedgerService, ObligationService],
})
export class LedgerModule {}
