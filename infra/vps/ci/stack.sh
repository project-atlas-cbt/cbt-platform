#!/usr/bin/env bash
# The CI stack (F21, owner decision 2026-10-04): the pilot's own Compose
# stack, built from this commit with production configuration, on a CI
# runner. It replaces per-PR preview deployments and staging while the
# pilot runs on one VPS (docs/operations/vps-pilot.md, "CI stack").
#
#   sudo -E infra/vps/ci/stack.sh up       configure, then bin/deploy.sh
#                                           (build, migrate, start, smoke)
#   sudo -E infra/vps/ci/stack.sh golden   golden path (09 §39) via Caddy
#   sudo -E infra/vps/ci/stack.sh logs     recent logs of every service
#   sudo -E infra/vps/ci/stack.sh down     stop and delete everything
#
# Root domain atlas.test; certificates from the internal CA (trust
# infra/vps/certs/ca.crt to browse it). Never point this at a real server:
# `up` writes test settings and the golden path writes test data.
set -euo pipefail
cd "$(dirname "$0")/.."
export COMPOSE_FILE=compose.yml:ci/compose.ci.yml
ROOT=atlas.test

setting() { # file key value — replace or append KEY=value
  if grep -q "^$2=" "$1"; then sed -i "s|^$2=.*|$2=$3|" "$1"; else echo "$2=$3" >> "$1"; fi
}

up() {
  [ ! -f .env ] || [ "$(. ./.env; echo "${ROOT_DOMAIN:-}")" = "$ROOT" ] ||
    { echo "infra/vps/.env is for another domain; refusing to touch it" >&2; exit 1; }
  bin/init-env.sh "$ROOT" "${PRODUCT_NAME:-Project Atlas}"
  setting .env CADDY_LOCAL_CA 1
  setting .env CADDY_LOCAL_CA_ROOT /ci-ca
  setting .env SCHOOLS ''
  setting app.env OPS_ALERT_EMAILS "ops@$ROOT"
  setting app.env SMTP_HOST mailpit
  setting app.env SMTP_PORT 587
  setting app.env SMTP_USER ci
  setting app.env SMTP_PASSWORD ci
  setting app.env SMTP_FROM_ADDRESS "noreply@$ROOT"

  bin/internal-tls.sh
  if [ ! -f certs/mailpit/server.crt ]; then
    mkdir -p certs/mailpit
    openssl req -newkey rsa:2048 -nodes -subj /CN=mailpit \
      -keyout certs/mailpit/server.key -out certs/mailpit/server.csr 2>/dev/null
    printf 'subjectAltName=DNS:mailpit\nextendedKeyUsage=serverAuth\n' > certs/mailpit/ext.cnf
    openssl x509 -req -in certs/mailpit/server.csr -CA certs/ca.crt -CAkey certs/ca.key \
      -CAcreateserial -days 30 -extfile certs/mailpit/ext.cnf -out certs/mailpit/server.crt 2>/dev/null
    rm -f certs/mailpit/server.csr certs/mailpit/ext.cnf
    chmod 755 certs/mailpit
    chmod 644 certs/mailpit/server.key certs/mailpit/server.crt
  fi
  docker compose up -d mailpit
  bin/deploy.sh
}

golden() {
  docker compose --profile ops run --rm --no-deps \
    -e ATLAS_ENVIRONMENT=staging -e GOLDEN_API=https://caddy/v1 \
    -e GOLDEN_SCHOOL_HOST='{school}.api.{root}' -e GOLDEN_PLATFORM_HOST='admin.api.{root}' \
    ops pnpm --filter @atlas/load golden-path
}

case "${1:-}" in
  up) up ;;
  golden) golden ;;
  logs) docker compose --profile ops logs --tail 200 --no-color ;;
  down)
    docker compose --profile ops down -v --remove-orphans
    rm -rf .env app.env Caddyfile certs releases.log
    ;;
  *) echo "usage: $0 up|golden|logs|down" >&2; exit 2 ;;
esac
