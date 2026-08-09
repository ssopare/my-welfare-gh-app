import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DefaulterModule } from '../defaulter/defaulter.module';
import { RbacModule } from '../rbac/rbac.module';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

@Module({
  imports: [AuthModule, RbacModule, DefaulterModule],
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
