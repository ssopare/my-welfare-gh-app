import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

// Tenant self-registration (FR-ONB-01): founds a new Organisation, and
// either creates a fresh Account or reuses one that already exists for
// this phone number (see AuthService.registerOrganisation) + an ADMIN
// Member in one step.
export class RegisterOrganisationDto {
  @IsString()
  @MinLength(6)
  phoneNumber!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Account-level identity (not per-membership) — carries through every
  // org this Account later joins. Only required (enforced in
  // AuthService.registerOrganisation, not here — same reasoning as
  // JoinOrganisationDto.name) when this phone number has no existing
  // Account yet; an existing Account founding another org keeps its name
  // from before, untouched.
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsString()
  @MinLength(2)
  legalName!: string;

  // §8.1: "legal name, type (employer-linked / voluntary), country & currency"
  @IsIn(['voluntary', 'employer-linked'])
  organisationType!: string;
}
