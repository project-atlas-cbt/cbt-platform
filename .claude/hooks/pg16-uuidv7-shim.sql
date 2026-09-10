-- Claude Code cloud sessions only — never used by Docker-based local dev.
--
-- Why this exists: every primary key in packages/db/prisma/schema.prisma
-- uses @default(dbgenerated("uuidv7()")), a function PostgreSQL only ships
-- built-in from version 18 onward. docker-compose.yml already runs the
-- real thing (postgres:18.6-alpine) and this file is never loaded there.
--
-- This container's package manager has no route to the PGDG apt
-- repository that would provide postgresql-18 (egress policy blocks
-- apt.postgresql.org; confirmed directly before writing this file, not
-- assumed) — only postgresql-16 (Ubuntu's own archive) is installable.
-- With no supported way to get a real PostgreSQL 18 here, this is a
-- same-shape stand-in for the one function the schema needs from it:
-- a spec-conformant UUIDv7 generator (RFC 9562 — 48-bit ms timestamp,
-- version nibble 0111, variant bits 10), good enough to satisfy every
-- consumer of the column (ordering, uniqueness) even though it isn't the
-- literal PostgreSQL 18 built-in.
--
-- Installed into "public" itself (not a separate schema added to the
-- search_path) so every unqualified uuidv7() call in a migration or query
-- resolves with zero connection-string changes — Prisma's own default
-- search_path assumption is left completely alone.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid AS $$
DECLARE
  unix_ts_ms bytea;
  rand_bytes bytea;
BEGIN
  unix_ts_ms := substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3 FOR 6);
  rand_bytes := gen_random_bytes(10);
  -- Version 7 in the high nibble of the 7th byte; variant 10 in the 9th.
  rand_bytes := set_byte(rand_bytes, 0, (get_byte(rand_bytes, 0) & 15) | 112);
  rand_bytes := set_byte(rand_bytes, 2, (get_byte(rand_bytes, 2) & 63) | 128);
  RETURN encode(unix_ts_ms || rand_bytes, 'hex')::uuid;
END;
$$ LANGUAGE plpgsql VOLATILE;

GRANT EXECUTE ON FUNCTION public.uuidv7() TO atlas_app, atlas_audit_reader;

-- `prisma migrate reset` (tests/support/run-prisma.ts's own documented
-- mechanism, and this project's standing response to migration drift —
-- see CLAUDE.md's B7/B13 Change Log entries) drops and recreates the
-- entire "public" schema, which would silently delete this function too
-- and break every migration after it. An event trigger is a
-- database-level catalog object, not a schema-owned one, so it survives
-- that drop and reinstalls the shim the instant "public" exists again —
-- the same self-healing shape @atlas/db's own grantAppRole() already
-- relies on for re-asserting atlas_app's table grants after a reset, just
-- applied to this one function instead.
--
-- Kept adjacent to, and in sync with, the CREATE FUNCTION above — if that
-- body ever changes, update the copy inside this EXECUTE block too.
CREATE OR REPLACE FUNCTION public.atlas_reinstall_uuidv7_shim() RETURNS event_trigger AS $trigger$
BEGIN
  EXECUTE $ddl$
    CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid AS $fn$
    DECLARE
      unix_ts_ms bytea;
      rand_bytes bytea;
    BEGIN
      unix_ts_ms := substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3 FOR 6);
      rand_bytes := gen_random_bytes(10);
      rand_bytes := set_byte(rand_bytes, 0, (get_byte(rand_bytes, 0) & 15) | 112);
      rand_bytes := set_byte(rand_bytes, 2, (get_byte(rand_bytes, 2) & 63) | 128);
      RETURN encode(unix_ts_ms || rand_bytes, 'hex')::uuid;
    END;
    $fn$ LANGUAGE plpgsql VOLATILE;
  $ddl$;
  EXECUTE 'GRANT EXECUTE ON FUNCTION public.uuidv7() TO atlas_app, atlas_audit_reader';
EXCEPTION WHEN undefined_object THEN
  -- atlas_app/atlas_audit_reader may not exist yet the very first time
  -- "public" is created (fresh database, before infra/postgres/init.sql's
  -- equivalent has run) — the function itself is still installed above;
  -- only the grant is skipped, and re-runs cleanly once those roles exist.
  NULL;
END;
$trigger$ LANGUAGE plpgsql;

DROP EVENT TRIGGER IF EXISTS atlas_reinstall_uuidv7_shim_trigger;
CREATE EVENT TRIGGER atlas_reinstall_uuidv7_shim_trigger
  ON ddl_command_end
  WHEN TAG IN ('CREATE SCHEMA')
  EXECUTE FUNCTION public.atlas_reinstall_uuidv7_shim();
