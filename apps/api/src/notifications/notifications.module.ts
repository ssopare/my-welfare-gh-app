import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DefaulterModule } from '../defaulter/defaulter.module';
import { RbacModule } from '../rbac/rbac.module';
import { NotificationController } from './notification.controller';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationService } from './notification.service';

@Module({
  imports: [AuthModule, RbacModule, DefaulterModule],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationSchedulerService],
  exports: [NotificationService],
})
export class NotificationsModule {}
