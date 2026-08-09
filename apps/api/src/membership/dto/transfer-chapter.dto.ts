import { IsUUID } from 'class-validator';

export class TransferChapterDto {
  @IsUUID()
  chapterId!: string;
}
