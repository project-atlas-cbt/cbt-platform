#!/usr/bin/env bash
# =============================================================================
# B22 restore drill: encrypted base backup + continuous WAL archive, then
# point-in-time recovery to a chosen timestamp and recovery to the end of the
# archive after a crash (project-owner decision 1A, 2026-10-04: a real
# base-backup + WAL PITR, not dump/reload).
#
# Self-contained: it builds its own source cluster, so it never touches a
# real database.
#
#   1. Source cluster: initdb, roles, migrations (the real schema), padding
#      (pgbench) to a chosen size.
#   2. Archive: pg_receivewal --synchronous streams WAL from before the base
#      backup; pg_basebackup streams the base backup straight into
#      gzip | age — the plaintext backup never touches disk.
#   3. Workload A through the real API and worker (provision + a submit
#      burst: start, answer, submit, mark — the golden path), then the
#      target timestamp T, then workload B.
#   4. Crash: markers committed continuously, then pg_ctl stop -m immediate.
#      The WAL archive is encrypted segment by segment with age.
#   5. Restore 1 (PITR to T) into a clean cluster: workload A present,
#      workload B absent, ops:restore-verify passes, the golden path runs
#      against it through a fresh API and worker, ops:anonymise-copy leaves
#      no names behind.
#   6. Restore 2 (end of archive): the last acknowledged marker is present
#      (RPO), timed (RTO).
#   7. Report: docs/performance/results/<stamp>-dr-drill.{json,md}.
#
# Needs: PostgreSQL server binaries (PGBIN), age, Redis and object storage
# as for the API, a built API and worker (pnpm turbo run build
# --filter=@atlas/api --filter=@atlas/worker). Run as root only on a dev box:
# the PostgreSQL steps then run as the postgres user.
#
# Encryption keys: DR_AGE_RECIPIENT (public) and DR_AGE_IDENTITY_FILE
# (private, from the secret manager) when given; otherwise a key pair made
# for this run only, inside the drill directory, never in the repository.
#
# Environment knobs (defaults in brackets): PGBIN [/usr/lib/postgresql/16/bin],
# DRILL_DIR [mktemp], DRILL_PAD_SCALE [20 ≈ 300 MB], DRILL_STUDENTS [40],
# DRILL_SRC_PORT [5434], DRILL_RESTORE_PORT [5433], DRILL_API_PORT [3201],
# DRILL_REDIS_URL [redis://localhost:6379/7], KEEP_DRILL_DIR [unset].
# =============================================================================
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT"
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
DRILL_DIR=${DRILL_DIR:-$(mktemp -d /tmp/atlas-dr-drill.XXXXXX)}
SRC_PORT=${DRILL_SRC_PORT:-5434}
RESTORE_PORT=${DRILL_RESTORE_PORT:-5433}
API_PORT=${DRILL_API_PORT:-3201}
PAD_SCALE=${DRILL_PAD_SCALE:-20}
STUDENTS=${DRILL_STUDENTS:-40}
DRILL_REDIS_URL=${DRILL_REDIS_URL:-redis://localhost:6379/7}
DB=atlas_drill
STAMP=$(date -u +%Y-%m-%dT%H-%M-%S)

log() { echo "[dr-drill $(date -u +%T)] $*"; }
now_ms() { date +%s%3N; }
secs() { awk "BEGIN { printf \"%.1f\", $1 / 1000 }"; }

# PostgreSQL refuses to run as root; on a dev box run its tools as postgres.
if [[ $(id -u) == 0 ]]; then
  PGUSER_OS=postgres
  as_pg() { runuser -u postgres -- env PGPASSWORD="${PGPASSWORD:-}" "$@"; }
else
  PGUSER_OS=$(id -un)
  as_pg() { "$@"; }
fi

mkdir -p "$DRILL_DIR"/{backup/wal,wal-stream,keys,load-results}
chmod 755 "$DRILL_DIR"
OWNER_PW=$(openssl rand -hex 16)
APP_PW=$(openssl rand -hex 16)
AUDIT_PW=$(openssl rand -hex 16)
export PGPASSWORD=$OWNER_PW
printf '%s\n' "$OWNER_PW" > "$DRILL_DIR/pw"

if [[ -n ${DR_AGE_RECIPIENT:-} && -n ${DR_AGE_IDENTITY_FILE:-} ]]; then
  RECIPIENT=$DR_AGE_RECIPIENT
  cp "$DR_AGE_IDENTITY_FILE" "$DRILL_DIR/keys/identity"
else
  age-keygen -o "$DRILL_DIR/keys/identity" 2> /dev/null
  RECIPIENT=$(age-keygen -y "$DRILL_DIR/keys/identity")
fi
chmod 600 "$DRILL_DIR/keys/identity" "$DRILL_DIR/pw"
cp "$ROOT/infra/dr/restore-wal.sh" "$DRILL_DIR/restore-wal.sh"
chown -R "$PGUSER_OS" "$DRILL_DIR"

PIDS=()
cleanup() {
  set +e
  for pid in "${PIDS[@]}"; do kill "$pid" 2> /dev/null; done
  for d in src restore; do
    [[ -f $DRILL_DIR/$d/postmaster.pid ]] && as_pg "$PGBIN/pg_ctl" -D "$DRILL_DIR/$d" -m immediate stop > /dev/null 2>&1
  done
  if [[ -z ${KEEP_DRILL_DIR:-} ]]; then rm -rf "$DRILL_DIR"; else log "kept $DRILL_DIR"; fi
}
trap cleanup EXIT

psql_at() { # port db sql
  psql -h 127.0.0.1 -p "$1" -U atlas -d "$2" -v ON_ERROR_STOP=1 -Atqc "$3"
}

owner_url() { echo "postgresql://atlas:$OWNER_PW@127.0.0.1:$1/$DB?schema=public"; }
app_env() { # port → environment for the API, worker and load tools
  echo "DATABASE_URL=$(owner_url "$1")" \
    "DATABASE_APP_URL=postgresql://atlas_app:$APP_PW@127.0.0.1:$1/$DB?schema=public" \
    "DATABASE_AUDIT_READER_URL=postgresql://atlas_audit_reader:$AUDIT_PW@127.0.0.1:$1/$DB?schema=public" \
    "REDIS_URL=$DRILL_REDIS_URL" "LOAD_RESULTS_DIR=$DRILL_DIR/load-results"
}

start_apps() { # db port
  local env
  env=$(app_env "$1")
  (cd "$ROOT/apps/api" && exec env $env API_PORT=$API_PORT TRUST_PROXY_HOPS=1 LOG_LEVEL=warn \
    node dist/main.js >> "$DRILL_DIR/api.log" 2>&1) &
  APP_PIDS=($!)
  (cd "$ROOT/apps/worker" && exec env $env LOG_LEVEL=warn node dist/main.js >> "$DRILL_DIR/worker.log" 2>&1) &
  APP_PIDS+=($!)
  PIDS+=("${APP_PIDS[@]}")
  for _ in $(seq 1 120); do
    curl -sf "http://127.0.0.1:$API_PORT/v1/health" > /dev/null && return 0
    sleep 0.5
  done
  echo "API did not start; see $DRILL_DIR/api.log" >&2
  return 1
}
stop_apps() {
  kill -TERM "${APP_PIDS[@]}" 2> /dev/null || true
  wait "${APP_PIDS[@]}" 2> /dev/null || true
}
json_only() { sed -n '/^{/,$p'; } # dotenv prints a banner line first

load() { # db port, then load CLI args
  local port=$1
  shift
  env $(app_env "$port") pnpm --silent --filter @atlas/load exec tsx src/cli.ts "$@"
}

# --- 1. Source cluster --------------------------------------------------------
log "source cluster on :$SRC_PORT in $DRILL_DIR"
as_pg "$PGBIN/initdb" -D "$DRILL_DIR/src" -U atlas --pwfile="$DRILL_DIR/pw" -A scram-sha-256 \
  --data-checksums > /dev/null
cat >> "$DRILL_DIR/src/postgresql.conf" << EOF
port = $SRC_PORT
listen_addresses = '127.0.0.1'
unix_socket_directories = '$DRILL_DIR'
wal_level = replica
max_wal_senders = 5
max_replication_slots = 5
EOF
as_pg "$PGBIN/pg_ctl" -D "$DRILL_DIR/src" -l "$DRILL_DIR/src.log" -w start > /dev/null

psql_at "$SRC_PORT" postgres "CREATE ROLE atlas_app LOGIN PASSWORD '$APP_PW'; CREATE ROLE atlas_audit_reader LOGIN PASSWORD '$AUDIT_PW';"
# CREATE DATABASE cannot share a -c with other statements (it would run in one transaction).
psql_at "$SRC_PORT" postgres "CREATE DATABASE $DB OWNER atlas"
psql_at "$SRC_PORT" postgres "CREATE DATABASE drill_pad OWNER atlas"
psql_at "$SRC_PORT" "$DB" "GRANT USAGE ON SCHEMA public TO atlas_app, atlas_audit_reader;
  ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO atlas_app;
  ALTER DEFAULT PRIVILEGES FOR ROLE atlas IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO atlas_app;"
if [[ $(psql_at "$SRC_PORT" "$DB" 'SHOW server_version_num') -lt 180000 ]]; then
  psql -h 127.0.0.1 -p "$SRC_PORT" -U atlas -d "$DB" -qf "$ROOT/.claude/hooks/pg16-uuidv7-shim.sql" > /dev/null
fi
(cd "$ROOT/packages/db" && env $(app_env "$SRC_PORT") pnpm --silent run migrate:deploy > "$DRILL_DIR/migrate.log" 2>&1)
log "padding with pgbench scale $PAD_SCALE"
as_pg "$PGBIN/pgbench" -h 127.0.0.1 -p "$SRC_PORT" -U atlas -i -q -s "$PAD_SCALE" drill_pad > /dev/null 2>&1

# --- 2. Archive + encrypted base backup ---------------------------------------
as_pg "$PGBIN/pg_receivewal" -h 127.0.0.1 -p "$SRC_PORT" -U atlas -D "$DRILL_DIR/wal-stream" \
  --slot drill --create-slot --if-not-exists > /dev/null 2>&1
as_pg "$PGBIN/pg_receivewal" -h 127.0.0.1 -p "$SRC_PORT" -U atlas -D "$DRILL_DIR/wal-stream" \
  --slot drill --synchronous --no-loop > "$DRILL_DIR/receivewal.log" 2>&1 &
RECEIVEWAL_PID=$!
PIDS+=("$RECEIVEWAL_PID")
sleep 1

log "base backup → gzip → age"
t=$(now_ms)
as_pg "$PGBIN/pg_basebackup" -h 127.0.0.1 -p "$SRC_PORT" -U atlas -D - -Ft -X none -c fast \
  | gzip -1 | age -r "$RECIPIENT" > "$DRILL_DIR/backup/base.tar.gz.age"
BACKUP_MS=$(($(now_ms) - t))
CLUSTER_BYTES=$(psql_at "$SRC_PORT" postgres "SELECT sum(pg_database_size(datname)) FROM pg_database")
BACKUP_BYTES=$(stat -c %s "$DRILL_DIR/backup/base.tar.gz.age")
# The encrypted file is not readable as a tar without the key.
if gzip -t < "$DRILL_DIR/backup/base.tar.gz.age" 2> /dev/null; then
  echo "base backup is not encrypted" >&2
  exit 1
fi

# --- 3. Workload A, target time, workload B -----------------------------------
start_apps "$SRC_PORT"
log "workload A: provision + submit burst of $STUDENTS (golden path)"
load "$SRC_PORT" provision --name dr-drill --schools 1 --students "$STUDENTS" --questions 10 \
  --target "http://127.0.0.1:$API_PORT/v1" > "$DRILL_DIR/provision.log" 2>&1
load "$SRC_PORT" burst --name dr-drill --kind submit --n "$STUDENTS" \
  --target "http://127.0.0.1:$API_PORT/v1" > "$DRILL_DIR/burst-a.log" 2>&1
ATTEMPTS_A=$(psql_at "$SRC_PORT" "$DB" "SELECT count(*) FROM exam_attempts")
RESULTS_A=$(psql_at "$SRC_PORT" "$DB" "SELECT count(*) FROM results WHERE state = 'FINAL'")
sleep 2
TARGET=$(psql_at "$SRC_PORT" "$DB" "SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")
sleep 2
log "target time $TARGET (A: $ATTEMPTS_A attempts); workload B"
load "$SRC_PORT" burst --name dr-drill --kind submit --n "$STUDENTS" \
  --target "http://127.0.0.1:$API_PORT/v1" > "$DRILL_DIR/burst-b.log" 2>&1
ATTEMPTS_B=$(psql_at "$SRC_PORT" "$DB" "SELECT count(*) FROM exam_attempts")
stop_apps

# --- 4. Crash with markers in flight ------------------------------------------
psql_at "$SRC_PORT" drill_pad "CREATE TABLE rpo_markers (id bigint PRIMARY KEY, at timestamptz NOT NULL DEFAULT clock_timestamp())"
(
  i=0
  while true; do
    i=$((i + 1))
    psql_at "$SRC_PORT" drill_pad "INSERT INTO rpo_markers (id) VALUES ($i)" 2> /dev/null || exit 0
    echo "$i $(now_ms)" > "$DRILL_DIR/last-acked"
  done
) &
MARKER_PID=$!
sleep 8
log "crash: pg_ctl stop -m immediate"
as_pg "$PGBIN/pg_ctl" -D "$DRILL_DIR/src" -m immediate stop > /dev/null
wait "$MARKER_PID" 2> /dev/null || true
read -r LAST_ACKED LAST_ACKED_AT < "$DRILL_DIR/last-acked"
wait "$RECEIVEWAL_PID" 2> /dev/null || true

log "encrypting the WAL archive"
for f in "$DRILL_DIR"/wal-stream/*; do
  age -r "$RECIPIENT" -o "$DRILL_DIR/backup/wal/$(basename "$f").age" "$f"
done
WAL_FILES=$(ls "$DRILL_DIR/backup/wal" | wc -l)
rm -rf "$DRILL_DIR/wal-stream"
chown -R "$PGUSER_OS" "$DRILL_DIR/backup"

# --- Restore ------------------------------------------------------------------
restore() { # "time" → PITR to $TARGET; "latest" → end of the archive
  rm -rf "$DRILL_DIR/restore"
  install -d -m 700 -o "$PGUSER_OS" "$DRILL_DIR/restore"
  age -d -i "$DRILL_DIR/keys/identity" "$DRILL_DIR/backup/base.tar.gz.age" \
    | gunzip | as_pg tar -x -C "$DRILL_DIR/restore"
  {
    echo "port = $RESTORE_PORT"
    echo "restore_command = '$DRILL_DIR/restore-wal.sh $DRILL_DIR/backup/wal $DRILL_DIR/keys/identity %f %p'"
    if [[ $1 == time ]]; then
      echo "recovery_target_time = '$TARGET'"
      echo "recovery_target_action = 'promote'"
    fi
  } | as_pg tee -a "$DRILL_DIR/restore/postgresql.auto.conf" > /dev/null
  as_pg touch "$DRILL_DIR/restore/recovery.signal"
  as_pg "$PGBIN/pg_ctl" -D "$DRILL_DIR/restore" -l "$DRILL_DIR/restore-$1.log" -w -t 3600 start > /dev/null
  for _ in $(seq 1 3600); do
    [[ $(psql_at "$RESTORE_PORT" postgres 'SELECT pg_is_in_recovery()' 2> /dev/null) == f ]] && return 0
    sleep 1
  done
  return 1
}
verify() {
  env $(app_env "$RESTORE_PORT") pnpm --silent --filter @atlas/api exec tsx src/ops/restore-verify.ts \
    --database-url "$(owner_url "$RESTORE_PORT")" | json_only > "$DRILL_DIR/verify-$1.json"
}

log "restore 1: PITR to $TARGET"
t=$(now_ms)
restore time
verify pitr
PITR_RTO_MS=$(($(now_ms) - t))
PITR_ATTEMPTS=$(psql_at "$RESTORE_PORT" "$DB" "SELECT count(*) FROM exam_attempts")
PITR_RESULTS=$(psql_at "$RESTORE_PORT" "$DB" "SELECT count(*) FROM results WHERE state = 'FINAL'")
if [[ $PITR_ATTEMPTS != "$ATTEMPTS_A" || $PITR_RESULTS != "$RESULTS_A" ]]; then
  echo "PITR mismatch: attempts $PITR_ATTEMPTS (want $ATTEMPTS_A), results $PITR_RESULTS (want $RESULTS_A)" >&2
  exit 1
fi

# The pre-restore instance stays available after an RDS PITR (the restore
# is a new instance); here the crashed source is restarted to play it.
log "attempts affected by the rollback (old instance vs restore)"
as_pg "$PGBIN/pg_ctl" -D "$DRILL_DIR/src" -l "$DRILL_DIR/src.log" -w start > /dev/null
env $(app_env "$SRC_PORT") pnpm --silent --filter @atlas/api exec tsx src/ops/attempts-affected-cli.ts \
  --old-url "$(owner_url "$SRC_PORT")" --restored-url "$(owner_url "$RESTORE_PORT")" \
  | json_only > "$DRILL_DIR/affected.json"
as_pg "$PGBIN/pg_ctl" -D "$DRILL_DIR/src" -w stop > /dev/null
AFFECTED_MISSING=$(node -e "console.log(require('$DRILL_DIR/affected.json').counts.MISSING ?? 0)")
AFFECTED_TOTAL=$(node -e "console.log(require('$DRILL_DIR/affected.json').total)")
if [[ $AFFECTED_MISSING != $((ATTEMPTS_B - ATTEMPTS_A)) || $AFFECTED_TOTAL != "$AFFECTED_MISSING" ]]; then
  echo "affected-attempts report: $AFFECTED_MISSING missing of $AFFECTED_TOTAL (want $((ATTEMPTS_B - ATTEMPTS_A)) missing, nothing else)" >&2
  exit 1
fi

log "golden path against the restored copy"
start_apps "$RESTORE_PORT"
load "$RESTORE_PORT" burst --name dr-drill --kind submit --n "$STUDENTS" \
  --target "http://127.0.0.1:$API_PORT/v1" > "$DRILL_DIR/burst-restored.log" 2>&1
stop_apps
verify golden

log "anonymising the restored copy"
env $(app_env "$SRC_PORT") pnpm --silent --filter @atlas/api exec tsx src/ops/anonymise-copy-cli.ts \
  --database-url "$(owner_url "$RESTORE_PORT")" --confirm-copy "$DB" | json_only > "$DRILL_DIR/anonymise.json"
NAMED_USERS=$(psql_at "$RESTORE_PORT" "$DB" "SELECT count(*) FROM users WHERE first_name <> 'Person'")
NAMED_LOGINS=$(psql_at "$RESTORE_PORT" "$DB" "SELECT count(*) FROM school_memberships WHERE login_identifier NOT LIKE 'user-%'")
if [[ $NAMED_USERS != 0 || $NAMED_LOGINS != 0 ]]; then
  echo "anonymised copy still has $NAMED_USERS named users, $NAMED_LOGINS original sign-in identifiers" >&2
  exit 1
fi
verify anonymised
as_pg "$PGBIN/pg_ctl" -D "$DRILL_DIR/restore" -w stop > /dev/null

log "restore 2: end of archive after the crash"
t=$(now_ms)
restore latest
verify latest
LATEST_RTO_MS=$(($(now_ms) - t))
RESTORED_LAST=$(psql_at "$RESTORE_PORT" drill_pad "SELECT coalesce(max(id), 0) FROM rpo_markers")
LATEST_ATTEMPTS=$(psql_at "$RESTORE_PORT" "$DB" "SELECT count(*) FROM exam_attempts")
LOST=$((LAST_ACKED - RESTORED_LAST))
RPO_MS=0
if ((LOST > 0)); then
  RESTORED_AT=$(psql_at "$RESTORE_PORT" drill_pad "SELECT (extract(epoch FROM at) * 1000)::bigint FROM rpo_markers WHERE id = $RESTORED_LAST")
  RPO_MS=$((LAST_ACKED_AT - ${RESTORED_AT:-LAST_ACKED_AT}))
fi
as_pg "$PGBIN/pg_ctl" -D "$DRILL_DIR/restore" -w stop > /dev/null
if ((LOST < 0)) || [[ $LATEST_ATTEMPTS != "$ATTEMPTS_B" ]]; then
  echo "latest restore mismatch: markers $RESTORED_LAST/$LAST_ACKED, attempts $LATEST_ATTEMPTS/$ATTEMPTS_B" >&2
  exit 1
fi

# --- 7. Report ----------------------------------------------------------------
OUT="$ROOT/docs/performance/results/$STAMP-dr-drill"
PGVER=$("$PGBIN/postgres" --version)
cat > "$OUT.json" << EOF
{
  "scenario": "dr-drill",
  "startedAt": "$STAMP",
  "postgres": "$PGVER",
  "clusterBytes": $CLUSTER_BYTES,
  "encryptedBaseBackupBytes": $BACKUP_BYTES,
  "baseBackupSeconds": $(secs "$BACKUP_MS"),
  "walSegmentsArchived": $WAL_FILES,
  "target": "$TARGET",
  "attempts": { "beforeTarget": $ATTEMPTS_A, "afterWorkloadB": $ATTEMPTS_B, "pitrRestored": $PITR_ATTEMPTS, "latestRestored": $LATEST_ATTEMPTS },
  "pitr": { "rtoSeconds": $(secs "$PITR_RTO_MS"), "finalResults": $PITR_RESULTS },
  "affectedAttempts": { "total": $AFFECTED_TOTAL, "missing": $AFFECTED_MISSING },
  "latest": { "rtoSeconds": $(secs "$LATEST_RTO_MS"), "lastAcknowledgedMarker": $LAST_ACKED, "lastRestoredMarker": $RESTORED_LAST, "markersLost": $LOST, "rpoSeconds": $(secs "$RPO_MS") },
  "verification": { "pitr": $(cat "$DRILL_DIR/verify-pitr.json"), "afterGoldenPath": $(cat "$DRILL_DIR/verify-golden.json"), "anonymised": $(cat "$DRILL_DIR/verify-anonymised.json"), "latest": $(cat "$DRILL_DIR/verify-latest.json") },
  "anonymise": $(cat "$DRILL_DIR/anonymise.json")
}
EOF
cat > "$OUT.md" << EOF
# B22 restore drill — $STAMP

Self-contained drill (\`infra/dr/pitr-drill.sh\`): encrypted (\`age\`) base backup + continuous WAL
archive (\`pg_receivewal --synchronous\`), $PGVER, local disk. **Local verification only** — RDS
backup/PITR is measured on staging in B23.

| | |
| --- | --- |
| Cluster size at backup | $((CLUSTER_BYTES / 1048576)) MB (includes pgbench padding, scale $PAD_SCALE) |
| Encrypted base backup | $((BACKUP_BYTES / 1048576)) MB in $(secs "$BACKUP_MS") s |
| WAL segments archived (encrypted) | $WAL_FILES |
| Target time | $TARGET |
| Attempts before target / after workload B | $ATTEMPTS_A / $ATTEMPTS_B |

## Restore 1 — PITR to the target time

- Attempts restored: **$PITR_ATTEMPTS** (expected $ATTEMPTS_A — workload B absent); FINAL results $PITR_RESULTS.
- \`ops:restore-verify\`: $(grep -q '"ok": true' "$DRILL_DIR/verify-pitr.json" && echo pass || echo FAIL).
- \`ops:attempts-affected\` (old instance vs restore): $AFFECTED_TOTAL attempts, all MISSING — exactly workload B's
  $((ATTEMPTS_B - ATTEMPTS_A)) attempts started after the target.
- Golden path (provisioned school → new exam → $STUDENTS students start, answer, submit → marked)
  through a fresh API and worker against the restored copy: $(grep -q PASS "$DRILL_DIR/burst-restored.log" && echo pass || echo FAIL);
  \`ops:restore-verify\` afterwards: $(grep -q '"ok": true' "$DRILL_DIR/verify-golden.json" && echo pass || echo FAIL).
- \`ops:anonymise-copy\`: named users left $NAMED_USERS, original sign-in identifiers left $NAMED_LOGINS;
  \`ops:restore-verify\` afterwards: $(grep -q '"ok": true' "$DRILL_DIR/verify-anonymised.json" && echo pass || echo FAIL).
- **Time to a verified database (RTO, restore + replay + integrity checks): $(secs "$PITR_RTO_MS") s.**

## Restore 2 — end of archive after a crash

- Markers committed every few ms until \`pg_ctl stop -m immediate\`; last acknowledged #$LAST_ACKED,
  last restored #$RESTORED_LAST — **$LOST lost, RPO $(secs "$RPO_MS") s** with synchronous WAL streaming.
- \`ops:restore-verify\`: $(grep -q '"ok": true' "$DRILL_DIR/verify-latest.json" && echo pass || echo FAIL).
- **RTO: $(secs "$LATEST_RTO_MS") s.**
EOF
log "PASS — report $OUT.md"
