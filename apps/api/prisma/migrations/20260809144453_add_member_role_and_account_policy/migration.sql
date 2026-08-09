-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "role" "MemberRole" NOT NULL DEFAULT 'MEMBER';

-- CreateIndex
CREATE INDEX "members_accountId_idx" ON "members"("accountId");

-- Additional, independent permissive RLS policy on members: an Account can
-- always read its own Membership rows via app.account_id, regardless of
-- tenant context (app.tenant_id). Postgres OR's multiple permissive
-- policies for the same command together, so this doesn't weaken the
-- existing tenant_isolation policy — it only adds a second way to legally
-- see a row, scoped to your own account_id instead of the current tenant.
--
-- This is what makes login possible at all: authenticating an Account
-- requires discovering which Organisation(s) it belongs to, which is
-- inherently a cross-tenant lookup — there's no tenant context yet to set,
-- the same bootstrapping problem tenant creation had (see
-- simplify_organisation_rls_policy). PrismaService.withAccount() sets
-- app.account_id the same way withTenant() sets app.tenant_id.
CREATE POLICY own_memberships ON members
  FOR SELECT USING ("accountId" = current_setting('app.account_id', true));
