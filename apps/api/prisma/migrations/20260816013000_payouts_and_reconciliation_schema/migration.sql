-- CreateTable
CREATE TABLE "settlement_accounts" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "providerSubaccountCode" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_recipients" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "bankCode" TEXT NOT NULL,
    "isAllowlisted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_requests" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "amountValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "fundId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "requesterId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payout_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payout_approvals" (
    "id" TEXT NOT NULL,
    "payoutRequestId" TEXT NOT NULL,
    "officerId" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payout_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fund_control_policies" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "dailyLimitValue" DECIMAL(12,2) NOT NULL,
    "monthlyLimitValue" DECIMAL(12,2) NOT NULL,
    "thresholdOneApproverValue" DECIMAL(12,2) NOT NULL,
    "thresholdTwoApproversValue" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "fund_control_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_records" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "ledgerAmountValue" DECIMAL(12,2) NOT NULL,
    "settlementAmountValue" DECIMAL(12,2) NOT NULL,
    "feeAmountValue" DECIMAL(12,2) NOT NULL,
    "matched" BOOLEAN NOT NULL DEFAULT false,
    "flaggedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "settlement_accounts_organisationId_key" ON "settlement_accounts"("organisationId");

-- CreateIndex
CREATE UNIQUE INDEX "fund_control_policies_organisationId_key" ON "fund_control_policies"("organisationId");

-- AddForeignKey
ALTER TABLE "settlement_accounts" ADD CONSTRAINT "settlement_accounts_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_recipients" ADD CONSTRAINT "payout_recipients_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "payout_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_requests" ADD CONSTRAINT "payout_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_approvals" ADD CONSTRAINT "payout_approvals_payoutRequestId_fkey" FOREIGN KEY ("payoutRequestId") REFERENCES "payout_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payout_approvals" ADD CONSTRAINT "payout_approvals_officerId_fkey" FOREIGN KEY ("officerId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fund_control_policies" ADD CONSTRAINT "fund_control_policies_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_records" ADD CONSTRAINT "reconciliation_records_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: every tenant-scoped table gets this same policy (see e.g.
-- 20260813072654_budgets/migration.sql for the sibling pattern) — Prisma's
-- own migration diff doesn't know about RLS, so this is added by hand on
-- every migration that creates a new tenant-scoped table. All six tables
-- here carry organisationId and were missing this entirely — the payouts/
-- treasury feature had never actually been migrated before this file,
-- only ever existing via local schema drift (prisma db push, never
-- committed as a migration).
ALTER TABLE settlement_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE settlement_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON settlement_accounts
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE payout_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_recipients FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payout_recipients
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE payout_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_requests FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payout_requests
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE payout_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE payout_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payout_approvals
  USING (
    "payoutRequestId" IN (
      SELECT "id" FROM "payout_requests"
      WHERE "organisationId" = current_setting('app.tenant_id', true)
    )
  );

ALTER TABLE fund_control_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fund_control_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON fund_control_policies
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE reconciliation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_records FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reconciliation_records
  USING ("organisationId" = current_setting('app.tenant_id', true));
