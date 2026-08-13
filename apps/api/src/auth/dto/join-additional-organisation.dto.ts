import { IsOptional, IsString, IsUUID } from 'class-validator';

// Authenticated counterpart to JoinOrganisationDto — no phoneNumber,
// password, or name: the caller's JWT already identifies the Account,
// this just needs to know which organisation to join. Either joinCode
// (the normal path) or organisationId (still accepted) identifies it;
// exactly one is required, enforced in AuthService.resolveOrganisationId.
export class JoinAdditionalOrganisationDto {
  @IsOptional()
  @IsUUID()
  organisationId?: string;

  @IsOptional()
  @IsString()
  joinCode?: string;
}
