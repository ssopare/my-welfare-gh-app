import {
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class TransferFundsDto {
  @IsUUID()
  toFundId!: string;

  @IsNumberString()
  amountValue!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  description?: string;
}
