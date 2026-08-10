import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { SubscriptionCoreModule } from './subscription-core.module';
import { SubscriptionPlanController } from './subscription-plan.controller';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionGuard } from './subscription.guard';

@Module({
  imports: [AuthModule, PlatformAuthModule, SubscriptionCoreModule],
  controllers: [SubscriptionPlanController, SubscriptionController],
  // APP_GUARD makes SubscriptionGuard global regardless of which module
  // registers it — colocated here rather than in AppModule so the whole
  // subscription-billing concern (schema, services, controllers, the
  // guard that enforces it) lives in one place.
  providers: [{ provide: APP_GUARD, useClass: SubscriptionGuard }],
})
export class SubscriptionsModule {}
