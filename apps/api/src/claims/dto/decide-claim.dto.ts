import { IsEnum, IsOptional, IsString } from 'class-validator';

export class DecideClaimDto {
  @IsEnum(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  comment?: string;
}
