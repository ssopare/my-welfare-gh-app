-- CreateEnum
CREATE TYPE "LedgerAccountType" AS ENUM ('ASSET', 'LIABILITY', 'INCOME', 'EXPENSE', 'EQUITY');

-- CreateEnum
CREATE TYPE "ObligationStatus" AS ENUM ('UPCOMING', 'DUE', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'DEFAULTED', 'WAIVED', 'EXEMPTED', 'WRITTEN_OFF', 'CANCELLED');

-- AlterTable
ALTER TABLE "contribution_plans" ADD COLUMN     "joiningGracePeriodDays" INTEGER,
ADD COLUMN     "paymentGracePeriodDays" INTEGER,
ADD COLUMN     "reinstatementWaitingPeriodMonths" INTEGER;

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "paymentAllocationPolicy" TEXT NOT NULL DEFAULT 'oldest_first';

-- CreateTable
CREATE TABLE "funds" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "memberId" TEXT,
    "type" "LedgerAccountType" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "reversalOfId" TEXT,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "journalEntryId" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "memberId" TEXT,
    "obligationId" TEXT,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligations" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "contributionPlanId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "amountPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "ObligationStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funds_organisationId_idx" ON "funds"("organisationId");

-- CreateIndex
CREATE INDEX "ledger_accounts_organisationId_idx" ON "ledger_accounts"("organisationId");

-- CreateIndex
CREATE INDEX "ledger_accounts_fundId_idx" ON "ledger_accounts"("fundId");

-- CreateIndex
CREATE INDEX "journal_entries_organisationId_idx" ON "journal_entries"("organisationId");

-- CreateIndex
CREATE INDEX "journal_entries_fundId_idx" ON "journal_entries"("fundId");

-- CreateIndex
CREATE INDEX "journal_lines_organisationId_idx" ON "journal_lines"("organisationId");

-- CreateIndex
CREATE INDEX "journal_lines_journalEntryId_idx" ON "journal_lines"("journalEntryId");

-- CreateIndex
CREATE INDEX "journal_lines_ledgerAccountId_idx" ON "journal_lines"("ledgerAccountId");

-- CreateIndex
CREATE INDEX "journal_lines_obligationId_idx" ON "journal_lines"("obligationId");

-- CreateIndex
CREATE INDEX "obligations_organisationId_idx" ON "obligations"("organisationId");

-- CreateIndex
CREATE INDEX "obligations_memberId_idx" ON "obligations"("memberId");

-- CreateIndex
CREATE INDEX "obligations_contributionPlanId_idx" ON "obligations"("contributionPlanId");

-- AddForeignKey
ALTER TABLE "funds" ADD CONSTRAINT "funds_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "obligations" ADD CONSTRAINT "obligations_contributionPlanId_fkey" FOREIGN KEY ("contributionPlanId") REFERENCES "contribution_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No explicit GRANT needed — ALTER DEFAULT
-- PRIVILEGES FOR ROLE welfare from that same migration already covers it.
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE funds FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON funds
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ledger_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON ledger_accounts
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_entries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journal_entries
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE journal_lines FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON journal_lines
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE obligations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON obligations
  USING ("organisationId" = current_setting('app.tenant_id', true));
