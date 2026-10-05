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

echo "== building $RELEASE"
docker compose build web api ops

echo "== data services"
docker compose up -d --wait postgres redis minio

echo "== object storage bucket and app user"
policy=$(mktemp)
cat > "$policy" <<JSON
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":["s3:GetBucketLocation","s3:ListBucket","s3:ListBucketVersions","s3:GetBucketVersioning"],"Resource":["arn:aws:s3:::atlas-media"]},
 {"Effect":"Allow","Action":["s3:GetObject","s3:GetObjectVersion","s3:PutObject","s3:DeleteObject","s3:DeleteObjectVersion"],"Resource":["arn:aws:s3:::atlas-media/*"]}]}
JSON
docker compose cp "$policy" minio:/tmp/atlas-app-policy.json
rm -f "$policy"
docker compose exec -T -e MC_HOST_local="http://atlas-root:${MINIO_ROOT_PASSWORD}@localhost:9000" minio sh -c '
  mc mb --ignore-existing local/atlas-media >/dev/null &&
  mc version enable local/atlas-media >/dev/null &&
  mc admin policy create local atlas-app /tmp/atlas-app-policy.json >/dev/null &&
  mc admin user add local atlas-app "$0" >/dev/null &&
  mc admin policy attach local atlas-app --user atlas-app >/dev/null 2>&1 || true' "$MINIO_APP_PASSWORD"

echo "== migrations"
docker compose --profile ops run --rm ops

echo "== application"
docker compose up -d --wait --remove-orphans caddy web api worker

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
echo "$RELEASE" >> releases.log
echo "deployed $RELEASE"
