#!/usr/bin/env bash
# Daily stale-backup check (cron, 03:30 UTC, two hours after the nightly
# backup). backup.sh alerts when a backup it started fails; this covers a
# backup that never started or never finished: cron removed, the job killed,
# or a backups/ folder the atlas user cannot write (root-owned), where the
# cron redirect fails before backup.sh runs. It emails the same operations
# alert recipients through ops:send-alert. Exits 1 when it alerts.
set -euo pipefail
cd "$(dirname "$0")/.."

max_age_minutes=${BACKUP_MAX_AGE_MINUTES:-1560}   # 26 hours

problem=""
if [ ! -d backups ]; then
  problem="the backups/ folder is missing"
elif [ ! -w backups ]; then
  problem="the backups/ folder is not writable by $(id -un) (a root-owned folder? fix: chown -R atlas:atlas backups, as root)"
elif [ -z "$(find backups -name 'db-*.dump' -mmin "-$max_age_minutes" -print -quit)" ]; then
  problem="no database dump newer than $((max_age_minutes / 60)) hours is in backups/ (the nightly job did not run or did not finish)"
fi

if [ -z "$problem" ]; then
  echo "backup check ok: $(date -u +%FT%TZ)"
  exit 0
fi

echo "backup check FAILED: $problem" >&2
RELEASE=$(tail -n 1 releases.log 2>/dev/null || true)
[ -n "$RELEASE" ] || { echo "no releases.log; alert not sent" >&2; exit 1; }
export RELEASE
docker compose --profile ops run --rm --no-deps -T ops \
  pnpm --silent --filter @atlas/api ops:send-alert -- \
  --key backup.stale --title "Nightly backup missing" \
  --summary "On $(hostname): $problem." \
  || echo "alert email could not be sent" >&2
exit 1
