import { IsOptional, IsString, MinLength } from 'class-validator';

// Account-level, not per-membership — see the schema comment on
// Account.name. This is what lets an account created before this field
// existed (or a member who just wants to change it) set/update it later.
export class UpdateOwnProfileDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
