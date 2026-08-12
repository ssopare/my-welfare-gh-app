-- AlterTable
ALTER TABLE "contribution_plans" ADD COLUMN     "defaultFundId" TEXT;

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "creditBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AddForeignKey
ALTER TABLE "contribution_plans" ADD CONSTRAINT "contribution_plans_defaultFundId_fkey" FOREIGN KEY ("defaultFundId") REFERENCES "funds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
