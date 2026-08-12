-- AlterTable: added nullable first, not with the usual single-step
-- required-column-with-default — `prisma migrate dev` refused to
-- generate this automatically since this table already has rows (this
-- environment's accumulated dev/test data). Backfilled below, then
-- tightened to NOT NULL, same staged shape a real production migration
-- touching a populated table would need.
ALTER TABLE "organisations" ADD COLUMN     "joinCode" TEXT;

-- Backfill: a short, readable code per existing row. Not using the
-- application's real generateJoinCode() logic (legalName-derived prefix)
-- since that's TypeScript, not SQL — these are pre-existing dev/test rows,
-- not real tenants anyone has actually been given a code for yet, so a
-- flat random code is fine here; every row created going forward gets a
-- proper one from AuthService.registerOrganisation.
UPDATE "organisations"
SET "joinCode" = 'ORG-' || upper(substr(md5(random()::text || id), 1, 6))
WHERE "joinCode" IS NULL;

ALTER TABLE "organisations" ALTER COLUMN "joinCode" SET NOT NULL;
CREATE UNIQUE INDEX "organisations_joinCode_key" ON "organisations"("joinCode");

-- Additional, independent permissive RLS policy on organisations — same
-- shape and reasoning as system_scheduler_read (see the
-- notifications_core migration): doesn't weaken tenant_isolation, only
-- adds a second, narrower way to legally see organisation rows.
--
-- Unlike system_scheduler_read/platform_operator_access, this one *is*
-- reachable from an unauthenticated HTTP request — POST
-- /auth/join-organisation has no guard by design (joining happens before
-- login exists). Safe because: (1) SELECT-only, (2)
-- AuthService.joinOrganisation only ever reads the `id` column through
-- it (never exposing other tenant fields via this path) to resolve a
-- submitted joinCode to the real organisationId before it can open a
-- normal withTenant() context, and (3) a join code is meant to be shared
-- publicly as an invite mechanism in the first place — it's not a secret
-- credential; actually joining still requires a phone number and setting
-- a password.
CREATE POLICY join_code_lookup_read ON organisations
  FOR SELECT USING (current_setting('app.system_context', true) = 'join_lookup');
