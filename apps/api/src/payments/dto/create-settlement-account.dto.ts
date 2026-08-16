import { IsIn, IsString, MinLength } from 'class-validator';

export class CreateSettlementAccountDto {
  @IsIn(['mtn', 'vod', 'atl'])
  momoProvider!: 'mtn' | 'vod' | 'atl';

  @IsString()
  @MinLength(1)
  phoneNumber!: string;

  @IsString()
  @MinLength(1)
  accountName!: string;
}
