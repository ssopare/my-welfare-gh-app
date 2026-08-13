import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin, requirePermission } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { CreateBudgetDto } from './dto/create-budget.dto';

// Advanced reporting Phase B, §9. Budgets are targets, not ledger
// entries — a normal delete is fine (no reversal-style correction
// needed, unlike JournalEntry). This service is the one write path;
// ReportingService stays read-only, per its own stated principle.
@Injectable()
export class BudgetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async create(actor: AuthTokenPayload, dto: CreateBudgetDto) {
    await requireAdmin(this.rbac, actor);
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);
    if (periodEnd <= periodStart) {
      throw new BadRequestException('periodEnd must be after periodStart');
    }

    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const account = await tx.ledgerAccount.findUnique({
        where: { id: dto.ledgerAccountId },
      });
      if (!account) {
        throw new NotFoundException('Ledger account not found');
      }
      return tx.budget.create({
        data: {
          organisationId: actor.organisationId,
          ledgerAccountId: dto.ledgerAccountId,
          name: dto.name,
          periodStart,
          periodEnd,
          amountValue: dto.amountValue,
          createdBy: actor.memberId,
        },
      });
    });
  }

  async remove(actor: AuthTokenPayload, id: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const budget = await tx.budget.findUnique({ where: { id } });
      if (!budget) {
        throw new NotFoundException('Budget not found');
      }
      await tx.budget.delete({ where: { id } });
      return { id };
    });
  }

  // Actual is computed fresh from JournalLine within each budget's own
  // period — never stored — the same credit-normal (INCOME) /
  // debit-normal (everything else) net-movement logic as
  // ReportingService.incomeExpenditureStatement.
  async listWithActuals(actor: AuthTokenPayload) {
    await requirePermission(this.rbac, actor, 'ledger', 'view');
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const budgets = await tx.budget.findMany({
        include: {
          ledgerAccount: { include: { fund: { select: { name: true } } } },
        },
        orderBy: { periodStart: 'desc' },
      });

      return Promise.all(
        budgets.map(async (budget) => {
          const lines = await tx.journalLine.findMany({
            where: {
              ledgerAccountId: budget.ledgerAccountId,
              journalEntry: {
                postedAt: { gte: budget.periodStart, lte: budget.periodEnd },
              },
            },
            select: { debit: true, credit: true },
          });
          const debit = lines.reduce(
            (sum, line) => sum.plus(line.debit),
            new Prisma.Decimal(0),
          );
          const credit = lines.reduce(
            (sum, line) => sum.plus(line.credit),
            new Prisma.Decimal(0),
          );
          const isIncomeNormal = budget.ledgerAccount.type === 'INCOME';
          const actual = isIncomeNormal
            ? credit.minus(debit)
            : debit.minus(credit);
          const budgeted = new Prisma.Decimal(budget.amountValue);
          const variance = actual.minus(budgeted);
          const variancePercent = budgeted.isZero()
            ? null
            : variance.dividedBy(budgeted).times(100).toString();

          let status: 'over_budget' | 'on_track' | 'underperforming';
          if (isIncomeNormal) {
            status = actual.greaterThanOrEqualTo(budgeted)
              ? 'on_track'
              : 'underperforming';
          } else {
            status = actual.greaterThan(budgeted) ? 'over_budget' : 'on_track';
          }

          return {
            id: budget.id,
            ledgerAccountId: budget.ledgerAccountId,
            accountName: budget.ledgerAccount.name,
            accountType: budget.ledgerAccount.type,
            fundName: budget.ledgerAccount.fund.name,
            name: budget.name,
            periodStart: budget.periodStart,
            periodEnd: budget.periodEnd,
            budgeted: budgeted.toString(),
            actual: actual.toString(),
            variance: variance.toString(),
            variancePercent,
            status,
          };
        }),
      );
    });
  }
}
