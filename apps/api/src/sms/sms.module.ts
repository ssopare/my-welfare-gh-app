import { Module, Global } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { ArkeselSmsProvider } from './providers/arkesel-sms.provider';
import { MnotifySmsProvider } from './providers/mnotify-sms.provider';
import { HubtelSmsProvider } from './providers/hubtel-sms.provider';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuthModule } from '../auth/auth.module';

@Global()
@Module({
  // AuthModule is needed for JwtAuthGuard (SmsController is
  // @UseGuards(JwtAuthGuard) class-wide) — JwtAuthGuard depends on
  // JwtService, which only AuthModule's JwtModule.register() provides;
  // without this import, Nest can't resolve it and every /sms/* route
  // throws at request time. AuthModule doesn't import SmsModule anywhere
  // in its own graph (SmsService reaches NotificationService only via
  // SmsModule's @Global() export, not an import edge), so this doesn't
  // create a cycle.
  imports: [PrismaModule, RbacModule, AuthModule],
  controllers: [SmsController],
  providers: [
    ArkeselSmsProvider,
    MnotifySmsProvider,
    HubtelSmsProvider,
    MockSmsProvider,
    SmsService,
  ],
  exports: [SmsService],
})
export class SmsModule {}
