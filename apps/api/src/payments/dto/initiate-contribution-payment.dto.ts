import {
  IsIn,
  IsNumberString,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class InitiateContributionPaymentDto {
  @IsUUID()
  memberId!: string;

  @IsUUID()
  fundId!: string;

  @IsNumberString()
  amountValue!: string;

  @IsString()
  @MinLength(3)
  currency!: string;

  @IsIn(['MOBILE_MONEY', 'CARD', 'BANK_TRANSFER'])
  channel!: 'MOBILE_MONEY' | 'CARD' | 'BANK_TRANSFER';
}
