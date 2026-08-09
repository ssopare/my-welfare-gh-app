import { IsIn, IsString, MinLength } from 'class-validator';

// Tenant self-registration (FR-ONB-01): creates the founding Account +
// Organisation + an ADMIN Member in one step.
export class RegisterOrganisationDto {
  @IsString()
  @MinLength(6)
  phoneNumber!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsString()
  @MinLength(2)
  legalName!: string;

  // §8.1: "legal name, type (employer-linked / voluntary), country & currency"
  @IsIn(['voluntary', 'employer-linked'])
  organisationType!: string;
}
