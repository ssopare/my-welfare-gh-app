import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { NotificationTypeValue } from './notification.service';

// The full catalogue this settings page always shows — kept here (not
// derived from the DB) so a NotificationType with no row yet still shows
// up as an explicit "off" toggle rather than silently missing from the
// list. Mirrors NotificationService's own hand-rolled union rather than
// importing the Prisma-generated enum, for the same reason noted there.
const ALL_NOTIFICATION_TYPES: NotificationTypeValue[] = [
  'CONTRIBUTION_DUE_REMINDER',
  'DEFAULTER_RISK_ALERT',
  'CLAIM_STAGE_ENTERED',
  'CLAIM_STATUS_CHANGED',
  'SUBSCRIPTION_LAPSED',
  'MEMBER_JOIN_PENDING',
];

// Platform-operator-managed, not tenant-scoped — same reasoning as
// SubscriptionPlanService (see its own file comment): no RLS, no
// withTenant, writes gated by PlatformAuthGuard at the controller.
@Injectable()
export class NotificationChannelSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const rows = await this.prisma.notificationChannelSetting.findMany();
    const byType = new Map(rows.map((r) => [r.notificationType, r]));
    return ALL_NOTIFICATION_TYPES.map(
      (notificationType) =>
        byType.get(notificationType) ?? {
          id: null,
          notificationType,
          smsEnabled: false,
          updatedAt: null,
        },
    );
  }

  update(notificationType: NotificationTypeValue, smsEnabled: boolean) {
    return this.prisma.notificationChannelSetting.upsert({
      where: { notificationType },
      update: { smsEnabled },
      create: { notificationType, smsEnabled },
    });
  }
}
