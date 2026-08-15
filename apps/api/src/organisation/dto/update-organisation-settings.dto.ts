import { IsIn, IsOptional, IsString } from 'class-validator';

// Only the policy values ObligationService actually implements are
// accepted here — 'oldest_first' (the default) and 'member_selected'.
// Organisation.paymentAllocationPolicy itself stores the full FR-LEDGER-07
// vocabulary as a free string so a later implementation never needs a
// migration, but this DTO shouldn't let an admin opt into a value nothing
// can actually apply yet.
const IMPLEMENTED_PAYMENT_ALLOCATION_POLICIES = [
  'oldest_first',
  'member_selected',
] as const;

export class UpdateOrganisationSettingsDto {
  @IsOptional()
  @IsIn(IMPLEMENTED_PAYMENT_ALLOCATION_POLICIES)
  paymentAllocationPolicy?: (typeof IMPLEMENTED_PAYMENT_ALLOCATION_POLICIES)[number];

  @IsOptional()
  @IsIn(['PASSWORD_ONLY', 'OTP_ONLY', 'PASSWORD_AND_OTP'])
  authStrategy?: 'PASSWORD_ONLY' | 'OTP_ONLY' | 'PASSWORD_AND_OTP';

  @IsOptional()
  @IsString()
  logoUrl?: string;
}
