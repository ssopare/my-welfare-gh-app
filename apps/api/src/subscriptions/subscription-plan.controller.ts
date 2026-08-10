import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PlatformAuthGuard } from '../platform-auth/platform-auth.guard';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';
import { SubscriptionPlanService } from './subscription-plan.service';

@Controller()
export class SubscriptionPlanController {
  constructor(private readonly plans: SubscriptionPlanService) {}

  // Public — no guard. A pricing page needs this before any account, let
  // alone any organisation, exists.
  @Get('subscription-plans')
  list(@Query('includeArchived') includeArchived?: string) {
    return this.plans.list(includeArchived === 'true');
  }

  @UseGuards(PlatformAuthGuard)
  @Post('platform/subscription-plans')
  create(@Body() dto: CreateSubscriptionPlanDto) {
    return this.plans.create(dto);
  }

  @UseGuards(PlatformAuthGuard)
  @Patch('platform/subscription-plans/:id/archive')
  archive(@Param('id') id: string) {
    return this.plans.archive(id);
  }
}
