import { IsUUID } from 'class-validator';

export class DisburseClaimDto {
  @IsUUID()
  fundId!: string;
}
