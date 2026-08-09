-- Consolidate organisations' 4 per-command policies back into one blanket
-- policy, matching members' pattern.
--
-- The earlier split (a wide-open INSERT policy alongside tenant-scoped
-- SELECT/UPDATE/DELETE) was working around what looked like a chicken-and-
-- egg problem: creating a new Organisation happens before that tenant's own
-- app.tenant_id context exists. But it turns out there's no problem to work
-- around — Prisma's .create() always uses INSERT ... RETURNING, and
-- Postgres's RETURNING on a table with RLS is filtered through the SELECT
-- policy, which throws "new row violates row-level security policy" (not a
-- silent empty result) when the new row isn't visible under it. Since the
-- Organisation's id is generated client-side (Prisma's `@default(uuid())`)
-- before the INSERT is ever sent, the app can — and now must — set
-- app.tenant_id to that pre-generated id first (see
-- PrismaService.provisionOrganisation), making the new tenant responsible
-- for its own first row under the exact same policy every other tenant-
-- scoped write already uses. No special-cased INSERT policy needed.
DROP POLICY tenant_isolation_insert ON organisations;
DROP POLICY tenant_isolation_read ON organisations;
DROP POLICY tenant_isolation_update ON organisations;
DROP POLICY tenant_isolation_delete ON organisations;

CREATE POLICY tenant_isolation ON organisations
  USING (id = current_setting('app.tenant_id', true));