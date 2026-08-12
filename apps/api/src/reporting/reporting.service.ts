import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requirePermission, requireSelfOrAdmin } from '../common/access.util';
import { DefaulterService } from '../defaulter/defaulter.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

const OPEN_OBLIGATION_STATUSES = [
  'UPCOMING',
  'DUE',
  'PARTIALLY_PAID',
  'OVERDUE',
] as const;

// §16's reporting catalogue, Phase 1 scope only per the roadmap table
// (contribution summary, member statement, defaulter register,
// disbursement report — forecasting/solvency, income/expense registers,
// and the wallet statement are Phase 2). §8.9: "reporting is a query
// layer over the immutable ledger and claim history, not a parallel data
// entry surface" — nothing here writes anything or introduces new tables;
// every report is derived fresh from Obligation/JournalLine/Claim rows
// already built by earlier slices, the same "never a stored,
// independently-editable number" principle FR-LEDGER-05 established for
// account balances, applied to reporting generally.
@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly defaulter: DefaulterService,
  ) {}

  // "Expected vs. collected, by plan, by chapter." Grouped in application
  // code rather than a SQL GROUP BY — the group count here is small
  // (plans × chapters per tenant), and this keeps the amount arithmetic on
  // Prisma.Decimal instead of trusting a driver to sum DECIMAL columns
  // without precision loss.
  async contributionSummary(
    actor: AuthTokenPayload,
    planId?: string,
    from?: Date,
    to?: Date,
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const obligations = await tx.obligation.findMany({
        where: {
          ...(planId ? { contributionPlanId: planId } : {}),
          ...(from || to
            ? {
                dueDate: {
                  ...(from ? { gte: from } : {}),
                  ...(to ? { lte: to } : {}),
                },
              }
            : {}),
        },
        include: { member: true, contributionPlan: true },
      });

      interface Group {
        contributionPlanId: string;
        planName: string;
        chapterId: string | null;
        memberIds: Set<string>;
        expectedTotal: Prisma.Decimal;
        collectedTotal: Prisma.Decimal;
      }
      const groups = new Map<string, Group>();
      for (const obligation of obligations) {
        const chapterId = obligation.member.chapterId;
        const key = `${obligation.contributionPlanId}::${chapterId ?? 'none'}`;
        let group = groups.get(key);
        if (!group) {
          group = {
            contributionPlanId: obligation.contributionPlanId,
            planName: obligation.contributionPlan.name,
            chapterId,
            memberIds: new Set(),
            expectedTotal: new Prisma.Decimal(0),
            collectedTotal: new Prisma.Decimal(0),
          };
          groups.set(key, group);
        }
        group.memberIds.add(obligation.memberId);
        group.expectedTotal = group.expectedTotal.plus(obligation.amountValue);
        group.collectedTotal = group.collectedTotal.plus(obligation.amountPaid);
      }

      return Array.from(groups.values()).map((group) => ({
        contributionPlanId: group.contributionPlanId,
        planName: group.planName,
        chapterId: group.chapterId,
        memberCount: group.memberIds.size,
        expectedTotal: group.expectedTotal.toString(),
        collectedTotal: group.collectedTotal.toString(),
        outstandingTotal: group.expectedTotal
          .minus(group.collectedTotal)
          .toString(),
      }));
    });
  }

  // "Full payment history, standing status, benefit history, paid-through
  // date." paidThroughDate is derived, not stored: the latest dueDate of
  // an unbroken run of PAID obligations starting from the member's
  // earliest one — the first gap ends the run, same reasoning as
  // DefaulterService's missed-period streak, just counting the opposite
  // direction (paid, not missed).
  async memberStatement(actor: AuthTokenPayload, memberId: string) {
    await requireSelfOrAdmin(this.rbac, actor, memberId);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const member = await tx.member.findUnique({
        where: { id: memberId },
        include: { statusChanges: { orderBy: { changedAt: 'desc' } } },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      const obligations = await tx.obligation.findMany({
        where: { memberId },
        include: { contributionPlan: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
      });

      const paymentLines = await tx.journalLine.findMany({
        where: { memberId },
        include: { journalEntry: true },
      });
      const payments = paymentLines
        .map((line) => ({
          journalEntryId: line.journalEntryId,
          description: line.journalEntry.description,
          postedAt: line.journalEntry.postedAt,
          sourceType: line.journalEntry.sourceType,
          debit: line.debit.toString(),
          credit: line.credit.toString(),
        }))
        .sort((a, b) => b.postedAt.getTime() - a.postedAt.getTime());

      const claims = await tx.claim.findMany({
        where: { memberId },
        include: { benefitRule: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      });

      let paidThroughDate: Date | null = null;
      for (const obligation of obligations) {
        if (obligation.status !== 'PAID') {
          break;
        }
        paidThroughDate = obligation.dueDate;
      }

      return {
        memberId: member.id,
        status: member.status,
        joinDate: member.joinDate,
        chapterId: member.chapterId,
        statusHistory: member.statusChanges,
        obligations,
        payments,
        claims,
        paidThroughDate,
      };
    });
  }

  // "Members by standing state, consecutive-missed count, arrears owed."
  // One row per (member, contributionPlan) they have open obligations
  // under — reuses DefaulterService.getConsecutiveMissedCount directly so
  // this register can never disagree with what an actual reassessment
  // would decide.
  // agingBuckets: the outstanding balance of this row's open obligations,
  // split by how many days overdue each one is (0-30/31-60/61-90/90+) —
  // the concrete, data-backed version of the admin UI design plan's
  // "defaulter aging heatmap" idea. Bucketed by amount, not obligation
  // count, so the heatmap reads as "how much is aging where," consistent
  // with arrearsOwed already being an amount, not a count.
  async defaulterRegister(actor: AuthTokenPayload) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const members = await tx.member.findMany({
        where: { status: { in: ['DEFAULTER', 'SUSPENDED'] } },
      });

      const rows: {
        memberId: string;
        phoneNumber: string | undefined;
        status: string;
        contributionPlanId: string;
        planName: string | undefined;
        consecutiveMissedCount: number;
        arrearsOwed: string;
        agingBuckets: {
          days0To30: string;
          days31To60: string;
          days61To90: string;
          days90Plus: string;
        };
      }[] = [];
      const now = new Date();

      for (const member of members) {
        const account = await tx.account.findUnique({
          where: { id: member.accountId },
        });
        const obligations = await tx.obligation.findMany({
          where: {
            memberId: member.id,
            status: { in: [...OPEN_OBLIGATION_STATUSES] },
          },
        });
        const planIds = new Set(obligations.map((o) => o.contributionPlanId));
        for (const planId of planIds) {
          const plan = await tx.contributionPlan.findUnique({
            where: { id: planId },
          });
          const missed = await this.defaulter.getConsecutiveMissedCount(
            tx,
            member.id,
            planId,
          );
          const planObligations = obligations.filter(
            (o) => o.contributionPlanId === planId,
          );
          const arrears = planObligations.reduce(
            (sum, o) =>
              sum.plus(new Prisma.Decimal(o.amountValue).minus(o.amountPaid)),
            new Prisma.Decimal(0),
          );

          const buckets = {
            days0To30: new Prisma.Decimal(0),
            days31To60: new Prisma.Decimal(0),
            days61To90: new Prisma.Decimal(0),
            days90Plus: new Prisma.Decimal(0),
          };
          for (const obligation of planObligations) {
            const outstanding = new Prisma.Decimal(
              obligation.amountValue,
            ).minus(obligation.amountPaid);
            if (outstanding.lessThanOrEqualTo(0)) continue;
            const daysOverdue = Math.max(
              0,
              Math.floor(
                (now.getTime() - obligation.dueDate.getTime()) /
                  (1000 * 60 * 60 * 24),
              ),
            );
            if (daysOverdue <= 30)
              buckets.days0To30 = buckets.days0To30.plus(outstanding);
            else if (daysOverdue <= 60)
              buckets.days31To60 = buckets.days31To60.plus(outstanding);
            else if (daysOverdue <= 90)
              buckets.days61To90 = buckets.days61To90.plus(outstanding);
            else buckets.days90Plus = buckets.days90Plus.plus(outstanding);
          }

          rows.push({
            memberId: member.id,
            phoneNumber: account?.phoneNumber,
            status: member.status,
            contributionPlanId: planId,
            planName: plan?.name,
            consecutiveMissedCount: missed,
            arrearsOwed: arrears.toString(),
            agingBuckets: {
              days0To30: buckets.days0To30.toString(),
              days31To60: buckets.days31To60.toString(),
              days61To90: buckets.days61To90.toString(),
              days90Plus: buckets.days90Plus.toString(),
            },
          });
        }
      }
      return rows;
    });
  }

  // Dashboard's "Fund Position Trend" chart. The running total cash
  // position (sum of every ASSET-type ledger account's balance — Cash
  // accounts) at each of the last 6 month-ends, derived fresh from
  // JournalLine debits/credits, same "never a stored, independently-
  // editable number" principle as every other report here — there's no
  // separate balance-history table to drift out of sync with the ledger.
  // Single pass: lines are fetched once, ordered by postedAt, and the
  // running balance advances through each cutoff in turn rather than
  // re-summing from scratch per month.
  async fundPositionTrend(actor: AuthTokenPayload) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const lines = await tx.journalLine.findMany({
        where: { ledgerAccount: { type: 'ASSET' } },
        select: {
          debit: true,
          credit: true,
          journalEntry: { select: { postedAt: true } },
        },
        orderBy: { journalEntry: { postedAt: 'asc' } },
      });

      const now = new Date();
      const cutoffs: { month: string; cutoff: Date }[] = [];
      for (let i = 5; i >= 0; i -= 1) {
        // Day 0 of next month = the last day of the target month — a
        // symbolic month-end label; using it as the actual filter cutoff
        // is safe even mid-month since nothing in the ledger is ever
        // post-dated past "now".
        const cutoff = new Date(
          Date.UTC(
            now.getUTCFullYear(),
            now.getUTCMonth() - i + 1,
            0,
            23,
            59,
            59,
            999,
          ),
        );
        cutoffs.push({
          month: cutoff.toLocaleString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          cutoff,
        });
      }

      let lineIndex = 0;
      let runningBalance = new Prisma.Decimal(0);
      const trend: { month: string; balance: string }[] = [];
      for (const { month, cutoff } of cutoffs) {
        while (
          lineIndex < lines.length &&
          lines[lineIndex].journalEntry.postedAt <= cutoff
        ) {
          runningBalance = runningBalance
            .plus(lines[lineIndex].debit)
            .minus(lines[lineIndex].credit);
          lineIndex += 1;
        }
        trend.push({ month, balance: runningBalance.toString() });
      }
      return trend;
    });
  }

  // Dashboard's "Contributions vs. claims" chart — two real monthly
  // totals side by side, over the same 6-month window as the fund trend
  // above: contributions collected (credits to "Contributions Income")
  // and claims paid out (debits to "Benefits Expense", posted by
  // ClaimService's disbursement step). Both are summed fresh from
  // JournalLine, not read off Obligation/Claim running totals, for the
  // same reason as every other report in this file.
  async contributionsVsClaimsMonthly(actor: AuthTokenPayload) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const lines = await tx.journalLine.findMany({
        where: {
          ledgerAccount: {
            name: { in: ['Contributions Income', 'Benefits Expense'] },
          },
        },
        select: {
          debit: true,
          credit: true,
          ledgerAccount: { select: { name: true } },
          journalEntry: { select: { postedAt: true } },
        },
      });

      const now = new Date();
      const months = Array.from({ length: 6 }, (_, index) => {
        const i = 5 - index;
        const start = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1),
        );
        const end = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59, 999),
        );
        return {
          month: end.toLocaleString('en-US', {
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          start,
          end,
          contributions: new Prisma.Decimal(0),
          claimsPaid: new Prisma.Decimal(0),
        };
      });

      for (const line of lines) {
        const postedAt = line.journalEntry.postedAt;
        const bucket = months.find((m) => postedAt >= m.start && postedAt <= m.end);
        if (!bucket) continue;
        if (line.ledgerAccount.name === 'Contributions Income') {
          bucket.contributions = bucket.contributions.plus(line.credit);
        } else {
          bucket.claimsPaid = bucket.claimsPaid.plus(line.debit);
        }
      }

      return months.map((m) => ({
        month: m.month,
        contributions: m.contributions.toString(),
        claimsPaid: m.claimsPaid.toString(),
      }));
    });
  }

  // "Amounts, beneficiaries, benefit type, approver trail." Every PAID
  // claim already carries everything this needs — the approval chain
  // (ClaimStageAction) and the disbursement posting (JournalEntry) both
  // exist because of how the Claims slice wired those two together, not
  // anything new built for reporting. Joins the recipient's phone number
  // and, per approver, theirs too — ClaimStageAction.actorMemberId has no
  // Prisma relation to Member (a plain FK, not a declared @relation), so
  // approver phone numbers need a separate batched lookup rather than a
  // nested include.
  async disbursementReport(actor: AuthTokenPayload, from?: Date, to?: Date) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const claims = await tx.claim.findMany({
        where: {
          status: 'PAID',
          ...(from || to
            ? {
                journalEntry: {
                  postedAt: {
                    ...(from ? { gte: from } : {}),
                    ...(to ? { lte: to } : {}),
                  },
                },
              }
            : {}),
        },
        include: {
          benefitRule: true,
          journalEntry: true,
          stageActions: { orderBy: { decidedAt: 'asc' } },
          member: { include: { account: { select: { phoneNumber: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });

      const actorIds = new Set<string>();
      for (const claim of claims) {
        for (const action of claim.stageActions) {
          actorIds.add(action.actorMemberId);
        }
      }
      const actors = await tx.member.findMany({
        where: { id: { in: Array.from(actorIds) } },
        include: { account: { select: { phoneNumber: true } } },
      });
      const actorPhoneById = new Map(
        actors.map((a) => [a.id, a.account.phoneNumber]),
      );

      return claims.map((claim) => ({
        claimId: claim.id,
        memberId: claim.memberId,
        phoneNumber: claim.member.account.phoneNumber,
        dependantId: claim.dependantId,
        benefitRuleId: claim.benefitRuleId,
        benefitName: claim.benefitRule.name,
        triggerEvent: claim.benefitRule.triggerEvent,
        amountValue: claim.amountValue.toString(),
        currency: claim.currency,
        paidAt: claim.journalEntry?.postedAt ?? null,
        journalEntryId: claim.journalEntryId,
        approverTrail: claim.stageActions.map((action) => ({
          stageIndex: action.stageIndex,
          stageName: action.stageName,
          actorMemberId: action.actorMemberId,
          actorPhoneNumber: actorPhoneById.get(action.actorMemberId),
          decision: action.decision,
          decidedAt: action.decidedAt,
          comment: action.comment,
        })),
      }));
    });
  }
}
