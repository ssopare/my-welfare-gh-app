-- Baseline migration: this column already exists in the dev database
-- (added directly, outside the migration history, before this migration
-- was written) — recorded here via `prisma migrate resolve --applied`
-- rather than executed, so migration history matches reality without
-- re-running DDL against a column that's already there. A fresh deploy
-- with no prior data will run this for real.
-- AlterTable
ALTER TABLE "contribution_plans" ADD COLUMN     "beneficiaryMemberIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
