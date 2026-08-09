import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { LedgerModule } from './ledger/ledger.module';
import { MembershipModule } from './membership/membership.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoleModule } from './rbac/role.module';
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
