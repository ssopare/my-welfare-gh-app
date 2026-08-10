-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "platform_operators" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_operators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceAmount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "billingCadence" TEXT NOT NULL,
    "trialDays" INTEGER NOT NULL DEFAULT 60,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "planId" TEXT,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trialEndsAt" TIMESTAMP(3) NOT NULL,
    "gracePeriodDays" INTEGER NOT NULL DEFAULT 14,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "platform_operators_email_key" ON "platform_operators"("email");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_organisationId_key" ON "subscriptions"("organisationId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Deliberately no RLS on platform_operators or subscription_plans: neither
-- is tenant data (no organisationId column to isolate on) — same reasoning
-- as accounts having no tenant_isolation policy. app_runtime's table-level
-- grants (via the ALTER DEFAULT PRIVILEGES in the enable_rls migration)
-- already cover both automatically.
--
-- subscriptions *is* tenant data, so it gets the ordinary tenant_isolation
-- policy — a tenant's own admin reads/manages their own subscription the
-- normal way, via withTenant(). It also gets a second, independent
-- permissive policy for the platform operator's cross-tenant billing
-- management, keyed on a distinct app.system_context value from the
-- scheduler's — same "Postgres ORs multiple permissive policies together"
-- shape as own_memberships/system_scheduler_read.
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON subscriptions
  USING ("organisationId" = current_setting('app.tenant_id', true));
CREATE POLICY platform_operator_access ON subscriptions
  USING (current_setting('app.system_context', true) = 'platform_operator')
  WITH CHECK (current_setting('app.system_context', true) = 'platform_operator');
