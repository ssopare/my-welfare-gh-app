import { Module, Global } from '@nestjs/common';
import { SmsService } from './sms.service';
import { SmsController } from './sms.controller';
import { ArkeselSmsProvider } from './providers/arkesel-sms.provider';
import { MnotifySmsProvider } from './providers/mnotify-sms.provider';
import { HubtelSmsProvider } from './providers/hubtel-sms.provider';
import { MockSmsProvider } from './providers/mock-sms.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { RbacModule } from '../rbac/rbac.module';

@Global()
@Module({
  imports: [PrismaModule, RbacModule],
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
