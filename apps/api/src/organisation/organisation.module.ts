import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from '../rbac/rbac.module';
import { OrganisationController } from './organisation.controller';
import { OrganisationService } from './organisation.service';

@Module({
  imports: [AuthModule, RbacModule], // AuthModule for JwtAuthGuard, RbacModule for permission checks
  controllers: [OrganisationController],
  providers: [OrganisationService],
})
export class OrganisationModule {}
