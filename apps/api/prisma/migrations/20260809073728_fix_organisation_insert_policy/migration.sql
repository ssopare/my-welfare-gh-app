-- Split organisations' single blanket RLS policy into per-command policies.
--
-- The original policy (id = current_setting('app.tenant_id')) applied to
-- every command including INSERT, which makes creating a *new* Organisation
-- impossible: tenant onboarding (§8.1) necessarily happens before that
-- tenant's own app.tenant_id context can exist — there's no value to set
-- app.tenant_id to that would satisfy "id = the tenant being created" for a
-- row that doesn't exist yet. INSERT is therefore its own, unrestricted
-- policy; read/update/delete of an *existing* org stays tenant-scoped.
DROP POLICY tenant_isolation ON organisations;

CREATE POLICY tenant_isolation_insert ON organisations
  FOR INSERT WITH CHECK (true);
CREATE POLICY tenant_isolation_read ON organisations
  FOR SELECT USING (id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_isolation_update ON organisations
  FOR UPDATE USING (id = current_setting('app.tenant_id', true));
CREATE POLICY tenant_isolation_delete ON organisations
  FOR DELETE USING (id = current_setting('app.tenant_id', true));