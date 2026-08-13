import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { BudgetModule } from './budget/budget.module';
import { ClaimsModule } from './claims/claims.module';
import { DefaulterModule } from './defaulter/defaulter.module';
import { GovernanceModule } from './governance/governance.module';
import { LedgerModule } from './ledger/ledger.module';
import { MembershipModule } from './membership/membership.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrganisationModule } from './organisation/organisation.module';
import { PaymentsModule } from './payments/payments.module';
import { PlatformAuthModule } from './platform-auth/platform-auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoleModule } from './rbac/role.module';
import { ReportingModule } from './reporting/reporting.module';
import { RuleEngineModule } from './rule-engine/rule-engine.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
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
    GovernanceModule,
    NotificationsModule,
    PlatformAuthModule,
    SubscriptionsModule,
    OrganisationModule,
    BudgetModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
