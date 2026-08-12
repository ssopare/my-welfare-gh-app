-- CreateEnum
CREATE TYPE "MemberRemovalRequestStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- AlterTable
ALTER TABLE "member_status_changes" ADD COLUMN     "changedBy" TEXT;

-- CreateTable
CREATE TABLE "member_removal_requests" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "MemberRemovalRequestStatus" NOT NULL DEFAULT 'PENDING',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "cancelledBy" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "member_removal_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "member_removal_requests_organisationId_idx" ON "member_removal_requests"("organisationId");

-- CreateIndex
CREATE INDEX "member_removal_requests_memberId_idx" ON "member_removal_requests"("memberId");

-- AddForeignKey
ALTER TABLE "member_removal_requests" ADD CONSTRAINT "member_removal_requests_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No explicit GRANT needed — ALTER DEFAULT
-- PRIVILEGES FOR ROLE welfare from that same migration already covers it.
ALTER TABLE member_removal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_removal_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON member_removal_requests
  USING ("organisationId" = current_setting('app.tenant_id', true));
