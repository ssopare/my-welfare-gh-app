import { IsIn, IsOptional, IsString } from 'class-validator';

export class SubmitPayoutApprovalDto {
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @IsString()
  @IsOptional()
  comment?: string;
}
