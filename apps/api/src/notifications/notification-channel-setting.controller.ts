import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { PlatformAuthGuard } from '../platform-auth/platform-auth.guard';
import { UpdateNotificationChannelSettingDto } from './dto/update-notification-channel-setting.dto';
import { NotificationChannelSettingService } from './notification-channel-setting.service';
import type { NotificationTypeValue } from './notification.service';

const VALID_TYPES: NotificationTypeValue[] = [
  'CONTRIBUTION_DUE_REMINDER',
  'DEFAULTER_RISK_ALERT',
  'CLAIM_STAGE_ENTERED',
  'CLAIM_STATUS_CHANGED',
  'SUBSCRIPTION_LAPSED',
  'MEMBER_JOIN_PENDING',
];

@Controller('platform/notification-channel-settings')
@UseGuards(PlatformAuthGuard)
export class NotificationChannelSettingController {
  constructor(private readonly settings: NotificationChannelSettingService) {}

  @Get()
  list() {
    return this.settings.list();
  }

  @Patch(':notificationType')
  update(
    @Param('notificationType') notificationType: string,
    @Body() dto: UpdateNotificationChannelSettingDto,
  ) {
    if (!VALID_TYPES.includes(notificationType as NotificationTypeValue)) {
      throw new BadRequestException(
        `Unknown notification type: ${notificationType}`,
      );
    }
    return this.settings.update(
      notificationType as NotificationTypeValue,
      dto.smsEnabled,
    );
  }
}
