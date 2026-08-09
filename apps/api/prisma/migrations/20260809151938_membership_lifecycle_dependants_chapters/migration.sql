-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "MemberStatus" ADD VALUE 'PENDING';
ALTER TYPE "MemberStatus" ADD VALUE 'PROBATION';
ALTER TYPE "MemberStatus" ADD VALUE 'GRACE';
ALTER TYPE "MemberStatus" ADD VALUE 'DEFAULTER';
ALTER TYPE "MemberStatus" ADD VALUE 'DECEASED';

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'standard',
ADD COLUMN     "chapterId" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "chapters" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dependants" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "relationship" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dependants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "member_status_changes" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fromStatus" "MemberStatus",
    "toStatus" "MemberStatus" NOT NULL,
    "reason" TEXT,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "member_status_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chapters_organisationId_idx" ON "chapters"("organisationId");

-- CreateIndex
CREATE INDEX "dependants_organisationId_idx" ON "dependants"("organisationId");

-- CreateIndex
CREATE INDEX "dependants_memberId_idx" ON "dependants"("memberId");

-- CreateIndex
CREATE INDEX "member_status_changes_organisationId_idx" ON "member_status_changes"("organisationId");

-- CreateIndex
CREATE INDEX "member_status_changes_memberId_idx" ON "member_status_changes"("memberId");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "members" ADD CONSTRAINT "members_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dependants" ADD CONSTRAINT "dependants_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "member_status_changes" ADD CONSTRAINT "member_status_changes_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS on the three new tenant-scoped tables, same tenant_isolation shape as
-- organisations/members (see the enable_rls migration). No explicit GRANT
-- needed — ALTER DEFAULT PRIVILEGES FOR ROLE welfare in that same migration
-- already covers every future table app_runtime will ever need.
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON chapters
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE dependants ENABLE ROW LEVEL SECURITY;
ALTER TABLE dependants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON dependants
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE member_status_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_status_changes FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON member_status_changes
  USING ("organisationId" = current_setting('app.tenant_id', true));
