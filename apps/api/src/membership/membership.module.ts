import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { MembershipController } from './membership.controller';
import { MembershipService } from './membership.service';

@Module({
  imports: [AuthModule, RbacModule], // AuthModule for JwtAuthGuard, RbacModule for permission checks
  controllers: [MembershipController],
  providers: [MembershipService],
})
export class MembershipModule {}
