import { randomUUID } from 'node:crypto';
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireAdmin, requireSelfOrAdmin } from '../common/access.util';
import { ObligationService } from '../ledger/obligation.service';
import { PrismaService } from '../prisma/prisma.service';
import { InitiateContributionPaymentDto } from './dto/initiate-contribution-payment.dto';
import { WebhookPayloadDto } from './dto/webhook-payload.dto';
import { PAYMENT_PROVIDER } from './providers/payment-provider.interface';
import type { PaymentProvider } from './providers/payment-provider.interface';

@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly obligations: ObligationService,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  // Phase 1, FR-PAY-01: a real payment is asynchronous — this only starts
  // it. The PaymentIntent's status stays INITIATED until handleWebhook
  // confirms an outcome; nothing gets posted to the ledger here.
  async initiateContributionPayment(
    actor: AuthTokenPayload,
    dto: InitiateContributionPaymentDto,
  ) {
    requireSelfOrAdmin(actor, dto.memberId);

    return this.prisma.withTenant(actor.organisationId, async (tx) => {
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
          providerReference: `pending_${randomUUID()}`,
        },
      });

      const { providerReference } = await this.provider.initiatePayment({
        organisationId: actor.organisationId,
        amountValue: dto.amountValue,
        currency: dto.currency,
        channel: dto.channel,
        metadata: {
          organisationId: actor.organisationId,
          reference: intent.id,
        },
      });

      return tx.paymentIntent.update({
        where: { id: intent.id },
        data: { providerReference },
      });
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

      const { journalEntry } =
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
          },
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
      };
    });
  }

  async findOne(actor: AuthTokenPayload, id: string) {
    return this.prisma.withTenant(actor.organisationId, async (tx) => {
      const intent = await tx.paymentIntent.findUnique({ where: { id } });
      if (!intent) {
        throw new NotFoundException('Payment intent not found');
      }
      requireSelfOrAdmin(actor, intent.memberId);
      return intent;
    });
  }

  async listReconciliationExceptions(actor: AuthTokenPayload) {
    requireAdmin(actor);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.reconciliationException.findMany({
        where: { resolvedAt: null },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async resolveReconciliationException(actor: AuthTokenPayload, id: string) {
    requireAdmin(actor);
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
