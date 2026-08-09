import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { GovernanceController } from './governance.controller';
import { GovernanceService } from './governance.service';

@Module({
  imports: [AuthModule, RbacModule], // AuthModule for JwtAuthGuard, RbacModule for permission checks
  controllers: [GovernanceController],
  providers: [GovernanceService],
})
export class GovernanceModule {}
