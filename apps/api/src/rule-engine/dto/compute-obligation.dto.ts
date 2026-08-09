import { IsISO8601, IsUUID } from 'class-validator';

export class ComputeObligationDto {
  @IsUUID()
  memberId!: string;

  @IsISO8601()
  periodDate!: string;
}
