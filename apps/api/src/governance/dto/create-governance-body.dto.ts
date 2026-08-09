import { IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

// §8.3, FR-GOV-01. membershipCompositionRule/quorumRule/tieBreakRule/
// meetingCadence are free-form — see the schema comment on GovernanceBody
// for why nothing structures or evaluates them yet.
export class CreateGovernanceBodyDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsString()
  membershipCompositionRule?: string;

  @IsOptional()
  @IsString()
  quorumRule?: string;

  @IsOptional()
  @IsString()
  tieBreakRule?: string;

  @IsOptional()
  @IsString()
  meetingCadence?: string;

  // FR-GOV-02: how many consecutive terms a member may hold the same
  // office in this body before a cooling-off period is required. Omitted
  // entirely means no limit — most tenants won't configure this.
  @IsOptional()
  @IsInt()
  @Min(1)
  maxConsecutiveTerms?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  coolingOffPeriodMonths?: number;
}
