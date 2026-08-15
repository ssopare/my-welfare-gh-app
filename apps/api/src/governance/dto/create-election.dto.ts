import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  IsArray,
} from 'class-validator';

export class CreateElectionDto {
  @IsString()
  @MinLength(1)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(['OFFICER', 'ISSUE'])
  type!: 'OFFICER' | 'ISSUE';

  @IsOptional()
  @IsBoolean()
  isAnonymous?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  quorumPercentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  passPercentage?: number;

  @IsOptional()
  @IsDateString()
  nominationStartsAt?: string;

  @IsOptional()
  @IsDateString()
  nominationEndsAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  minNomineeTenureMonths?: number;

  @IsOptional()
  @IsBoolean()
  requireGoodStandingForNominee?: boolean;

  @IsOptional()
  @IsBoolean()
  requireNoArrearsForNominee?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  minSecondersRequired?: number;

  @IsDateString()
  startsAt!: string;

  @IsDateString()
  endsAt!: string;

  // Options for ISSUE referendums (e.g. Yes, No, Abstain)
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  // Direct nominee Member IDs if bypassing the nomination phase
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  nomineeMemberIds?: string[];
}
