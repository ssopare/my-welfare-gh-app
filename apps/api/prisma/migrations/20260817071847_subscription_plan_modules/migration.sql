-- AlterTable
ALTER TABLE "subscription_plans" ADD COLUMN     "includedModules" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Grandfather every plan that already existed before this feature shipped
-- into keeping 'voting' — this is a new gate on a feature nobody has ever
-- had to pay extra for, so a paying customer must never silently lose
-- access to something they already had the moment this migration runs.
-- Only plans created *after* this migration start from an empty list —
-- see ModuleAccessGuard for the separate "no plan chosen yet" trial case.
UPDATE "subscription_plans" SET "includedModules" = ARRAY['voting'];
