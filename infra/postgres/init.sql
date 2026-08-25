-- Local dev cluster bootstrap. Runs once, on first container init.
--
-- Two roles, matching how a real deployment separates them:
--   * POSTGRES_USER ("atlas") — schema owner, runs migrations, has DDL
--     rights. Docker's postgres image makes this role a superuser.
--   * atlas_app — the role the running application (and this repo's RLS
--     test) actually connects as. Deliberately NOT a superuser: Postgres
--     superusers bypass Row-Level Security unconditionally, FORCE ROW
--     LEVEL SECURITY notwithstanding (see ADR-0023's rls_bootstrap
--     migration). If the app connected as the migration owner, every RLS
--     policy in this project would silently do nothing and the isolation
--     test would pass for the wrong reason — it failed exactly this way
--     the first time this file didn't exist.
--
-- ALTER DEFAULT PRIVILEGES makes this automatic for every table a future
-- migration creates (as "atlas", the owner) — no per-migration grant step
-- needed.

CREATE ROLE atlas_app WITH LOGIN PASSWORD 'atlas_app_dev_password';
GRANT USAGE ON SCHEMA public TO atlas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO atlas_app;

CREATE DATABASE atlas_test OWNER atlas;

\connect atlas_test

GRANT USAGE ON SCHEMA public TO atlas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;
ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO atlas_app;
