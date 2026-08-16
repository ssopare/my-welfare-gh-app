import {
  BadRequestException,
  Injectable,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { ContributionPlan, Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import {
  requireAdmin,
  requirePermission,
  requireSelfOrAdmin,
} from '../common/access.util';
import { DefaulterService } from '../defaulter/defaulter.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { CreateObligationDto } from './dto/create-obligation.dto';
import { RecordContributionPaymentDto } from './dto/record-contribution-payment.dto';
import { LedgerService } from './ledger.service';

// Exported so PaymentService.initiateContributionPayment can replicate the
// exact same open-obligation-selection rules at initiate time as
// recordContributionPaymentInTx enforces at confirmation time — see that
// method's own comment on why the two checks have to agree.
export const OPEN_STATUSES = [
  'UPCOMING',
  'DUE',
  'PARTIALLY_PAID',
  'OVERDUE',
] as const;

// Same safety cap the reference implementation
// (D:\djangoWeb\SMS\apps\welfare\services.py's _spread_payment) uses for
// an extreme overpayment — protects against a fat-fingered amount
// silently generating years of future obligations.
const MAX_MONTHLY_EXTENSION_MONTHS = 24;

// Advances one calendar month, clamping the day-of-month to whatever the
// target month actually has (so Jan 31 + 1 month lands on Feb 28/29, not
// an overflowed March 2/3) — the same reasoning January 31st + a naive
// setMonth() would get wrong.
function addOneMonth(date: Date): Date {
  const day = date.getUTCDate();
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );
  const daysInNextMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, daysInNextMonth));
  return next;
}

// Walks a ContributionPlan's full amendment lineage (both directions via
// supersedesId) so the extension phase below can resolve, for any given
// future month, which specific version's rate actually applies — a rate
// change effective partway through an advance payment's range must split
// at the boundary, the same way D:\djangoWeb\SMS\apps\welfare\services.py's
// WelfareRate lookup resolves a rate per month rather than once per member.
// Only ACTIVE/SUPERSEDED versions count: a DRAFT plan that set supersedesId
// but was never activated never actually superseded anything.
async function resolvePlanFamily(
  tx: Prisma.TransactionClient,
  plan: ContributionPlan,
): Promise<ContributionPlan[]> {
  const family: ContributionPlan[] = [plan];

  let cursor = plan;
  while (cursor.supersedesId) {
    const predecessor = await tx.contributionPlan.findUnique({
      where: { id: cursor.supersedesId },
    });
    if (!predecessor) break;
    family.push(predecessor);
    cursor = predecessor;
  }

  cursor = plan;
  while (true) {
    const successor = await tx.contributionPlan.findFirst({
      where: {
        supersedesId: cursor.id,
        status: { in: ['ACTIVE', 'SUPERSEDED'] },
      },
    });
    if (!successor) break;
    family.push(successor);
    cursor = successor;
  }

  return family;
}

