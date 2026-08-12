-- AlterTable
ALTER TABLE "payment_intents" ADD COLUMN     "obligationIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
