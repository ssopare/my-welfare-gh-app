import { IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateNominationDto {
  @IsUUID()
  nomineeMemberId!: string;

  @IsOptional()
  @IsString()
  statement?: string;
}
