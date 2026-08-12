import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumberString,
  IsOptional,
  IsUUID,
  Min,
  IsString,
  MinLength,
} from 'class-validator';

// FR-LED-01/02. amountValue is a numeric *string* deliberately — money
// should never round-trip through a JS float, and Prisma's Decimal field
// accepts a string directly.
export class CreateContributionPlanDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['monthly', 'one_time', 'event_triggered'])
  cadence!: string;

  // Only 'fixed' is actually evaluated by RuleEngineService right now — see
  // the schema comment on ContributionPlan.computationType.
  @IsOptional()
  @IsIn(['fixed'])
  computationType?: string;

  @IsNumberString()
  amountValue!: string;

  @IsString()
  @MinLength(3)
  currency!: string;

  @IsOptional()
  @IsIn(['push', 'payroll'])
  collectionMechanism?: string;

  // Which Fund a payment against this plan should default to — see the
  // schema comment on ContributionPlan.defaultFundId.
  @IsOptional()
  @IsUUID()
  defaultFundId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minTenureMonths?: number;

  @IsOptional()
  @IsBoolean()
  goodStandingRequired?: boolean;

  // §12.4's three contribution-side grace-period concepts — see the schema
  // comment on ContributionPlan for why they're kept separate. Not consumed
  // anywhere until the defaulter slice (§14): paymentGracePeriodDays feeds
  // DefaulterService's missed-period computation, reinstatementWaitingPeriodMonths
  // feeds its reinstatement-to-PROBATION-not-ACTIVE step.
  @IsOptional()
  @IsInt()
  @Min(0)
  joiningGracePeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  paymentGracePeriodDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  reinstatementWaitingPeriodMonths?: number;

  // FR-COM-01: unset means no due-date reminder is ever sent for this
  // plan — see the schema comment on ContributionPlan.
  @IsOptional()
  @IsInt()
  @Min(0)
  reminderDaysBeforeDue?: number;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  // Set when this plan amends an existing ACTIVE one — see activate().
  @IsOptional()
  @IsUUID()
  supersedesId?: string;
}
