import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AppointOfficerDto } from './dto/appoint-officer.dto';
import { CreateGovernanceBodyDto } from './dto/create-governance-body.dto';

// §8.3, roadmap: Governance. Phase 1 scope per the roadmap table —
// governance bodies, term limits, role vacancy handling. Motions/minutes/
// votes and "vote of no confidence" (FR-GOV-03/04) are Phase 2: "officers
// can be recorded administratively at first."
@Injectable()
export class GovernanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(actor: AuthTokenPayload, dto: CreateGovernanceBodyDto) {
    await requireAdmin(this.rbac, actor);
    if (dto.maxConsecutiveTerms == null && dto.coolingOffPeriodMonths != null) {
      throw new BadRequestException(
        'coolingOffPeriodMonths only makes sense alongside maxConsecutiveTerms',
      );
    }
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.governanceBody.create({
        data: {
          organisationId: actor.organisationId,
          name: dto.name,
          membershipCompositionRule: dto.membershipCompositionRule,
          quorumRule: dto.quorumRule,
          tieBreakRule: dto.tieBreakRule,
          meetingCadence: dto.meetingCadence,
          maxConsecutiveTerms: dto.maxConsecutiveTerms,
          coolingOffPeriodMonths: dto.coolingOffPeriodMonths,
        },
      }),
    );
  }

  async list(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.governanceBody.findMany({ orderBy: { createdAt: 'asc' } }),
    );
  }

  async listOfficers(actor: AuthTokenPayload, governanceBodyId: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const body = await tx.governanceBody.findUnique({
        where: { id: governanceBodyId },
      });
      if (!body) {
        throw new NotFoundException('Governance body not found');
      }
      return tx.roleAssignment.findMany({
        where: { governanceBodyId },
        include: { role: true },
        orderBy: { termStart: 'desc' },
      });
    });
  }

  // FR-GOV-02: term limits + cooling-off, checked before delegating to
  // RbacService.assignRoleInTx for the actual grant — reusing slice 6's
  // RoleAssignment machinery rather than inventing a parallel "officer"
  // concept, per the spec's own "RoleAssignment links Member x Role x
  // Governance Body" data-model line. Each RoleAssignment row for this
  // (role, body) pair already *is* one term — walking them newest-first
  // and counting how many in a row belong to this member is the same
  // "each row is a version" reasoning as the schema comment explains.
  async appointOfficer(
    actor: AuthTokenPayload,
    governanceBodyId: string,
    dto: AppointOfficerDto,
  ) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const body = await tx.governanceBody.findUnique({
        where: { id: governanceBodyId },
      });
      if (!body) {
        throw new NotFoundException('Governance body not found');
      }
      const role = await tx.role.findUnique({ where: { id: dto.roleId } });
      if (!role) {
        throw new NotFoundException('Role not found');
      }
      const member = await tx.member.findUnique({
        where: { id: dto.memberId },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      if (body.maxConsecutiveTerms != null) {
        const history = await tx.roleAssignment.findMany({
          where: { roleId: dto.roleId, governanceBodyId },
          orderBy: { termStart: 'desc' },
        });

        let consecutive = 0;
        let mostRecentOwnTermEnd: Date | null = null;
        for (const assignment of history) {
          if (assignment.memberId !== dto.memberId) {
            break;
          }
          consecutive++;
          if (mostRecentOwnTermEnd === null) {
            mostRecentOwnTermEnd = assignment.termEnd;
          }
        }

        if (consecutive >= body.maxConsecutiveTerms) {
          const coolingOffMonths = body.coolingOffPeriodMonths ?? 0;
          const eligibleAgainAt = mostRecentOwnTermEnd
            ? new Date(mostRecentOwnTermEnd)
            : null;
          eligibleAgainAt?.setMonth(
            eligibleAgainAt.getMonth() + coolingOffMonths,
          );
          const hasCooledOff =
            eligibleAgainAt !== null && eligibleAgainAt <= new Date();
          if (!hasCooledOff) {
            throw new BadRequestException(
              `This member has already served ${consecutive} consecutive term(s) as ${role.name} in this body — a ${coolingOffMonths} month cooling-off period applies before reappointment`,
            );
          }
        }
      }

      return this.rbac.assignRoleInTx(
        tx,
        actor.organisationId,
        dto.memberId,
        dto.roleId,
        {
          governanceBodyId,
          termEnd: dto.termEnd ? new Date(dto.termEnd) : undefined,
        },
      );
    });
  }
}
