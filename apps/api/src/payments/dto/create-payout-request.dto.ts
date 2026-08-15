import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePayoutRequestDto {
  @IsString()
  @MinLength(1)
  amountValue!: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @MinLength(1)
  fundId!: string;

  @IsString()
  @MinLength(1)
  recipientId!: string;

  @IsString()
  @MinLength(1)
  purpose!: string;
}
