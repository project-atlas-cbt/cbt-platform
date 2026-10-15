#!/usr/bin/env bash
# Deploys the checked-out commit on this server (docs/operations/vps-pilot.md).
#   bin/deploy.sh            build and deploy HEAD
#   bin/deploy.sh <git-ref>  check out <ref> first (e.g. a tag, or the
#                            previous release to roll back)
# Order matters: data services first, then migrations (expand-only, so the
# running release keeps working), then the new api/worker/web.
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -n "${1:-}" ]; then
  git fetch --tags origin
  git checkout --detach "$1"
fi
export RELEASE
RELEASE=$(git rev-parse --short=12 HEAD)
[ -f .env ] && [ -f app.env ] || { echo "run bin/init-env.sh first" >&2; exit 1; }
set -a; . ./.env; set +a

if [ "$(id -u)" = 0 ]; then bin/internal-tls.sh; else sudo "$PWD/bin/internal-tls.sh"; fi
bin/render-caddyfile.sh

# A build needs several GB; running out mid-build fails the deploy, and a
# full disk also endangers the database (2026-10-08). Stop early instead.
# DEPLOY_MIN_FREE_GB=0 skips it (the CI stack, whose runner disk is small).
free_gb=$(df -P --block-size=1G . | awk 'NR==2 {print $4}')
if [ "$free_gb" -lt "${DEPLOY_MIN_FREE_GB:-10}" ]; then
  echo "only ${free_gb} GB free; free space first (vps-pilot.md, \"Disk space\")" >&2
  exit 1
fi

echo "== building $RELEASE"
docker compose build caddy marketing web api ops

echo "== data services"
# Create backups/ as this user before compose bind-mounts it; otherwise Docker
# creates it owned by root and the nightly backup (run as atlas) cannot write.
mkdir -p backups
[ "$(id -u)" != 0 ] || chown "$(stat -c %U:%G .)" backups
[ -w backups ] || { echo "backups/ is not writable by $(id -un); chown it (vps-pilot.md)" >&2; exit 1; }
docker compose up -d --wait postgres redis minio

echo "== object storage bucket and app user"
# The app user may write and delete current objects but never object
# versions (P2-26): an overwritten or deleted file stays recoverable until
# the lifecycle rule below expires it after 35 days, matching the AWS
# design (docs/operations/backup-and-restore.md).
policy=$(mktemp)
cat > "$policy" <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket","s3:ListBucketVersions","s3:GetBucketVersioning"],"Resource":["arn:aws:s3:::atlas-media"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:GetObjectVersion","s3:PutObject","s3:DeleteObject"],"Resource":["arn:aws:s3:::atlas-media/*"]}]}
JSON
lifecycle=$(mktemp)
cat > "$lifecycle" <<JSON
{"Rules":[{"ID":"object-noncurrent-versions","Status":"Enabled","Filter":{"Prefix":""},"NoncurrentVersionExpiration":{"NoncurrentDays":35}}]}
JSON
docker compose cp "$policy" minio:/tmp/atlas-app-policy.json
docker compose cp "$lifecycle" minio:/tmp/atlas-media-lifecycle.json
rm -f "$policy" "$lifecycle"
# Every step must succeed (P3-11: a trailing `|| true` used to hide any
# failure). Only re-attaching an already attached policy is tolerated. The
# passwords come from the container's own environment, not this command line.
if ! docker compose exec -T -e MINIO_APP_PASSWORD minio sh -ec '
  export MC_HOST_local="http://atlas-root:${MINIO_ROOT_PASSWORD}@localhost:9000"
  mc mb --ignore-existing local/atlas-media >/dev/null
  mc version enable local/atlas-media >/dev/null
  mc ilm import local/atlas-media < /tmp/atlas-media-lifecycle.json >/dev/null
  mc admin policy create local atlas-app /tmp/atlas-app-policy.json >/dev/null
  mc admin user add local atlas-app "$MINIO_APP_PASSWORD" >/dev/null
  if ! out=$(mc admin policy attach local atlas-app --user atlas-app 2>&1); then
    case $out in *already*) ;; *) echo "$out" >&2; exit 1 ;; esac
  fi'; then
  echo "object storage setup failed; nothing was changed in the running release" >&2
  exit 1
fi

echo "== migrations"
docker compose --profile ops run --rm ops

echo "== application"
if ! docker compose up -d --wait --wait-timeout 180 --remove-orphans caddy marketing web api worker; then
  docker compose ps -a
  docker compose logs --tail 80 api worker web marketing
  echo "application did not become healthy for $RELEASE. Roll back with: bin/deploy.sh $(tail -n 1 releases.log 2>/dev/null || echo '<previous ref>')" >&2
  exit 1
fi

# Caddy reads its Caddyfile only at start, and the file is a bind mount, so
# `up` leaves a running Caddy untouched when only SCHOOLS changed. Reload it
# so a new school's hosts are served (and their certificates requested).
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile

echo "== smoke"
ready=""
for _ in $(seq 1 30); do
  ready=$(docker compose exec -T caddy wget -qO- http://api:3001/v1/health/ready 2>/dev/null) && break
  sleep 2
done
echo "api readiness: ${ready:-unreachable}"
case $ready in
  *degraded*|"") docker compose logs --tail 80 api; exit 1 ;;
esac

# F21 (DoD 10): the read-only smoke through Caddy with each real host name
# (TLS certificates, every critical web page, the API's tenancy, auth and
# CORS). It connects to Caddy inside the network, so it does not depend on
# the server reaching its own public address; public DNS is the external
# uptime check's job. It writes nothing, so it is safe here; the golden
# path never runs against this database.
echo "== post-deploy smoke"
# P2-25: every listed school is checked; each must already exist (create it
# in the Software Admin console before adding it to SCHOOLS). With wildcard
# certificates (CLOUDFLARE_API_TOKEN) SCHOOLS only chooses what the smoke
# checks, and any school host is expected to have a certificate.
if ! docker compose --profile ops run --rm --no-deps \
  -e SMOKE_ROOT="$ROOT_DOMAIN" -e SMOKE_SCHOOLS="${SCHOOLS:-}" -e SMOKE_WEB=true -e SMOKE_MARKETING=true \
  -e SMOKE_ANY_SCHOOL_HOST="$([ "${CADDY_LOCAL_CA:-}" = 1 ] || [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && echo true || echo false)" \
  -e SMOKE_API=https://caddy/v1 -e SMOKE_WEB_URL=https://caddy \
  ops pnpm --filter @atlas/load smoke; then
  echo "smoke FAILED for $RELEASE; it is running. Roll back with: bin/deploy.sh $(tail -n 1 releases.log 2>/dev/null || echo '<previous ref>')" >&2
  exit 1
fi
previous=$(tail -n 1 releases.log 2>/dev/null || true)
echo "$RELEASE" >> releases.log

# Each release leaves about 8 GB of images; without this the disk filled
# (2026-10-08). Keep this release's and the previous one's, drop the rest,
# and drop build cache older than a week. Docker refuses to remove an image
# a container still uses, so this cannot touch anything running.
echo "== removing old release images"
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E '^atlas-(server|web|marketing|ops):' \
  | grep -v -e ":$RELEASE\$" ${previous:+-e ":$previous\$"} \
  | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null
docker builder prune -f --filter until=168h >/dev/null || true
df -h . | awk 'NR==2 {print "disk: " $4 " free"}'
echo "deployed $RELEASE"
