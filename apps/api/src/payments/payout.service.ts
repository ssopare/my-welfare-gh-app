import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateSettlementAccountDto } from './dto/create-settlement-account.dto';
import { CreatePayoutRecipientDto } from './dto/create-payout-recipient.dto';
import { CreatePayoutRequestDto } from './dto/create-payout-request.dto';
import { SubmitPayoutApprovalDto } from './dto/submit-payout-approval.dto';
import { UpdateFundControlPolicyDto } from './dto/update-fund-control-policy.dto';
import { randomUUID } from 'node:crypto';

@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly ledger: LedgerService,
  ) {}

  // providerSubaccountCode here is a placeholder, not a real Paystack
  // subaccount — creating/verifying one requires a real call to Paystack's
  // subaccount API, which isn't built yet (settlement/routing is still
  // pending Paystack's own answer on this, per the payments integration
  // notes). verified therefore always starts false: payment.service.ts
  // only passes providerSubaccountCode into a live charge when verified is
  // true, so leaving it false here is what keeps contribution payments
  // routing normally instead of failing against a subaccount code Paystack
  // has never heard of. Flip this to a real verified flag once an actual
  // subaccount-creation call exists.
  async createSettlementAccount(
    organisationId: string,
    dto: CreateSettlementAccountDto,
  ) {
    const subaccountCode = `ACCT_mock_subaccount_${randomUUID().slice(0, 8)}`;
    return this.prisma.withTenant(organisationId, async (tx) => {
      return tx.settlementAccount.upsert({
        where: { organisationId },
        update: {
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          verified: false,
        },
        create: {
          organisationId,
          providerSubaccountCode: subaccountCode,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          verified: false,
        },
      });
    });
  }

  async getSettlementAccount(organisationId: string) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      const account = await tx.settlementAccount.findUnique({
        where: { organisationId },
      });
      if (!account) return null;
      // Mask account number for security in normal API reads
      return {
        ...account,
        accountNumber:
          account.accountNumber.length > 4
            ? account.accountNumber.replace(/.(?=.{4})/g, '*')
            : account.accountNumber,
      };
    });
  }

  async createPayoutRecipient(
    organisationId: string,
    dto: CreatePayoutRecipientDto,
  ) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      return tx.payoutRecipient.create({
        data: {
          organisationId,
          name: dto.name,
          type: dto.type,
          accountNumber: dto.accountNumber,
          bankCode: dto.bankCode,
          isAllowlisted: true,
        },
      });
    });
  }

  async listPayoutRecipients(organisationId: string) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      const recipients = await tx.payoutRecipient.findMany({
        where: { organisationId },
      });
      return recipients.map((r) => ({
        ...r,
        accountNumber:
          r.accountNumber.length > 4
            ? r.accountNumber.replace(/.(?=.{4})/g, '*')
            : r.accountNumber,
      }));
    });
  }

  async updateFundControlPolicy(
    organisationId: string,
    dto: UpdateFundControlPolicyDto,
  ) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      return tx.fundControlPolicy.upsert({
        where: { organisationId },
        update: {
          dailyLimitValue: new Prisma.Decimal(dto.dailyLimitValue),
          monthlyLimitValue: new Prisma.Decimal(dto.monthlyLimitValue),
          thresholdOneApproverValue: new Prisma.Decimal(
            dto.thresholdOneApproverValue,
          ),
          thresholdTwoApproversValue: new Prisma.Decimal(
            dto.thresholdTwoApproversValue,
          ),
        },
        create: {
          organisationId,
          dailyLimitValue: new Prisma.Decimal(dto.dailyLimitValue),
          monthlyLimitValue: new Prisma.Decimal(dto.monthlyLimitValue),
          thresholdOneApproverValue: new Prisma.Decimal(
            dto.thresholdOneApproverValue,
          ),
          thresholdTwoApproversValue: new Prisma.Decimal(
            dto.thresholdTwoApproversValue,
          ),
        },
      });
    });
  }

  async getFundControlPolicy(organisationId: string) {
    return this.prisma.withTenant(organisationId, (tx) =>
      this.getFundControlPolicyInTx(tx, organisationId),
    );
  }

  // Same logic as getFundControlPolicy, for a caller that already has an
  // open tenant transaction — see the comment on
  // LedgerService.getLedgerAccountBalanceInTx for why this avoids a
  // second, independent nested transaction.
  private async getFundControlPolicyInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
  ) {
    const policy = await tx.fundControlPolicy.findUnique({
      where: { organisationId },
    });
    if (policy) return policy;

    // Safe global defaults
    return {
      id: 'default',
      organisationId,
      dailyLimitValue: new Prisma.Decimal('10000.00'),
      monthlyLimitValue: new Prisma.Decimal('50000.00'),
      thresholdOneApproverValue: new Prisma.Decimal('500.00'),
      thresholdTwoApproversValue: new Prisma.Decimal('5000.00'),
    };
  }

  async createPayoutRequest(
    organisationId: string,
    requesterMemberId: string,
    dto: CreatePayoutRequestDto,
  ) {
    const amount = new Prisma.Decimal(dto.amountValue);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.prisma.withTenant(organisationId, async (tx) => {
      // Advisory lock scoped to this org (transaction-scoped, auto-
      // released on commit/rollback) — without it, two concurrent payout
      // requests near the daily/monthly cap (or near the fund's cash
      // balance) can both sum the existing totals before either commits,
      // both pass the limit check below, and jointly exceed the
      // configured cap. Namespaced with a string prefix so this doesn't
      // collide with any unrelated advisory lock added elsewhere later.
      // Other organisations are unaffected — the key is per-tenant.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('payout_requests:' || ${organisationId}))`;

      // 1. Verify recipient exists and is allowlisted
      const recipient = await tx.payoutRecipient.findUnique({
        where: { id: dto.recipientId },
      });
      if (!recipient || recipient.organisationId !== organisationId) {
        throw new NotFoundException('Payout recipient not found');
      }
      if (!recipient.isAllowlisted) {
        throw new BadRequestException(
          'Recipient is not allowlisted for payouts',
        );
      }

      // 2. Verify fund exists and check cash balance
      const fund = await tx.fund.findUnique({
        where: { id: dto.fundId },
      });
      if (!fund || fund.organisationId !== organisationId) {
        throw new NotFoundException('Fund not found');
      }

      const cashAccount = await tx.ledgerAccount.findFirst({
        where: { fundId: dto.fundId, name: 'Cash' },
      });
      if (!cashAccount) {
        throw new NotFoundException(
          'This fund is missing its Cash ledger account',
        );
      }

      const balanceRes = await this.ledger.getLedgerAccountBalanceInTx(
        tx,
        cashAccount.id,
      );
      const balance = new Prisma.Decimal(balanceRes.balance);
      if (balance.lessThan(amount)) {
        throw new BadRequestException(
          `Insufficient fund balance: Available cash is ${balance.toString()} GHS`,
        );
      }

      // 3. Enforce policy limits
      const policy = await this.getFundControlPolicyInTx(tx, organisationId);

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const dailyTotalRes = await tx.payoutRequest.aggregate({
        _sum: { amountValue: true },
        where: {
          organisationId,
          createdAt: { gte: todayStart },
          status: { in: ['PENDING', 'APPROVED', 'SUCCEEDED'] },
        },
      });
      const dailyTotal =
        dailyTotalRes._sum.amountValue || new Prisma.Decimal(0);
      if (dailyTotal.plus(amount).greaterThan(policy.dailyLimitValue)) {
        throw new BadRequestException(
          `Daily payout limit of ${policy.dailyLimitValue.toString()} GHS exceeded`,
        );
      }

      const firstDayOfMonth = new Date(
        Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1),
      );
      const monthlyTotalRes = await tx.payoutRequest.aggregate({
        _sum: { amountValue: true },
        where: {
          organisationId,
          createdAt: { gte: firstDayOfMonth },
          status: { in: ['PENDING', 'APPROVED', 'SUCCEEDED'] },
        },
      });
      const monthlyTotal =
        monthlyTotalRes._sum.amountValue || new Prisma.Decimal(0);
      if (monthlyTotal.plus(amount).greaterThan(policy.monthlyLimitValue)) {
        throw new BadRequestException(
          `Monthly payout limit of ${policy.monthlyLimitValue.toString()} GHS exceeded`,
        );
      }

      // 4. Create payout request in PENDING state
      return tx.payoutRequest.create({
        data: {
          organisationId,
          amountValue: amount,
          currency: dto.currency ?? 'GHS',
          fundId: dto.fundId,
          recipientId: dto.recipientId,
          purpose: dto.purpose,
          requesterId: requesterMemberId,
          status: 'PENDING',
        },
      });
    });
  }

  async approvePayoutRequest(
    organisationId: string,
    officerMemberId: string,
    requestId: string,
    dto: SubmitPayoutApprovalDto,
  ) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      // Row lock: without this, two concurrent approvals on the same
      // payout can both read PENDING + the same approvals snapshot before
      // either commits, either double-posting the disbursement (if 1
      // approval is enough) or leaving it stuck below its real approval
      // count (if 2+ are required). This blocks a second concurrent call
      // until the first transaction commits, so it re-reads the true,
      // post-approval state below rather than a stale one.
      await tx.$queryRaw`SELECT id FROM payout_requests WHERE id = ${requestId} FOR UPDATE`;

      const payout = await tx.payoutRequest.findUnique({
        where: { id: requestId },
        include: { approvals: true },
      });
      if (!payout || payout.organisationId !== organisationId) {
        throw new NotFoundException('Payout request not found');
      }

      if (payout.status !== 'PENDING') {
        throw new BadRequestException(
          `Payout request is already ${payout.status}`,
        );
      }

      // Maker-checker restriction: requester cannot approve
      if (payout.requesterId === officerMemberId) {
        throw new ForbiddenException(
          'Maker-checker policy: The requester cannot approve this payout',
        );
      }

      // No duplicate approvals by same officer
      if (payout.approvals.some((a) => a.officerId === officerMemberId)) {
        throw new BadRequestException(
          'You have already submitted an approval decision for this request',
        );
      }

      // Handle Rejection
      if (dto.decision === 'REJECTED') {
        await tx.payoutApproval.create({
          data: {
            payoutRequestId: requestId,
            officerId: officerMemberId,
            decision: 'REJECTED',
            comment: dto.comment,
          },
        });
        return tx.payoutRequest.update({
          where: { id: requestId },
          data: { status: 'REJECTED' },
        });
      }

      // Create Approval Record
      await tx.payoutApproval.create({
        data: {
          payoutRequestId: requestId,
          officerId: officerMemberId,
          decision: 'APPROVED',
          comment: dto.comment,
        },
      });

      // Recalculate approvals count
      const activeApprovalsCount =
        payout.approvals.filter((a) => a.decision === 'APPROVED').length + 1;

      // Determine required approvals count based on policy thresholds
      const policy = await this.getFundControlPolicyInTx(tx, organisationId);
      const amount = new Prisma.Decimal(payout.amountValue);
      let requiredApprovals = 1;

      if (amount.greaterThan(policy.thresholdTwoApproversValue)) {
        requiredApprovals = 3; // Committee threshold
      } else if (amount.greaterThan(policy.thresholdOneApproverValue)) {
        requiredApprovals = 2; // Medium threshold
      }

      if (activeApprovalsCount >= requiredApprovals) {
        // Payout fully approved! Post ledger entries and mark SUCCEEDED (simulated provider payout transfer)
        const [cashAccount, expenseAccount] = await Promise.all([
          tx.ledgerAccount.findFirst({
            where: { fundId: payout.fundId, name: 'Cash' },
          }),
          tx.ledgerAccount.findFirst({
            where: { fundId: payout.fundId, name: 'Benefits Expense' },
          }),
        ]);

        if (!cashAccount || !expenseAccount) {
          throw new NotFoundException(
            'Cash or Benefits Expense accounts missing for this fund',
          );
        }

        await this.ledger.postJournalEntryInTx(tx, organisationId, {
          fundId: payout.fundId,
          description: `Payout disbursement to recipient ${payout.recipientId} for: ${payout.purpose}`,
          sourceType: 'benefit_disbursement',
          sourceId: payout.id,
          createdBy: officerMemberId,
          lines: [
            {
              ledgerAccountId: expenseAccount.id,
              debit: payout.amountValue.toString(),
            },
            {
              ledgerAccountId: cashAccount.id,
              credit: payout.amountValue.toString(),
            },
          ],
        });

        return tx.payoutRequest.update({
          where: { id: requestId },
          data: {
            status: 'SUCCEEDED',
            completedAt: new Date(),
          },
        });
      }

      // Otherwise, return request remains PENDING (waiting on more checkers)
      return tx.payoutRequest.findUnique({
        where: { id: requestId },
        include: { approvals: true },
      });
    });
  }

  async listPayoutRequests(organisationId: string) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      return tx.payoutRequest.findMany({
        where: { organisationId },
        include: {
          approvals: {
            include: {
              officer: {
                include: {
                  account: {
                    select: { name: true },
                  },
                },
              },
            },
          },
          recipient: true,
          requester: {
            include: {
              account: {
                select: { name: true },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    });
  }
}
