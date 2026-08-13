import { IsUUID } from 'class-validator';

export class SwitchOrganisationDto {
  @IsUUID()
  organisationId!: string;
}
