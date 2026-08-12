import {
  ArrayMinSize,
  IsArray,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

// Phase 1 scope: this *records* that a payment was received (e.g. a
// treasurer entering a cash/mobile-money payment they collected) — it does
// not itself talk to a payment provider. Wiring a real gateway webhook to
// call the same underlying ObligationService.recordContributionPayment is
// roadmap slice 5 (Payments); the accounting and allocation logic here is
// exactly what that slice will reuse, not something it replaces.
export class RecordContributionPaymentDto {
  @IsUUID()
  memberId!: string;

  @IsUUID()
  fundId!: string;

  @IsNumberString()
  amountValue!: string;

  @IsString()
  @MinLength(3)
  currency!: string;

  @IsOptional()
  @IsString()
  reference?: string;

  // Only meaningful (and required) when the org's paymentAllocationPolicy
  // is 'member_selected' — which specific open obligations this payment
  // should cover, rather than the default oldest-due-first sweep across
  // everything open. See recordContributionPaymentInTx for the validation
  // and allocation logic.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  obligationIds?: string[];
}
