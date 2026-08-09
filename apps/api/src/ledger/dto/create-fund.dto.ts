import { IsString, MinLength } from 'class-validator';

export class CreateFundDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
