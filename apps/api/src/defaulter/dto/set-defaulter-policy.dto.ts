import { IsInt, Min } from 'class-validator';

export class SetDefaulterPolicyDto {
  @IsInt()
  @Min(1)
  defaulterThresholdMonths!: number;

  @IsInt()
  @Min(1)
  forfeitureThresholdMonths!: number;
}
