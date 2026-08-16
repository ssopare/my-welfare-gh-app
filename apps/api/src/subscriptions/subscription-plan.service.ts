import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubscriptionPlanDto } from './dto/create-subscription-plan.dto';

// FR-SUB-04: "editable by the platform operator through an admin screen,
// never hardcoded in application code." Not tenant data — no RLS, no
// withTenant/withPlatformOperatorContext needed for reads; writes are
// gated by PlatformAuthGuard at the controller instead (see
// PlatformOperator's schema comment for why nothing here needs a session
// variable the way cross-tenant Subscription access does).
@Injectable()
export class SubscriptionPlanService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateSubscriptionPlanDto) {
    return this.prisma.subscriptionPlan.create({
      data: {
        name: dto.name,
        priceAmount: dto.priceAmount,
        currency: dto.currency,
        billingCadence: dto.billingCadence,
        trialDays: dto.trialDays ?? 60,
        platformFeePercentage: dto.platformFeePercentage ?? '0',
      },
    });
  }

  // Public — a tenant browsing plans to convert into, or a prospective
  // tenant on a pricing page, needs this before any auth exists at all.
  list(includeArchived = false) {
    return this.prisma.subscriptionPlan.findMany({
      where: includeArchived ? undefined : { archived: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  async archive(id: string) {
    const plan = await this.prisma.subscriptionPlan.findUnique({
      where: { id },
    });
    if (!plan) {
      throw new NotFoundException('Subscription plan not found');
    }
    return this.prisma.subscriptionPlan.update({
      where: { id },
      data: { archived: true },
    });
  }
}
