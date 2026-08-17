import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type {
  AutoDisbursement,
  PayoutRequest,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { LedgerService } from '../ledger/ledger.service';
import { CreateSettlementAccountDto } from './dto/create-settlement-account.dto';
import { CreatePayoutRecipientDto } from './dto/create-payout-recipient.dto';
import { CreatePayoutRequestDto } from './dto/create-payout-request.dto';
import { SubmitPayoutApprovalDto } from './dto/submit-payout-approval.dto';
import { UpdateFundControlPolicyDto } from './dto/update-fund-control-policy.dto';
import { TransferWebhookPayloadDto } from './dto/transfer-webhook-payload.dto';
import { TRANSFER_PROVIDER } from './providers/transfer-provider.interface';
import type { TransferProvider } from './providers/transfer-provider.interface';
import { randomUUID } from 'node:crypto';

@Injectable()
export class PayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly ledger: LedgerService,
    @Inject(TRANSFER_PROVIDER)
    private readonly transferProvider: TransferProvider,
  ) {}

  // Registers this organisation's own MoMo number as a real Paystack
  // Transfer Recipient — replaces the old fake "subaccount" code that was
  // never sent anywhere real (subaccounts settle to a bank account, not a
  // MoMo wallet; see SettlementAccount's schema comment). A rejected
  // recipient creation is fatal: there's nothing to auto-disburse to
  // until Paystack has genuinely accepted this number.
  async createSettlementAccount(
    organisationId: string,
    dto: CreateSettlementAccountDto,
  ) {
    let result: { recipientCode: string; verified: boolean };
    try {
      result = await this.transferProvider.createRecipient({
        organisationId,
        name: dto.accountName,
        accountNumber: dto.phoneNumber,
        momoProvider: dto.momoProvider,
        currency: 'GHS',
      });
    } catch (err) {
      throw new BadRequestException(
        `Unable to register settlement account with the payment provider: ${(err as Error).message}`,
      );
    }
    return this.prisma.withTenant(organisationId, async (tx) => {
      return tx.settlementAccount.upsert({
        where: { organisationId },
        update: {
          momoProvider: dto.momoProvider,
          accountName: dto.accountName,
          accountNumber: dto.phoneNumber,
          providerRecipientCode: result.recipientCode,
          verified: result.verified,
        },
        create: {
          organisationId,
          momoProvider: dto.momoProvider,
          accountName: dto.accountName,
          accountNumber: dto.phoneNumber,
          providerRecipientCode: result.recipientCode,
          verified: result.verified,
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

  // Registers a real Paystack Transfer Recipient for this beneficiary —
  // same reasoning as createSettlementAccount: a payout can't be trusted
  // to actually reach anyone until Paystack has genuinely accepted the
  // MoMo number it's headed to. A rejected recipient creation is fatal.
  async createPayoutRecipient(
    organisationId: string,
    dto: CreatePayoutRecipientDto,
  ) {
    let result: { recipientCode: string; verified: boolean };
    try {
      result = await this.transferProvider.createRecipient({
        organisationId,
        name: dto.name,
        accountNumber: dto.accountNumber,
        momoProvider: dto.momoProvider,
        currency: 'GHS',
      });
    } catch (err) {
      throw new BadRequestException(
        `Unable to register recipient with the payment provider: ${(err as Error).message}`,
      );
    }
    return this.prisma.withTenant(organisationId, async (tx) => {
      return tx.payoutRecipient.create({
        data: {
          organisationId,
          name: dto.name,
          type: 'mobile_money',
          accountNumber: dto.accountNumber,
          bankCode: dto.momoProvider.toUpperCase(),
          providerRecipientCode: result.recipientCode,
          verified: result.verified,
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
          // undefined here means Prisma omits the column from the SET
          // clause entirely — an admin updating only the limits above
          // never accidentally resets this toggle back to false.
          autoDisbursement: dto.autoDisbursement,
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
          autoDisbursement: dto.autoDisbursement,
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
      autoDisbursement: false,
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
      if (!recipient.verified || !recipient.providerRecipientCode) {
        throw new BadRequestException(
          'Recipient has not been verified with the payment provider yet',
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
          // TRANSFER_PENDING still counts — a request whose transfer
          // hasn't been confirmed yet isn't free headroom for another
          // payout to claim; otherwise two approvals in quick succession
          // could jointly exceed the cap during that window.
          status: {
            in: ['PENDING', 'APPROVED', 'TRANSFER_PENDING', 'SUCCEEDED'],
          },
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
          // TRANSFER_PENDING still counts — a request whose transfer
          // hasn't been confirmed yet isn't free headroom for another
          // payout to claim; otherwise two approvals in quick succession
          // could jointly exceed the cap during that window.
          status: {
            in: ['PENDING', 'APPROVED', 'TRANSFER_PENDING', 'SUCCEEDED'],
          },
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
        // Payout fully approved — hand off to a real Paystack transfer.
        // No ledger entry is posted here: exactly like AutoDisbursement,
        // a transfer only ever comes back "pending" from Paystack, so the
        // benefit expense is only real once handleTransferWebhook
        // confirms it, not the moment an officer clicks approve.
        const recipient = await tx.payoutRecipient.findUnique({
          where: { id: payout.recipientId },
        });
        if (!recipient?.verified || !recipient.providerRecipientCode) {
          // Can't happen through the normal flow (createPayoutRequest
          // already requires a verified recipient), but a recipient could
          // in principle have been altered between request and approval —
          // fail loudly rather than silently stranding the payout.
          throw new BadRequestException(
            'Recipient is no longer verified with the payment provider',
          );
        }

        const placeholderReference = `pending_${randomUUID()}`;
        await tx.payoutRequest.update({
          where: { id: requestId },
          data: { providerReference: placeholderReference },
        });

        try {
          const result = await this.transferProvider.initiateTransfer({
            organisationId,
            recipientCode: recipient.providerRecipientCode,
            amountValue: payout.amountValue.toString(),
            currency: payout.currency,
            reference: requestId,
            reason: `Payout to ${recipient.name}: ${payout.purpose}`,
            metadata: { organisationId, referenceId: requestId },
          });
          return tx.payoutRequest.update({
            where: { id: requestId },
            data: {
              status: 'TRANSFER_PENDING',
              providerReference: result.providerReference,
            },
            include: { approvals: true },
          });
        } catch (err) {
          // The approval itself still stands (recorded above) — only the
          // handoff to the provider failed. Terminal, not retried
          // automatically; same "a downstream side-effect never rewrites
          // an already-true fact" principle as AutoDisbursement's own
          // catch block.
          await tx.reconciliationException.create({
            data: {
              organisationId,
              providerReference: placeholderReference,
              reason: `Payout transfer failed to initiate for request ${requestId}: ${(err as Error).message}`,
            },
          });
          return tx.payoutRequest.update({
            where: { id: requestId },
            data: { status: 'TRANSFER_FAILED' },
            include: { approvals: true },
          });
        }
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

  // Find-or-create, lazily — same reasoning as ObligationService's
  // "Payment Provider Fees"/"Member Credit Balance" accounts: funds
  // created before this feature existed don't have these yet, and most
  // funds will never need them at all (only orgs that turn on
  // autoDisbursement do).
  private async findOrCreateFundAccount(
    tx: Prisma.TransactionClient,
    organisationId: string,
    fundId: string,
    name: string,
    type: 'ASSET' | 'EXPENSE',
  ) {
    const existing = await tx.ledgerAccount.findFirst({
      where: { fundId, name },
    });
    if (existing) return existing;
    return tx.ledgerAccount.create({
      data: { organisationId, fundId, name, type },
    });
  }

  // Called from PaymentService.handleWebhook right after a contribution
  // payment is confirmed and posted. Fully automatic, no maker-checker —
  // that's a deliberate product decision distinct from the manual
  // PayoutRequest flow above, which stays untouched. Returns null (a
  // no-op) in every case where this org hasn't opted in or isn't ready,
  // so an org that never touches this feature sees zero behavior change.
  async triggerAutoDisbursementIfEnabledInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
    fundId: string,
    paymentIntentId: string,
    disbursableAmountValue: string,
  ) {
    const policy = await this.getFundControlPolicyInTx(tx, organisationId);
    if (!policy.autoDisbursement) return null;

    const settlement = await tx.settlementAccount.findUnique({
      where: { organisationId },
    });
    if (!settlement?.verified || !settlement.providerRecipientCode) {
      // Nothing registered to send to yet — admin has enabled the toggle
      // but hasn't finished settlement-account setup. Not an error, just
      // nothing to do until they do.
      return null;
    }

    const subscription = await tx.subscription.findUnique({
      where: { organisationId },
      include: { plan: true },
    });
    const feePercent =
      subscription?.plan?.platformFeePercentage ?? new Prisma.Decimal(0);

    const disbursable = new Prisma.Decimal(disbursableAmountValue);
    const platformFeeValue = disbursable
      .times(feePercent)
      .dividedBy(100)
      .toDecimalPlaces(2);
    const transferAmountValue = disbursable.minus(platformFeeValue);

    if (transferAmountValue.lessThanOrEqualTo(0)) {
      return tx.autoDisbursement.create({
        data: {
          organisationId,
          fundId,
          paymentIntentId,
          disbursableAmountValue: disbursable,
          platformFeePercentage: feePercent,
          platformFeeValue,
          transferAmountValue,
          providerReference: `skipped_${randomUUID()}`,
          status: 'FAILED',
          failureReason:
            'Computed transfer amount was zero or negative after the platform fee',
        },
      });
    }

    const record = await tx.autoDisbursement.create({
      data: {
        organisationId,
        fundId,
        paymentIntentId,
        disbursableAmountValue: disbursable,
        platformFeePercentage: feePercent,
        platformFeeValue,
        transferAmountValue,
        // Same placeholder-then-update pattern PaymentIntent.providerReference
        // already uses — the real provider reference isn't known until the
        // transfer call below returns.
        providerReference: `pending_${randomUUID()}`,
      },
    });

    try {
      const result = await this.transferProvider.initiateTransfer({
        organisationId,
        recipientCode: settlement.providerRecipientCode,
        amountValue: transferAmountValue.toString(),
        currency: 'GHS',
        reference: record.id,
        reason: `Auto-disbursement for contribution ${paymentIntentId}`,
        metadata: { organisationId, referenceId: record.id },
      });
      return tx.autoDisbursement.update({
        where: { id: record.id },
        data: {
          providerReference: result.providerReference,
          providerRecipientCode: settlement.providerRecipientCode,
        },
      });
    } catch (err) {
      // A failed transfer *attempt* never rolls back or fails the
      // contribution webhook itself — the money was genuinely received;
      // only its onward disbursement failed. Same "a downstream
      // side-effect never undoes the core confirmation" principle
      // PaymentService.handleWebhook already relies on.
      return tx.autoDisbursement.update({
        where: { id: record.id },
        data: {
          status: 'FAILED',
          failureReason: (err as Error).message ?? 'Transfer initiation failed',
        },
      });
    }
  }

  // Idempotent-by-providerReference confirmation for a transfer, mirroring
  // PaymentService.handleWebhook's exact shape: unmatched or conflicting
  // deliveries are logged as ReconciliationExceptions (reused, not a new
  // table), an already-terminal-and-matching redelivery is a no-op, and
  // the ledger is posted only once, only here, only on genuine success.
  // The one entry point both the mock dev webhook and the real signed
  // Paystack webhook call for any transfer.success/transfer.failed event
  // — routes by looking the providerReference up in whichever table
  // actually initiated it, rather than threading a "kind" flag through
  // Paystack's own metadata round-trip. providerReference is a real
  // unique key in both tables, so there's no realistic collision between
  // an AutoDisbursement and a PayoutRequest sharing one.
  async handleTransferWebhook(dto: TransferWebhookPayloadDto) {
    return this.prisma.withTenant(dto.organisationId, async (tx) => {
      const autoDisbursement = await tx.autoDisbursement.findUnique({
        where: { providerReference: dto.providerReference },
      });
      if (autoDisbursement) {
        return this.confirmAutoDisbursementTransfer(tx, dto, autoDisbursement);
      }

      const payoutRequest = await tx.payoutRequest.findUnique({
        where: { providerReference: dto.providerReference },
      });
      if (payoutRequest) {
        return this.confirmPayoutTransfer(tx, dto, payoutRequest);
      }

      await tx.reconciliationException.create({
        data: {
          organisationId: dto.organisationId,
          providerReference: dto.providerReference,
          reason:
            'Transfer webhook referenced an unknown providerReference for this organisation',
        },
      });
      return { outcome: 'unmatched' as const };
    });
  }

  private async confirmAutoDisbursementTransfer(
    tx: Prisma.TransactionClient,
    dto: TransferWebhookPayloadDto,
    record: AutoDisbursement,
  ) {
    if (record.status !== 'PENDING') {
      const reportedOutcome =
        dto.status === 'succeeded' ? 'SUCCEEDED' : 'FAILED';
      if (record.status !== reportedOutcome) {
        await tx.reconciliationException.create({
          data: {
            organisationId: dto.organisationId,
            providerReference: dto.providerReference,
            reason: `Transfer webhook reported "${dto.status}" but this disbursement was already recorded as ${record.status}`,
          },
        });
      }
      return { outcome: 'already_processed' as const, status: record.status };
    }

    if (dto.status === 'failed') {
      await tx.autoDisbursement.update({
        where: { id: record.id },
        data: { status: 'FAILED', completedAt: new Date() },
      });
      // No maker-checker exists on this path to otherwise catch a
      // failure — surface it the same way an unmatched webhook does.
      await tx.reconciliationException.create({
        data: {
          organisationId: dto.organisationId,
          providerReference: dto.providerReference,
          reason: `Auto-disbursement transfer failed for payment intent ${record.paymentIntentId}`,
        },
      });
      return { outcome: 'failed' as const };
    }

    const [cashAccount, settledAccount] = await Promise.all([
      tx.ledgerAccount.findFirst({
        where: { fundId: record.fundId, name: 'Cash' },
      }),
      this.findOrCreateFundAccount(
        tx,
        record.organisationId,
        record.fundId,
        'Settled to MoMo',
        'ASSET',
      ),
    ]);
    if (!cashAccount) {
      throw new NotFoundException(
        'This fund is missing its Cash ledger account',
      );
    }

    // Only find-or-create the fee account, and only add its line, when
    // there's an actual fee to post — a zero-amount line is invalid
    // (postJournalEntryInTx rejects a line with neither a real debit
    // nor credit), and most orgs have no plan/0% fee, so this account
    // often never needs to exist at all.
    const feePercentGreaterThanZero = record.platformFeeValue.greaterThan(0);
    const feeAccount = feePercentGreaterThanZero
      ? await this.findOrCreateFundAccount(
          tx,
          record.organisationId,
          record.fundId,
          'Platform Fee Expense',
          'EXPENSE',
        )
      : null;

    const paymentIntent = await tx.paymentIntent.findUnique({
      where: { id: record.paymentIntentId },
    });
    if (!paymentIntent) {
      throw new NotFoundException(
        'The contribution payment behind this disbursement was not found',
      );
    }

    const journalEntry = await this.ledger.postJournalEntryInTx(
      tx,
      record.organisationId,
      {
        fundId: record.fundId,
        description: `Auto-disbursement to organisation MoMo for contribution ${record.paymentIntentId}`,
        sourceType: 'auto_disbursement',
        sourceId: record.id,
        // The member whose payment triggered this — no human officer
        // initiates an automatic disbursement, and JournalEntry.createdBy
        // is a real Member.id everywhere else in this schema, so this
        // keeps that contract rather than inventing a sentinel string.
        createdBy: paymentIntent.memberId,
        lines: [
          {
            ledgerAccountId: cashAccount.id,
            credit: record.disbursableAmountValue.toString(),
          },
          ...(feeAccount
            ? [
                {
                  ledgerAccountId: feeAccount.id,
                  debit: record.platformFeeValue.toString(),
                },
              ]
            : []),
          {
            ledgerAccountId: settledAccount.id,
            debit: record.transferAmountValue.toString(),
          },
        ],
      },
    );

    await tx.autoDisbursement.update({
      where: { id: record.id },
      data: { status: 'SUCCEEDED', completedAt: new Date() },
    });

    return { outcome: 'succeeded' as const, journalEntryId: journalEntry.id };
  }

  private async confirmPayoutTransfer(
    tx: Prisma.TransactionClient,
    dto: TransferWebhookPayloadDto,
    payout: PayoutRequest,
  ) {
    if (payout.status !== 'TRANSFER_PENDING') {
      const reportedOutcome =
        dto.status === 'succeeded' ? 'SUCCEEDED' : 'TRANSFER_FAILED';
      if (payout.status !== reportedOutcome) {
        await tx.reconciliationException.create({
          data: {
            organisationId: dto.organisationId,
            providerReference: dto.providerReference,
            reason: `Transfer webhook reported "${dto.status}" but payout request ${payout.id} was already recorded as ${payout.status}`,
          },
        });
      }
      return { outcome: 'already_processed' as const, status: payout.status };
    }

    if (dto.status === 'failed') {
      await tx.payoutRequest.update({
        where: { id: payout.id },
        data: { status: 'TRANSFER_FAILED' },
      });
      await tx.reconciliationException.create({
        data: {
          organisationId: dto.organisationId,
          providerReference: dto.providerReference,
          reason: `Payout transfer failed for request ${payout.id} (${payout.purpose})`,
        },
      });
      return { outcome: 'failed' as const };
    }

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

    const journalEntry = await this.ledger.postJournalEntryInTx(
      tx,
      dto.organisationId,
      {
        fundId: payout.fundId,
        description: `Payout disbursement to recipient ${payout.recipientId} for: ${payout.purpose}`,
        sourceType: 'benefit_disbursement',
        sourceId: payout.id,
        // No human officer confirms a webhook — the approving officer(s)
        // are already recorded as PayoutApproval rows; requesterId is the
        // closest real Member.id to attribute this posting to, same
        // "createdBy is always a genuine Member" contract used elsewhere.
        createdBy: payout.requesterId,
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
      },
    );

    await tx.payoutRequest.update({
      where: { id: payout.id },
      data: { status: 'SUCCEEDED', completedAt: new Date() },
    });

    return { outcome: 'succeeded' as const, journalEntryId: journalEntry.id };
  }
}
