import { IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  phoneNumber!: string;

  @IsString()
  password!: string;

  // Required only when the Account has more than one Membership — Phase 1
  // doesn't build the polished multi-group switcher (§24.1), just the data
  // model to support it, so ambiguity is resolved by the caller specifying
  // which org rather than a UI picker.
  @IsOptional()
  @IsString()
  organisationId?: string;
}
