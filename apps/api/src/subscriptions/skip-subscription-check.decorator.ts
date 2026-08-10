import { SetMetadata } from '@nestjs/common';

export const SKIP_SUBSCRIPTION_CHECK = 'skipSubscriptionCheck';

// For the handful of endpoints that must keep working even on a
// suspended/cancelled subscription — chiefly the one way out of that state,
// POST /subscription/convert. Without this, a suspended tenant could never
// reach the endpoint that reactivates them.
export const SkipSubscriptionCheck = () =>
  SetMetadata(SKIP_SUBSCRIPTION_CHECK, true);
