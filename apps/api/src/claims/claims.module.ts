import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RbacModule } from '../rbac/rbac.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { ClaimController } from './claim.controller';
import { ClaimService } from './claim.service';

@Module({
  imports: [
    AuthModule,
    RuleEngineModule,
    LedgerModule,
    RbacModule,
    NotificationsModule,
  ],
  controllers: [ClaimController],
  providers: [ClaimService],
})
export class ClaimsModule {}
