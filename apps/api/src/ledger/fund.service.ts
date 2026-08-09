import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFundDto } from './dto/create-fund.dto';

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
];

@Injectable()
export class FundService {
  constructor(private readonly prisma: PrismaService) {}

  async create(actor: AuthTokenPayload, dto: CreateFundDto) {
    requireAdmin(actor);
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
}
