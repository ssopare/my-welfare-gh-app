import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DefaulterModule } from '../defaulter/defaulter.module';
import { RbacModule } from '../rbac/rbac.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { FundController } from './fund.controller';
import { FundService } from './fund.service';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';
import { ObligationController } from './obligation.controller';
import { ObligationService } from './obligation.service';

@Module({
  imports: [AuthModule, RuleEngineModule, RbacModule, DefaulterModule],
  controllers: [FundController, LedgerController, ObligationController],
  providers: [FundService, LedgerService, ObligationService],
  exports: [LedgerService, ObligationService],
})
export class LedgerModule {}
