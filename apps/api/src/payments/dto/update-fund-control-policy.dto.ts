import { IsString, MinLength } from 'class-validator';

export class UpdateFundControlPolicyDto {
  @IsString()
  @MinLength(1)
  dailyLimitValue!: string;

  @IsString()
  @MinLength(1)
  monthlyLimitValue!: string;

  @IsString()
  @MinLength(1)
  thresholdOneApproverValue!: string;

  @IsString()
  @MinLength(1)
  thresholdTwoApproversValue!: string;
}
