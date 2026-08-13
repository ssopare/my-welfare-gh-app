import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

const LEDGER_ACCOUNT_TYPES = [
  'ASSET',
  'LIABILITY',
  'INCOME',
  'EXPENSE',
  'EQUITY',
] as const;

export class CreateLedgerAccountDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsIn(LEDGER_ACCOUNT_TYPES)
  type!: (typeof LEDGER_ACCOUNT_TYPES)[number];

  @IsOptional()
  @IsBoolean()
  isAdministrative?: boolean;
}
