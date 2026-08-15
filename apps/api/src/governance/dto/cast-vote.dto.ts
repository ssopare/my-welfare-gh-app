import { IsOptional, IsUUID } from 'class-validator';

export class CastVoteDto {
  @IsOptional()
  @IsUUID()
  nomineeId?: string;

  @IsOptional()
  @IsUUID()
  issueOptionId?: string;
}
