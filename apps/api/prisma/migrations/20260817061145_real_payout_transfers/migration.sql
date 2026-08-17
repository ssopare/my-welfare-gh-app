-- AlterTable
ALTER TABLE "payout_recipients" ADD COLUMN     "providerRecipientCode" TEXT,
ADD COLUMN     "verified" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payout_requests" ADD COLUMN     "providerReference" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "payout_requests_providerReference_key" ON "payout_requests"("providerReference");
