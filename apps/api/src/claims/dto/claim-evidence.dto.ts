import { IsString, MinLength } from 'class-validator';

export class ClaimEvidenceDto {
  @IsString()
  @MinLength(1)
  evidenceType!: string;

  @IsString()
  @MinLength(1)
  description!: string;
}
