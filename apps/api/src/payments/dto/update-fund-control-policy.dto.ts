import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

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

  // Org-admin opt-in to auto-disbursing contributions to this org's
  // SettlementAccount — see FundControlPolicy.autoDisbursement. Optional
  // and left undefined (not reset to false) when a caller only wants to
  // update the limits above.
  @IsOptional()
  @IsBoolean()
  autoDisbursement?: boolean;
}
