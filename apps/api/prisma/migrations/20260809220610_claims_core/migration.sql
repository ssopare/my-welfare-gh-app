-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateEnum
CREATE TYPE "ClaimDecision" AS ENUM ('APPROVE', 'REJECT');

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "benefitRuleId" TEXT NOT NULL,
    "dependantId" TEXT,
    "submittedBy" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "amountValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "ClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "currentStageIndex" INTEGER NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_evidence" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_stage_actions" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "stageIndex" INTEGER NOT NULL,
    "stageName" TEXT NOT NULL,
    "actorMemberId" TEXT NOT NULL,
    "decision" "ClaimDecision" NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_stage_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "claims_journalEntryId_key" ON "claims"("journalEntryId");

-- CreateIndex
CREATE INDEX "claims_organisationId_idx" ON "claims"("organisationId");

-- CreateIndex
CREATE INDEX "claims_memberId_idx" ON "claims"("memberId");

-- CreateIndex
CREATE INDEX "claims_benefitRuleId_idx" ON "claims"("benefitRuleId");

-- CreateIndex
CREATE INDEX "claim_evidence_organisationId_idx" ON "claim_evidence"("organisationId");

-- CreateIndex
CREATE INDEX "claim_evidence_claimId_idx" ON "claim_evidence"("claimId");

-- CreateIndex
CREATE INDEX "claim_stage_actions_organisationId_idx" ON "claim_stage_actions"("organisationId");

-- CreateIndex
CREATE INDEX "claim_stage_actions_claimId_idx" ON "claim_stage_actions"("claimId");

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_benefitRuleId_fkey" FOREIGN KEY ("benefitRuleId") REFERENCES "benefit_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_dependantId_fkey" FOREIGN KEY ("dependantId") REFERENCES "dependants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_evidence" ADD CONSTRAINT "claim_evidence_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_stage_actions" ADD CONSTRAINT "claim_stage_actions_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No explicit GRANT needed — ALTER DEFAULT
-- PRIVILEGES FOR ROLE welfare from that same migration already covers it.
ALTER TABLE claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE claims FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON claims
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE claim_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_evidence FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON claim_evidence
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE claim_stage_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_stage_actions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON claim_stage_actions
  USING ("organisationId" = current_setting('app.tenant_id', true));
