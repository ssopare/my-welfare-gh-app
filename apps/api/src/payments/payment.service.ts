import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin, requireSelfOrAdmin } from '../common/access.util';
import { OPEN_STATUSES, ObligationService } from '../ledger/obligation.service';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { InitiateContributionPaymentDto } from './dto/initiate-contribution-payment.dto';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import type { PaymentProvider } from './providers/payment-provider.interface';
import { PaymentIntent, Prisma } from '../../generated/prisma/client';
import { PayoutService } from './payout.service';
@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly obligations: ObligationService,
    private readonly rbac: RbacService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly payouts: PayoutService,
  ) {}

  // Phase 1, FR-PAY-01: a real payment is asynchronous — this only starts
  // it. The PaymentIntent's status stays INITIATED until handleWebhook
  // confirms an outcome; nothing gets posted to the ledger here.
  async initiateContributionPayment(
    actor: AuthTokenPayload,
    dto: InitiateContributionPaymentDto,
  ): Promise<PaymentIntent & { displayText?: string }> {
    await requireSelfOrAdmin(this.rbac, actor, dto.memberId);

    // Same guard PayoutService.createPayoutRequest already has — amountValue
    // is only class-validator's @IsNumberString here, which accepts "0" and
    // negative strings. Without this, a zero/negative amount would sail
    // through MockPaymentProvider (which never checks it) and, once
    // confirmed, post a reversing entry to the real ledger. A real Paystack
    // charge would likely reject it too, but that's a third party's
    // validation to rely on, not ours.
    if (new Prisma.Decimal(dto.amountValue).lessThanOrEqualTo(0)) {
      throw new BadRequestException('Amount must be positive');
    }

    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      // Only a fail-fast, policy-consistency check here — whether the
      // selected ids are still genuinely open for this member is
      // authoritatively re-checked at confirmation time by
      // recordContributionPaymentInTx, since a real payment is
      // asynchronous and the member's obligations could change in the
      // meantime (e.g. another payment settling one first). The rules
      // themselves have to match recordContributionPaymentInTx's exactly
      // — this used to be a stricter, independently-drifted copy (always
      // required a selection under member_selected regardless of whether
      // there was anything to select, and always forbade one under
      // oldest_first) that caused a real payment to be wrongly rejected;
      // see that method's own comments for why selecting which
      // contribution *types* to pay is policy-independent now.
      const organisation = await tx.organisation.findUnique({
        where: { id: actor.organisationId },
      });
      const openObligations = await tx.obligation.findMany({
        where: { memberId: dto.memberId, status: { in: [...OPEN_STATUSES] } },
        include: { contributionPlan: true },
      });
      const monthlyIds = new Set(
        openObligations
          .filter((o) => o.contributionPlan.cadence === 'monthly')
          .map((o) => o.id),
      );
      const otherObligationsCount = openObligations.filter(
        (o) => o.contributionPlan.cadence !== 'monthly',
      ).length;

      if ((dto.obligationIds ?? []).some((id) => monthlyIds.has(id))) {
        throw new BadRequestException(
          'Monthly contributions are applied automatically and cannot be individually selected',
        );
      }
      if (
        organisation?.paymentAllocationPolicy === 'member_selected' &&
        otherObligationsCount > 0 &&
        !dto.obligationIds?.length
      ) {
        throw new BadRequestException(
          'This organisation requires selecting which obligations a payment covers',
        );
      }

      const member = await tx.member.findUnique({
        where: { id: dto.memberId },
        include: { account: { select: { phoneNumber: true } } },
      });
      if (!member) {
        throw new NotFoundException('Member not found');
      }

      // Placeholder, globally unique, satisfies the not-null unique
      // constraint until the provider assigns its own reference below —
      // providers issue their own transaction ids, so this can't be known
      // before calling them.
      const intent = await tx.paymentIntent.create({
        data: {
          organisationId: actor.organisationId,
          memberId: dto.memberId,
          fundId: dto.fundId,
          channel: dto.channel,
          amountValue: dto.amountValue,
          currency: dto.currency,
          obligationIds: dto.obligationIds ?? [],
          providerReference: `pending_${randomUUID()}`,
        },
      });

      // No SettlementAccount lookup here — routing an org's own share of
      // a contribution is now handled entirely by the async
      // auto-disbursement path (PayoutService.triggerAutoDisbursementIfEnabledInTx,
      // fired after this payment is confirmed), not by attaching
      // anything to the inbound charge itself.
      const result = await this.provider.initiatePayment({
        organisationId: actor.organisationId,
        amountValue: dto.amountValue,
        currency: dto.currency,
        channel: dto.channel,
        phoneNumber: member.account.phoneNumber,
        momoProvider: dto.momoProvider,
        metadata: {
          organisationId: actor.organisationId,
          reference: intent.id,
        },
      });

      const providerReference = result.providerReference;
      const displayText = result.displayText;

      const updated = await tx.paymentIntent.update({
        where: { id: intent.id },
        data: { providerReference },
      });

      // displayText (e.g. Paystack's MoMo "please dial *170#..." prompt)
      // is presentational only — shown once here, never persisted on the
      // PaymentIntent row itself.
      return { ...updated, displayText };
    });
  }

  // FR-PAY-04: deduplicated by provider transaction id before ledger
  // posting; a second delivery of an already-processed webhook is a no-op,
  // never a double-post. organisationId is expected to be whatever the
  // provider echoes back from the metadata set at initiate time — see the
  // PaymentProvider interface — so this never needs an anonymous,
  // cross-tenant lookup: it's always inside a normal withTenant context.
  async handleWebhook(dto: WebhookPayloadDto) {
    return this.prisma.withTenant(dto.organisationId, async (tx) => {
      const intent = await tx.paymentIntent.findUnique({
        where: { providerReference: dto.providerReference },
      });

      if (!intent) {
        await tx.reconciliationException.create({
          data: {
            organisationId: dto.organisationId,
            providerReference: dto.providerReference,
            reason:
              'Webhook referenced an unknown providerReference for this organisation',
          },
        });
        return { outcome: 'unmatched' as const };
      }

      if (intent.status !== 'INITIATED') {
        const reportedOutcome =
          dto.status === 'succeeded' ? 'SUCCEEDED' : 'FAILED';
        if (intent.status !== reportedOutcome) {
          // A genuine conflict (e.g. reported succeeded after we already
          // recorded it failed) is worth flagging even though the intent
          // is already terminal — an already-matching repeat delivery is
          // just idempotent no-op, not an exception.
          await tx.reconciliationException.create({
            data: {
              organisationId: dto.organisationId,
              providerReference: dto.providerReference,
              reason: `Webhook reported "${dto.status}" but this payment was already recorded as ${intent.status}`,
            },
          });
        }
        return {
          outcome: 'already_processed' as const,
          intentStatus: intent.status,
        };
      }

      if (dto.status === 'failed') {
        await tx.paymentIntent.update({
          where: { id: intent.id },
          data: { status: 'FAILED', completedAt: new Date() },
        });
        return { outcome: 'failed' as const };
      }

      const { journalEntry, netAmount } =
        await this.obligations.recordContributionPaymentInTx(
          tx,
          dto.organisationId,
          intent.memberId,
          {
            memberId: intent.memberId,
            fundId: intent.fundId,
            amountValue: intent.amountValue.toString(),
            currency: intent.currency,
            reference: intent.providerReference,
            obligationIds: intent.obligationIds.length
              ? intent.obligationIds
              : undefined,
          },
          'verified',
        );

      const autoDisbursement =
        await this.payouts.triggerAutoDisbursementIfEnabledInTx(
          tx,
          dto.organisationId,
          intent.fundId,
          intent.id,
          netAmount,
        );

      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          status: 'SUCCEEDED',
          completedAt: new Date(),
          journalEntryId: journalEntry.id,
        },
      });

      return {
        outcome: 'succeeded' as const,
        journalEntryId: journalEntry.id,
        autoDisbursementId: autoDisbursement?.id,
      };
    });
  }

  async findOne(actor: AuthTokenPayload, id: string) {
    // Fetched in its own, already-closed transaction before the
    // requireSelfOrAdmin check runs — that check itself opens a
    // transaction via RbacService, and Prisma's interactive transactions
    // don't nest, so the permission check can't happen from inside the
    // withTenant callback that first learns intent.memberId.
    const intent = await this.prisma.withTenant(
      actor.organisationId,
      async (tx) => {
        const found = await tx.paymentIntent.findUnique({ where: { id } });
        if (!found) {
          throw new NotFoundException('Payment intent not found');
        }
        return found;
      },
    );
    await requireSelfOrAdmin(this.rbac, actor, intent.memberId);
    return intent;
  }

  // Deliberately the one endpoint in this whole app visible to any
  // authenticated member of the org, not gated by requireSelfOrAdmin or
  // requireAdmin — reproducing the real practice this feature is modeled
  // on (a welfare group posting contribution payments to its WhatsApp
  // chat as they land, so everyone can see who's current). Sourced from
  // JournalLine, not Obligation.amountPaid/status: the ledger is this
  // system's actual append-only record of when money moved, whereas
  // amountPaid/status are mutable running totals that collapse multiple
  // partial payments into one final number, losing the individual
  // payment events a feed needs. Capped at 100 — a feed, not a full
  // historical export (Reporting already covers that, admin-only).
  async listActivity(actor: AuthTokenPayload) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const lines = await tx.journalLine.findMany({
        where: {
          obligationId: { not: null },
          ledgerAccount: { name: 'Contributions Income' },
        },
        select: {
          credit: true,
          journalEntry: {
            select: { postedAt: true, sourceType: true, createdBy: true },
          },
          obligation: {
            select: {
              dueDate: true,
              contributionPlan: { select: { name: true, cadence: true } },
              member: {
                select: {
                  account: { select: { name: true, phoneNumber: true } },
                },
              },
            },
          },
        },
        orderBy: { journalEntry: { postedAt: 'desc' } },
        take: 100,
      });

      // Only a manually-recorded entry needs its recorder's name resolved
      // — a verified one was self-attested by the paying member, already
      // covered by obligation.member above. Most feeds are all-verified,
      // so this join is usually a no-op.
      const manualRecorderIds = new Set(
        lines
          .filter(
            (l) => l.journalEntry.sourceType === 'contribution_payment_manual',
          )
          .map((l) => l.journalEntry.createdBy),
      );
      const recorders = manualRecorderIds.size
        ? await tx.member.findMany({
            where: { id: { in: Array.from(manualRecorderIds) } },
            include: { account: { select: { name: true, phoneNumber: true } } },
          })
        : [];
      const recorderById = new Map(recorders.map((r) => [r.id, r.account]));

      return lines.map((line) => {
        const verified =
          line.journalEntry.sourceType !== 'contribution_payment_manual';
        const recorder = verified
          ? null
          : recorderById.get(line.journalEntry.createdBy);
        return {
          credit: line.credit,
          journalEntry: { postedAt: line.journalEntry.postedAt },
          obligation: line.obligation,
          verified,
          recordedByName: recorder?.name ?? null,
        };
      });
    });
  }

  async listReconciliationExceptions(actor: AuthTokenPayload) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.reconciliationException.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async resolveReconciliationException(actor: AuthTokenPayload, id: string) {
    await requireAdmin(this.rbac, actor);
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const exception = await tx.reconciliationException.findUnique({
        where: { id },
      });
      if (!exception) {
        throw new NotFoundException('Reconciliation exception not found');
      }
      return tx.reconciliationException.update({
        where: { id },
        data: { resolvedAt: new Date(), resolvedBy: actor.memberId },
      });
    });
  }
}
