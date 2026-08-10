import { IsUUID } from 'class-validator';

export class ConvertSubscriptionDto {
  @IsUUID()
  planId!: string;
}
