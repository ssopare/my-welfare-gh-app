import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { DefaulterController } from './defaulter.controller';
import { DefaulterService } from './defaulter.service';

@Module({
  imports: [AuthModule, RbacModule], // AuthModule for JwtAuthGuard, RbacModule for permission checks
  controllers: [DefaulterController],
  providers: [DefaulterService],
  exports: [DefaulterService],
})
export class DefaulterModule {}
