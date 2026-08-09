import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { ClaimsModule } from './claims/claims.module';
import { DefaulterModule } from './defaulter/defaulter.module';
import { LedgerModule } from './ledger/ledger.module';
import { MembershipModule } from './membership/membership.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoleModule } from './rbac/role.module';
import { ReportingModule } from './reporting/reporting.module';
import { RuleEngineModule } from './rule-engine/rule-engine.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    MembershipModule,
    RuleEngineModule,
    LedgerModule,
    PaymentsModule,
    RoleModule,
    ClaimsModule,
    DefaulterModule,
    ReportingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
