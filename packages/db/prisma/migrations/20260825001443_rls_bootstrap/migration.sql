-- ADR-0023: Row-Level Security as defence in depth, on top of the
-- denormalised school_id column and composite foreign keys the "init"
-- migration already established.
--
-- Session variable: app.current_school_id, set per request/job via
-- @atlas/db's withTenant() (packages/db/src/tenancy.ts) using set_config(
-- ..., true) — scoped to the current transaction, safe under connection
-- pooling (see that function's comment and ADR-0023's "Harder" section).
--
-- FORCE ROW LEVEL SECURITY matters here: this migration itself runs as the
-- table owner ("atlas"), and Postgres exempts owners from RLS by default.
-- Without FORCE, this bootstrap would silently do nothing against a
-- connection using the owner role.
--
-- FORCE alone is not sufficient, though: a Postgres *superuser* bypasses
-- RLS unconditionally, FORCE notwithstanding — that attribute, not table
-- ownership, is what actually exempts a role. Docker's postgres image
-- makes POSTGRES_USER ("atlas") a superuser, so the running application
-- must never connect as that role. It connects as "atlas_app" instead
-- (infra/postgres/init.sql, DATABASE_APP_URL) — an ordinary, non-superuser
-- role for which FORCE has real effect. This came back to bite once
-- already: tests/tenancy/rls.integration.test.ts originally ran its
-- assertions against the owner connection too, so it passed for the wrong
-- reason (RLS wasn't actually restricting anything) until the app role and
-- this comment's distinction were introduced together.
--
-- Applies to every school-owned table below School itself. B0 only has the
-- two scaffolding probe tables; every later migration that adds a real
-- school-owned table (B1's User, B3's real School fields' children, etc.)
-- must add the same three statements for that table.

ALTER TABLE "tenancy_probes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenancy_probes" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenancy_probes_isolation" ON "tenancy_probes"
  USING (school_id::text = current_setting('app.current_school_id', true));

ALTER TABLE "tenancy_probe_children" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tenancy_probe_children" FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenancy_probe_children_isolation" ON "tenancy_probe_children"
  USING (school_id::text = current_setting('app.current_school_id', true));
