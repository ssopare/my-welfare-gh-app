-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONTRIBUTION_DUE_REMINDER', 'DEFAULTER_RISK_ALERT', 'CLAIM_STAGE_ENTERED', 'CLAIM_STATUS_CHANGED');

-- AlterTable
ALTER TABLE "contribution_plans" ADD COLUMN     "reminderDaysBeforeDue" INTEGER;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "message" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_organisationId_idx" ON "notifications"("organisationId");

-- CreateIndex
CREATE INDEX "notifications_memberId_idx" ON "notifications"("memberId");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No explicit GRANT needed — ALTER DEFAULT
-- PRIVILEGES FOR ROLE welfare from that same migration already covers it.
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON notifications
  USING ("organisationId" = current_setting('app.tenant_id', true));

-- Additional, independent permissive RLS policy on organisations — same
-- "Postgres ORs multiple permissive policies together" shape as
-- own_memberships on members (see the add_member_role_and_account_policy
-- migration): this doesn't weaken tenant_isolation, it only adds a second,
-- narrower way to legally see organisation rows, scoped to a trusted
-- internal session context rather than any specific tenant.
--
-- NotificationSchedulerService is the first genuinely cross-tenant process
-- in this app — a periodic sweep has to enumerate every organisation
-- before it can do anything, and there's no per-tenant JWT to derive
-- app.tenant_id from the way every request-driven query has one. Nothing
-- user-facing can ever set app.system_context — only
-- PrismaService.withSystemContext(), called exclusively by the scheduler,
-- not any HTTP-reachable code path — so this policy can't be triggered by
-- a request no matter what a client sends.
CREATE POLICY system_scheduler_read ON organisations
  FOR SELECT USING (current_setting('app.system_context', true) = 'scheduler');
