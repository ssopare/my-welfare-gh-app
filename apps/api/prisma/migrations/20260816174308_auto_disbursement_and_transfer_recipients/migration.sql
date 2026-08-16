/*
  Warnings:

  - You are about to drop the column `bankName` on the `settlement_accounts` table. All the data in the column will be lost.
  - You are about to drop the column `providerSubaccountCode` on the `settlement_accounts` table. All the data in the column will be lost.
  - Added the required column `accountName` to the `settlement_accounts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `momoProvider` to the `settlement_accounts` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "fund_control_policies" ADD COLUMN     "autoDisbursement" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "settlement_accounts" DROP COLUMN "bankName",
DROP COLUMN "providerSubaccountCode",
ADD COLUMN     "accountName" TEXT NOT NULL,
ADD COLUMN     "momoProvider" TEXT NOT NULL,
ADD COLUMN     "providerRecipientCode" TEXT;

-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "platformFeePercentage" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "auto_disbursements" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "paymentIntentId" TEXT NOT NULL,
    "disbursableAmountValue" DECIMAL(12,2) NOT NULL,
    "platformFeePercentage" DECIMAL(5,2) NOT NULL,
    "platformFeeValue" DECIMAL(12,2) NOT NULL,
    "transferAmountValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerReference" TEXT NOT NULL,
    "providerRecipientCode" TEXT,
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "auto_disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auto_disbursements_paymentIntentId_key" ON "auto_disbursements"("paymentIntentId");

-- CreateIndex
CREATE UNIQUE INDEX "auto_disbursements_providerReference_key" ON "auto_disbursements"("providerReference");

-- CreateIndex
CREATE INDEX "auto_disbursements_organisationId_idx" ON "auto_disbursements"("organisationId");

-- AddForeignKey
ALTER TABLE "auto_disbursements" ADD CONSTRAINT "auto_disbursements_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_disbursements" ADD CONSTRAINT "auto_disbursements_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_disbursements" ADD CONSTRAINT "auto_disbursements_paymentIntentId_fkey" FOREIGN KEY ("paymentIntentId") REFERENCES "payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS: same tenant_isolation pattern as every other tenant-scoped table
-- (see 20260816013000_payouts_and_reconciliation_schema/migration.sql) —
-- Prisma's own migration diff doesn't know about RLS, so it's added by
-- hand here. settlement_accounts, fund_control_policies and
-- subscription_plans already carry RLS from earlier migrations; only the
-- new auto_disbursements table needs it.
ALTER TABLE auto_disbursements ENABLE ROW LEVEL SECURITY;
ALTER TABLE auto_disbursements FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON auto_disbursements
  USING ("organisationId" = current_setting('app.tenant_id', true));
