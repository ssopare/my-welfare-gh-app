import { BadRequestException, Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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

  async createSettlementAccount(organisationId: string, dto: CreateSettlementAccountDto) {
    const subaccountCode = `ACCT_mock_subaccount_${randomUUID().slice(0, 8)}`;
    return this.prisma.withTenant(organisationId, async (tx) => {
      return tx.settlementAccount.upsert({
        where: { organisationId },
        update: {
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          verified: true,
        },
        create: {
          organisationId,
          providerSubaccountCode: subaccountCode,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          verified: true,
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
        accountNumber: account.accountNumber.length > 4
          ? account.accountNumber.replace(/.(?=.{4})/g, '*')
          : account.accountNumber,
      };
    });
  }

  async createPayoutRecipient(organisationId: string, dto: CreatePayoutRecipientDto) {
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
        accountNumber: r.accountNumber.length > 4
          ? r.accountNumber.replace(/.(?=.{4})/g, '*')
          : r.accountNumber,
      }));
    });
  }

  async updateFundControlPolicy(organisationId: string, dto: UpdateFundControlPolicyDto) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      return tx.fundControlPolicy.upsert({
        where: { organisationId },
        update: {
          dailyLimitValue: new Prisma.Decimal(dto.dailyLimitValue),
          monthlyLimitValue: new Prisma.Decimal(dto.monthlyLimitValue),
          thresholdOneApproverValue: new Prisma.Decimal(dto.thresholdOneApproverValue),
          thresholdTwoApproversValue: new Prisma.Decimal(dto.thresholdTwoApproversValue),
        },
        create: {
          organisationId,
          dailyLimitValue: new Prisma.Decimal(dto.dailyLimitValue),
          monthlyLimitValue: new Prisma.Decimal(dto.monthlyLimitValue),
          thresholdOneApproverValue: new Prisma.Decimal(dto.thresholdOneApproverValue),
          thresholdTwoApproversValue: new Prisma.Decimal(dto.thresholdTwoApproversValue),
        },
      });
    });
  }

  async getFundControlPolicy(organisationId: string) {
    return this.prisma.withTenant(organisationId, async (tx) => {
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
    });
  }

  async createPayoutRequest(organisationId: string, requesterMemberId: string, dto: CreatePayoutRequestDto) {
    const amount = new Prisma.Decimal(dto.amountValue);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.prisma.withTenant(organisationId, async (tx) => {
      // 1. Verify recipient exists and is allowlisted
      const recipient = await tx.payoutRecipient.findUnique({
        where: { id: dto.recipientId },
      });
      if (!recipient || recipient.organisationId !== organisationId) {
        throw new NotFoundException('Payout recipient not found');
      }
      if (!recipient.isAllowlisted) {
        throw new BadRequestException('Recipient is not allowlisted for payouts');
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
        throw new NotFoundException('This fund is missing its Cash ledger account');
      }

      const balanceRes = await this.ledger.getLedgerAccountBalance(organisationId, cashAccount.id);
      const balance = new Prisma.Decimal(balanceRes.balance);
      if (balance.lessThan(amount)) {
        throw new BadRequestException(`Insufficient fund balance: Available cash is ${balance.toString()} GHS`);
      }

      // 3. Enforce policy limits
      const policy = await this.getFundControlPolicy(organisationId);
      
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
      const dailyTotal = dailyTotalRes._sum.amountValue || new Prisma.Decimal(0);
      if (dailyTotal.plus(amount).greaterThan(policy.dailyLimitValue)) {
        throw new BadRequestException(`Daily payout limit of ${policy.dailyLimitValue.toString()} GHS exceeded`);
      }

      const firstDayOfMonth = new Date(Date.UTC(todayStart.getUTCFullYear(), todayStart.getUTCMonth(), 1));
      const monthlyTotalRes = await tx.payoutRequest.aggregate({
        _sum: { amountValue: true },
        where: {
          organisationId,
          createdAt: { gte: firstDayOfMonth },
          status: { in: ['PENDING', 'APPROVED', 'SUCCEEDED'] },
        },
      });
      const monthlyTotal = monthlyTotalRes._sum.amountValue || new Prisma.Decimal(0);
      if (monthlyTotal.plus(amount).greaterThan(policy.monthlyLimitValue)) {
        throw new BadRequestException(`Monthly payout limit of ${policy.monthlyLimitValue.toString()} GHS exceeded`);
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

  async approvePayoutRequest(organisationId: string, officerMemberId: string, requestId: string, dto: SubmitPayoutApprovalDto) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      const payout = await tx.payoutRequest.findUnique({
        where: { id: requestId },
        include: { approvals: true },
      });
      if (!payout || payout.organisationId !== organisationId) {
        throw new NotFoundException('Payout request not found');
      }

      if (payout.status !== 'PENDING') {
        throw new BadRequestException(`Payout request is already ${payout.status}`);
      }

      // Maker-checker restriction: requester cannot approve
      if (payout.requesterId === officerMemberId) {
        throw new ForbiddenException('Maker-checker policy: The requester cannot approve this payout');
      }

      // No duplicate approvals by same officer
      if (payout.approvals.some((a) => a.officerId === officerMemberId)) {
        throw new BadRequestException('You have already submitted an approval decision for this request');
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
      const activeApprovalsCount = payout.approvals.filter((a) => a.decision === 'APPROVED').length + 1;

      // Determine required approvals count based on policy thresholds
      const policy = await this.getFundControlPolicy(organisationId);
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
          throw new NotFoundException('Cash or Benefits Expense accounts missing for this fund');
        }

        const journalEntry = await this.ledger.postJournalEntryInTx(tx, organisationId, {
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
