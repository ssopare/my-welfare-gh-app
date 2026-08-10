import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { ConvertSubscriptionDto } from './dto/convert-subscription.dto';
import {
  SubscriptionStatusValue,
  UpdateSubscriptionStatusDto,
} from './dto/update-subscription-status.dto';

// §18, roadmap: Subscription billing. FR-SUB-01: nothing here ever
// references Fund/JournalEntry/LedgerAccount/Obligation — structurally
// separate from the welfare-fund ledger, by construction, not by
// convention.
const DEFAULT_TRIAL_DAYS = 60;

function addBillingPeriod(from: Date, cadence: string): Date {
  const result = new Date(from);
  switch (cadence) {
    case 'annual':
      result.setFullYear(result.getFullYear() + 1);
      break;
    case 'termly':
      // No fixed definition in the spec (school-year constitutions like
      // St. Peter's don't specify term length in days) — 4 months is a
      // reasonable approximation for a 3-term academic year, documented
      // rather than silently assumed.
      result.setMonth(result.getMonth() + 4);
      break;
    case 'monthly':
    default:
      result.setMonth(result.getMonth() + 1);
      break;
  }
  return result;
}

@Injectable()
export class SubscriptionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // §18.1: "Free Trial: every new tenant, automatically." Called from
  // inside AuthService.registerOrganisation's own transaction — not a
  // separate withTenant, so a failure here rolls back the whole
  // registration rather than leaving an organisation with no subscription
  // row at all.
  async createTrialInTx(tx: Prisma.TransactionClient, organisationId: string) {
    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + DEFAULT_TRIAL_DAYS);
    return tx.subscription.create({
      data: { organisationId, status: 'TRIAL', trialEndsAt },
    });
  }

  async getOwn(actor: AuthTokenPayload) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { organisationId: actor.organisationId },
        include: { plan: true },
      });
      if (!subscription) {
        throw new NotFoundException(
          'No subscription found for this organisation',
        );
      }
      return subscription;
    });
  }

  // A tenant choosing (or switching to) a plan — the only self-service
  // mutation on the tenant side; every other status transition (past-due,
  // suspended, cancelled) is the platform operator's manual lever, since
  // no real payment-gateway/dunning automation exists yet for platform
  // billing itself.
  async convertToPaid(actor: AuthTokenPayload, dto: ConvertSubscriptionDto) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const plan = await tx.subscriptionPlan.findUnique({
        where: { id: dto.planId },
      });
      if (!plan || plan.archived) {
        throw new NotFoundException('Subscription plan not found');
      }
      const subscription = await tx.subscription.findUnique({
        where: { organisationId: actor.organisationId },
      });
      if (!subscription) {
        throw new NotFoundException(
          'No subscription found for this organisation',
        );
      }
      return tx.subscription.update({
        where: { organisationId: actor.organisationId },
        data: {
          planId: plan.id,
          status: 'ACTIVE',
          currentPeriodEnd: addBillingPeriod(new Date(), plan.billingCadence),
        },
      });
    });
  }

  // Platform-operator side, cross-tenant — via withPlatformOperatorContext,
  // never withTenant, since a platform operator has no organisationId of
  // its own.
  async listAllForOperator() {
    return this.prisma.withPlatformOperatorContext((tx) =>
      tx.subscription.findMany({
        include: { plan: true, organisation: { select: { legalName: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async updateStatusForOperator(
    organisationId: string,
    dto: UpdateSubscriptionStatusDto,
  ) {
    return this.prisma.withPlatformOperatorContext(async (tx) => {
      const subscription = await tx.subscription.findUnique({
        where: { organisationId },
      });
      if (!subscription) {
        throw new NotFoundException(
          'No subscription found for this organisation',
        );
      }
      if (
        subscription.status === 'CANCELLED' &&
        dto.status !== ('CANCELLED' as SubscriptionStatusValue)
      ) {
        throw new BadRequestException(
          'A cancelled subscription cannot be reactivated directly — create a new one',
        );
      }
      return tx.subscription.update({
        where: { organisationId },
        data: {
          status: dto.status,
          currentPeriodEnd: dto.currentPeriodEnd
            ? new Date(dto.currentPeriodEnd)
            : undefined,
          cancelledAt: dto.status === 'CANCELLED' ? new Date() : undefined,
        },
      });
    });
  }
}
