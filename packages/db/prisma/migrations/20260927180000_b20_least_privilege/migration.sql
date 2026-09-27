-- B20: reassert the runtime role's least-privilege boundary.
--
-- atlas_app needs USAGE on public and ordinary DML on product tables, but
-- never schema creation and never any capability that can mutate, truncate,
-- re-reference, or replace triggers on append-only audit history.
REVOKE CREATE ON SCHEMA public FROM atlas_app;

REVOKE UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON "audit_events" FROM atlas_app;
GRANT SELECT, INSERT ON "audit_events" TO atlas_app;