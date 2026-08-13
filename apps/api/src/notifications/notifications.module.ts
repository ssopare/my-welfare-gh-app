import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DefaulterModule } from '../defaulter/defaulter.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationController } from './notification.controller';
import { NotificationCoreModule } from './notification-core.module';
import { NotificationSchedulerService } from './notification-scheduler.service';

// No longer re-exports NotificationService — anything that needs it
// (e.g. ClaimsModule) imports NotificationCoreModule directly now, same
// split as SubscriptionCoreModule/SubscriptionsModule. This module is
// just the HTTP surface (NotificationController) plus the cron sweep.
@Module({
  imports: [AuthModule, RbacModule, DefaulterModule, NotificationCoreModule],
  controllers: [NotificationController],
  providers: [NotificationSchedulerService],
})
export class NotificationsModule {}
