import { IsISO8601, IsUUID } from 'class-validator';

export class CreateObligationDto {
  @IsUUID()
  memberId!: string;

  @IsISO8601()
  dueDate!: string;
}
