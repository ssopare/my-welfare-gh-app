import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin, requireSelfOrAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { CreateObligationDto } from './dto/create-obligation.dto';
import { RecordContributionPaymentDto } from './dto/record-contribution-payment.dto';
import { LedgerService } from './ledger.service';

const OPEN_STATUSES = ['UPCOMING', 'DUE', 'PARTIALLY_PAID', 'OVERDUE'] as const;

@Injectable()
export class ObligationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
    private readonly ledger: LedgerService,
  ) {}

  // The "prove them together" moment the roadmap called for: the rule
  // engine (slice 3) computes the amount, this slice persists it as a
  // trackable Obligation.
  async create(
    actor: AuthTokenPayload,
    contributionPlanId: string,
    dto: CreateObligationDto,
  ) {
    requireAdmin(actor);
    const dueDate = new Date(dto.dueDate);
    const computed = await this.ruleEngine.computeContributionObligation(
      actor.organisationId,
      contributionPlanId,
      dto.memberId,
      dueDate,
    );
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.obligation.create({
        data: {
          organisationId: actor.organisationId,
          memberId: dto.memberId,
          contributionPlanId,
          dueDate,
          amountValue: computed.amount,
          currency: computed.currency,
          status: dueDate > new Date() ? 'UPCOMING' : 'DUE',
        },
      }),
    );
  }

  async listForMember(actor: AuthTokenPayload, memberId: string) {
    requireSelfOrAdmin(actor, memberId);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.obligation.findMany({
        where: { memberId },
        orderBy: { dueDate: 'asc' },
      }),
    );
  }

  // FR-LEDGER-07: applies a payment across the member's open obligations
  // per the org's configured policy, then posts the matching balanced
  // JournalEntry (Cash debit / Contributions Income credit) — both in the
  // same transaction, so a failure in either rolls back both.
  async recordContributionPayment(
    actor: AuthTokenPayload,
    dto: RecordContributionPaymentDto,
  ) {
    requireSelfOrAdmin(actor, dto.memberId);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      this.recordContributionPaymentInTx(
        tx,
        actor.organisationId,
        actor.memberId,
        dto,
      ),
    );
  }

  // The actual logic, taking an already-open tx — used by
  // recordContributionPayment above, and directly by
  // PaymentService.handleWebhook, which is itself inside its own
  // withTenant transaction (to atomically look up the PaymentIntent *and*
  // post the resulting ledger entry). Calling recordContributionPayment
  // from in there would silently open a second, independent transaction —
  // Prisma's interactive transactions don't nest — the same class of bug
  // postJournalEntryInTx exists to avoid in LedgerService.
  async recordContributionPaymentInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
    postedBy: string,
    dto: RecordContributionPaymentDto,
  ) {
    const organisation = await tx.organisation.findUnique({
      where: { id: organisationId },
    });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    if (organisation.paymentAllocationPolicy !== 'oldest_first') {
      // FR-LEDGER-07 lists five other policies (newest-first, current-
      // period-first, member-selected, admin-selected, proportional);
      // only the one every source constitution's "arrears before current
      // dues" pattern actually needed is implemented.
      throw new NotImplementedException(
        `paymentAllocationPolicy "${organisation.paymentAllocationPolicy}" is not yet implemented`,
      );
    }

    const [cashAccount, incomeAccount] = await Promise.all([
      tx.ledgerAccount.findFirst({
        where: { fundId: dto.fundId, name: 'Cash' },
      }),
      tx.ledgerAccount.findFirst({
        where: { fundId: dto.fundId, name: 'Contributions Income' },
      }),
    ]);
    if (!cashAccount || !incomeAccount) {
      throw new NotFoundException(
        'This fund is missing its standard Cash/Contributions Income accounts',
      );
    }

    const openObligations = await tx.obligation.findMany({
      where: { memberId: dto.memberId, status: { in: [...OPEN_STATUSES] } },
      orderBy: { dueDate: 'asc' }, // oldest-first (FR-LEDGER-07 / FR-DEF-02)
    });

    let remaining = new Prisma.Decimal(dto.amountValue);
    const allocations: { obligationId: string; amount: Prisma.Decimal }[] = [];

    for (const obligation of openObligations) {
      if (remaining.lessThanOrEqualTo(0)) break;
      const outstanding = new Prisma.Decimal(obligation.amountValue).minus(
        obligation.amountPaid,
      );
      if (outstanding.lessThanOrEqualTo(0)) continue;

      const applied = Prisma.Decimal.min(remaining, outstanding);
      allocations.push({ obligationId: obligation.id, amount: applied });
      remaining = remaining.minus(applied);

      const newAmountPaid = new Prisma.Decimal(obligation.amountPaid).plus(
        applied,
      );
      const fullyPaid = newAmountPaid.greaterThanOrEqualTo(
        obligation.amountValue,
      );
      await tx.obligation.update({
        where: { id: obligation.id },
        data: {
          amountPaid: newAmountPaid,
          status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        },
      });
    }

    if (remaining.greaterThan(0)) {
      // Phase 1 deliberately has nowhere for this to go: no advance-
      // payment credit (FR-LED-03) and no wallet top-up (FR-LED-07) yet —
      // both are explicitly Phase 2 *features* (the wallet's liability
      // account data model exists on LedgerAccount already, nothing
      // creates or credits one yet). Reject rather than silently dropping
      // the excess.
      throw new BadRequestException(
        `Payment of ${dto.amountValue} exceeds this member's total open obligations by ${remaining.toString()}; advance/wallet credit isn't supported yet`,
      );
    }

    const journalEntry = await this.ledger.postJournalEntryInTx(
      tx,
      organisationId,
      {
        fundId: dto.fundId,
        description: dto.reference
          ? `Contribution payment from member ${dto.memberId} (${dto.reference})`
          : `Contribution payment from member ${dto.memberId}`,
        sourceType: 'contribution_payment',
        createdBy: postedBy,
        lines: [
          {
            ledgerAccountId: cashAccount.id,
            debit: dto.amountValue,
            memberId: dto.memberId,
          },
          ...allocations.map((allocation) => ({
            ledgerAccountId: incomeAccount.id,
            credit: allocation.amount.toString(),
            memberId: dto.memberId,
            obligationId: allocation.obligationId,
          })),
        ],
      },
    );

    return {
      journalEntry,
      allocations: allocations.map((allocation) => ({
        obligationId: allocation.obligationId,
        amount: allocation.amount.toString(),
      })),
    };
  }
}
