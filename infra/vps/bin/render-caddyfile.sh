#!/usr/bin/env bash
# Writes infra/vps/Caddyfile from .env: one site per host, each with its own
# Let's Encrypt certificate (HTTP-01, so no DNS API access is needed).
# A school is added by appending its label to SCHOOLS and redeploying.
#   CADDY_LOCAL_CA=1 issues certificates from Caddy's own CA instead (testing).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${ROOT_DOMAIN:?ROOT_DOMAIN is not set in .env}"

web_hosts="$ROOT_DOMAIN, www.$ROOT_DOMAIN, admin.$ROOT_DOMAIN"
api_hosts="api.$ROOT_DOMAIN, admin.api.$ROOT_DOMAIN"
for school in ${SCHOOLS//,/ }; do
  if ! [[ $school =~ ^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$ ]]; then
    echo "invalid school label in SCHOOLS: $school" >&2; exit 1
  fi
  case $school in api|admin|www|media) echo "reserved label in SCHOOLS: $school" >&2; exit 1;; esac
  web_hosts="$web_hosts, $school.$ROOT_DOMAIN"
  api_hosts="$api_hosts, $school.api.$ROOT_DOMAIN"
done

{
  echo '{'
  [ -n "${ACME_EMAIL:-}" ] && echo "  email $ACME_EMAIL"
  [ "${CADDY_LOCAL_CA:-}" = 1 ] && echo '  local_certs'
  echo '}'
  cat <<CADDY

(common) {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		-Server
	}
	log {
		output stdout
		format json
	}
}

$web_hosts {
	import common
	reverse_proxy web:3000
}

$api_hosts {
	import common
	# SSE (Exam Control Center) streams are flushed as they arrive.
	reverse_proxy api:3001 {
		flush_interval -1
	}
}

media.$ROOT_DOMAIN {
	import common
	request_body {
		max_size 100MB
	}
	reverse_proxy minio:9000
}
CADDY
} > Caddyfile
echo "Caddyfile written for: $web_hosts | $api_hosts | media.$ROOT_DOMAIN"
