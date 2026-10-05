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
root_re=${ROOT_DOMAIN//./\\.}

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

# F21 (DoD 4): bin/maintenance.sh creates maintenance/ON; Caddy checks for it
# on every request. The same responses cover web or API being down.
(maintenance_page) {
	root * /srv/maintenance
	rewrite * /index.html
	header {
		Cache-Control "no-store"
		Retry-After "120"
		Content-Security-Policy "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"
		X-Content-Type-Options "nosniff"
	}
	file_server {
		status 503
	}
}

# The canonical error envelope (ADR-0033), retryable, so the exam client
# keeps answers queued and retries. CORS only for the platform's own https
# hosts, so the browser lets the client read it instead of seeing a network
# error.
(api_unavailable) {
	@platform_origin header_regexp Origin ^https://([a-z0-9-]+\.)?$root_re\$
	header @platform_origin {
		Access-Control-Allow-Origin "{http.request.header.Origin}"
		Access-Control-Allow-Credentials "true"
		Vary "Origin"
	}
	header {
		Cache-Control "no-store"
		Retry-After "30"
		Content-Type "application/json"
	}
	respond \`{"error":{"code":"SERVICE_UNAVAILABLE","message":"The service is briefly unavailable. Please try again shortly.","retryable":true,"correlationId":"{http.request.uuid}"}}\` 503
}

(maintenance_flag) {
	@maintenance file {
		root /srv/maintenance
		try_files /ON
	}
}

$web_hosts {
	import common
	import maintenance_flag
	handle @maintenance {
		import maintenance_page
	}
	handle {
		reverse_proxy web:3000
	}
	handle_errors 502 503 504 {
		import maintenance_page
	}
}

$api_hosts {
	import common
	import maintenance_flag
	handle @maintenance {
		import api_unavailable
	}
	handle {
		# SSE (Exam Control Center) streams are flushed as they arrive.
		reverse_proxy api:3001 {
			flush_interval -1
		}
	}
	handle_errors 502 503 504 {
		import api_unavailable
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
