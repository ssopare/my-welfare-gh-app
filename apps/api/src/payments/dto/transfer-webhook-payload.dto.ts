import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';

// Same shape as WebhookPayloadDto, for the same reason: the webhook only
// ever confirms a status, never reports an amount we didn't already
// record ourselves at initiate time (see AutoDisbursement).
export class TransferWebhookPayloadDto {
  @IsUUID()
  organisationId!: string;

  @IsString()
  @MinLength(1)
  providerReference!: string;

  @IsIn(['succeeded', 'failed'])
  status!: 'succeeded' | 'failed';
}
