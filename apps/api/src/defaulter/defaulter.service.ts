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
import { SetDefaulterPolicyDto } from './dto/set-defaulter-policy.dto';

// Statuses PAID/WAIVED/EXEMPTED/CANCELLED settle the streak (this period
// wasn't missed, whatever its history); anything else still open counts as
// missed. UPCOMING is neither — handled separately by the grace-period
// check before this list is even consulted.
const SETTLED_STATUSES = ['PAID', 'WAIVED', 'EXEMPTED', 'CANCELLED'];

// Only auto-transitioned by DefaulterService — PENDING, EXITED, and
// DECEASED are left alone regardless of missed-contribution count.
const ELIGIBLE_FOR_AUTO_TRANSITION = [
  'ACTIVE',
  'GRACE',
  'PROBATION',
  'DEFAULTER',
  'SUSPENDED',
];

// §14, FR-DEF-01/02, Phase 1 scope: threshold-based status transitions and
// requiring arrears fully cleared before restoring good standing. §14.1's
// consistency score and §14.3/14.4's dumping-pattern/proportional-payout
// logic are explicitly Phase 2 — not built here.
//
// There is no scheduler in this app (Notifications, which would normally
// drive a periodic sweep, is also out of Phase 1) — so "automatic" here
// means "recomputed on the real trigger events that matter," not "runs on
// a timer": reassess() is admin-callable directly, and
// ObligationService.recordContributionPaymentInTx calls it after every
// payment so clearing arrears restores good standing without a separate
// manual step. A tenant that wants nightly sweeps of members who simply
// stopped paying (no payment event to hang a reassessment on) needs a real
// job runner — a known, deliberate gap, not an oversight.
@Injectable()
export class DefaulterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async setPolicy(actor: AuthTokenPayload, dto: SetDefaulterPolicyDto) {
    await requireAdmin(this.rbac, actor);
    if (dto.defaulterThresholdMonths >= dto.forfeitureThresholdMonths) {
      throw new BadRequestException(
        'defaulterThresholdMonths must be less than forfeitureThresholdMonths',
      );
    }
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.defaulterPolicy.upsert({
        where: { organisationId: actor.organisationId },
        create: {
          organisationId: actor.organisationId,
          defaulterThresholdMonths: dto.defaulterThresholdMonths,
          forfeitureThresholdMonths: dto.forfeitureThresholdMonths,
        },
        update: {
          defaulterThresholdMonths: dto.defaulterThresholdMonths,
          forfeitureThresholdMonths: dto.forfeitureThresholdMonths,
        },
      }),
    );
  }

  async getPolicy(actor: AuthTokenPayload) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.defaulterPolicy.findUnique({
        where: { organisationId: actor.organisationId },
      }),
    );
  }

  async reassess(
    actor: AuthTokenPayload,
    memberId: string,
    contributionPlanId: string,
  ) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      this.reassessInTx(tx, actor.organisationId, memberId, contributionPlanId),
    );
  }

  // Counts how many of a member's most recent, chronologically-consecutive
  // obligations under this plan are missed as of now — walking newest to
  // oldest, stopping at the first one that's settled (or not due yet under
  // the plan's payment grace period). A purely query-time computation, not
  // a stored counter — nothing here depends on an OVERDUE status ever
  // having been set by a job that doesn't exist.
  private async getConsecutiveMissedCount(
    tx: Prisma.TransactionClient,
    memberId: string,
    contributionPlanId: string,
  ): Promise<number> {
    const plan = await tx.contributionPlan.findUnique({
      where: { id: contributionPlanId },
    });
    if (!plan) {
      throw new NotFoundException('Contribution plan not found');
    }
    const graceDays = plan.paymentGracePeriodDays ?? 0;
    const now = new Date();

    const obligations = await tx.obligation.findMany({
      where: { memberId, contributionPlanId },
      orderBy: { dueDate: 'desc' },
    });

    let missed = 0;
    for (const obligation of obligations) {
      const effectiveDue = new Date(obligation.dueDate);
      effectiveDue.setDate(effectiveDue.getDate() + graceDays);
      if (effectiveDue > now) {
        continue; // still within grace — doesn't count either way yet
      }
      if (SETTLED_STATUSES.includes(obligation.status)) {
        break; // streak ends: this period was settled
      }
      missed++;
    }
    return missed;
  }

  // The state machine: DEFAULTER at the configured threshold, SUSPENDED
  // (standing in for §14's "Forfeited" — both already block benefit
  // eligibility identically via goodStandingRequired, so Phase 1 doesn't
  // need a dedicated enum value) at the deeper one, and back to ACTIVE (or
  // PROBATION, if the plan configures a reinstatementWaitingPeriodMonths —
  // a fresh probation per FR-LEDGER-06, requiring a human to confirm the
  // wait elapsed via the existing PATCH /members/:id/status) once arrears
  // are fully cleared.
  async reassessInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
    memberId: string,
    contributionPlanId: string,
  ) {
    const policy = await tx.defaulterPolicy.findUnique({
      where: { organisationId },
    });
    if (!policy) {
      return null; // opt-in: nothing configured, nothing to enforce
    }

    const member = await tx.member.findUnique({ where: { id: memberId } });
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (!ELIGIBLE_FOR_AUTO_TRANSITION.includes(member.status)) {
      return member;
    }

    const missed = await this.getConsecutiveMissedCount(
      tx,
      memberId,
      contributionPlanId,
    );

    let toStatus: string | null = null;
    let reason: string | null = null;

    if (missed >= policy.forfeitureThresholdMonths) {
      if (member.status !== 'SUSPENDED') {
        toStatus = 'SUSPENDED';
        reason = `${missed} consecutive missed contribution period(s) reached the forfeiture threshold (${policy.forfeitureThresholdMonths})`;
      }
    } else if (missed >= policy.defaulterThresholdMonths) {
      if (member.status !== 'DEFAULTER') {
        toStatus = 'DEFAULTER';
        reason = `${missed} consecutive missed contribution period(s) reached the defaulter threshold (${policy.defaulterThresholdMonths})`;
      }
    } else if (
      missed === 0 &&
      ['DEFAULTER', 'SUSPENDED'].includes(member.status)
    ) {
      const plan = await tx.contributionPlan.findUnique({
        where: { id: contributionPlanId },
      });
      const waitMonths = plan?.reinstatementWaitingPeriodMonths;
      toStatus = waitMonths ? 'PROBATION' : 'ACTIVE';
      reason = waitMonths
        ? `Arrears cleared; ${waitMonths} month(s) reinstatement waiting period applies before full ACTIVE status`
        : 'Arrears cleared';
    }

    if (!toStatus) {
      return member;
    }

    const updated = await tx.member.update({
      where: { id: memberId },
      data: { status: toStatus as never },
    });
    await tx.memberStatusChange.create({
      data: {
        memberId,
        organisationId,
        fromStatus: member.status,
        toStatus: toStatus as never,
        reason,
      },
    });
    return updated;
  }
}
