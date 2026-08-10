import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationService } from './notification.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class NotificationController {
  constructor(private readonly notifications: NotificationService) {}

  @Get('members/:memberId/notifications')
  listForMember(
    @CurrentUser() user: AuthTokenPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.notifications.listForMember(user, memberId);
  }

  @Patch('notifications/:id/read')
  markRead(@CurrentUser() user: AuthTokenPayload, @Param('id') id: string) {
    return this.notifications.markRead(user, id);
  }
}
