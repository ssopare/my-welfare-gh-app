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
        const bucket = months.find(
          (m) => postedAt >= m.start && postedAt <= m.end,
        );
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

  // The audit trail for the one place this app asks you to just trust a
  // human: recordContributionPayment lets an admin/treasurer attest "I
  // personally collected this," with nothing independently confirming it
  // (unlike a real Paystack-verified payment, tagged 'contribution_payment'
  // rather than 'contribution_payment_manual' — see
  // ObligationService.recordContributionPaymentInTx). This report doesn't
  // change who's allowed to do that; it just makes every instance of it
  // visible — who recorded what, for whom, and when — rather than leaving
  // it buried in raw ledger data only findable by someone who already
  // knows to go look.
  async manualPaymentsReport(actor: AuthTokenPayload, from?: Date, to?: Date) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const lines = await tx.journalLine.findMany({
        where: {
          obligationId: { not: null },
          ledgerAccount: { name: 'Contributions Income' },
          journalEntry: {
            sourceType: 'contribution_payment_manual',
            ...(from || to
              ? {
                  postedAt: {
                    ...(from ? { gte: from } : {}),
                    ...(to ? { lte: to } : {}),
                  },
                }
              : {}),
          },
        },
        select: {
          credit: true,
          journalEntry: {
            select: { id: true, postedAt: true, createdBy: true },
          },
          obligation: {
            select: {
              memberId: true,
              contributionPlan: { select: { name: true } },
              member: {
                select: {
                  account: { select: { name: true, phoneNumber: true } },
                },
              },
            },
          },
        },
        orderBy: { journalEntry: { postedAt: 'desc' } },
      });

      const recorderIds = new Set(
        lines.map((line) => line.journalEntry.createdBy),
      );
      const recorders = await tx.member.findMany({
        where: { id: { in: Array.from(recorderIds) } },
        include: { account: { select: { name: true, phoneNumber: true } } },
      });
      const recorderById = new Map(recorders.map((r) => [r.id, r.account]));

      return lines.map((line) => {
        const recorder = recorderById.get(line.journalEntry.createdBy);
        return {
          journalEntryId: line.journalEntry.id,
          postedAt: line.journalEntry.postedAt,
          amountValue: line.credit.toString(),
          memberId: line.obligation!.memberId,
          memberName: line.obligation!.member.account.name,
          memberPhoneNumber: line.obligation!.member.account.phoneNumber,
          planName: line.obligation!.contributionPlan.name,
          recordedByMemberId: line.journalEntry.createdBy,
          recordedByName: recorder?.name ?? null,
          recordedByPhoneNumber: recorder?.phoneNumber ?? null,
        };
      });
    });
  }

  // Phase A of the advanced reporting spec — formal Income & Expenditure
  // Statement. Sums every INCOME/EXPENSE account's net movement within
  // [from, to] (credit-debit for INCOME's credit-normal balance,
  // debit-credit for EXPENSE's debit-normal balance) — nothing here reads
  // Obligation/Claim running totals, only JournalLine, same principle as
  // every other report in this file. Fund transfers (LedgerService.
  // transferBetweenFunds) post against Fund Equity, never an INCOME/
  // EXPENSE account, so they're excluded automatically here with no
  // special-casing — exactly the spec's "must not treat transfers between
  // internal welfare funds as external income or expenditure" requirement.
  async incomeExpenditureStatement(
    actor: AuthTokenPayload,
    params: { fundId?: string; from: Date; to: Date },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const accounts = await tx.ledgerAccount.findMany({
        where: {
          type: { in: ['INCOME', 'EXPENSE'] },
          ...(params.fundId ? { fundId: params.fundId } : {}),
        },
        include: {
          journalLines: {
            where: {
              journalEntry: { postedAt: { gte: params.from, lte: params.to } },
            },
            select: { debit: true, credit: true },
          },
        },
      });

      const incomeLines: {
        ledgerAccountId: string;
        accountName: string;
        amount: string;
      }[] = [];
      const expenseLines: {
        ledgerAccountId: string;
        accountName: string;
        amount: string;
      }[] = [];
      let totalIncome = new Prisma.Decimal(0);
      let totalExpense = new Prisma.Decimal(0);

      for (const account of accounts) {
        const debit = account.journalLines.reduce(
          (sum, line) => sum.plus(line.debit),
          new Prisma.Decimal(0),
        );
        const credit = account.journalLines.reduce(
          (sum, line) => sum.plus(line.credit),
          new Prisma.Decimal(0),
        );
        if (account.type === 'INCOME') {
          const amount = credit.minus(debit);
          incomeLines.push({
            ledgerAccountId: account.id,
            accountName: account.name,
            amount: amount.toString(),
          });
          totalIncome = totalIncome.plus(amount);
        } else {
          const amount = debit.minus(credit);
          expenseLines.push({
            ledgerAccountId: account.id,
            accountName: account.name,
            amount: amount.toString(),
          });
          totalExpense = totalExpense.plus(amount);
        }
      }

      // Accumulated fund (opening/closing) is the EQUITY balance at the
      // period's edges — same single-pass running-balance technique as
      // fundPositionTrend above.
      const equityAccountIds = (
        await tx.ledgerAccount.findMany({
          where: {
            type: 'EQUITY',
            ...(params.fundId ? { fundId: params.fundId } : {}),
          },
          select: { id: true },
        })
      ).map((a) => a.id);
      const equityLines = await tx.journalLine.findMany({
        where: { ledgerAccountId: { in: equityAccountIds } },
        select: {
          debit: true,
          credit: true,
          journalEntry: { select: { postedAt: true } },
        },
        orderBy: { journalEntry: { postedAt: 'asc' } },
      });
      const equityBalanceAsOf = (cutoff: Date): Prisma.Decimal => {
        let balance = new Prisma.Decimal(0);
        for (const line of equityLines) {
          if (line.journalEntry.postedAt > cutoff) break;
          balance = balance.plus(line.credit).minus(line.debit);
        }
        return balance;
      };
      const openingAccumulatedFund = equityBalanceAsOf(
        new Date(params.from.getTime() - 1),
      );
      const closingAccumulatedFund = equityBalanceAsOf(params.to);

      return {
        incomeLines,
        expenseLines,
        totalIncome: totalIncome.toString(),
        totalExpense: totalExpense.toString(),
        surplusOrDeficit: totalIncome.minus(totalExpense).toString(),
        openingAccumulatedFund: openingAccumulatedFund.toString(),
        closingAccumulatedFund: closingAccumulatedFund.toString(),
      };
    });
  }

  // Trial Balance — every account's net balance, shown on whichever side
  // (debit/credit) it actually falls on rather than assumed from its
  // type, so a genuine imbalance or an account sitting on its "wrong"
  // side stays visible instead of being silently forced into a column.
  // totalDebit/totalCredit should always agree, since every JournalEntry
  // is balance-checked before insert (LedgerService.postJournalEntryInTx)
  // — `balanced` makes that an explicit, checkable fact in the response
  // rather than an assumption.
  async trialBalance(
    actor: AuthTokenPayload,
    params: { asOf?: Date; fundId?: string },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    const asOf = params.asOf ?? new Date();
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const accounts = await tx.ledgerAccount.findMany({
        where: params.fundId ? { fundId: params.fundId } : {},
        include: {
          journalLines: {
            where: { journalEntry: { postedAt: { lte: asOf } } },
            select: { debit: true, credit: true },
          },
          fund: { select: { name: true } },
        },
        orderBy: [{ fund: { name: 'asc' } }, { type: 'asc' }, { name: 'asc' }],
      });

      let totalDebit = new Prisma.Decimal(0);
      let totalCredit = new Prisma.Decimal(0);
      const rows = accounts.map((account) => {
        const debitSum = account.journalLines.reduce(
          (sum, line) => sum.plus(line.debit),
          new Prisma.Decimal(0),
        );
        const creditSum = account.journalLines.reduce(
          (sum, line) => sum.plus(line.credit),
          new Prisma.Decimal(0),
        );
        const net = debitSum.minus(creditSum);
        const debitBalance = net.greaterThan(0) ? net : new Prisma.Decimal(0);
        const creditBalance = net.lessThan(0)
          ? net.negated()
          : new Prisma.Decimal(0);
        totalDebit = totalDebit.plus(debitBalance);
        totalCredit = totalCredit.plus(creditBalance);
        return {
          ledgerAccountId: account.id,
          accountName: account.name,
          accountType: account.type,
          fundName: account.fund.name,
          debitBalance: debitBalance.toString(),
          creditBalance: creditBalance.toString(),
        };
      });

      return {
        asOf: asOf.toISOString(),
        accounts: rows,
        totalDebit: totalDebit.toString(),
        totalCredit: totalCredit.toString(),
        balanced: totalDebit.equals(totalCredit),
      };
    });
  }

  // General Ledger — every line posted to one account, in order, with a
  // running balance either side of [from, to]. Opening balance folds in
  // everything before `from`; closing balance is the running total after
  // the last in-range line, which (with no `from`/`to` at all) reduces to
  // exactly what getLedgerAccountBalance already returns for the same
  // account — the e2e test cross-checks against that proven endpoint the
  // same way fundPositionTrend's own test does.
  async generalLedger(
    actor: AuthTokenPayload,
    ledgerAccountId: string,
    params: { from?: Date; to?: Date },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const account = await tx.ledgerAccount.findUnique({
        where: { id: ledgerAccountId },
        include: { fund: { select: { name: true } } },
      });
      if (!account) {
        throw new NotFoundException('Ledger account not found');
      }

      const allLines = await tx.journalLine.findMany({
        where: { ledgerAccountId },
        select: {
          debit: true,
          credit: true,
          journalEntry: {
            select: {
              id: true,
              postedAt: true,
              description: true,
              sourceType: true,
              reversalOfId: true,
            },
          },
        },
        orderBy: { journalEntry: { postedAt: 'asc' } },
      });

      let openingBalance = new Prisma.Decimal(0);
      const inRangeLines: typeof allLines = [];
      for (const line of allLines) {
        const postedAt = line.journalEntry.postedAt;
        if (params.from && postedAt < params.from) {
          openingBalance = openingBalance.plus(line.debit).minus(line.credit);
        } else if (params.to && postedAt > params.to) {
          continue;
        } else {
          inRangeLines.push(line);
        }
      }

      let runningBalance = openingBalance;
      const entries = inRangeLines.map((line) => {
        runningBalance = runningBalance.plus(line.debit).minus(line.credit);
        return {
          journalEntryId: line.journalEntry.id,
          date: line.journalEntry.postedAt,
          description: line.journalEntry.description,
          sourceType: line.journalEntry.sourceType,
          isReversal: line.journalEntry.reversalOfId !== null,
          debit: line.debit.toString(),
          credit: line.credit.toString(),
          runningBalance: runningBalance.toString(),
        };
      });

      return {
        ledgerAccountId: account.id,
        accountName: account.name,
        accountType: account.type,
        fundName: account.fund.name,
        openingBalance: openingBalance.toString(),
        entries,
        closingBalance: runningBalance.toString(),
      };
    });
  }

  // Advanced reporting Phase B §33 — Advance Contributions. Member.
  // creditBalance is already the real, actively-written figure
  // (ObligationService.recordContributionPaymentInTx parks a monthly
  // overshoot there); this just surfaces every member currently carrying
  // one, alongside their next open obligation so a reader can see what
  // the credit will cover.
  async advanceContributions(actor: AuthTokenPayload) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const members = await tx.member.findMany({
        where: { creditBalance: { gt: 0 } },
        include: { account: { select: { phoneNumber: true, name: true } } },
        orderBy: { creditBalance: 'desc' },
      });

      const rows = await Promise.all(
        members.map(async (member) => {
          const nextObligation = await tx.obligation.findFirst({
            where: {
              memberId: member.id,
              status: { in: [...OPEN_OBLIGATION_STATUSES] },
            },
            include: { contributionPlan: { select: { name: true } } },
            orderBy: { dueDate: 'asc' },
          });
          return {
            memberId: member.id,
            phoneNumber: member.account.phoneNumber,
            name: member.account.name,
            creditBalance: member.creditBalance.toString(),
            nextObligation: nextObligation
              ? {
                  obligationId: nextObligation.id,
                  planName: nextObligation.contributionPlan.name,
                  dueDate: nextObligation.dueDate,
                  amountOutstanding: new Prisma.Decimal(
                    nextObligation.amountValue,
                  )
                    .minus(nextObligation.amountPaid)
                    .toString(),
                }
              : null,
          };
        }),
      );
      return rows;
    });
  }

  // Advanced reporting Phase B §34 — Arrears Allocation. Distinguishes
  // the contribution *period* a payment was for (Obligation.dueDate) from
  // the date cash actually arrived (JournalEntry.postedAt on that same
  // line) — both already-populated fields, joined rather than tracked
  // anew. daysLate stays 0 (never negative) for on-time or advance
  // payments so an early payer never reads as "late".
  async arrearsAllocation(
    actor: AuthTokenPayload,
    params: { memberId?: string },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const lines = await tx.journalLine.findMany({
        where: {
          obligationId: { not: null },
          memberId: params.memberId ? params.memberId : { not: null },
          ledgerAccount: { name: 'Contributions Income' },
        },
        include: {
          journalEntry: { select: { postedAt: true } },
          obligation: { select: { dueDate: true } },
        },
        orderBy: { journalEntry: { postedAt: 'desc' } },
      });

      // JournalLine.memberId is a plain FK with no declared Prisma
      // relation (same reason disbursementReport batches actor phone
      // numbers separately) — one batched lookup instead of a nested
      // include.
      const memberIds = Array.from(
        new Set(lines.map((l) => l.memberId as string)),
      );
      const members = await tx.member.findMany({
        where: { id: { in: memberIds } },
        include: { account: { select: { phoneNumber: true } } },
      });
      const phoneByMemberId = new Map(
        members.map((m) => [m.id, m.account.phoneNumber]),
      );

      return lines
        .filter((line) => line.obligation)
        .map((line) => {
          const contributionPeriod = line.obligation!.dueDate;
          const cashCollectionDate = line.journalEntry.postedAt;
          const daysLate = Math.max(
            0,
            Math.floor(
              (cashCollectionDate.getTime() - contributionPeriod.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          );
          return {
            memberId: line.memberId as string,
            phoneNumber: phoneByMemberId.get(line.memberId as string),
            obligationId: line.obligationId as string,
            contributionPeriod,
            cashCollectionDate,
            amount: line.credit.toString(),
            daysLate,
          };
        });
    });
  }

  // Advanced reporting Phase B §35 — Benefit Expenditure Analytics. Every
  // Claim at every lifecycle stage, not just PAID ones (unlike
  // disbursementReport), grouped by benefit type. A claim's status is
  // enough to place it: ClaimService only ever sets journalEntryId in the
  // same write that flips status to PAID (see claim.service.ts's
  // disburse step), so an APPROVED claim is always still-unpaid/committed
  // — no separate "committedUnpaid" bucket needed alongside it.
  async benefitExpenditureAnalytics(
    actor: AuthTokenPayload,
    params: { from?: Date; to?: Date },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const claims = await tx.claim.findMany({
        where: {
          ...(params.from || params.to
            ? {
                eventDate: {
                  ...(params.from ? { gte: params.from } : {}),
                  ...(params.to ? { lte: params.to } : {}),
                },
              }
            : {}),
        },
        include: { benefitRule: { select: { name: true } } },
      });

      interface Group {
        benefitRuleId: string;
        benefitName: string;
        totalPaid: Prisma.Decimal;
        beneficiaryIds: Set<string>;
        paidCount: number;
        submitted: number;
        approved: number;
        rejected: number;
        paid: number;
      }
      const groups = new Map<string, Group>();
      for (const claim of claims) {
        let group = groups.get(claim.benefitRuleId);
        if (!group) {
          group = {
            benefitRuleId: claim.benefitRuleId,
            benefitName: claim.benefitRule.name,
            totalPaid: new Prisma.Decimal(0),
            beneficiaryIds: new Set(),
            paidCount: 0,
            submitted: 0,
            approved: 0,
            rejected: 0,
            paid: 0,
          };
          groups.set(claim.benefitRuleId, group);
        }
        if (claim.status === 'PAID') {
          group.totalPaid = group.totalPaid.plus(claim.amountValue);
          group.beneficiaryIds.add(claim.memberId);
          group.paidCount += 1;
          group.paid += 1;
        } else if (claim.status === 'SUBMITTED') {
          group.submitted += 1;
        } else if (claim.status === 'APPROVED') {
          group.approved += 1;
        } else {
          group.rejected += 1;
        }
      }

      const byBenefitType = Array.from(groups.values()).map((group) => ({
        benefitRuleId: group.benefitRuleId,
        benefitName: group.benefitName,
        totalPaid: group.totalPaid.toString(),
        beneficiaryCount: group.beneficiaryIds.size,
        averageBenefit:
          group.paidCount > 0
            ? group.totalPaid.dividedBy(group.paidCount).toString()
            : '0',
        statusCounts: {
          submitted: group.submitted,
          approved: group.approved,
          rejected: group.rejected,
          paid: group.paid,
        },
      }));

      const totalBenefitsPaid = byBenefitType.reduce(
        (sum, g) => sum.plus(g.totalPaid),
        new Prisma.Decimal(0),
      );

      // Same credit-normal net-movement logic as incomeExpenditureStatement,
      // over the same optional date range, for an honest denominator —
      // never a stored, independently-editable "contribution income"
      // figure.
      const incomeAccounts = await tx.ledgerAccount.findMany({
        where: { name: 'Contributions Income' },
        include: {
          journalLines: {
            where:
              params.from || params.to
                ? {
                    journalEntry: {
                      postedAt: {
                        ...(params.from ? { gte: params.from } : {}),
                        ...(params.to ? { lte: params.to } : {}),
                      },
                    },
                  }
                : {},
            select: { debit: true, credit: true },
          },
        },
      });
      const totalContributionIncome = incomeAccounts.reduce(
        (sum, account) =>
          sum.plus(
            account.journalLines.reduce(
              (lineSum, line) => lineSum.plus(line.credit).minus(line.debit),
              new Prisma.Decimal(0),
            ),
          ),
        new Prisma.Decimal(0),
      );

      return {
        byBenefitType,
        totalBenefitsPaid: totalBenefitsPaid.toString(),
        totalContributionIncome: totalContributionIncome.toString(),
        benefitsAsPercentOfIncome: totalContributionIncome.isZero()
          ? null
          : totalBenefitsPaid
              .dividedBy(totalContributionIncome)
              .times(100)
              .toDecimalPlaces(2)
              .toString(),
      };
    });
  }

  // Advanced reporting Phase B §36-37 — Management Ratios & Financial
  // Health. Every ratio here is computed fresh from the same
  // Obligation/JournalLine/Claim rows every other report in this file
  // reads — nothing new tracked. A ratio whose denominator is genuinely
  // zero returns null rather than an infinite/fabricated percentage; the
  // health verdict is a documented, fixed threshold table (not yet
  // admin-configurable — a real follow-up, noted rather than silently
  // pretended). expenseRatio/administrativeCostRatio are omitted outright
  // with a notAvailable note: both assume a distinct administrative-
  // expense ledger account this system's standard chart doesn't have
  // (see FundService.STANDARD_CHART_OF_ACCOUNTS) — reusing Benefits
  // Expense for them would silently misreport benefit payouts as
  // administrative overhead.
  async managementRatiosAndHealth(
    actor: AuthTokenPayload,
    params: { from: Date; to: Date },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const { from, to } = params;

      const obligations = await tx.obligation.findMany({
        where: { dueDate: { gte: from, lte: to } },
        select: { amountValue: true, amountPaid: true },
      });
      const expectedTotal = obligations.reduce(
        (sum, o) => sum.plus(o.amountValue),
        new Prisma.Decimal(0),
      );
      const collectedTotal = obligations.reduce(
        (sum, o) => sum.plus(o.amountPaid),
        new Prisma.Decimal(0),
      );
      const outstandingTotal = expectedTotal.minus(collectedTotal);
      const collectionRate = expectedTotal.isZero()
        ? null
        : collectedTotal.dividedBy(expectedTotal).times(100).toDecimalPlaces(2);
      const arrearsRate = expectedTotal.isZero()
        ? null
        : outstandingTotal
            .dividedBy(expectedTotal)
            .times(100)
            .toDecimalPlaces(2);

      const incomeInRange = async (rangeFrom: Date, rangeTo: Date) => {
        const accounts = await tx.ledgerAccount.findMany({
          where: { name: 'Contributions Income' },
          include: {
            journalLines: {
              where: {
                journalEntry: { postedAt: { gte: rangeFrom, lte: rangeTo } },
              },
              select: { debit: true, credit: true },
            },
          },
        });
        return accounts.reduce(
          (sum, account) =>
            sum.plus(
              account.journalLines.reduce(
                (lineSum, line) => lineSum.plus(line.credit).minus(line.debit),
                new Prisma.Decimal(0),
              ),
            ),
          new Prisma.Decimal(0),
        );
      };
      const totalContributionIncome = await incomeInRange(from, to);

      const paidClaims = await tx.claim.findMany({
        where: {
          status: 'PAID',
          journalEntry: { postedAt: { gte: from, lte: to } },
        },
        select: { amountValue: true },
      });
      const totalBenefitsPaid = paidClaims.reduce(
        (sum, c) => sum.plus(c.amountValue),
        new Prisma.Decimal(0),
      );
      const benefitPayoutRatio = totalContributionIncome.isZero()
        ? null
        : totalBenefitsPaid
            .dividedBy(totalContributionIncome)
            .times(100)
            .toDecimalPlaces(2);

      const cashAccounts = await tx.ledgerAccount.findMany({
        where: { type: 'ASSET' },
        include: { journalLines: { select: { debit: true, credit: true } } },
      });
      const currentCashBalance = cashAccounts.reduce(
        (sum, account) =>
          sum.plus(
            account.journalLines.reduce(
              (lineSum, line) => lineSum.plus(line.debit).minus(line.credit),
              new Prisma.Decimal(0),
            ),
          ),
        new Prisma.Decimal(0),
      );
      const fundUtilisationRate = currentCashBalance.isZero()
        ? null
        : totalBenefitsPaid
            .dividedBy(currentCashBalance)
            .times(100)
            .toDecimalPlaces(2);

      // Immediately preceding period of the same length, for a genuine
      // period-over-period comparison rather than an arbitrary lookback.
      const durationMs = to.getTime() - from.getTime();
      const previousTo = new Date(from.getTime() - 1);
      const previousFrom = new Date(previousTo.getTime() - durationMs);
      const previousContributionIncome = await incomeInRange(
        previousFrom,
        previousTo,
      );
      const growthRate = previousContributionIncome.isZero()
        ? null
        : totalContributionIncome
            .minus(previousContributionIncome)
            .dividedBy(previousContributionIncome)
            .times(100)
            .toDecimalPlaces(2);

      // Reporting Phase C: expenseRatio/administrativeCostRatio stay null
      // until the org has explicitly created at least one isAdministrative
      // account (FundService.createAccount) — the gate is "does this
      // category exist," not "does it have a balance," so a freshly
      // created administrative account with zero postings still turns the
      // ratio on (as '0'), never a fabricated number for an org that never
      // asked to separate admin cost from benefit cost.
      const expenseAccounts = await tx.ledgerAccount.findMany({
        where: { type: 'EXPENSE' },
        include: {
          journalLines: {
            where: { journalEntry: { postedAt: { gte: from, lte: to } } },
            select: { debit: true, credit: true },
          },
        },
      });
      const netMovement = (account: (typeof expenseAccounts)[number]) =>
        account.journalLines.reduce(
          (sum, line) => sum.plus(line.debit).minus(line.credit),
          new Prisma.Decimal(0),
        );
      const hasAdministrativeAccount = expenseAccounts.some(
        (a) => a.isAdministrative,
      );
      const totalExpenses = expenseAccounts.reduce(
        (sum, a) => sum.plus(netMovement(a)),
        new Prisma.Decimal(0),
      );
      const adminExpenses = expenseAccounts
        .filter((a) => a.isAdministrative)
        .reduce((sum, a) => sum.plus(netMovement(a)), new Prisma.Decimal(0));
      const expenseRatio =
        hasAdministrativeAccount && !totalContributionIncome.isZero()
          ? totalExpenses
              .dividedBy(totalContributionIncome)
              .times(100)
              .toDecimalPlaces(2)
          : null;
      const administrativeCostRatio =
        hasAdministrativeAccount && !totalContributionIncome.isZero()
          ? adminExpenses
              .dividedBy(totalContributionIncome)
              .times(100)
              .toDecimalPlaces(2)
          : null;

      let financialHealth: 'Healthy' | 'Watch' | 'At Risk' | 'Critical';
      let reason: string;
      if (collectionRate === null || arrearsRate === null) {
        financialHealth = 'Watch';
        reason =
          'No obligations fell due in this period, so collection and arrears rates cannot be assessed.';
      } else {
        const collectionRateStr = collectionRate.toString();
        const arrearsRateStr = arrearsRate.toString();
        if (
          collectionRate.greaterThanOrEqualTo(90) &&
          arrearsRate.lessThanOrEqualTo(10)
        ) {
          financialHealth = 'Healthy';
          reason = `Collection rate ${collectionRateStr}% and arrears rate ${arrearsRateStr}% are within healthy thresholds (>=90% collected, <=10% arrears).`;
        } else if (
          collectionRate.greaterThanOrEqualTo(75) &&
          arrearsRate.lessThanOrEqualTo(25)
        ) {
          financialHealth = 'Watch';
          reason = `Collection rate ${collectionRateStr}% and arrears rate ${arrearsRateStr}% are below healthy thresholds but not yet critical (>=75% collected, <=25% arrears).`;
        } else if (
          collectionRate.greaterThanOrEqualTo(50) &&
          arrearsRate.lessThanOrEqualTo(50)
        ) {
          financialHealth = 'At Risk';
          reason = `Collection rate ${collectionRateStr}% and arrears rate ${arrearsRateStr}% indicate significant strain (>=50% collected, <=50% arrears).`;
        } else {
          financialHealth = 'Critical';
          reason = `Collection rate ${collectionRateStr}% and arrears rate ${arrearsRateStr}% are below the minimum sustainable thresholds (<50% collected or >50% arrears).`;
        }
      }

      return {
        from: from.toISOString(),
        to: to.toISOString(),
        collectionRate: collectionRate?.toString() ?? null,
        arrearsRate: arrearsRate?.toString() ?? null,
        benefitPayoutRatio: benefitPayoutRatio?.toString() ?? null,
        fundUtilisationRate: fundUtilisationRate?.toString() ?? null,
        growthRate: growthRate?.toString() ?? null,
        expenseRatio: expenseRatio?.toString() ?? null,
        administrativeCostRatio: administrativeCostRatio?.toString() ?? null,
        notAvailable: hasAdministrativeAccount
          ? null
          : 'Expense Ratio and Administrative Cost Ratio need at least one ledger account explicitly flagged administrative (see Chart of Accounts → New account) — none exists for this organisation yet.',
        financialHealth,
        reason,
      };
    });
  }

  // Advanced reporting Phase C §10 — Cash Flow Statement. Every Cash
  // (ASSET) account's JournalLines carry one of a handful of sourceTypes
  // today (see obligation.service.ts, claim.service.ts, ledger.service.ts,
  // payout.service.ts): 'contribution_payment'/'contribution_payment_manual'
  // (always a debit to Cash — verified vs admin-attested, see
  // ObligationService.recordContributionPaymentInTx, irrelevant to cash
  // flow itself since both are real cash movements), 'benefit_disbursement'
  // and 'auto_disbursement' (always a credit — cash leaving to a benefit
  // payout or an org's own auto-disbursed settlement, respectively),
  // 'fund_transfer' (either, depending on direction). Operating =
  // contributions/benefits/auto-disbursements; Financing = fund movements
  // between this org's own funds; Investing is always zero because nothing
  // in this system posts an investing-activity entry yet — an honest
  // absence, not a hidden feature. closingCash sums every line up to `to`
  // directly (the same running-balance technique as
  // getLedgerAccountBalance), independently of these sourceType buckets,
  // so `reconciles` is a genuine cross-check that would catch a future
  // sourceType this method doesn't yet categorize (it would still count
  // toward closingCash but fall into no bucket), not a tautology.
  async cashFlowStatement(
    actor: AuthTokenPayload,
    params: { fundId?: string; from: Date; to: Date },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const cashAccounts = await tx.ledgerAccount.findMany({
        where: {
          name: 'Cash',
          ...(params.fundId ? { fundId: params.fundId } : {}),
        },
        select: { id: true },
      });
      const cashAccountIds = cashAccounts.map((a) => a.id);

      const lines = await tx.journalLine.findMany({
        where: { ledgerAccountId: { in: cashAccountIds } },
        select: {
          debit: true,
          credit: true,
          journalEntry: { select: { postedAt: true, sourceType: true } },
        },
        orderBy: { journalEntry: { postedAt: 'asc' } },
      });

      let openingCash = new Prisma.Decimal(0);
      let closingCash = new Prisma.Decimal(0);
      let operatingIn = new Prisma.Decimal(0);
      let operatingOut = new Prisma.Decimal(0);
      let financingIn = new Prisma.Decimal(0);
      let financingOut = new Prisma.Decimal(0);

      for (const line of lines) {
        const postedAt = line.journalEntry.postedAt;
        if (postedAt < params.from) {
          openingCash = openingCash.plus(line.debit).minus(line.credit);
        }
        if (postedAt <= params.to) {
          closingCash = closingCash.plus(line.debit).minus(line.credit);
        }
        if (postedAt >= params.from && postedAt <= params.to) {
          const sourceType = line.journalEntry.sourceType;
          if (
            sourceType === 'contribution_payment' ||
            sourceType === 'contribution_payment_manual'
          ) {
            operatingIn = operatingIn.plus(line.debit);
          } else if (
            sourceType === 'benefit_disbursement' ||
            sourceType === 'auto_disbursement'
          ) {
            operatingOut = operatingOut.plus(line.credit);
          } else if (sourceType === 'fund_transfer') {
            financingIn = financingIn.plus(line.debit);
            financingOut = financingOut.plus(line.credit);
          }
        }
      }

      const netCashMovement = closingCash.minus(openingCash);
      const bucketedMovement = operatingIn
        .minus(operatingOut)
        .plus(financingIn)
        .minus(financingOut);

      return {
        fundId: params.fundId ?? null,
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        operating: {
          inflow: operatingIn.toString(),
          outflow: operatingOut.toString(),
          net: operatingIn.minus(operatingOut).toString(),
        },
        financing: {
          inflow: financingIn.toString(),
          outflow: financingOut.toString(),
          net: financingIn.minus(financingOut).toString(),
        },
        investing: {
          inflow: '0',
          outflow: '0',
          net: '0',
          note: 'No investing-activity account type exists in this system yet.',
        },
        openingCash: openingCash.toString(),
        closingCash: closingCash.toString(),
        netCashMovement: netCashMovement.toString(),
        reconciles: netCashMovement.equals(bucketedMovement),
      };
    });
  }

  // Advanced reporting Phase C §11 — Fund Position Report. Per-fund
  // figures use only what's genuinely fund-scoped in this data model:
  // Fund Equity (opening/closing), that fund's INCOME/EXPENSE accounts,
  // Fund Equity's own fund_transfer lines, Cash, and Benefits Payable.
  // Committed-but-unpaid benefits (an APPROVED claim with no
  // journalEntryId yet) are shown as one organisation-wide figure, not
  // per fund, because Claim.journalEntryId — and therefore which fund it
  // will actually draw from — is only decided at disbursement time, not
  // at approval time. Attributing it to a fund ahead of that would be a
  // guess, not a fact, so it isn't.
  async fundPositionReport(
    actor: AuthTokenPayload,
    params: { from: Date; to: Date },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const funds = await tx.fund.findMany({
        include: { ledgerAccounts: true },
      });
      const allAccountIds = funds.flatMap((f) =>
        f.ledgerAccounts.map((a) => a.id),
      );

      const allLines = await tx.journalLine.findMany({
        where: { ledgerAccountId: { in: allAccountIds } },
        select: {
          ledgerAccountId: true,
          debit: true,
          credit: true,
          journalEntry: { select: { postedAt: true, sourceType: true } },
        },
      });
      const linesByAccount = new Map<string, typeof allLines>();
      for (const line of allLines) {
        const bucket = linesByAccount.get(line.ledgerAccountId);
        if (bucket) bucket.push(line);
        else linesByAccount.set(line.ledgerAccountId, [line]);
      }

      const balanceAsOf = (accountId: string, cutoff: Date): Prisma.Decimal =>
        (linesByAccount.get(accountId) ?? []).reduce(
          (sum, line) =>
            line.journalEntry.postedAt <= cutoff
              ? sum.plus(line.debit).minus(line.credit)
              : sum,
          new Prisma.Decimal(0),
        );

      const rows = funds.map((fund) => {
        const findAccount = (name: string) =>
          fund.ledgerAccounts.find((a) => a.name === name);
        const equity = findAccount('Fund Equity');
        const cash = findAccount('Cash');
        const payable = findAccount('Benefits Payable');

        const openingFundBalance = equity
          ? balanceAsOf(equity.id, new Date(params.from.getTime() - 1))
          : new Prisma.Decimal(0);
        const closingFundBalance = equity
          ? balanceAsOf(equity.id, params.to)
          : new Prisma.Decimal(0);

        let income = new Prisma.Decimal(0);
        let expenses = new Prisma.Decimal(0);
        for (const account of fund.ledgerAccounts) {
          if (account.type !== 'INCOME' && account.type !== 'EXPENSE') continue;
          const lines = (linesByAccount.get(account.id) ?? []).filter(
            (l) =>
              l.journalEntry.postedAt >= params.from &&
              l.journalEntry.postedAt <= params.to,
          );
          const debit = lines.reduce(
            (s, l) => s.plus(l.debit),
            new Prisma.Decimal(0),
          );
          const credit = lines.reduce(
            (s, l) => s.plus(l.credit),
            new Prisma.Decimal(0),
          );
          if (account.type === 'INCOME')
            income = income.plus(credit.minus(debit));
          else expenses = expenses.plus(debit.minus(credit));
        }

        let transfersIn = new Prisma.Decimal(0);
        let transfersOut = new Prisma.Decimal(0);
        if (equity) {
          const transferLines = (linesByAccount.get(equity.id) ?? []).filter(
            (l) =>
              l.journalEntry.sourceType === 'fund_transfer' &&
              l.journalEntry.postedAt >= params.from &&
              l.journalEntry.postedAt <= params.to,
          );
          transfersIn = transferLines.reduce(
            (s, l) => s.plus(l.credit),
            new Prisma.Decimal(0),
          );
          transfersOut = transferLines.reduce(
            (s, l) => s.plus(l.debit),
            new Prisma.Decimal(0),
          );
        }

        return {
          fundId: fund.id,
          fundName: fund.name,
          openingFundBalance: openingFundBalance.toString(),
          income: income.toString(),
          expenses: expenses.toString(),
          transfersIn: transfersIn.toString(),
          transfersOut: transfersOut.toString(),
          surplusOrDeficit: income.minus(expenses).toString(),
          closingFundBalance: closingFundBalance.toString(),
          cashAvailable: cash
            ? balanceAsOf(cash.id, params.to).toString()
            : '0',
          payables: payable
            ? balanceAsOf(payable.id, params.to).toString()
            : '0',
        };
      });

      const totalCashAvailable = rows.reduce(
        (sum, row) => sum.plus(row.cashAvailable),
        new Prisma.Decimal(0),
      );
      const committedClaims = await tx.claim.findMany({
        where: { status: 'APPROVED', journalEntryId: null },
        select: { amountValue: true },
      });
      const totalCommittedBenefits = committedClaims.reduce(
        (sum, c) => sum.plus(c.amountValue),
        new Prisma.Decimal(0),
      );

      return {
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        funds: rows,
        organisationSummary: {
          totalCashAvailable: totalCashAvailable.toString(),
          totalCommittedBenefits: totalCommittedBenefits.toString(),
          availableUncommittedFunds: totalCashAvailable
            .minus(totalCommittedBenefits)
            .toString(),
          note: 'Committed benefits cannot be attributed to a single fund — the disbursing fund is chosen at payment time, not at approval time — so this figure is organisation-wide, not per fund.',
        },
      };
    });
  }

  // Advanced reporting Phase C §35 — Refunds and Reversals.
  // LedgerService.reverseJournalEntry already sets reversalOfId and folds
  // the reason into the reversing entry's description — this is a report
  // over data that already exists, not a new reversal mechanism. The
  // Gross/Net Collection summary is scoped to Contributions Income
  // specifically, matching the spec's own wording.
  async reversalsAndAdjustments(
    actor: AuthTokenPayload,
    params: { from: Date; to: Date },
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const reversals = await tx.journalEntry.findMany({
        where: {
          reversalOfId: { not: null },
          postedAt: { gte: params.from, lte: params.to },
        },
        include: {
          lines: { select: { debit: true, credit: true } },
          reversalOf: {
            select: {
              id: true,
              description: true,
              postedAt: true,
              sourceType: true,
            },
          },
        },
        orderBy: { postedAt: 'desc' },
      });

      const rows = reversals.map((entry) => ({
        journalEntryId: entry.id,
        postedAt: entry.postedAt,
        description: entry.description,
        sourceType: entry.sourceType,
        amount: entry.lines
          .reduce((sum, l) => sum.plus(l.debit), new Prisma.Decimal(0))
          .toString(),
        originalEntryId: entry.reversalOf?.id ?? null,
        originalDescription: entry.reversalOf?.description ?? null,
        originalPostedAt: entry.reversalOf?.postedAt ?? null,
      }));

      const incomeAccounts = await tx.ledgerAccount.findMany({
        where: { name: 'Contributions Income' },
        select: { id: true },
      });
      const incomeAccountIds = incomeAccounts.map((a) => a.id);
      const incomeLines = await tx.journalLine.findMany({
        where: {
          ledgerAccountId: { in: incomeAccountIds },
          journalEntry: { postedAt: { gte: params.from, lte: params.to } },
        },
        select: {
          debit: true,
          credit: true,
          journalEntry: { select: { reversalOfId: true, sourceType: true } },
        },
      });
      const grossCollection = incomeLines.reduce(
        (sum, l) => sum.plus(l.credit),
        new Prisma.Decimal(0),
      );
      // A reversal of a credit-normal Contributions Income posting books
      // as a debit on this same account — the contra side of the
      // original credit — so reversalsTotal sums debits, not credits.
      const reversalsTotal = incomeLines
        .filter(
          (l) =>
            l.journalEntry.reversalOfId !== null &&
            // A reversal entry inherits its original's sourceType (see
            // LedgerService.reverseJournalEntry) — verified or manually
            // recorded originally, still a contribution reversal either way.
            (l.journalEntry.sourceType === 'contribution_payment' ||
              l.journalEntry.sourceType === 'contribution_payment_manual'),
        )
        .reduce((sum, l) => sum.plus(l.debit), new Prisma.Decimal(0));

      return {
        from: params.from.toISOString(),
        to: params.to.toISOString(),
        reversals: rows,
        grossCollection: grossCollection.toString(),
        reversalsTotal: reversalsTotal.toString(),
        netCollection: grossCollection.minus(reversalsTotal).toString(),
      };
    });
  }
}
