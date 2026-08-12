import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { ActivateRuleDto } from './dto/activate-rule.dto';
import { CreateBenefitRuleDto } from './dto/create-benefit-rule.dto';

@Injectable()
export class BenefitRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(actor: AuthTokenPayload, dto: CreateBenefitRuleDto) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.benefitRule.create({
        data: {
          organisationId: actor.organisationId,
          chapterId: dto.chapterId,
          name: dto.name,
          triggerEvent: dto.triggerEvent,
          subjectTypes: dto.subjectTypes,
          amountValue: dto.amountValue,
          currency: dto.currency,
          occurrenceCapScope: dto.occurrenceCapScope ?? 'lifetime',
          occurrenceCapMax: dto.occurrenceCapMax,
          minTenureMonths: dto.minTenureMonths,
          goodStandingRequired: dto.goodStandingRequired ?? true,
          maxConsecutiveMissedPeriods: dto.maxConsecutiveMissedPeriods,
          evidenceRequired: dto.evidenceRequired ?? [],
          approvalChain: dto.approvalChain ?? [],
          supersedesId: dto.supersedesId,
          createdBy: actor.memberId,
        },
      }),
    );
  }

  // See ContributionPlanService.activate for the versioning/supersession
  // and maker-checker reasoning — identical shape, different model.
  async activate(actor: AuthTokenPayload, id: string, dto: ActivateRuleDto) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const rule = await tx.benefitRule.findUnique({ where: { id } });
      if (!rule) {
        throw new NotFoundException('Benefit rule not found');
      }
      if (rule.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot activate a rule in ${rule.status} status`,
        );
      }

      const organisation = await tx.organisation.findUnique({
        where: { id: actor.organisationId },
      });
      if (
        organisation?.makerCheckerEnabled &&
        rule.createdBy === actor.memberId
      ) {
        throw new ForbiddenException(
          'Maker-checker is enabled for this organisation: the member who created this rule cannot also activate it',
        );
      }

      const effectiveFrom = dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : new Date();

      if (rule.supersedesId) {
        const predecessor = await tx.benefitRule.findUnique({
          where: { id: rule.supersedesId },
        });
        if (!predecessor) {
          throw new NotFoundException('The rule this supersedes was not found');
        }
        if (predecessor.status !== 'ACTIVE') {
          throw new BadRequestException(
            'Can only supersede a currently ACTIVE rule',
          );
        }
        await tx.benefitRule.update({
          where: { id: predecessor.id },
          data: { status: 'SUPERSEDED', effectiveTo: effectiveFrom },
        });
      }

      return tx.benefitRule.update({
        where: { id },
        data: { status: 'ACTIVE', effectiveFrom, approvedBy: actor.memberId },
      });
    });
  }

  async reject(actor: AuthTokenPayload, id: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const rule = await tx.benefitRule.findUnique({ where: { id } });
      if (!rule) {
        throw new NotFoundException('Benefit rule not found');
      }
      if (rule.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot reject a rule in ${rule.status} status`,
        );
      }
      return tx.benefitRule.update({
        where: { id },
        data: { status: 'REJECTED', approvedBy: actor.memberId },
      });
    });
  }

  async listActive(actor: AuthTokenPayload, asOf: Date) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.benefitRule.findMany({
        where: {
          status: 'ACTIVE',
          effectiveFrom: { lte: asOf },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
        },
      }),
    );
  }

  // Admin-only management view — see ContributionPlanService.listAll for
  // why listActive alone can't support the create -> activate/reject
  // workflow the admin console needs.
  async listAll(actor: AuthTokenPayload) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.benefitRule.findMany({ orderBy: { createdAt: 'desc' } }),
    );
  }

  // Single-rule lookup for the admin console's rule detail/live eligibility
  // preview screen — see ContributionPlanService.get for why this didn't
  // already exist.
  async get(actor: AuthTokenPayload, id: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const rule = await tx.benefitRule.findUnique({ where: { id } });
      if (!rule) {
        throw new NotFoundException('Benefit rule not found');
      }
      return rule;
    });
  }
}
