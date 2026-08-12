import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

// FR-MEM-09: joining an *existing* organisation, as opposed to
// register-organisation's FR-ONB-01 (creating a brand-new one). Reuses the
// Account if the phone number already has one.
//
// Either joinCode (the normal path a member actually gets handed — see
// the organisation_join_code migration) or organisationId (the raw id,
// still accepted) identifies the organisation. Exactly one is required —
// enforced in AuthService.resolveOrganisationId, not here, since it's a
// cross-field rule.
export class JoinOrganisationDto {
  @IsString()
  @MinLength(6)
  phoneNumber!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  // Only meaningful (and required — see AuthService.joinOrganisation)
  // when this phone number has no existing Account yet. An existing
  // Account joining a second org already has a name from before, so
  // this is ignored in that branch, never overwriting it.
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsUUID()
  organisationId?: string;

  @IsOptional()
  @IsString()
  joinCode?: string;
}
