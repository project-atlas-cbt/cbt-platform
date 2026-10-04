#!/usr/bin/env bash
# Nightly backup (cron, installed by bin/setup-server.sh). Exam records must
# survive the loss of this server, so copies go off the machine:
#   1. a pg_dump of the whole database (custom format), checked readable;
#   2. the media bucket, mirrored without deleting anything off-site.
# Local dumps are kept 7 days; off-site retention is the bucket's lifecycle
# rule. Restore: docs/operations/vps-pilot.md "Restore".
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
umask 077
mkdir -p backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
dump=backups/db-$stamp.dump

docker compose exec -T postgres pg_dump -U atlas -d atlas -Fc > "$dump"
docker compose exec -T postgres pg_restore --list < "$dump" > /dev/null
echo "database dump: $dump ($(du -h "$dump" | cut -f1))"

if [ -n "${BACKUP_S3_ENDPOINT:-}" ]; then
  docker compose exec -T \
    -e MC_HOST_local="http://atlas-root:${MINIO_ROOT_PASSWORD}@localhost:9000" \
    -e MC_HOST_offsite="https://${BACKUP_S3_ACCESS_KEY_ID}:${BACKUP_S3_SECRET_ACCESS_KEY}@${BACKUP_S3_ENDPOINT#https://}" \
    minio sh -c "mc cp --quiet /backups/$(basename "$dump") offsite/$BACKUP_S3_BUCKET/db/ &&
                 mc mirror --quiet --overwrite local/atlas-media offsite/$BACKUP_S3_BUCKET/media"
  echo "off-site copy: $BACKUP_S3_BUCKET"
else
  echo "WARNING: BACKUP_S3_ENDPOINT is empty; backups are on this server only" >&2
fi

find backups -name 'db-*.dump' -mtime +7 -delete
