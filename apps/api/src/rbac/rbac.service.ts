import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import type { Permission, PermissionContext } from './rbac.types';
import {
  STARTER_ROLE_TEMPLATES,
  WILDCARD_ADMIN_PERMISSION,
} from './rbac.types';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  // Called once, inside the same transaction as tenant creation
  // (AuthService.registerOrganisation) — a fresh org gets real, assignable
  // roles from day one instead of an empty role list.
  async seedStarterRolesInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
  ): Promise<Map<string, string>> {
    const roleIdsByName = new Map<string, string>();
    for (const template of STARTER_ROLE_TEMPLATES) {
      const role = await tx.role.create({
        data: {
          organisationId,
          name: template.name,
          isTemplate: true,
          permissions: template.permissions as unknown as Prisma.InputJsonValue,
        },
      });
      roleIdsByName.set(template.name, role.id);
    }
    return roleIdsByName;
  }

  async assignRoleInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
    memberId: string,
    roleId: string,
    options?: { chapterId?: string; termEnd?: Date },
  ) {
    return tx.roleAssignment.create({
      data: {
        organisationId,
        memberId,
        roleId,
        chapterId: options?.chapterId,
        termEnd: options?.termEnd,
      },
    });
  }

  // The actual authorization primitive — live and DB-backed, never a
  // cached or JWT-derived claim, so revoking a role (or letting a
  // time-boxed one lapse, FR-AUD-01) takes effect on the very next
  // request, not after some token expires. '*' on either field matches
  // anything, which is how the Org Admin template represents "full"
  // access (§13.2) without a separate is-super-admin flag.
  //
  // Scope (§13.1) is checked here too, against whatever `context` the
  // caller supplies — see the comment on PermissionContext for the exact
  // matching rule. `scope: 'organisation'` always passes regardless of
  // context, which is *why* WILDCARD_ADMIN_PERMISSION (scope
  // 'organisation') keeps working everywhere unchanged: requireAdmin/
  // requireSelfOrAdmin's admin fallback never needed to pass a context and
  // still doesn't.
  async hasPermission(
    organisationId: string,
    memberId: string,
    resource: string,
    action: string,
    context: PermissionContext = {},
  ): Promise<boolean> {
    return this.prisma.withTenant(organisationId, async (tx) => {
      const now = new Date();
      const assignments = await tx.roleAssignment.findMany({
        where: {
          memberId,
          termStart: { lte: now },
          OR: [{ termEnd: null }, { termEnd: { gt: now } }],
        },
        include: { role: true },
      });
      return assignments.some((assignment) => {
        const permissions = assignment.role
          .permissions as unknown as Permission[];
        return permissions.some((p) => {
          if (!(p.resource === '*' || p.resource === resource)) return false;
          if (!(p.action === '*' || p.action === action)) return false;
          switch (p.scope) {
            case 'organisation':
              return true;
            case 'own':
              return (
                context.targetMemberId !== undefined &&
                context.targetMemberId === memberId
              );
            case 'chapter':
              return (
                assignment.chapterId != null &&
                context.targetChapterId !== undefined &&
                assignment.chapterId === context.targetChapterId
              );
            default:
              return false;
          }
        });
      });
    });
  }

  // What access.util.ts's requireAdmin actually calls — see rbac.types.ts
  // for why this specific pair means "admin-equivalent."
  hasWildcardAdminPermission(
    organisationId: string,
    memberId: string,
  ): Promise<boolean> {
    return this.hasPermission(
      organisationId,
      memberId,
      WILDCARD_ADMIN_PERMISSION.resource,
      WILDCARD_ADMIN_PERMISSION.action,
    );
  }

  async createRole(actor: AuthTokenPayload, dto: CreateRoleDto) {
    if (
      !(await this.hasWildcardAdminPermission(
        actor.organisationId,
        actor.memberId,
      ))
    ) {
      throw new ForbiddenException('Only an organisation admin can do this');
    }
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.role.create({
        data: {
          organisationId: actor.organisationId,
          name: dto.name,
          isTemplate: false,
          permissions: dto.permissions as unknown as Prisma.InputJsonValue,
        },
      }),
    );
  }

  async listRoles(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.role.findMany({ orderBy: { createdAt: 'asc' } }),
    );
  }

  async assignRole(
    actor: AuthTokenPayload,
    roleId: string,
    dto: AssignRoleDto,
  ) {
    if (
      !(await this.hasWildcardAdminPermission(
        actor.organisationId,
        actor.memberId,
      ))
    ) {
      throw new ForbiddenException('Only an organisation admin can do this');
    }
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const role = await tx.role.findUnique({ where: { id: roleId } });
      if (!role) {
        throw new NotFoundException('Role not found');
      }
      const member = await tx.member.findUnique({
        where: { id: dto.memberId },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      return tx.roleAssignment.create({
        data: {
          organisationId: actor.organisationId,
          memberId: dto.memberId,
          roleId,
          chapterId: dto.chapterId,
          termEnd: dto.termEnd ? new Date(dto.termEnd) : undefined,
        },
      });
    });
  }

  // Ends an assignment early rather than deleting it — "member X held
  // role Y from date A to date B" stays a reconstructable historical fact
  // (FR-AUD-02), same reasoning as MemberStatusChange never being deleted.
  async revokeAssignment(actor: AuthTokenPayload, id: string) {
    if (
      !(await this.hasWildcardAdminPermission(
        actor.organisationId,
        actor.memberId,
      ))
    ) {
      throw new ForbiddenException('Only an organisation admin can do this');
    }
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const assignment = await tx.roleAssignment.findUnique({ where: { id } });
      if (!assignment) {
        throw new NotFoundException('Role assignment not found');
      }
      const now = new Date();
      if (assignment.termEnd && assignment.termEnd <= now) {
        throw new BadRequestException('This assignment has already ended');
      }
      return tx.roleAssignment.update({
        where: { id },
        data: { termEnd: now },
      });
    });
  }

  async listForMember(actor: AuthTokenPayload, memberId: string) {
    if (
      actor.memberId !== memberId &&
      !(await this.hasWildcardAdminPermission(
        actor.organisationId,
        actor.memberId,
      ))
    ) {
      throw new ForbiddenException(
        'Can only do this for yourself unless you are an admin',
      );
    }
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.roleAssignment.findMany({
        where: { memberId },
        include: { role: true },
        orderBy: { termStart: 'desc' },
      }),
    );
  }
}
