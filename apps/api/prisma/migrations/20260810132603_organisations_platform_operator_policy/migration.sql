-- Fixes a real, previously-undiscovered gap: GET /platform/subscriptions
-- (SubscriptionService.listAllForOperator) has always joined
-- organisation.legalName for display, but the organisations table's only
-- RLS policy (tenant_isolation, keyed on app.tenant_id) has no bypass for
-- app.system_context = 'platform_operator' the way subscriptions itself
-- already does (see the platform_operator_access policy added in the
-- subscription_billing migration). withPlatformOperatorContext never sets
-- app.tenant_id, so "organisationId" = current_setting('app.tenant_id', true)
-- evaluates to NULL (not true) for every row under that context — the
-- join was silently returning null on every single row, discovered
-- building the admin console's Platform Operator screen against it.
--
-- Read-only bypass, deliberately narrower than subscriptions' policy
-- (no WITH CHECK): a platform operator manages plans/subscription status,
-- never an organisation's own tenant data directly.
CREATE POLICY platform_operator_read ON organisations
  FOR SELECT
  USING (current_setting('app.system_context', true) = 'platform_operator');
