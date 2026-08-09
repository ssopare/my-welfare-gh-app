import { IsString, IsUUID, MinLength } from 'class-validator';

// FR-MEM-09: joining an *existing* organisation, as opposed to
// register-organisation's FR-ONB-01 (creating a brand-new one). Reuses the
// Account if the phone number already has one.
export class JoinOrganisationDto {
  @IsString()
  @MinLength(6)
  phoneNumber!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsUUID()
  organisationId!: string;
}
