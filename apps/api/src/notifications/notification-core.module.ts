import { Module } from '@nestjs/common';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationService } from './notification.service';

// Service-only, zero imports of AuthModule — deliberately, so AuthService
// can inject NotificationService (to notify admins when someone joins
// pending approval) without a cycle. Same split as
// SubscriptionCoreModule/SubscriptionsModule: controllers live in the
// sibling NotificationsModule, which imports both this and AuthModule;
// AuthModule imports only this one.
@Module({
  imports: [RbacModule],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationCoreModule {}
