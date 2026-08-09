import { IsString, MinLength } from 'class-validator';

export class ReverseJournalEntryDto {
  @IsString()
  @MinLength(1)
  reason!: string;
}
