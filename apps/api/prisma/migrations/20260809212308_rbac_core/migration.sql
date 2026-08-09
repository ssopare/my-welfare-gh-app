-- AlterTable
ALTER TABLE "organisations" ADD COLUMN     "makerCheckerEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "permissions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "chapterId" TEXT,
    "termStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "roles_organisationId_idx" ON "roles"("organisationId");

-- CreateIndex
CREATE INDEX "role_assignments_organisationId_idx" ON "role_assignments"("organisationId");

-- CreateIndex
CREATE INDEX "role_assignments_memberId_idx" ON "role_assignments"("memberId");

-- CreateIndex
CREATE INDEX "role_assignments_roleId_idx" ON "role_assignments"("roleId");

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "role_assignments_chapterId_fkey" FOREIGN KEY ("chapterId") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No explicit GRANT needed — ALTER DEFAULT
-- PRIVILEGES FOR ROLE welfare from that same migration already covers it.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON roles
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON role_assignments
  USING ("organisationId" = current_setting('app.tenant_id', true));
