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

  @IsOptional()
  @IsInt()
  @Min(0)
  minTenureMonths?: number;

  @IsOptional()
  @IsBoolean()
  goodStandingRequired?: boolean;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  // Set when this plan amends an existing ACTIVE one — see activate().
  @IsOptional()
  @IsUUID()
  supersedesId?: string;
}
