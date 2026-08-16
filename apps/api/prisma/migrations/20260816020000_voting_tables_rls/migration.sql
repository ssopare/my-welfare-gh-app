-- RLS: the voting feature's 7 tables (20260815191737_add_voting) were
-- created with no RLS at all — every tenant-scoped table in this codebase
-- is required to have this (see e.g. 20260813072654_budgets/migration.sql
-- for the sibling pattern), so without this migration any organisation
-- could read/write another organisation's elections, nominations, votes,
-- and ballots. Only "elections" carries organisationId directly; the
-- other six are children scoped through electionId, so their policies
-- join back to elections the same way payout_approvals joins back to
-- payout_requests (20260816013000_payouts_and_reconciliation_schema).

ALTER TABLE elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE elections FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON elections
  USING ("organisationId" = current_setting('app.tenant_id', true));

ALTER TABLE nominations ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominations FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON nominations
  USING (
    "electionId" IN (
      SELECT "id" FROM "elections"
      WHERE "organisationId" = current_setting('app.tenant_id', true)
    )
  );

ALTER TABLE nominees ENABLE ROW LEVEL SECURITY;
ALTER TABLE nominees FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON nominees
  USING (
    "electionId" IN (
      SELECT "id" FROM "elections"
      WHERE "organisationId" = current_setting('app.tenant_id', true)
    )
  );

ALTER TABLE issue_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE issue_options FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON issue_options
  USING (
    "electionId" IN (
      SELECT "id" FROM "elections"
      WHERE "organisationId" = current_setting('app.tenant_id', true)
    )
  );

ALTER TABLE voter_registries ENABLE ROW LEVEL SECURITY;
ALTER TABLE voter_registries FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON voter_registries
  USING (
    "electionId" IN (
      SELECT "id" FROM "elections"
      WHERE "organisationId" = current_setting('app.tenant_id', true)
    )
  );

ALTER TABLE public_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_ballots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON public_ballots
  USING (
    "electionId" IN (
      SELECT "id" FROM "elections"
      WHERE "organisationId" = current_setting('app.tenant_id', true)
    )
  );

ALTER TABLE anonymous_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE anonymous_ballots FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON anonymous_ballots
  USING (
    "electionId" IN (
      SELECT "id" FROM "elections"
      WHERE "organisationId" = current_setting('app.tenant_id', true)
    )
  );
