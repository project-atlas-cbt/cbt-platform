#!/usr/bin/env sh
# B20: the one CI copy of infra/postgres/init.sql's role bootstrap (both CI
# jobs that need a database used to carry their own inline copy). GitHub
# Actions `services:` containers can't mount an init script the way
# docker-compose does, so this runs the same statements over psql before
# any migration. ALTER DEFAULT PRIVILEGES must precede the first migration;
# grantAppRole() then narrows the grant state after every deploy
# (packages/db/src/privileges.ts).
set -eu

: "${PGHOST:=localhost}"
: "${PGUSER:=atlas}"
: "${PGDATABASE:=atlas_ci}"
: "${APP_ROLE_PASSWORD:=atlas_app_ci_password}"
: "${AUDIT_READER_PASSWORD:=atlas_audit_reader_ci_password}"

# Explicit flags: the defaults above are plain shell variables, which psql
# never sees unless exported, and without -h it falls back to a local Unix
# socket — the CI database is a service container reachable only over TCP.
psql -h "$PGHOST" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1 \
  -c "CREATE ROLE atlas_app WITH LOGIN PASSWORD '${APP_ROLE_PASSWORD}'" \
  -c "GRANT USAGE ON SCHEMA public TO atlas_app" \
  -c "ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app" \
  -c "ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO atlas_app" \
  -c "CREATE ROLE atlas_audit_reader WITH LOGIN PASSWORD '${AUDIT_READER_PASSWORD}'" \
  -c "GRANT USAGE ON SCHEMA public TO atlas_audit_reader"
