import { IsIn, IsString, MinLength } from 'class-validator';

export class CreatePayoutRecipientDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(['mtn', 'vod', 'atl'])
  momoProvider!: 'mtn' | 'vod' | 'atl';

  @IsString()
  @MinLength(1)
  accountNumber!: string;
}
