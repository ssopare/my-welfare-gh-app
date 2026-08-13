-- CreateTable
CREATE TABLE "budgets" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "ledgerAccountId" TEXT NOT NULL,
    "name" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "amountValue" DECIMAL(12,2) NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budgets_organisationId_idx" ON "budgets"("organisationId");

-- CreateIndex
CREATE INDEX "budgets_ledgerAccountId_idx" ON "budgets"("ledgerAccountId");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: every tenant-scoped table gets this same policy (see e.g.
-- 20260809200744_ledger_core/migration.sql for the sibling tables) —
-- Prisma's own migration diff doesn't know about RLS, so this is added
-- by hand on every migration that creates a new tenant-scoped table.
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON budgets
  USING ("organisationId" = current_setting('app.tenant_id', true));
