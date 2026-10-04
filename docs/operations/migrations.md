# Migrations: expand, then contract

**Status:** B23 (2026-10-04), DoD 4: "Migrations are backward-aware; a rollout window with mixed
versions does not corrupt data" (`08 §22`).

## The rule

A deployment migrates first and then replaces tasks one by one, so for a few minutes the
**previous release runs on the new schema**. A rollback leaves the previous release on the new
schema for as long as it takes to fix forward. So every migration must be safe for the release
before it:

- **Expand** (any release): add a table, a nullable column, a column with a default, an index, an
  enum value, a constraint the previous release already satisfies.
- **Contract** (a later release, once nothing deployed uses the old shape): drop or rename a
  table or column, change a type, make a column required, remove an enum value, delete data.

A change that needs both is split across releases. Renaming a column, for example:

1. Release N: add the new column; write both; read the new one, falling back to the old.
2. Backfill (a script or a migration).
3. Release N+1: stop writing the old column.
4. Release N+2: drop it, in a migration marked as a contract step.

Enum values the code writes are added in one release and written from the next, because a
previous release reading a value it does not know is a crash.

## What enforces it

- `pnpm lint:migrations` (part of `pnpm lint`, so CI): `scripts/lint-migrations.mjs` flags
  contract-shaped DDL in every migration after the launch baseline `20261004120000`. A deliberate
  contract migration carries `-- atlas:contract <reason>` on its own line, which a reviewer
  checks against what is deployed.
- CI job **Golden path and mixed-version rollout**: the golden path (`09 §39`) on this commit,
  then with the base commit's API beside this commit's worker, then this commit's API beside the
  base commit's worker, all on this commit's migrated schema.
- The deploy workflow runs migrations from the new release's ops image before any service
  changes, and a failed migration stops the deployment with the old release still serving.

Migrations before the baseline were written before anything was deployed and include contract
steps (B16 reshaped `exam_participations` in one migration); the lint's own test shows it would
have caught them.

## Rehearsal on a production-like dataset

Required by B23's testing table. On staging, before launch and before any release with a heavy
migration:

1. Restore a production-sized, anonymised copy (`ops:anonymise-copy`, B22) to staging.
2. Deploy the release; the migrate step's duration is in the ops task log.
3. Roll back with the rollback workflow, then forward again; run the golden path after each.
4. Record times and any lock waits in the launch checklist.

Never run a long-locking statement (a table rewrite, `CREATE INDEX` without `CONCURRENTLY` on a
large table) without that rehearsal.
