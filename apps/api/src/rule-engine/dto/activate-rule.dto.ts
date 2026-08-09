import { IsISO8601, IsOptional } from 'class-validator';

export class ActivateRuleDto {
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}
