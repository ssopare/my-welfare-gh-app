import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationCoreModule } from '../notifications/notification-core.module';
import { RbacModule } from '../rbac/rbac.module';
import { SubscriptionCoreModule } from '../subscriptions/subscription-core.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  // Fail at startup, not on the first login attempt.
  throw new Error('JWT_SECRET environment variable is required');
}

@Module({
  imports: [
    JwtModule.register({
      secret: jwtSecret,
      signOptions: { expiresIn: '1d' },
    }),
    RbacModule,
    SubscriptionCoreModule,
    NotificationCoreModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
