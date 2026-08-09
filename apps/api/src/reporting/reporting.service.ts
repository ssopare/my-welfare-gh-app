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
      }[] = [];

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
          const arrears = obligations
            .filter((o) => o.contributionPlanId === planId)
            .reduce(
              (sum, o) =>
                sum.plus(new Prisma.Decimal(o.amountValue).minus(o.amountPaid)),
              new Prisma.Decimal(0),
            );
          rows.push({
            memberId: member.id,
            phoneNumber: account?.phoneNumber,
            status: member.status,
            contributionPlanId: planId,
            planName: plan?.name,
            consecutiveMissedCount: missed,
            arrearsOwed: arrears.toString(),
          });
        }
      }
      return rows;
    });
  }

  // "Amounts, beneficiaries, benefit type, approver trail." Every PAID
  // claim already carries everything this needs — the approval chain
  // (ClaimStageAction) and the disbursement posting (JournalEntry) both
  // exist because of how the Claims slice wired those two together, not
  // anything new built for reporting.
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
        },
        orderBy: { createdAt: 'desc' },
      });

      return claims.map((claim) => ({
        claimId: claim.id,
        memberId: claim.memberId,
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
          decision: action.decision,
          decidedAt: action.decidedAt,
          comment: action.comment,
        })),
      }));
    });
  }
}
