import { IsString, MinLength } from 'class-validator';

// FR-MEM-03.
export class AddDependantDto {
  @IsString()
  @MinLength(1)
  relationship!: string;

  @IsString()
  @MinLength(1)
  name!: string;
}
