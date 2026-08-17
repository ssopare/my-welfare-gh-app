import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client';
import type { AuthTokenPayload } from '../auth/auth.service';
import { requireSelfOrAdmin } from '../common/access.util';
import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { SmsService } from '../sms/sms.service';

export type NotificationTypeValue =
  | 'CONTRIBUTION_DUE_REMINDER'
  | 'DEFAULTER_RISK_ALERT'
  | 'CLAIM_STAGE_ENTERED'
  | 'CLAIM_STATUS_CHANGED'
  | 'SUBSCRIPTION_LAPSED'
  | 'MEMBER_JOIN_PENDING';

// §8.11, FR-COM-01/02. This in-app inbox is the one always-on channel —
// every notification lands here regardless of settings. A real SMS module
// (SmsModule, Arkesel/mNotify/Hubtel with failover) now also exists;
// whether a given NotificationType *additionally* dispatches an SMS is a
// platform-operator-controlled per-type toggle (NotificationChannelSetting,
// see NotificationChannelSettingService), not a blanket "SMS for
// everything" switch. See the schema comment on Notification.
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
    private readonly sms: SmsService,
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
    const notification = await tx.notification.create({
      data: {
        organisationId,
        memberId,
        type,
        message,
        sourceType: source?.sourceType,
        sourceId: source?.sourceId,
      },
    });
    this.dispatchSmsIfEnabled(organisationId, memberId, type, message);
    return notification;
  }

  // Deliberately NOT awaited by notifyInTx and deliberately NOT using the
  // caller's `tx` — that client stops being valid the instant the caller's
  // transaction (which this function outlives) commits or rolls back, and
  // an external SMS gateway call (with up to 3 failover attempts) inside
  // that transaction would hold its DB connection open for however long
  // the gateway takes, on every one of notifyInTx's several loop-over-
  // recipients call sites. Trade-off: on the rare rollback-after-notify
  // path, an SMS can go out for a notification that never actually
  // persisted. Given this only fires when a platform operator has opted a
  // type into SMS at all, that's judged an acceptable edge case against
  // blocking real transactions on network latency.
  private dispatchSmsIfEnabled(
    organisationId: string,
    memberId: string,
    type: NotificationTypeValue,
    message: string,
  ): void {
    void this.prisma
      .withTenant(organisationId, async (freshTx) => {
        const setting = await freshTx.notificationChannelSetting.findUnique({
          where: { notificationType: type },
        });
        if (!setting?.smsEnabled) {
          return;
        }
        const member = await freshTx.member.findUnique({
          where: { id: memberId },
          include: { account: { select: { phoneNumber: true } } },
        });
        const phone = member?.account?.phoneNumber;
        if (!phone) {
          return;
        }
        await this.sms.sendSms({
          to: phone,
          message,
          type: 'TRANSACTIONAL',
          organisationId,
        });
      })
      .catch((err: unknown) => {
        this.logger.error(
          `SMS dispatch for ${type} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
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
