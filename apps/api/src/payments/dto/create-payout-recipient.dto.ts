import { IsString, MinLength } from 'class-validator';

export class CreatePayoutRecipientDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  type!: string;

  @IsString()
  @MinLength(1)
  accountNumber!: string;

  @IsString()
  @MinLength(1)
  bankCode!: string;
}
