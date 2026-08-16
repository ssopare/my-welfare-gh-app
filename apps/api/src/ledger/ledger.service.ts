import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { LedgerAccount } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import type { TransferFundsDto } from './dto/transfer-funds.dto';

function findLedgerAccount(
  accounts: LedgerAccount[],
  fundName: string,
  accountName: string,
): LedgerAccount {
  const account = accounts.find((a) => a.name === accountName);
  if (!account) {
    throw new BadRequestException(
      `${fundName} has no "${accountName}" ledger account`,
    );
  }
  return account;
}

export interface JournalLineInput {
  ledgerAccountId: string;
  debit?: string;
  credit?: string;
  memberId?: string;
  obligationId?: string;
}

export interface PostJournalEntryParams {
  fundId: string;
  description: string;
  lines: JournalLineInput[];
  sourceType?: string;
  sourceId?: string;
  createdBy: string;
  reversalOfId?: string;
}

// §12.2, FR-LEDGER-01/02.
@Injectable()
export class LedgerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async postJournalEntry(
    organisationId: string,
    params: PostJournalEntryParams,
  ) {
    return this.prisma.withTenant(organisationId, (tx) =>
      this.postJournalEntryInTx(tx, organisationId, params),
    );
  }

  // Split out from postJournalEntry so a caller that's already inside its
  // own withTenant transaction (ObligationService.recordContributionPayment,
  // which also updates Obligation rows and needs both to commit or fail
  // together) can post through that same tx — Prisma's interactive
  // transactions don't nest, so calling the public postJournalEntry from
  // inside another transaction would silently open a second, independent
  // one and break atomicity.
  async postJournalEntryInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
    params: PostJournalEntryParams,
  ) {
    if (params.lines.length < 2) {
      throw new BadRequestException('A journal entry needs at least two lines');
    }

    let totalDebit = new Prisma.Decimal(0);
    let totalCredit = new Prisma.Decimal(0);
    for (const line of params.lines) {
      const debit = new Prisma.Decimal(line.debit ?? 0);
      const credit = new Prisma.Decimal(line.credit ?? 0);
      if (debit.isZero() === credit.isZero()) {
        throw new BadRequestException(
          'Each journal line must have exactly one of debit or credit set, not both or neither',
        );
      }
      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);
    }
    if (!totalDebit.equals(totalCredit)) {
      throw new BadRequestException(
        `Journal entry is not balanced: total debit ${totalDebit.toString()} != total credit ${totalCredit.toString()}`,
      );
    }

    return tx.journalEntry.create({
      data: {
        organisationId,
        fundId: params.fundId,
        description: params.description,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        reversalOfId: params.reversalOfId,
        createdBy: params.createdBy,
        lines: {
          create: params.lines.map((line) => ({
            organisationId,
            ledgerAccountId: line.ledgerAccountId,
            memberId: line.memberId,
            obligationId: line.obligationId,
            debit: line.debit ?? 0,
            credit: line.credit ?? 0,
          })),
        },
      },
      include: { lines: true },
    });
  }

  // Moving money between two of an org's own funds — a real, admin-only
  // capability, not a workaround. JournalEntry.fundId is required and
  // singular (every entry belongs to exactly one fund), so a transfer is
  // two separate, individually-balanced entries — one per fund — linked
  // by a shared sourceId, exactly matching how the Income & Expenditure
  // Reporting spec itself describes it: "Transfer Out in the source fund
  // and Transfer In in the destination fund." Posted against each fund's
  // existing Fund Equity account (not a new "Transfer In/Out" account
  // type) deliberately: Equity is neither Income nor Expense, so a
  // transfer nets to zero in the Income & Expenditure Statement and any
  // consolidated report automatically, with no special-casing needed in
  // the reporting queries.
  async transferBetweenFunds(
    actor: AuthTokenPayload,
    fromFundId: string,
    dto: TransferFundsDto,
  ) {
    await requireAdmin(this.rbac, actor);
    if (fromFundId === dto.toFundId) {
      throw new BadRequestException('Cannot transfer a fund to itself');
    }
    const amount = new Prisma.Decimal(dto.amountValue);
    if (amount.lessThanOrEqualTo(0)) {
      throw new BadRequestException(
        'Transfer amount must be greater than zero',
      );
    }
    const description = dto.description?.trim() || 'Fund transfer';
    const transferId = randomUUID();

    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const [fromFund, toFund] = await Promise.all([
        tx.fund.findUnique({
          where: { id: fromFundId },
          include: { ledgerAccounts: true },
        }),
        tx.fund.findUnique({
          where: { id: dto.toFundId },
          include: { ledgerAccounts: true },
        }),
      ]);
      if (!fromFund) throw new NotFoundException('Source fund not found');
      if (!toFund) throw new NotFoundException('Destination fund not found');

      const fromCash = findLedgerAccount(
        fromFund.ledgerAccounts,
        fromFund.name,
        'Cash',
      );
      const fromEquity = findLedgerAccount(
        fromFund.ledgerAccounts,
        fromFund.name,
        'Fund Equity',
      );
      const toCash = findLedgerAccount(
        toFund.ledgerAccounts,
        toFund.name,
        'Cash',
      );
      const toEquity = findLedgerAccount(
        toFund.ledgerAccounts,
        toFund.name,
        'Fund Equity',
      );

      // Same check PayoutService.createPayoutRequest does before it lets
      // cash leave a fund — without it, a transfer can post a source-fund
      // Cash balance that goes negative, which no other part of the ledger
      // ever allows.
      const fromBalanceRes = await this.getLedgerAccountBalanceInTx(
        tx,
        fromCash.id,
      );
      const fromBalance = new Prisma.Decimal(fromBalanceRes.balance);
      if (fromBalance.lessThan(amount)) {
        throw new BadRequestException(
          `Insufficient fund balance: Available cash is ${fromBalance.toString()} GHS`,
        );
      }

      const outEntry = await this.postJournalEntryInTx(
        tx,
        actor.organisationId,
        {
          fundId: fromFundId,
          description: `Transfer to ${toFund.name}: ${description}`,
          sourceType: 'fund_transfer',
          sourceId: transferId,
          createdBy: actor.memberId,
          lines: [
            { ledgerAccountId: fromEquity.id, debit: amount.toString() },
            { ledgerAccountId: fromCash.id, credit: amount.toString() },
          ],
        },
      );
      const inEntry = await this.postJournalEntryInTx(
        tx,
        actor.organisationId,
        {
          fundId: dto.toFundId,
          description: `Transfer from ${fromFund.name}: ${description}`,
          sourceType: 'fund_transfer',
          sourceId: transferId,
          createdBy: actor.memberId,
          lines: [
            { ledgerAccountId: toCash.id, debit: amount.toString() },
            { ledgerAccountId: toEquity.id, credit: amount.toString() },
          ],
        },
      );

      return { transferId, outEntry, inEntry };
    });
  }

  // FR-LEDGER-02: the only way to correct a posted entry — a new contra
  // entry with every line's debit/credit swapped, referencing the original
  // via reversalOfId. The original is never touched.
  async reverseJournalEntry(
    organisationId: string,
    entryId: string,
    createdBy: string,
    reason: string,
  ) {
    return this.prisma.withTenant(organisationId, async (tx) => {
      const original = await tx.journalEntry.findUnique({
        where: { id: entryId },
        include: { lines: true },
      });
      if (!original) {
        throw new NotFoundException('Journal entry not found');
      }

      return this.postJournalEntryInTx(tx, organisationId, {
        fundId: original.fundId,
        description: `Reversal (${reason}) of entry ${original.id}: ${original.description}`,
        sourceType: original.sourceType ?? undefined,
        sourceId: original.sourceId ?? undefined,
        reversalOfId: original.id,
        createdBy,
        lines: original.lines.map((line) => ({
          ledgerAccountId: line.ledgerAccountId,
          memberId: line.memberId ?? undefined,
          obligationId: line.obligationId ?? undefined,
          debit: line.credit.toString(),
          credit: line.debit.toString(),
        })),
      });
    });
  }

  // FR-LEDGER-05: never a stored, independently-editable number — always
  // the sum of posted journal lines, computed fresh every time.
  async getLedgerAccountBalance(
    organisationId: string,
    ledgerAccountId: string,
  ) {
    return this.prisma.withTenant(organisationId, (tx) =>
      this.getLedgerAccountBalanceInTx(tx, ledgerAccountId),
    );
  }

  // Same logic as getLedgerAccountBalance, for a caller that already has
  // an open tenant transaction (e.g. PayoutService checking cash balance
  // mid-payout-request) — reuses that connection/transaction instead of
  // opening a second, independent one via withTenant, which would neither
  // see the outer transaction's uncommitted writes nor share its
  // connection (a real risk under a small pool).
  async getLedgerAccountBalanceInTx(
    tx: Prisma.TransactionClient,
    ledgerAccountId: string,
  ) {
    const account = await tx.ledgerAccount.findUnique({
      where: { id: ledgerAccountId },
    });
    if (!account) {
      throw new NotFoundException('Ledger account not found');
    }

    const totals = await tx.journalLine.aggregate({
      where: { ledgerAccountId },
      _sum: { debit: true, credit: true },
    });
    const debitTotal = totals._sum.debit ?? new Prisma.Decimal(0);
    const creditTotal = totals._sum.credit ?? new Prisma.Decimal(0);

    // ASSET/EXPENSE accounts carry a normal debit balance;
    // LIABILITY/INCOME/EQUITY carry a normal credit balance.
    const normalDebitBalance =
      account.type === 'ASSET' || account.type === 'EXPENSE';
    const balance = normalDebitBalance
      ? debitTotal.minus(creditTotal)
      : creditTotal.minus(debitTotal);

    return {
      ledgerAccountId,
      type: account.type,
      balance: balance.toString(),
    };
  }

  // Admin-only transaction history — surfaced building the admin console:
  // every prior endpoint either posted an entry or reversed one by an
  // already-known id, so nothing before this could actually browse what's
  // been posted. Financial transaction history, so admin-gated (unlike the
  // more general-purpose fund/balance reads above).
  async listJournalEntries(actor: AuthTokenPayload, fundId?: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.journalEntry.findMany({
        where: fundId ? { fundId } : undefined,
        orderBy: { postedAt: 'desc' },
        include: { lines: true },
      }),
    );
  }
}
