import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireSelfOrAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';

type NotificationTypeValue =
  | 'CONTRIBUTION_DUE_REMINDER'
  | 'DEFAULTER_RISK_ALERT'
  | 'CLAIM_STAGE_ENTERED'
  | 'CLAIM_STATUS_CHANGED'
  | 'SUBSCRIPTION_LAPSED';

// §8.11, FR-COM-01/02, Phase 1 scope only. No SMS/push/email provider
// exists for this project (unlike Payments, nothing in the roadmap names
// one to eventually integrate) — this is a real, durable in-app inbox, not
// a dispatch-to-an-external-channel system. See the schema comment on
// Notification.
@Injectable()
export class NotificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  // Always called from inside a caller's already-open transaction
  // (ClaimService, NotificationSchedulerService) — never opens its own,
  // same InTx pattern as LedgerService.postJournalEntryInTx. Dedup via
  // sourceType/sourceId when supplied: "already reminded about obligation
  // X" should never fire twice, but an ordinary claim-status notification
  // has no natural dedup key and doesn't need one — each call is already
  // one real event.
  async notifyInTx(
    tx: Prisma.TransactionClient,
    organisationId: string,
    memberId: string,
    type: NotificationTypeValue,
    message: string,
    source?: { sourceType: string; sourceId: string },
  ) {
    if (source) {
      const existing = await tx.notification.findFirst({
        where: {
          memberId,
          type,
          sourceType: source.sourceType,
          sourceId: source.sourceId,
        },
      });
      if (existing) {
        return existing;
      }
    }
    return tx.notification.create({
      data: {
        organisationId,
        memberId,
        type,
        message,
        sourceType: source?.sourceType,
        sourceId: source?.sourceId,
      },
    });
  }

  async listForMember(actor: AuthTokenPayload, memberId: string) {
    await requireSelfOrAdmin(this.rbac, actor, memberId);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.notification.findMany({
        where: { memberId },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  // Fetches outside the check, then checks, then writes — RbacService's own
  // transaction can't nest inside one already open (same pattern as
  // ClaimService.addEvidence).
  async markRead(actor: AuthTokenPayload, id: string) {
    const notification = await this.prisma.withTenant(
      actor.organisationId,
      async (tx) => {
        const found = await tx.notification.findUnique({ where: { id } });
        if (!found) {
          throw new NotFoundException('Notification not found');
        }
        return found;
      },
    );
    await requireSelfOrAdmin(this.rbac, actor, notification.memberId);
    return this.prisma.withTenant(actor.organisationId, (tx) =>
      tx.notification.update({
        where: { id },
        data: { readAt: new Date() },
      }),
    );
  }
}
