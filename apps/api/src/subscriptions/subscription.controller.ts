import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthTokenPayload } from '../auth/auth.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlatformAuthGuard } from '../platform-auth/platform-auth.guard';
import { ConvertSubscriptionDto } from './dto/convert-subscription.dto';
import { UpdateSubscriptionStatusDto } from './dto/update-subscription-status.dto';
import { SkipSubscriptionCheck } from './skip-subscription-check.decorator';
import { SubscriptionService } from './subscription.service';

@Controller()
export class SubscriptionController {
  constructor(private readonly subscriptions: SubscriptionService) {}

  @UseGuards(JwtAuthGuard)
  @Get('subscription')
  getOwn(@CurrentUser() user: AuthTokenPayload) {
    return this.subscriptions.getOwn(user);
  }

  @UseGuards(JwtAuthGuard)
  @SkipSubscriptionCheck()
  @Post('subscription/convert')
  convert(
    @CurrentUser() user: AuthTokenPayload,
    @Body() dto: ConvertSubscriptionDto,
  ) {
    return this.subscriptions.convertToPaid(user, dto);
  }

  @UseGuards(PlatformAuthGuard)
  @Get('platform/subscriptions')
  listAllForOperator() {
    return this.subscriptions.listAllForOperator();
  }

  @UseGuards(PlatformAuthGuard)
  @Patch('platform/organisations/:organisationId/subscription')
  updateStatusForOperator(
    @Param('organisationId') organisationId: string,
    @Body() dto: UpdateSubscriptionStatusDto,
  ) {
    return this.subscriptions.updateStatusForOperator(organisationId, dto);
  }
}
