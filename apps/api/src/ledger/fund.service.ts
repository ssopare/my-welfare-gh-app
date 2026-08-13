import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateFundDto } from './dto/create-fund.dto';
import { CreateLedgerAccountDto } from './dto/create-ledger-account.dto';

// §12.1's standard categories, provisioned automatically whenever a Fund is
// created — enough to actually post real entries against without needing a
// full chart-of-accounts builder (out of scope for Phase 1; a tenant that
// needs bespoke accounts beyond these five doesn't exist yet).
const STANDARD_CHART_OF_ACCOUNTS = [
  { name: 'Cash', type: 'ASSET' as const },
  { name: 'Contributions Income', type: 'INCOME' as const },
  { name: 'Benefits Payable', type: 'LIABILITY' as const },
  { name: 'Benefits Expense', type: 'EXPENSE' as const },
  { name: 'Fund Equity', type: 'EQUITY' as const },
  // What a member has paid ahead of what's currently owed (monthly
  // contributions only — see ObligationService.recordContributionPaymentInTx)
  // sits here as a real liability until it's consumed by a future
  // payment, rather than as a number nowhere in the ledger. Funds created
  // before this existed get it lazily, find-or-created the first time a
  // payment actually needs it.
  { name: 'Member Credit Balance', type: 'LIABILITY' as const },
];

@Injectable()
export class FundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(actor: AuthTokenPayload, dto: CreateFundDto) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const fund = await tx.fund.create({
        data: { organisationId: actor.organisationId, name: dto.name },
      });
      await tx.ledgerAccount.createMany({
        data: STANDARD_CHART_OF_ACCOUNTS.map((account) => ({
          organisationId: actor.organisationId,
          fundId: fund.id,
          name: account.name,
          type: account.type,
        })),
      });
      return tx.fund.findUnique({
        where: { id: fund.id },
        include: { ledgerAccounts: true },
      });
    });
  }

  async list(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.fund.findMany({ include: { ledgerAccounts: true } }),
    );
  }

  async findOne(actor: AuthTokenPayload, id: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const fund = await tx.fund.findUnique({
        where: { id },
        include: { ledgerAccounts: true },
      });
      if (!fund) {
        throw new NotFoundException('Fund not found');
      }
      return fund;
    });
  }

  // Reporting Phase C, §30: the standard 6-account chart above stays flat
  // and hard-coded for what every fund needs to function; this is the
  // extension point for anything beyond that (an Administrative Expenses
  // account, a Donations income account, etc.) — still flat, still no
  // account codes/hierarchy, a deliberate scope boundary carried over from
  // Phase A. Every existing report already queries accounts dynamically by
  // fund/type rather than the 6 fixed names, so a new account here needs
  // no changes anywhere else to start showing up in Trial Balance, the
  // Income & Expenditure Statement, or the Budget account picker.
  async createAccount(
    actor: AuthTokenPayload,
    fundId: string,
    dto: CreateLedgerAccountDto,
  ) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const fund = await tx.fund.findUnique({ where: { id: fundId } });
      if (!fund) {
        throw new NotFoundException('Fund not found');
      }
      const existing = await tx.ledgerAccount.findFirst({
        where: { fundId, name: dto.name },
      });
      if (existing) {
        throw new BadRequestException(
          `An account named "${dto.name}" already exists on this fund`,
        );
      }
      return tx.ledgerAccount.create({
        data: {
          organisationId: actor.organisationId,
          fundId,
          name: dto.name,
          type: dto.type,
          isAdministrative: dto.isAdministrative ?? false,
        },
      });
    });
  }
}
