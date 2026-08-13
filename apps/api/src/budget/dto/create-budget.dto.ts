import {
  IsDateString,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateBudgetDto {
  @IsUUID()
  ledgerAccountId!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsNumberString()
  amountValue!: string;
}
