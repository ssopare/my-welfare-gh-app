import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddDependantDto } from './dto/add-dependant.dto';
import { ChangeStatusDto } from './dto/change-status.dto';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { TransferChapterDto } from './dto/transfer-chapter.dto';

// RBAC is still a placeholder (Member.role ADMIN/MEMBER — see the real
// model's slot in the Phase 1 roadmap, §13). These inline role checks are
// deliberately minimal and will be replaced outright when that slice lands,
// not built out into a bigger guard/decorator framework ahead of it.
function requireAdmin(actor: AuthTokenPayload) {
  if (actor.role !== 'ADMIN') {
    throw new ForbiddenException('Only an organisation admin can do this');
  }
}

@Injectable()
export class MembershipService {
  constructor(private readonly prisma: PrismaService) {}

  async getOwnMembership(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: actor.memberId },
        include: {
          dependants: true,
          statusChanges: { orderBy: { changedAt: 'desc' } },
          chapter: true,
        },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      return member;
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

  async changeStatus(
    actor: AuthTokenPayload,
    memberId: string,
    dto: ChangeStatusDto,
  ) {
    requireAdmin(actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const member = await tx.member.findUnique({ where: { id: memberId } });
      if (!member) {
        throw new NotFoundException('Member not found');
      }
      const updated = await tx.member.update({
        where: { id: memberId },
        data: { status: dto.status },
      });
      await tx.memberStatusChange.create({
        data: {
          memberId,
          organisationId: actor.organisationId,
          fromStatus: member.status,
          toStatus: dto.status,
          reason: dto.reason,
        },
      });
      return updated;
    });
  }

  async createChapter(actor: AuthTokenPayload, dto: CreateChapterDto) {
    requireAdmin(actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.chapter.create({
        data: { organisationId: actor.organisationId, name: dto.name },
      }),
    );
  }

  async transferChapter(
    actor: AuthTokenPayload,
    memberId: string,
    dto: TransferChapterDto,
  ) {
    requireAdmin(actor);
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
