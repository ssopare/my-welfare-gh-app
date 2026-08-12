import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { RbacService } from './rbac.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class RoleController {
  constructor(private readonly rbac: RbacService) {}

  @Post('roles')
  create(@CurrentUser() user: AuthTokenPayload, @Body() dto: CreateRoleDto) {
    return this.rbac.createRole(user, dto);
  }

  @Get('roles')
  list(@CurrentUser() user: AuthTokenPayload) {
    return this.rbac.listRoles(user);
  }

  @Post('roles/:roleId/assignments')
  assign(
    @CurrentUser() user: AuthTokenPayload,
    @Param('roleId') roleId: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.rbac.assignRole(user, roleId, dto);
  }

  @Get('roles/:roleId/assignments')
  listAssignments(
    @CurrentUser() user: AuthTokenPayload,
    @Param('roleId') roleId: string,
  ) {
    return this.rbac.listAssignmentsForRole(user, roleId);
  }

  @Patch('role-assignments/:id/revoke')
  revoke(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.rbac.revokeAssignment(user, id);
  }

  @Get('members/:memberId/roles')
  listForMember(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.rbac.listForMember(user, memberId);
  }
}
