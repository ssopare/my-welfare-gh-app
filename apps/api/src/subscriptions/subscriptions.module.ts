import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { PlatformAuthModule } from '../platform-auth/platform-auth.module';
import { SubscriptionCoreModule } from './subscription-core.module';
import { SubscriptionPlanController } from './subscription-plan.controller';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionGuard } from './subscription.guard';
import { ModuleAccessGuard } from './module-access.guard';

@Module({
  imports: [AuthModule, PlatformAuthModule, SubscriptionCoreModule],
  controllers: [SubscriptionPlanController, SubscriptionController],
  // APP_GUARD makes both guards global regardless of which module
  // registers them — colocated here rather than in AppModule so the whole
  // subscription-billing concern (schema, services, controllers, the
  // guards that enforce it) lives in one place. NestJS runs every
  // registered APP_GUARD, so both apply independently.
  providers: [
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    { provide: APP_GUARD, useClass: ModuleAccessGuard },
  ],
})
export class SubscriptionsModule {}
