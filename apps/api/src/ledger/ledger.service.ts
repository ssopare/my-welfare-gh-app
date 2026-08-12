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
    return this.prisma.withTenant(organisationId, async (tx) => {
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
    });
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
