import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

class PermissionDto {
  @IsString()
  @MinLength(1)
  resource!: string;

  @IsString()
  @MinLength(1)
  action!: string;

  @IsIn(['own', 'chapter', 'organisation'])
  scope!: 'own' | 'chapter' | 'organisation';
}

export class CreateRoleDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PermissionDto)
  permissions!: PermissionDto[];
}
