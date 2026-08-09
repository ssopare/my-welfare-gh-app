import { IsIn, IsString, IsUUID, MinLength } from 'class-validator';

// Deliberately no amount/currency here: a real webhook payload would carry
// them, but this handler always posts using the amount our *own*
// PaymentIntent recorded at initiate time, never a figure reported back to
// us by an external caller — the webhook only confirms status.
export class WebhookPayloadDto {
  @IsUUID()
  organisationId!: string;

  @IsString()
  @MinLength(1)
  providerReference!: string;

  @IsIn(['succeeded', 'failed'])
  status!: 'succeeded' | 'failed';
}
