-- CreateTable
CREATE TABLE "defaulter_policies" (
    "id" TEXT NOT NULL,
    "organisationId" TEXT NOT NULL,
    "defaulterThresholdMonths" INTEGER NOT NULL,
    "forfeitureThresholdMonths" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defaulter_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "defaulter_policies_organisationId_key" ON "defaulter_policies"("organisationId");

-- AddForeignKey
ALTER TABLE "defaulter_policies" ADD CONSTRAINT "defaulter_policies_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "organisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS, same tenant_isolation shape as every other tenant-scoped table (see
-- the enable_rls migration). No explicit GRANT needed — ALTER DEFAULT
-- PRIVILEGES FOR ROLE welfare from that same migration already covers it.
ALTER TABLE defaulter_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE defaulter_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON defaulter_policies
  USING ("organisationId" = current_setting('app.tenant_id', true));
