import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RbacModule } from './rbac.module';
import { RoleController } from './role.controller';

@Module({
  imports: [AuthModule, RbacModule],
  controllers: [RoleController],
})
export class RoleModule {}
