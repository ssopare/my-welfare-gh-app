-- CreateEnum
CREATE TYPE "PaymentChannel" AS ENUM ('MOBILE_MONEY', 'CARD', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED');

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "fundId" TEXT NOT NULL,
    "channel" "PaymentChannel" NOT NULL,
    "amountValue" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'INITIATED',
    "journalEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_exceptions" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "providerReference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reconciliation_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_providerReference_key" ON "payment_intents"("providerReference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_journalEntryId_key" ON "payment_intents"("journalEntryId");

-- CreateIndex
CREATE INDEX "payment_intents_organisationId_idx" ON "payment_intents"("organisationId");

-- CreateIndex
CREATE INDEX "reconciliation_exceptions_organisationId_idx" ON "reconciliation_exceptions"("organisationId");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "funds"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "journal_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reconciliation_exceptions" ADD CONSTRAINT "reconciliation_exceptions_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No cross-tenant policy needed here despite
-- providerReference being globally unique: the webhook payload carries the
-- organisationId a real provider would echo back from metadata set at
-- initiate time (see PaymentService), so the lookup is always done inside
-- a normal withTenant(organisationId, ...) context, never anonymously
-- across tenants.
ALTER TABLE payment_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_intents FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON payment_intents
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE reconciliation_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_exceptions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reconciliation_exceptions
  USING ("organisationId" = current_setting('app.tenant_id', true));
