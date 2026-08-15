import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { AddDependantDto } from './dto/add-dependant.dto';
import { ChangeStatusDto, MemberStatusValue } from './dto/change-status.dto';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { TransferChapterDto } from './dto/transfer-chapter.dto';
import { UpdateOwnProfileDto } from './dto/update-own-profile.dto';

@Injectable()
export class MembershipService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // Admin-only directory listing — surfaced while building the admin
  // console: every prior endpoint either self-serves (members/me) or acts
  // on one already-known member id, so nothing before this ever needed to
  // *discover* which members exist. No pagination yet — Phase 1 pilot-org
  // sizes don't need it, and adding it later is additive, not a breaking
  // change to this shape.
  async listMembers(actor: AuthTokenPayload, status?: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.member.findMany({
        where: status ? { status: status as never } : undefined,
        orderBy: { createdAt: 'desc' },
        include: {
          account: { select: { phoneNumber: true, name: true, avatarUrl: true } },
          chapter: true,
        },
      }),
    );
  }

  async getOwnMembership(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: actor.memberId },
        include: {
          dependants: true,
          statusChanges: { orderBy: { changedAt: 'desc' } },
          chapter: true,
          account: { select: { phoneNumber: true, name: true, avatarUrl: true } },
        },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      return member;
    });
  }

  // Admin-only counterpart to getOwnMembership, for the Member 360 view —
  // same shape, any member in the org rather than just the caller's own.
  // Another directory-style gap surfaced building the admin console: the
  // members list (above) can enumerate ids, but nothing let an admin open
  // one.
  async getMemberDetail(actor: AuthTokenPayload, memberId: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: memberId },
        include: {
          dependants: true,
          statusChanges: { orderBy: { changedAt: 'desc' } },
          chapter: true,
          account: { select: { phoneNumber: true, name: true, avatarUrl: true } },
        },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      return member;
    });
  }

  // Account.name is identity-level, not tenant-scoped (see the schema
  // comment) — updated directly, no withTenant context needed, the same
  // way AuthService reads/writes Account elsewhere. This is what backfills
  // a name for an account created before this field existed, or lets
  // anyone change theirs later.
  async updateOwnProfile(actor: AuthTokenPayload, dto: UpdateOwnProfileDto) {
    return this.prisma.account.update({
      where: { id: actor.sub },
      data: {
        name: dto.name,
        avatarUrl: dto.avatarUrl !== undefined ? dto.avatarUrl : undefined,
      },
    });
  }

  async addDependant(actor: AuthTokenPayload, dto: AddDependantDto) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.dependant.create({
        data: {
          memberId: actor.memberId,
          organisationId: actor.organisationId,
          relationship: dto.relationship,
          name: dto.name,
          confirmed: true,
        },
      }),
    );
  }

  async confirmDependant(actor: AuthTokenPayload, dependantId: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const dependant = await tx.dependant.findUnique({
        where: { id: dependantId },
      });
      if (!dependant || dependant.memberId !== actor.memberId) {
        throw new NotFoundException('Dependant not found');
      }
      return tx.dependant.update({
        where: { id: dependantId },
        data: { confirmed: true },
      });
    });
  }

  // Applies a status transition for real: updates Member.status, writes the
  // permanent MemberStatusChange audit row (now with the acting admin
  // attached via changedBy), and runs the FR-GOV-02 governance-vacancy side
  // effect. Shared by the direct (no maker-checker) path below and by
  // confirmRemoval, so a removal that went through the two-step flow gets
  // exactly the same effects as one that didn't.
  private async applyStatus(
    tx: Prisma.TransactionClient,
    actor: AuthTokenPayload,
    memberId: string,
    fromStatus: MemberStatusValue,
    toStatus: MemberStatusValue,
    reason: string | undefined,
  ) {
    const updated = await tx.member.update({
      where: { id: memberId },
      data: { status: toStatus },
    });
    await tx.memberStatusChange.create({
      data: {
        memberId,
        organisationId: actor.organisationId,
        fromStatus,
        toStatus,
        reason,
        changedBy: actor.memberId,
      },
    });

    // FR-GOV-02: "auto-flag a role as vacant when its holder's membership
    // status changes to Exited or Deceased." Scoped to governance-body-
    // linked assignments only (officer seats) — ending an ordinary RBAC
    // role like the baseline "Member" grant isn't a vacancy in any
    // meaningful sense. A direct update, not a call into GovernanceModule —
    // this is a targeted side effect of *membership* status changing, not
    // governance domain logic, so it doesn't need GovernanceService
    // injected here.
    if (toStatus === 'EXITED' || toStatus === 'DECEASED') {
      const now = new Date();
      await tx.roleAssignment.updateMany({
        where: {
          memberId,
          governanceBodyId: { not: null },
          OR: [{ termEnd: null }, { termEnd: { gt: now } }],
        },
        data: { termEnd: now },
      });
    }

    return updated;
  }

  // Removal (status -> EXITED) is never a delete — see MemberRemovalRequest's
  // schema comment. Two extra rules apply only to removal, layered on top
  // of the plain status-change path every other transition still uses:
  //  1. An admin can never remove themselves, maker-checker or not — there
  //     is no legitimate single-actor path to your own removal.
  //  2. A reason is mandatory (every other status change keeps it optional).
  // When the org has makerCheckerEnabled, removal additionally becomes a
  // two-step request/confirm flow (see confirmRemoval/cancelRemoval) instead
  // of applying immediately.
  async changeStatus(
    actor: AuthTokenPayload,
    memberId: string,
    dto: ChangeStatusDto,
  ) {
    await requireAdmin(this.rbac, actor);

    if (dto.status === 'EXITED') {
      if (!dto.reason?.trim()) {
        throw new BadRequestException(
          'A reason is required when removing a member',
        );
      }
      if (memberId === actor.memberId) {
        throw new ForbiddenException(
          'You cannot remove yourself — ask another admin to do it',
        );
      }
    }

    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      if (dto.status === 'EXITED') {
        const organisation = await tx.organisation.findUnique({
          where: { id: actor.organisationId },
        });
        if (organisation?.makerCheckerEnabled) {
          const removalRequest = await tx.memberRemovalRequest.create({
            data: {
              memberId,
              organisationId: actor.organisationId,
              requestedBy: actor.memberId,
              reason: dto.reason!,
            },
          });
          return { outcome: 'pending_confirmation' as const, removalRequest };
        }
      }

      const updated = await this.applyStatus(
        tx,
        actor,
        memberId,
        member.status,
        dto.status,
        dto.reason,
      );
      return { outcome: 'applied' as const, member: updated };
    });
  }

  // Admin review queue for pending removals — the confirming admin needs to
  // see who requested what and why before signing off.
  async listRemovalRequests(actor: AuthTokenPayload, status?: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const requests = await tx.memberRemovalRequest.findMany({
        where: status ? { status: status as never } : undefined,
        orderBy: { requestedAt: 'desc' },
        include: {
          member: {
            include: { account: { select: { phoneNumber: true, name: true } } },
          },
        },
      });

      // requestedBy/confirmedBy/cancelledBy are plain member ids, not
      // Prisma relations (same reasoning as ClaimStageAction.actorMemberId
      // — a request can be acted on by any admin, not just one fixed
      // role), so their phone numbers need a separate batched lookup.
      const actorIds = new Set<string>();
      for (const r of requests) {
        actorIds.add(r.requestedBy);
        if (r.confirmedBy) actorIds.add(r.confirmedBy);
        if (r.cancelledBy) actorIds.add(r.cancelledBy);
      }
      const actors = await tx.member.findMany({
        where: { id: { in: [...actorIds] } },
        include: { account: { select: { phoneNumber: true, name: true } } },
      });
      const phoneById = new Map(
        actors.map((a) => [a.id, a.account.phoneNumber]),
      );

      return requests.map((r) => ({
        ...r,
        requestedByPhoneNumber: phoneById.get(r.requestedBy) ?? null,
        confirmedByPhoneNumber: r.confirmedBy
          ? (phoneById.get(r.confirmedBy) ?? null)
          : null,
        cancelledByPhoneNumber: r.cancelledBy
          ? (phoneById.get(r.cancelledBy) ?? null)
          : null,
      }));
    });
  }

  // The maker-checker payoff: a different admin than the requester signs
  // off, and only then does the member actually become EXITED.
  async confirmRemoval(actor: AuthTokenPayload, requestId: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const removalRequest = await tx.memberRemovalRequest.findUnique({
        where: { id: requestId },
      });
      if (!removalRequest || removalRequest.status !== 'PENDING') {
        throw new NotFoundException(
          'Removal request not found or already resolved',
        );
      }
      if (removalRequest.requestedBy === actor.memberId) {
        throw new ForbiddenException(
          'Maker-checker is enabled: a different admin must confirm this removal',
        );
      }
      const member = await tx.member.findUnique({
        where: { id: removalRequest.memberId },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      const updated = await this.applyStatus(
        tx,
        actor,
        removalRequest.memberId,
        member.status,
        'EXITED',
        removalRequest.reason,
      );
      await tx.memberRemovalRequest.update({
        where: { id: requestId },
        data: {
          status: 'CONFIRMED',
          confirmedBy: actor.memberId,
          confirmedAt: new Date(),
        },
      });
      return updated;
    });
  }

  async cancelRemoval(actor: AuthTokenPayload, requestId: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const removalRequest = await tx.memberRemovalRequest.findUnique({
        where: { id: requestId },
      });
      if (!removalRequest || removalRequest.status !== 'PENDING') {
        throw new NotFoundException(
          'Removal request not found or already resolved',
        );
      }
      return tx.memberRemovalRequest.update({
        where: { id: requestId },
        data: {
          status: 'CANCELLED',
          cancelledBy: actor.memberId,
          cancelledAt: new Date(),
        },
      });
    });
  }

  async createChapter(actor: AuthTokenPayload, dto: CreateChapterDto) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.chapter.create({
        data: { organisationId: actor.organisationId, name: dto.name },
      }),
    );
  }

  // Open to any member, like listActive on the rule engine — chapter names
  // are org structure, not sensitive. Needed for the admin console's
  // chapter-scoped role assignment picker (Convener et al.); nothing
  // before this could discover which chapters exist without already
  // knowing an id from a member record.
  async listChapters(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.chapter.findMany({ orderBy: { name: 'asc' } }),
    );
  }

  async transferChapter(
    actor: AuthTokenPayload,
    memberId: string,
    dto: TransferChapterDto,
  ) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      // Sequential, not Promise.all: both queries share one connection via
      // this interactive transaction's tx client, and pg doesn't support
      // running two queries concurrently on the same connection.
      const member = await tx.member.findUnique({ where: { id: memberId } });
      const chapter = await tx.chapter.findUnique({
        where: { id: dto.chapterId },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      if (!chapter) {
        throw new NotFoundException('Chapter not found');
      }
      return tx.member.update({
        where: { id: memberId },
        data: { chapterId: dto.chapterId },
      });
    });
  }
}
