import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumberString,
  IsOptional,
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

  // Which network to prompt for approval — not required at this layer:
  // MockPaymentProvider (the default) never reads it, so existing
  // MOBILE_MONEY payments through the mock/test path shouldn't have to
  // supply it. PaystackPaymentProvider — the one implementation that
  // actually needs this for a real charge — enforces it's present itself,
  // right where the requirement genuinely comes from.
  @IsOptional()
  @IsIn(['mtn', 'vod', 'atl'])
  momoProvider?: 'mtn' | 'vod' | 'atl';

  // Same meaning as RecordContributionPaymentDto.obligationIds — required
  // (and validated) when the org's paymentAllocationPolicy is
  // 'member_selected'. Stored on the PaymentIntent since a real payment
  // confirms asynchronously; see PaymentIntent.obligationIds.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  obligationIds?: string[];
}
