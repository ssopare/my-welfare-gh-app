-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'REJECTED');

-- CreateTable
CREATE TABLE "contribution_plans" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "chapterId" TEXT,
    "name" TEXT NOT NULL,
    "cadence" TEXT NOT NULL,
    "computationType" TEXT NOT NULL DEFAULT 'fixed',
    "amountValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "collectionMechanism" TEXT NOT NULL DEFAULT 'push',
    "minTenureMonths" INTEGER,
    "goodStandingRequired" BOOLEAN NOT NULL DEFAULT true,
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contribution_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "benefit_rules" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "chapterId" TEXT,
    "name" TEXT NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "subjectTypes" TEXT[],
    "amountValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "occurrenceCapScope" TEXT NOT NULL DEFAULT 'lifetime',
    "occurrenceCapMax" INTEGER NOT NULL,
    "minTenureMonths" INTEGER,
    "goodStandingRequired" BOOLEAN NOT NULL DEFAULT true,
    "maxConsecutiveMissedPeriods" INTEGER,
    "evidenceRequired" TEXT[],
    "approvalChain" TEXT[],
    "status" "RuleStatus" NOT NULL DEFAULT 'DRAFT',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "supersedesId" TEXT,
    "createdBy" TEXT NOT NULL,
    "approvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "benefit_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contribution_plans_supersedesId_key" ON "contribution_plans"("supersedesId");

-- CreateIndex
CREATE INDEX "contribution_plans_organisationId_idx" ON "contribution_plans"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "benefit_rules_supersedesId_key" ON "benefit_rules"("supersedesId");

-- CreateIndex
CREATE INDEX "benefit_rules_organisationId_idx" ON "benefit_rules"("organisationId");

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "contribution_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_rules" ADD CONSTRAINT "benefit_rules_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_rules" ADD CONSTRAINT "benefit_rules_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "benefit_rules" ADD CONSTRAINT "benefit_rules_supersedesId_fkey" FOREIGN KEY ("supersedesId") REFERENCES "benefit_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No explicit GRANT needed — ALTER DEFAULT
-- PRIVILEGES FOR ROLE welfare from that same migration already covers it.
ALTER TABLE contribution_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE contribution_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON contribution_plans
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE benefit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE benefit_rules FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON benefit_rules
  USING ("organisationId" = current_setting('app.tenant_id', true));
