import { IsEnum, IsOptional, IsString } from 'class-validator';

export class VetNominationDto {
  @IsEnum(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';

  @IsOptional()
  @IsString()
  rejectionReason?: string;
}
