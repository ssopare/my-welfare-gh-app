-- CreateEnum
CREATE TYPE "AuthStrategy" AS ENUM ('PASSWORD_ONLY', 'OTP_ONLY', 'PASSWORD_AND_OTP');

-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "authStrategy" "AuthStrategy" NOT NULL DEFAULT 'PASSWORD_ONLY';
