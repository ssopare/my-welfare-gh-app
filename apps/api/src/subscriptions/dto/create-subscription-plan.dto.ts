import {
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

// FR-SUB-04. amountValue is a numeric *string* deliberately — same reasoning
// as CreateContributionPlanDto: money never round-trips through a JS float.
export class CreateSubscriptionPlanDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsNumberString()
  priceAmount!: string;

  @IsString()
  @MinLength(3)
  currency!: string;

  // Free-form per §18.2 ("monthly, termly, or annual... not a fixed choice
  // baked into the app"), but constrained to what SubscriptionService's
  // period-length calculation actually understands.
  @IsIn(['monthly', 'termly', 'annual'])
  billingCadence!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  trialDays?: number;

  // The platform's cut of every contribution auto-disbursed for an
  // organisation on this plan (see AutoDisbursement) — scoped to the
  // plan, not a single global number, so future tiers can carry
  // different rates without a migration. Platform-operator-set only
  // (this DTO is only ever reachable via PlatformAuthGuard); defaults to
  // '0' when omitted.
  @IsOptional()
  @IsNumberString()
  platformFeePercentage?: string;
}
