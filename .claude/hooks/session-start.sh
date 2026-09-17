#!/bin/bash
# Claude Code cloud (web) session bootstrap for Project Atlas.
#
# Docker-based local dev (README.md's "Quick start", docker-compose.yml) is
# untouched and remains the primary, documented workflow — this script only
# runs in a Claude Code cloud session (gated on $CLAUDE_CODE_REMOTE below),
# where Docker itself is unavailable, and exists purely to save a future
# session from re-deriving the same manual Postgres/Redis/S3 setup by hand
# every time. See docs/operations/cloud-session-bootstrap.md for the full
# rationale and what to do if any step here needs to change.
#
# Idempotent throughout: every step checks its own current state first and
# only acts if something is actually missing, so re-running this script
# (same session, or a fresh one) is always safe.
set -uo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

REPO_ROOT="${CLAUDE_PROJECT_DIR:-/home/user/cbt-platform}"
cd "$REPO_ROOT"

log() { echo "[session-start] $*"; }
fail() { echo "[session-start] ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# 1. PostgreSQL — reuses infra/postgres/init.sql verbatim (never edited) for
#    the exact same roles/grants docker-compose.yml's postgres service gets
#    on first init, against a real installed PostgreSQL server. Only the
#    uuidv7() shim (pg16-uuidv7-shim.sql, this directory) is cloud-only —
#    see that file's own header for why it's necessary here and never used
#    by Docker, which always runs the real postgres:18.6-alpine.
# ---------------------------------------------------------------------------
PG_SUPERUSER_PW="atlas_dev_password"   # matches .env.example / docker-compose.yml's POSTGRES_PASSWORD
PG_APP_PW="atlas_app_dev_password"      # matches infra/postgres/init.sql
PG_AUDIT_PW="atlas_audit_reader_dev_password"

if command -v pg_lsclusters >/dev/null 2>&1; then
  PG_VERSION="$(pg_lsclusters | awk 'NR==2 {print $1}')"
elif command -v apt-get >/dev/null 2>&1; then
  log "No PostgreSQL server found — installing postgresql (Ubuntu's own archive; the PGDG repo for a real PostgreSQL 18 is not reachable from this container)."
  sudo apt-get update -qq
  sudo apt-get install -y --no-install-recommends postgresql
  PG_VERSION="$(pg_lsclusters | awk 'NR==2 {print $1}')"
else
  fail "No PostgreSQL server and no apt-get to install one."
fi
[ -n "${PG_VERSION:-}" ] || fail "Could not determine the installed PostgreSQL cluster version."

if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  log "Starting PostgreSQL $PG_VERSION..."
  sudo pg_ctlcluster "$PG_VERSION" main start
  for _ in $(seq 1 30); do
    pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 && break
    sleep 1
  done
  pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1 || fail "PostgreSQL did not become ready."
else
  log "PostgreSQL already running."
fi

role_exists() { sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$1'" | grep -q 1; }
db_exists() { sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$1'" | grep -q 1; }

if ! role_exists atlas; then
  log "Creating role 'atlas' (schema owner — superuser, matching docker-compose's POSTGRES_USER)."
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c \
    "CREATE ROLE atlas WITH LOGIN SUPERUSER PASSWORD '${PG_SUPERUSER_PW}';"
fi
if ! db_exists atlas_dev; then
  log "Creating database 'atlas_dev'."
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "CREATE DATABASE atlas_dev OWNER atlas;"
fi

if ! role_exists atlas_app; then
  # Runs infra/postgres/init.sql exactly once, exactly as Docker's own
  # docker-entrypoint-initdb.d mechanism would (psql, as the schema owner,
  # against atlas_dev) — same file, same roles/grants, same atlas_test
  # database it also creates. Re-running this file is NOT safe (Docker
  # never re-runs it either — see the file's own header), which is why the
  # role-existence check above guards the whole block.
  log "Bootstrapping atlas_app / atlas_audit_reader roles and atlas_test via infra/postgres/init.sql."
  PGPASSWORD="$PG_SUPERUSER_PW" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U atlas -d atlas_dev \
    -f "$REPO_ROOT/infra/postgres/init.sql"
else
  log "atlas_app / atlas_audit_reader / atlas_test already bootstrapped."
fi

log "Installing the uuidv7() shim into atlas_dev and atlas_test (safe to re-run; CREATE OR REPLACE throughout)."
PGPASSWORD="$PG_SUPERUSER_PW" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U atlas -d atlas_dev \
  -f "$REPO_ROOT/.claude/hooks/pg16-uuidv7-shim.sql" >/dev/null
PGPASSWORD="$PG_SUPERUSER_PW" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U atlas -d atlas_test \
  -f "$REPO_ROOT/.claude/hooks/pg16-uuidv7-shim.sql" >/dev/null

# ---------------------------------------------------------------------------
# 2. Redis — started with an explicit --dir outside the repo, so its
#    periodic RDB autosave can never write dump.rdb into the working tree
#    (the exact stray-file problem hit and fixed earlier this session).
# ---------------------------------------------------------------------------
REDIS_DATA_DIR="/var/lib/atlas-cloud-dev/redis"
if ! redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1; then
  log "Starting Redis (data dir: $REDIS_DATA_DIR, outside the repo)."
  sudo mkdir -p "$REDIS_DATA_DIR"
  sudo chmod 777 "$REDIS_DATA_DIR"
  redis-server --daemonize yes --port 6379 --dir "$REDIS_DATA_DIR" --save 60 1
  for _ in $(seq 1 15); do
    redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1 && break
    sleep 1
  done
  redis-cli -h 127.0.0.1 -p 6379 ping >/dev/null 2>&1 || fail "Redis did not become ready."
else
  log "Redis already running."
fi

# ---------------------------------------------------------------------------
# 3. S3-compatible object storage — s3rver stands in for docker-compose's
#    MinIO service (dl.min.io, MinIO's own download host, is not reachable
#    from this container; confirmed directly before choosing this). Started
#    with an explicit -d outside the repo for the same dump.rdb-class reason
#    as Redis above. ObjectStorageService.ensureBucket() (apps/api) creates
#    the bucket itself at boot, exactly as it already does against MinIO —
#    no bucket-provisioning step needed here.
# ---------------------------------------------------------------------------
S3_DATA_DIR="/var/lib/atlas-cloud-dev/s3"
if ! curl -fsS -o /dev/null "http://127.0.0.1:9000/" 2>/dev/null; then
  S3RVER_BIN=""
  for candidate in "$(command -v s3rver 2>/dev/null || true)" "/opt/node22/bin/s3rver"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      S3RVER_BIN="$candidate"
      break
    fi
  done
  if [ -z "$S3RVER_BIN" ]; then
    log "s3rver not found — installing it globally via npm."
    npm install -g s3rver >/dev/null 2>&1 || fail "Could not find or install s3rver (no local binary, and the npm registry was not reachable)."
    S3RVER_BIN="$(command -v s3rver)"
  fi
  log "Starting s3rver (data dir: $S3_DATA_DIR, outside the repo)."
  sudo mkdir -p "$S3_DATA_DIR"
  sudo chmod 777 "$S3_DATA_DIR"
  nohup "$S3RVER_BIN" -d "$S3_DATA_DIR" -a 0.0.0.0 -p 9000 \
    > /var/lib/atlas-cloud-dev/s3rver.log 2>&1 &
  disown
  for _ in $(seq 1 15); do
    curl -fsS -o /dev/null "http://127.0.0.1:9000/" 2>/dev/null && break
    sleep 1
  done
  curl -fsS -o /dev/null "http://127.0.0.1:9000/" 2>/dev/null || fail "s3rver did not become ready."
else
  log "S3-compatible storage already running."
fi

# ---------------------------------------------------------------------------
# 4. .env — copied from the repo's own .env.example (never overwritten if it
#    already exists, so a deliberately-customized .env is left alone), with
#    only the S3 credential fields patched to match s3rver's own fixed
#    test credentials. Every other value in .env.example (Postgres users/
#    passwords/ports, Redis, object-storage endpoint/port) already matches
#    what's provisioned above exactly, since it's written for the "native,
#    no-Docker" half of README.md's own two supported dev workflows.
# ---------------------------------------------------------------------------
if [ ! -f "$REPO_ROOT/.env" ]; then
  log "Creating .env from .env.example."
  cp "$REPO_ROOT/.env.example" "$REPO_ROOT/.env"
fi
patch_env() {
  local key="$1" value="$2"
  if grep -q "^${key}=" "$REPO_ROOT/.env"; then
    sed -i "s|^${key}=.*|${key}=\"${value}\"|" "$REPO_ROOT/.env"
  else
    echo "${key}=\"${value}\"" >> "$REPO_ROOT/.env"
  fi
}
patch_env S3_BUCKET "atlas-dev"
patch_env S3_ACCESS_KEY_ID "S3RVER"
patch_env S3_SECRET_ACCESS_KEY "S3RVER"

# ---------------------------------------------------------------------------
# 5. Dependencies, Prisma client, migrations — the project's own documented
#    commands (README.md's "Quick start"), unchanged.
# ---------------------------------------------------------------------------
log "Installing dependencies (pnpm install)."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install || fail "pnpm install failed."

log "Building @atlas/config (packages/db/prisma.config.ts needs this before db:generate)."
pnpm --filter @atlas/config run build || fail "@atlas/config build failed."

log "Generating the Prisma client."
pnpm db:generate || fail "pnpm db:generate failed."

log "Applying migrations to atlas_dev."
pnpm db:migrate:deploy || fail "pnpm db:migrate:deploy failed."

log "Bootstrap complete."
