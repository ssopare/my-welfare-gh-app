import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

// FR-RULE-04, §11.2/11.3's worked examples.
export class CreateBenefitRuleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  triggerEvent!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  subjectTypes!: string[];

  @IsNumberString()
  amountValue!: string;

  @IsString()
  @MinLength(3)
  currency!: string;

  @IsOptional()
  @IsString()
  occurrenceCapScope?: string;

  @IsInt()
  @Min(1)
  occurrenceCapMax!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minTenureMonths?: number;

  @IsOptional()
  @IsBoolean()
  goodStandingRequired?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxConsecutiveMissedPeriods?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceRequired?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvalChain?: string[];

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  @IsOptional()
  @IsUUID()
  supersedesId?: string;
}
