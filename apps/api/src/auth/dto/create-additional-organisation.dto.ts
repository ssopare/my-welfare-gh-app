import { IsIn, IsString, MinLength } from 'class-validator';

// An already-authenticated account founding a *second* (or third, ...)
// organisation — no phoneNumber/password/name here, unlike
// RegisterOrganisationDto: the Account already exists, this just adds
// another Member row (role ADMIN) under it for a brand-new Organisation.
export class CreateAdditionalOrganisationDto {
  @IsString()
  @MinLength(2)
  legalName!: string;

  @IsIn(['voluntary', 'employer-linked'])
  organisationType!: string;
}
