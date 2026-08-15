import { IsString, MinLength } from 'class-validator';

export class CreateSettlementAccountDto {
  @IsString()
  @MinLength(1)
  bankName!: string;

  @IsString()
  @MinLength(1)
  accountNumber!: string;
}
