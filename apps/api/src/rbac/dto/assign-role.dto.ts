import { IsISO8601, IsOptional, IsUUID } from 'class-validator';

export class AssignRoleDto {
  @IsUUID()
  memberId!: string;

  @IsOptional()
  @IsUUID()
  chapterId?: string;

  // Omit for an open-ended assignment. Set this for a genuinely time-boxed
  // grant — FR-AUD-01's Auditor role is the concrete case the spec names
  // ("without standing access thereafter").
  @IsOptional()
  @IsISO8601()
  termEnd?: string;
}
