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
import { CreateContributionPlanDto } from './dto/create-contribution-plan.dto';

@Injectable()
export class ContributionPlanService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(actor: AuthTokenPayload, dto: CreateContributionPlanDto) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.contributionPlan.create({
        data: {
          organisationId: actor.organisationId,
          chapterId: dto.chapterId,
          name: dto.name,
          cadence: dto.cadence,
          computationType: dto.computationType ?? 'fixed',
          amountValue: dto.amountValue,
          currency: dto.currency,
          collectionMechanism: dto.collectionMechanism ?? 'push',
          minTenureMonths: dto.minTenureMonths,
          goodStandingRequired: dto.goodStandingRequired ?? true,
          supersedesId: dto.supersedesId,
          createdBy: actor.memberId,
        },
      }),
    );
  }

  // FR-RULE-02: amendments create a new version; the predecessor is
  // SUPERSEDED (its effectiveTo set to the new version's effectiveFrom),
  // never edited or deleted.
  async activate(actor: AuthTokenPayload, id: string, dto: ActivateRuleDto) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const plan = await tx.contributionPlan.findUnique({ where: { id } });
      if (!plan) {
        throw new NotFoundException('Contribution plan not found');
      }
      if (plan.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot activate a plan in ${plan.status} status`,
        );
      }

      // §13.1 maker-checker: "block the person who initiated a financial
      // transaction (... a rule amendment) from also being its sole
      // approver" — opt-in per tenant, since some very small groups
      // genuinely have only one active officer.
      const organisation = await tx.organisation.findUnique({
        where: { id: actor.organisationId },
      });
      if (
        organisation?.makerCheckerEnabled &&
        plan.createdBy === actor.memberId
      ) {
        throw new ForbiddenException(
          'Maker-checker is enabled for this organisation: the member who created this plan cannot also activate it',
        );
      }

      const effectiveFrom = dto.effectiveFrom
        ? new Date(dto.effectiveFrom)
        : new Date();

      if (plan.supersedesId) {
        const predecessor = await tx.contributionPlan.findUnique({
          where: { id: plan.supersedesId },
        });
        if (!predecessor) {
          throw new NotFoundException('The plan this supersedes was not found');
        }
        if (predecessor.status !== 'ACTIVE') {
          throw new BadRequestException(
            'Can only supersede a currently ACTIVE plan',
          );
        }
        await tx.contributionPlan.update({
          where: { id: predecessor.id },
          data: { status: 'SUPERSEDED', effectiveTo: effectiveFrom },
        });
      }

      return tx.contributionPlan.update({
        where: { id },
        data: { status: 'ACTIVE', effectiveFrom, approvedBy: actor.memberId },
      });
    });
  }

  // Line 1114 of the spec: a rejected/draft rule "stays in that state
  // indefinitely; it never auto-activates on a timer."
  async reject(actor: AuthTokenPayload, id: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const plan = await tx.contributionPlan.findUnique({ where: { id } });
      if (!plan) {
        throw new NotFoundException('Contribution plan not found');
      }
      if (plan.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot reject a plan in ${plan.status} status`,
        );
      }
      return tx.contributionPlan.update({
        where: { id },
        data: { status: 'REJECTED', approvedBy: actor.memberId },
      });
    });
  }

  async listActive(actor: AuthTokenPayload, asOf: Date) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.contributionPlan.findMany({
        where: {
          status: 'ACTIVE',
          effectiveFrom: { lte: asOf },
          OR: [{ effectiveTo: null }, { effectiveTo: { gt: asOf } }],
        },
      }),
    );
  }
}
