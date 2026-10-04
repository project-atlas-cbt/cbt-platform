#!/usr/bin/env sh
# B23 DoD 4/5: (re)start one API and one worker from the given checkouts
# against the already-migrated database, then wait for readiness.
#   scripts/ci/run-fleet.sh <api checkout> <worker checkout> <label>
set -eu
api_root=$1
worker_root=$2
label=$3

pkill -f "[d]ist/main.js" || true
for _ in $(seq 1 30); do pgrep -f "[d]ist/main.js" >/dev/null || break; sleep 1; done

(cd "$api_root/apps/api" && nohup node dist/main.js > "/tmp/api-$label.log" 2>&1 &)
(cd "$worker_root/apps/worker" && nohup node dist/main.js > "/tmp/worker-$label.log" 2>&1 &)
for _ in $(seq 1 60); do
  curl -fsS http://127.0.0.1:3001/v1/health/ready >/dev/null 2>&1 && break || sleep 1
done
curl -fsS http://127.0.0.1:3001/v1/health/ready
echo
echo "fleet $label: api from $api_root, worker from $worker_root"
