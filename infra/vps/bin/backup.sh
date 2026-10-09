#!/usr/bin/env bash
# Nightly backup (cron, installed by bin/setup-server.sh). Exam records must
# survive the loss of this server, so copies go off the machine:
#   1. a pg_dump of the whole database (custom format), checked readable;
#   2. the media bucket, mirrored without deleting anything off-site.
# Local dumps are kept 7 days; off-site retention is the bucket's lifecycle
# rule. Restore: docs/operations/vps-pilot.md "Restore".
#
# P0-3: a failure emails the operations alert recipients (ops:send-alert,
# run from the running release's ops image), so a broken backup is noticed
# the next morning rather than at restore time.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
umask 077

step="reading settings"
alert_failure() {
  local code=$?
  [ "$code" -ne 0 ] || return 0
  echo "backup FAILED while $step (exit $code)" >&2
  # Cron has no RELEASE; the last deployed release's ops image is on disk.
  RELEASE=$(tail -n 1 releases.log 2>/dev/null || true)
  [ -n "$RELEASE" ] || { echo "no releases.log; alert not sent" >&2; return 0; }
  export RELEASE
  docker compose --profile ops run --rm --no-deps -T ops \
    pnpm --silent --filter @atlas/api ops:send-alert -- \
    --key backup.failed --title "Nightly backup failed" \
    --summary "The backup on $(hostname) failed while $step (exit $code). See infra/vps/backups/backup.log." \
    || echo "alert email could not be sent" >&2
}
trap alert_failure EXIT

mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump=backups/db-$stamp.dump

step="dumping the database"
docker compose exec -T postgres pg_dump -U atlas -d atlas -Fc > "$dump"
step="checking the dump"
docker compose exec -T postgres pg_restore --list < "$dump" > /dev/null
echo "database dump: $dump ($(du -h "$dump" | cut -f1))"

if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
  # P2-26: the keys reach mc as an MC_HOST_ variable, never as arguments,
  # so `ps` in the container doesn't show them. mc splits that value with a
  # pattern rather than as a URL, so a secret containing / + or @ works
  # as it is (a ":" would not; B2 keys never contain one).
  step="copying off-site"
  docker compose exec -T \
    -e BACKUP_S3_ENDPOINT -e BACKUP_S3_ACCESS_KEY_ID -e BACKUP_S3_SECRET_ACCESS_KEY \
    -e BACKUP_S3_BUCKET -e DUMP="$(basename "$dump")" \
    minio sh -ec '
      export MC_HOST_local="http://atlas-root:${MINIO_ROOT_PASSWORD}@localhost:9000"
      export MC_HOST_offsite="https://${BACKUP_S3_ACCESS_KEY_ID}:${BACKUP_S3_SECRET_ACCESS_KEY}@${BACKUP_S3_ENDPOINT#https://}"
      mc cp --quiet "/backups/$DUMP" "offsite/$BACKUP_S3_BUCKET/db/"
      mc mirror --quiet --overwrite local/atlas-media "offsite/$BACKUP_S3_BUCKET/media"'
  echo "off-site copy: $BACKUP_S3_BUCKET"
else
  echo "WARNING: BACKUP_S3_ENDPOINT is empty; backups are on this server only" >&2
fi

step="removing old local dumps"
find backups -name 'db-*.dump' -mtime +7 -delete
