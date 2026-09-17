# Cloud session bootstrap (Claude Code on the web)

This document explains `.claude/hooks/session-start.sh` — the one thing in this repository that
exists purely for Claude Code **cloud** sessions, never for local development.

## Why this exists

`README.md`'s "Quick start" — `docker compose up -d postgres redis` (and, for the full stack,
`minio`) — is and remains the real, primary, documented way to run this project locally. It is
untouched by anything below.

A Claude Code cloud session runs in a container with **no Docker**, and (checked directly, not
assumed) no route to two hosts the Docker workflow depends on: `apt.postgresql.org` (the PGDG
repository that provides a real PostgreSQL 18 package) and `dl.min.io` (MinIO's own release host).
Before this hook existed, every fresh cloud session had to rebuild Postgres/Redis/S3-compatible
storage from scratch by hand — a slow, undocumented, easy-to-get-wrong process (see `CLAUDE.md`'s
2026-09-10 Change Log entries for exactly how much of a session that cost, twice, before this hook
was written).

`.claude/hooks/session-start.sh` is a `SessionStart` hook (Claude Code's own mechanism —
`.claude/settings.json` registers it) that reruns that same setup automatically and idempotently at
the start of every cloud session, so it never has to be done by hand again.

## What it does, and why each piece is what it is

| Step            | What                                                                                                                                                                                                                                                                                       | Why this shape                                                                                                                                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL      | Starts the already-installed `postgresql-16` cluster; creates the `atlas` role/`atlas_dev` database if missing; runs **`infra/postgres/init.sql` unmodified** (the same file Docker's `docker-entrypoint-initdb.d` mechanism runs) to create `atlas_app`/`atlas_audit_reader`/`atlas_test` | Reuses the repo's real init script rather than re-deriving its roles/grants by hand                                                                                                                                                                                  |
| `uuidv7()` shim | Installs `.claude/hooks/pg16-uuidv7-shim.sql` into `atlas_dev` and `atlas_test`                                                                                                                                                                                                            | PostgreSQL 18 (which the schema's `@default(dbgenerated("uuidv7()"))` primary keys need) isn't installable here — see that file's own header for the full reasoning and the confirmed absence of a better option                                                     |
| Redis           | Starts `redis-server` with `--dir /var/lib/atlas-cloud-dev/redis`                                                                                                                                                                                                                          | Outside the repo, so its autosave can never write `dump.rdb` into the working tree (this exact problem happened once — see `CLAUDE.md`'s Change Log)                                                                                                                 |
| Object storage  | Starts `s3rver` (an S3-compatible dev server) on port 9000, data dir `/var/lib/atlas-cloud-dev/s3`                                                                                                                                                                                         | Stands in for MinIO, which can't be downloaded here; same "outside the repo" reasoning as Redis. `apps/api`'s own `ObjectStorageService.ensureBucket()` still self-provisions the bucket — nothing here creates it                                                   |
| `.env`          | Copies `.env.example` → `.env` if missing; patches only the three S3 credential fields to match `s3rver`'s fixed test credentials                                                                                                                                                          | Every other `.env.example` default (Postgres users/passwords/ports, Redis, the object-storage endpoint/port) already matches what's provisioned above, since `.env.example` is written for the "native, no-Docker" half of `README.md`'s own two supported workflows |
| Dependencies    | `pnpm install`, `pnpm --filter @atlas/config run build`, `pnpm db:generate`, `pnpm db:migrate:deploy`                                                                                                                                                                                      | The project's own documented commands, unchanged                                                                                                                                                                                                                     |

Every step checks its own current state before acting (a running service, an existing role, an
existing file) — safe to re-run within a session or across a fresh one.

## What it deliberately does not do

- **Never touches Docker, `docker-compose.yml`, or `infra/postgres/init.sql`'s own contents.**
  Local dev is completely unaffected.
- **Never runs on a real local machine** — gated on `$CLAUDE_CODE_REMOTE` at the top of the script,
  so it's a pure no-op anywhere that isn't a Claude Code cloud session.
- **Doesn't seed data or run the test suite.** Run `pnpm db:seed` / `pnpm test:integration` yourself
  once the session starts, exactly as you would locally.
- **Doesn't apply migrations to `atlas_test`.** `tests/support/run-prisma.ts`'s own `migrate reset`
  mechanism already owns that database's schema lifecycle (including re-asserting
  `atlas_app`/`atlas_audit_reader`'s grants afterward) — this hook only needs to make sure the
  `uuidv7()` shim survives that reset, which the event trigger in `pg16-uuidv7-shim.sql` does on
  its own.

## If a step here ever needs to change

- Postgres/Redis/S3 credentials and ports are deliberately kept identical to `.env.example`'s own
  values wherever the substitute service allows it (only the three S3 credential fields differ,
  because `s3rver` doesn't understand MinIO's credentials). If `.env.example` changes, check whether
  this hook's `patch_env` calls in `session-start.sh` still make sense.
- If PostgreSQL 18 ever becomes installable here (a policy change on the PGDG host), replace the
  `postgresql-16` install/start block with a real `postgresql-18` one and delete
  `pg16-uuidv7-shim.sql` and its two `psql -f` calls — nothing else in this file depends on it.
- If MinIO's release host ever becomes reachable, the same applies to the `s3rver` block.

## One known, accepted gap

The one `apps/api` integration test this substitution can't satisfy is
`media.integration.test.ts`'s "retrievable only via a signed URL" case, which asserts MinIO's
default-private-bucket behaviour — `s3rver` doesn't implement that. Not a bug in this hook; CI (real
PostgreSQL 18, real MinIO) remains the authoritative check for that one test.
