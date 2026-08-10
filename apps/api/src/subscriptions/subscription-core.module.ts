import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { SubscriptionPlanService } from './subscription-plan.service';
import { SubscriptionService } from './subscription.service';

// Service-only, zero imports of AuthModule — deliberately, so AuthService
// can inject SubscriptionService (to create the trial at registration)
// without a cycle. Same split as RbacModule/RoleModule in the RBAC slice:
// controllers live in the sibling SubscriptionsModule, which imports both
// this and AuthModule; AuthModule imports only this one.
@Module({
  imports: [RbacModule],
  providers: [SubscriptionPlanService, SubscriptionService],
  exports: [SubscriptionPlanService, SubscriptionService],
})
export class SubscriptionCoreModule {}
