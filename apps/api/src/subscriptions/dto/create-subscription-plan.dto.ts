import {
  IsArray,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

// The only module keys ModuleAccessGuard currently recognizes anything
// for — kept here (not a shared enum) since this DTO is the one place
// that has to validate a submitted value against it.
export const SUBSCRIPTION_PLAN_MODULES = ['voting'] as const;

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

  // Optional feature modules this plan entitles an organisation to — see
  // SubscriptionPlan.includedModules and ModuleAccessGuard. Defaults to
  // none when omitted.
  @IsOptional()
  @IsArray()
  @IsIn(SUBSCRIPTION_PLAN_MODULES, { each: true })
  includedModules?: string[];
}
