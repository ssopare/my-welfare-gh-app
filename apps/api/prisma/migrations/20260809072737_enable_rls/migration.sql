-- Tenant isolation via PostgreSQL RLS (Section 21 of the requirements spec).
--
-- app_runtime (see infra/docker/initdb/01-create-app-role.sh) is the
-- restricted, non-superuser role the NestJS app connects as at runtime.
-- Only that role is subject to these policies in practice — the migration
-- owner ("welfare") is a superuser and always bypasses RLS regardless of
-- FORCE ROW LEVEL SECURITY, so it must never be used for application
-- queries, only for schema migrations.
--
-- "accounts" is deliberately NOT RLS-protected: Section 7/10 defines the
-- Account as the shared login identity, explicitly not tenant-scoped (one
-- Account can hold Memberships in multiple Organisations).

GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts, organisations, members TO app_runtime;
ALTER DEFAULT PRIVILEGES FOR ROLE welfare IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;

-- organisations: a tenant context may only see its own tenant row.
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON organisations
  USING (id = current_setting('app.tenant_id', true));

-- members: the core tenant-scoped child table for this Phase 0 proof.
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE members FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON members
  USING ("organisationId" = current_setting('app.tenant_id', true));
