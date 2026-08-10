import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '../../generated/prisma/client';
import { DefaulterService } from '../defaulter/defaulter.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from './notification.service';

const OPEN_OBLIGATION_STATUSES = [
  'UPCOMING',
  'DUE',
  'PARTIALLY_PAID',
  'OVERDUE',
] as const;

const ELIGIBLE_FOR_AUTO_TRANSITION = [
  'ACTIVE',
  'GRACE',
  'PROBATION',
  'DEFAULTER',
  'SUSPENDED',
];

// §8.11/FR-COM-01 needs *something* to run on a schedule — a due-date
// reminder or a "you're approaching default" alert is meaningless if
// nothing ever re-evaluates it between requests. This is the first
// genuinely periodic process in the app; everything before it only ever
// ran in response to a specific HTTP request. Also closes the defaulter
// slice's own documented gap ("a member who simply stops paying, with no
// payment event to hang a reassessment on, never gets flagged") — the
// same daily sweep that walks open obligations for reminders reassesses
// defaulter status for the same members it's already looking at, for
// free.
//
// PrismaService.withSystemContext() is what makes "enumerate every
// tenant" possible at all — see its own comment and the
// system_scheduler_read migration for why that's safe. Every other query
// in this sweep goes back through the ordinary withTenant() once the
// per-org loop starts.
@Injectable()
export class NotificationSchedulerService {
  private readonly logger = new Logger(NotificationSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly defaulter: DefaulterService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async runDailySweep() {
    const organisationIds = await this.prisma.withSystemContext((tx) =>
      tx.organisation.findMany({ select: { id: true } }),
    );
    for (const { id: organisationId } of organisationIds) {
      await this.sweepOrganisation(organisationId);
    }
  }

  private async sweepOrganisation(organisationId: string) {
    try {
      await this.prisma.withTenant(organisationId, async (tx) => {
        await this.sendDueReminders(tx, organisationId);
        await this.reassessAndAlertDefaulters(tx, organisationId);
      });
    } catch (error) {
      // One tenant's bad data (or a transient failure) must never stop the
      // sweep for every other tenant — logged, not rethrown.
      this.logger.error(
        `Daily sweep failed for organisation ${organisationId}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  // FR-COM-01a: reminders ahead of a contribution due date.
  private async sendDueReminders(
    tx: Prisma.TransactionClient,
    organisationId: string,
  ) {
    const plans = await tx.contributionPlan.findMany({
      where: { status: 'ACTIVE', reminderDaysBeforeDue: { not: null } },
    });
    if (plans.length === 0) return;

    const now = new Date();
    for (const plan of plans) {
      const windowEnd = new Date(now);
      windowEnd.setDate(
        windowEnd.getDate() + (plan.reminderDaysBeforeDue ?? 0),
      );

      const obligations = await tx.obligation.findMany({
        where: {
          contributionPlanId: plan.id,
          status: { in: [...OPEN_OBLIGATION_STATUSES] },
          dueDate: { gte: now, lte: windowEnd },
        },
      });
      for (const obligation of obligations) {
        await this.notifications.notifyInTx(
          tx,
          organisationId,
          obligation.memberId,
          'CONTRIBUTION_DUE_REMINDER',
          `Your ${plan.name} contribution of ${obligation.amountValue.toString()} ${obligation.currency} is due on ${obligation.dueDate.toISOString().slice(0, 10)}.`,
          { sourceType: 'obligation', sourceId: obligation.id },
        );
      }
    }
  }

  // FR-COM-01b (escalating alert) + closing the "no scheduler" defaulter
  // gap by reassessing status for real, on every relevant member, daily —
  // not just when a payment happens to arrive.
  private async reassessAndAlertDefaulters(
    tx: Prisma.TransactionClient,
    organisationId: string,
  ) {
    const policy = await tx.defaulterPolicy.findUnique({
      where: { organisationId },
    });
    if (!policy) return;

    const members = await tx.member.findMany({
      where: { status: { in: ELIGIBLE_FOR_AUTO_TRANSITION as never } },
    });

    for (const member of members) {
      const obligations = await tx.obligation.findMany({
        where: {
          memberId: member.id,
          status: { in: [...OPEN_OBLIGATION_STATUSES] },
        },
      });
      const planIds = new Set(obligations.map((o) => o.contributionPlanId));
      for (const planId of planIds) {
        await this.defaulter.reassessInTx(
          tx,
          organisationId,
          member.id,
          planId,
        );

        const missed = await this.defaulter.getConsecutiveMissedCount(
          tx,
          member.id,
          planId,
        );
        if (missed === policy.defaulterThresholdMonths - 1) {
          const plan = await tx.contributionPlan.findUnique({
            where: { id: planId },
          });
          await this.notifications.notifyInTx(
            tx,
            organisationId,
            member.id,
            'DEFAULTER_RISK_ALERT',
            `You have missed ${missed} consecutive ${plan?.name ?? 'contribution'} period(s) — one more missed period will move you out of good standing.`,
            { sourceType: 'contribution_plan', sourceId: planId },
          );
        }
      }
    }
  }
}
