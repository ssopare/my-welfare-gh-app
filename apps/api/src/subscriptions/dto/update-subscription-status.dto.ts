import { IsIn, IsISO8601, IsOptional } from 'class-validator';

const SUBSCRIPTION_STATUSES = [
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELLED',
] as const;

export type SubscriptionStatusValue = (typeof SUBSCRIPTION_STATUSES)[number];

// The platform operator's manual lever over a tenant's billing lifecycle
// (§18: "trial → active → past-due → suspended → cancelled") — Phase 1 has
// no real payment-gateway/dunning automation for platform billing itself,
// the same "primitive now" bootstrapping every other slice started with
// (MockPaymentProvider stood in for a real gateway before FR-PAY-01
// existed; manual status changes stand in here).
export class UpdateSubscriptionStatusDto {
  @IsIn(SUBSCRIPTION_STATUSES)
  status!: SubscriptionStatusValue;

  @IsOptional()
  @IsISO8601()
  currentPeriodEnd?: string;
}