@Injectable()
export class ObligationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
    private readonly ledger: LedgerService,
    private readonly rbac: RbacService,
    private readonly defaulter: DefaulterService,
  ) {}

  // The "prove them together" moment the roadmap called for: the rule
  // engine (slice 3) computes the amount, this slice persists it as a
  // trackable Obligation.
  async create(
    actor: AuthTokenPayload,
    contributionPlanId: string,
    dto: CreateObligationDto,
  ) {
    await requireAdmin(this.rbac, actor);
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
    await requireSelfOrAdmin(this.rbac, actor, memberId);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.obligation.findMany({
        where: { memberId },
        orderBy: { dueDate: 'asc' },
        // cadence lets a payment picker tell "always automatic" monthly
        // obligations apart from one-time/event ones — see
        // recordContributionPaymentInTx's own monthly/other split.
        include: {
          contributionPlan: {
            select: { name: true, cadence: true, defaultFundId: true },
          },
        },
      }),
    );
  }

  // FR-LEDGER-07: applies a payment across the member's open obligations
  // per the org's configured policy, then posts the matching balanced
  // JournalEntry (Cash debit / Contributions Income credit) — both in the
  // same transaction, so a failure in either rolls back both.
  // Admin/Treasurer only (reuses the same ledger:disburse grant the
  // Treasurer starter role already has for payouts — there's no separate
  // "record incoming payment" permission in the catalog yet). This used
  // to be requireSelfOrAdmin, which let a member mark their own dues PAID
  // with a single authenticated request and zero actual payment — no
  // provider charge, no webhook, nothing. This is exactly the trusted
  // "I personally collected this cash/transfer" attestation the method's
  // own doc comment describes; it was never meant to be self-service.
  async recordContributionPayment(
    actor: AuthTokenPayload,
    dto: RecordContributionPaymentDto,
  ) {
    await requirePermission(this.rbac, actor, 'ledger', 'disburse');
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
    const policy = organisation.paymentAllocationPolicy;
    if (policy !== 'oldest_first' && policy !== 'member_selected') {
      // FR-LEDGER-07 lists four further policies (newest-first, current-
      // period-first, admin-selected, proportional); only the two every
      // source constitution's "arrears before current dues, with an
      // opt-in for members to direct their own payment" actually needed
      // are implemented.
      throw new NotImplementedException(
        `paymentAllocationPolicy "${policy}" is not yet implemented`,
      );
    }

    const member = await tx.member.findUnique({
      where: { id: dto.memberId },
    });
    if (!member) {
      throw new NotFoundException('Member not found');
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
      include: { contributionPlan: true },
    });

    // Monthly-cadence obligations are never individually pickable — you
    // don't skip April and pay May instead. They always apply
    // automatically, oldest-first, regardless of the org's policy; only
    // one-time/event obligations are ever subject to member_selected. See
    // the member_credit_balance_and_plan_default_fund migration.
    const monthlyObligations = openObligations.filter(
      (o) => o.contributionPlan.cadence === 'monthly',
    );
    const otherObligations = openObligations.filter(
      (o) => o.contributionPlan.cadence !== 'monthly',
    );

    // Monthly dues can never be individually selected, by anyone, under
    // any policy — the one rule that was never actually about
    // paymentAllocationPolicy in the first place; it's about not letting
    // a member skip a month within the *same* monthly plan, which is
    // orthogonal to which contribution *types* a payment covers.
    const monthlyIds = new Set(monthlyObligations.map((o) => o.id));
    if ((dto.obligationIds ?? []).some((id) => monthlyIds.has(id))) {
      throw new BadRequestException(
        'Monthly contributions are applied automatically and cannot be individually selected',
      );
    }
    // member_selected still *requires* a selection whenever there's more
    // than one open one-time/event item — oldest_first never requires
    // one; omitting it there just means "everything open, oldest-first",
    // same as always.
    if (
      policy === 'member_selected' &&
      otherObligations.length > 0 &&
      !dto.obligationIds?.length
    ) {
      throw new BadRequestException(
        'This organisation requires selecting which obligations a payment covers',
      );
    }

    // Selecting which one-time/event contribution *types* a payment
    // covers is available regardless of paymentAllocationPolicy — that
    // policy only ever governed whether a selection is *required*, not
    // whether one is *allowed*. Within whatever's selected (or the full
    // open set, if nothing was), allocation is still oldest-first: a
    // member can pick which debts a payment covers, not reorder arrears
    // priority among them.
    let otherObligationsToAllocate = otherObligations;
    if (dto.obligationIds?.length) {
      const openIds = new Set(otherObligations.map((o) => o.id));
      const notOpenForMember = dto.obligationIds.filter(
        (id) => !openIds.has(id),
      );
      if (notOpenForMember.length > 0) {
        throw new BadRequestException(
          `Not open obligations for this member: ${notOpenForMember.join(', ')}`,
        );
      }
      const selectedIds = new Set(dto.obligationIds);
      otherObligationsToAllocate = otherObligations.filter((o) =>
        selectedIds.has(o.id),
      );
    }

    // Existing idle credit (from a past overpayment, see below) is always
    // swept back in first — an advance a member built up previously gets
    // consumed by their very next payment rather than sitting disconnected
    // from what they now owe.
    const creditBalanceBefore = new Prisma.Decimal(member.creditBalance);
    let remaining = new Prisma.Decimal(dto.amountValue).plus(
      creditBalanceBefore,
    );
    const allocations: {
      obligationId: string;
      amount: Prisma.Decimal;
      contributionPlanId: string;
    }[] = [];

    const applyToObligation = async (
      obligation: {
        id: string;
        amountValue: Prisma.Decimal;
        amountPaid: Prisma.Decimal;
        contributionPlanId: string;
      },
      computationType = 'fixed',
    ) => {
      if (remaining.lessThanOrEqualTo(0)) return;

      let applied: Prisma.Decimal;
      let newAmountValue: Prisma.Decimal;

      if (computationType === 'voluntary') {
        applied = remaining;
        newAmountValue = new Prisma.Decimal(obligation.amountPaid).plus(
          applied,
        );
      } else if (computationType === 'minimum') {
        const outstanding = new Prisma.Decimal(obligation.amountValue).minus(
          obligation.amountPaid,
        );
        if (outstanding.lessThanOrEqualTo(0)) return;

        if (remaining.greaterThan(outstanding)) {
          applied = remaining;
          newAmountValue = new Prisma.Decimal(obligation.amountPaid).plus(
            applied,
          );
        } else {
          applied = remaining;
          newAmountValue = new Prisma.Decimal(obligation.amountValue);
        }
      } else {
        const outstanding = new Prisma.Decimal(obligation.amountValue).minus(
          obligation.amountPaid,
        );
        if (outstanding.lessThanOrEqualTo(0)) return;

        applied = Prisma.Decimal.min(remaining, outstanding);
        newAmountValue = new Prisma.Decimal(obligation.amountValue);
      }

      allocations.push({
        obligationId: obligation.id,
        amount: applied,
        contributionPlanId: obligation.contributionPlanId,
      });
      remaining = remaining.minus(applied);

      const newAmountPaid = new Prisma.Decimal(obligation.amountPaid).plus(
        applied,
      );
      const fullyPaid = newAmountPaid.greaterThanOrEqualTo(newAmountValue);
      await tx.obligation.update({
        where: { id: obligation.id },
        data: {
          amountValue: newAmountValue,
          amountPaid: newAmountPaid,
          status: fullyPaid ? 'PAID' : 'PARTIALLY_PAID',
        },
      });
    };

    // Phase 1: this member's open monthly dues, oldest-first, always —
    // the one part of allocation that's never a choice.
    for (const obligation of monthlyObligations) {
      if (remaining.lessThanOrEqualTo(0)) break;
      await applyToObligation(
        obligation,
        obligation.contributionPlan.computationType,
      );
    }

    // Phase 2: the "pay more than you owe" case — extend forward into
    // future months of the same monthly plan. Scoped to members with
    // nothing else open (no one-time/event obligations competing for the
    // same money) — a mixed payment covering both monthly dues and a
    // separate one-time item in one go is a real but rarer case, and
    // guessing a priority between them isn't worth the risk; that case
    // keeps the old reject-on-overflow behavior below. Anchors off the
    // last monthly obligation this payment touched, or — if the member
    // had none open at all (already fully paid up, or a first-ever
    // payment made ahead of any obligation being generated) — their most
    // recent monthly obligation on record, so paying ahead works even
    // before an admin has generated the next one.
    // Tracked so the final overflow check below knows the difference
    // between "genuinely nothing left to apply this to" (reject) and
    // "there was somewhere to extend into, it just hit the safety cap"
    // (park the rest as credit balance instead).
    let monthlyExtensionEligible = false;
    if (remaining.greaterThan(0) && otherObligations.length === 0) {
      let anchor =
        monthlyObligations.length > 0
          ? monthlyObligations[monthlyObligations.length - 1]
          : await tx.obligation.findFirst({
              where: {
                memberId: dto.memberId,
                contributionPlan: { cadence: 'monthly' },
              },
              orderBy: { dueDate: 'desc' },
              include: { contributionPlan: true },
            });

      if (!anchor) {
        // Fallback: check if there's an active monthly plan for this member's organisation/chapter
        const member = await tx.member.findUnique({
          where: { id: dto.memberId },
          select: { chapterId: true, organisationId: true },
        });
        if (member) {
          const fallbackPlan = await tx.contributionPlan.findFirst({
            where: {
              organisationId: member.organisationId,
              cadence: 'monthly',
              status: 'ACTIVE',
              OR: [{ chapterId: member.chapterId }, { chapterId: null }],
            },
            orderBy: { chapterId: 'desc' }, // prioritize chapter-specific plans
          });
          if (fallbackPlan) {
            const today = new Date();
            const startOfMonth = new Date(
              Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1),
            );
            anchor = {
              id: '',
              organisationId: member.organisationId,
              memberId: dto.memberId,
              contributionPlanId: fallbackPlan.id,
              dueDate: startOfMonth,
              amountValue: fallbackPlan.amountValue,
              currency: fallbackPlan.currency,
              amountPaid: new Prisma.Decimal(0),
              status: 'DUE',
              createdAt: today,
              contributionPlan: fallbackPlan,
            } as unknown as typeof anchor;
          }
        }
      }

      if (anchor) {
        // The anchor is whichever plan version the member's last-touched
        // monthly obligation happened to be generated against — which can
        // be an old, now-SUPERSEDED version if a rate change landed since.
        // Eligibility has to reflect whether the *family* has a live
        // successor, not whether that specific anchor row is still ACTIVE.
        const family = await resolvePlanFamily(tx, anchor.contributionPlan);
        const activeTail = family.find(
          (p) => p.status === 'ACTIVE' && p.computationType === 'fixed',
        );

        if (activeTail) {
          monthlyExtensionEligible = true;
          let cursorDate = anchor.dueDate;
          let extended = 0;
          while (
            remaining.greaterThan(0) &&
            extended < MAX_MONTHLY_EXTENSION_MONTHS
          ) {
            cursorDate = addOneMonth(cursorDate);
            extended += 1;
            // Resolve whichever version's [effectiveFrom, effectiveTo)
            // window actually covers this future month — a rate change
            // effective partway through the extension range splits here.
            const effectivePlan =
              family.find(
                (v) =>
                  v.effectiveFrom &&
                  v.effectiveFrom <= cursorDate &&
                  (!v.effectiveTo || cursorDate < v.effectiveTo),
              ) ?? activeTail;
            const created = await tx.obligation.create({
              data: {
                organisationId,
                memberId: dto.memberId,
                contributionPlanId: effectivePlan.id,
                dueDate: cursorDate,
                amountValue: effectivePlan.amountValue,
                currency: effectivePlan.currency,
                status: 'DUE',
              },
            });
            await applyToObligation({
              id: created.id,
              amountValue: created.amountValue,
              amountPaid: created.amountPaid,
              contributionPlanId: effectivePlan.id,
            });
          }
        }
      }
    }

    // Phase 3: one-time/event obligations, per the org's policy — the
    // full open set for oldest_first, or just what was selected for
    // member_selected.
    for (const obligation of otherObligationsToAllocate) {
      if (remaining.lessThanOrEqualTo(0)) break;
      await applyToObligation(
        obligation,
        obligation.contributionPlan.computationType,
      );
    }

    // Whatever's left either becomes (or clears) the member's credit
    // balance — always written, even when it's back to zero, since a
    // previously-idle balance may have just been fully consumed above.
    const creditBalanceAfter = remaining.greaterThan(0)
      ? remaining
      : new Prisma.Decimal(0);
    await tx.member.update({
      where: { id: dto.memberId },
      data: { creditBalance: creditBalanceAfter },
    });

    if (remaining.greaterThan(0) && !monthlyExtensionEligible) {
      // Reached when there was nowhere to extend into at all (a mixed
      // monthly + one-time payment, member_selected's chosen items being
      // insufficient, or no monthly plan on record for this member) —
      // genuinely reject rather than silently dropping the excess. When
      // there *was* somewhere to extend into and it merely hit the
      // safety cap, the credit-balance write above already resolved it
      // and this is skipped.
      const scope =
        policy === 'member_selected'
          ? 'the selected obligations'
          : "this member's total open obligations";
      throw new BadRequestException(
        `Payment of ${dto.amountValue} exceeds ${scope} by ${remaining.toString()}`,
      );
    }

    // Deduct transaction fees (1.95% for Paystack, 0% for mock sandbox)
    const isPaystack = process.env.PAYMENT_PROVIDER === 'paystack';
    const feePercent = isPaystack ? 0.0195 : 0;
    const totalAmount = new Prisma.Decimal(dto.amountValue);
    const feeAmount = totalAmount.times(feePercent).toDecimalPlaces(2);
    const netAmount = totalAmount.minus(feeAmount);

    let feeAccountId: string | null = null;
    if (feeAmount.greaterThan(0)) {
      const existing = await tx.ledgerAccount.findFirst({
        where: { fundId: dto.fundId, name: 'Payment Provider Fees' },
      });
      feeAccountId = existing
        ? existing.id
        : (
            await tx.ledgerAccount.create({
              data: {
                organisationId,
                fundId: dto.fundId,
                name: 'Payment Provider Fees',
                type: 'EXPENSE',
              },
            })
          ).id;
    }

    // Credit balance is a real liability, not just a number on Member —
    // consuming or creating it this transaction has to appear as an
    // actual balancing line, or the entry (correctly) fails
    // LedgerService's debit==credit check. Net negative (consumed more
    // old credit than was newly created) needs a debit here on top of the
    // Cash debit; net positive (created more credit than was consumed)
    // needs a credit here alongside Contributions Income. Found-or-created
    // lazily since funds provisioned before this feature existed don't
    // have this account yet.
    const netCreditChange = creditBalanceAfter.minus(creditBalanceBefore);
    let creditAccountId: string | null = null;
    if (!netCreditChange.isZero()) {
      const existing = await tx.ledgerAccount.findFirst({
        where: { fundId: dto.fundId, name: 'Member Credit Balance' },
      });
      creditAccountId = existing
        ? existing.id
        : (
            await tx.ledgerAccount.create({
              data: {
                organisationId,
                fundId: dto.fundId,
                name: 'Member Credit Balance',
                type: 'LIABILITY',
              },
            })
          ).id;
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
            debit: netAmount.toString(),
            memberId: dto.memberId,
          },
          ...(feeAccountId && feeAmount.greaterThan(0)
            ? [
                {
                  ledgerAccountId: feeAccountId,
                  debit: feeAmount.toString(),
                  memberId: dto.memberId,
                },
              ]
            : []),
          ...allocations.map((allocation) => ({
            ledgerAccountId: incomeAccount.id,
            credit: allocation.amount.toString(),
            memberId: dto.memberId,
            obligationId: allocation.obligationId,
          })),
          ...(creditAccountId && netCreditChange.lessThan(0)
            ? [
                {
                  ledgerAccountId: creditAccountId,
                  debit: netCreditChange.abs().toString(),
                  memberId: dto.memberId,
                },
              ]
            : []),
          ...(creditAccountId && netCreditChange.greaterThan(0)
            ? [
                {
                  ledgerAccountId: creditAccountId,
                  credit: netCreditChange.toString(),
                  memberId: dto.memberId,
                },
              ]
            : []),
        ],
      },
    );

    // FR-DEF-02: "require arrears to be cleared before restoring good
    // standing" — a payment is exactly the event that can clear them, so
    // this is where reassessment fires, once per distinct plan touched
    // (oldest-first allocation can span more than one plan in a single
    // payment). No-op if the tenant hasn't configured a DefaulterPolicy.
    // Reads contributionPlanId directly off each allocation (recorded by
    // applyToObligation) rather than looking it up in openObligations,
    // since an extension-phase allocation targets an obligation that was
    // just created and was never part of that original open set.
    const touchedPlanIds = new Set(
      allocations.map((allocation) => allocation.contributionPlanId),
    );
    for (const planId of touchedPlanIds) {
      await this.defaulter.reassessInTx(
        tx,
        organisationId,
        dto.memberId,
        planId,
      );
    }

    return {
      journalEntry,
      allocations: allocations.map((allocation) => ({
        obligationId: allocation.obligationId,
        amount: allocation.amount.toString(),
      })),
    };
  }
}
