import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class AppointOfficerDto {
  @IsUUID()
  memberId!: string;

  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsISO8601()
  termEnd?: string;
}
