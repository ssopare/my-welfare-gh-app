-- AlterTable
ALTER TABLE "role_assignments" ADD COLUMN     "governanceBodyId" TEXT;

-- CreateTable
CREATE TABLE "governance_bodies" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "membershipCompositionRule" TEXT,
    "quorumRule" TEXT,
    "tieBreakRule" TEXT,
    "meetingCadence" TEXT,
    "maxConsecutiveTerms" INTEGER,
    "coolingOffPeriodMonths" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "governance_bodies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "governance_bodies_organisationId_idx" ON "governance_bodies"("organisationId");

-- CreateIndex
CREATE INDEX "role_assignments_governanceBodyId_idx" ON "role_assignments"("governanceBodyId");

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_governanceBodyId_fkey" FOREIGN KEY ("governanceBodyId") REFERENCES "governance_bodies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "governance_bodies" ADD CONSTRAINT "governance_bodies_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No explicit GRANT needed — ALTER DEFAULT
-- PRIVILEGES FOR ROLE welfare from that same migration already covers it.
ALTER TABLE governance_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE governance_bodies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON governance_bodies
  USING ("organisationId" = current_setting('app.tenant_id', true));
