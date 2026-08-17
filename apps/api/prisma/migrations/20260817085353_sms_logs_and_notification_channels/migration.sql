-- CreateEnum
CREATE TYPE "SmsProviderType" AS ENUM ('ARKESEL', 'MNOTIFY', 'HUBTEL', 'MOCK');

-- CreateEnum
CREATE TYPE "SmsDeliveryStatus" AS ENUM ('DELIVERED', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "sms_logs" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "messageExcerpt" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'TRANSACTIONAL',
    "provider" "SmsProviderType" NOT NULL DEFAULT 'ARKESEL',
    "status" "SmsDeliveryStatus" NOT NULL DEFAULT 'SENT',
    "unitsUsed" INTEGER NOT NULL DEFAULT 1,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_channel_settings" (
    "id" TEXT NOT NULL,
    "notificationType" "NotificationType" NOT NULL,
    "smsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_channel_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sms_logs_organisationId_idx" ON "sms_logs"("organisationId");

-- CreateIndex
CREATE INDEX "sms_logs_phoneNumber_idx" ON "sms_logs"("phoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "notification_channel_settings_notificationType_key" ON "notification_channel_settings"("notificationType");

-- AddForeignKey
ALTER TABLE "sms_logs" ADD CONSTRAINT "sms_logs_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS: sms_logs is tenant-scoped (carries organisationId) — same pattern
-- as every other tenant table (see e.g.
-- 20260816013000_payouts_and_reconciliation_schema/migration.sql).
-- notification_channel_settings is deliberately NOT tenant-scoped —
-- platform-operator-managed, one shared catalogue, same as
-- subscription_plans (no RLS on that table either).
ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON sms_logs
  USING ("organisationId" = current_setting('app.tenant_id', true));
