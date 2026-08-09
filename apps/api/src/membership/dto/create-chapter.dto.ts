import { IsString, MinLength } from 'class-validator';

export class CreateChapterDto {
  @IsString()
  @MinLength(1)
  name!: string;
}
