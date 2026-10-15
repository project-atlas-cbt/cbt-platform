#!/usr/bin/env bash
# Writes infra/vps/Caddyfile from .env: one site per host, each with its own
# Let's Encrypt certificate (HTTP-01, so no DNS API access is needed).
#   CLOUDFLARE_API_TOKEN set (ADR-0032 amendment, 2026-10-15): every school
#     host is served from two wildcard certificates, *.<root> and
#     *.api.<root>, obtained through a DNS record in Cloudflare (DNS-01). A
#     school created in the Software Admin console works at once: no SCHOOLS
#     edit, redeploy or per-school certificate. The platform hosts and any
#     schools left in SCHOOLS keep their own HTTP-01 certificates, so they
#     never depend on the token; SCHOOLS is then optional.
#   Otherwise a school is added by appending its label to SCHOOLS and
#     redeploying.
#   CADDY_ON_DEMAND=1 (off by default) adds *.<root> and *.api.<root> sites
#     with on-demand TLS, so a school created in the Software Admin console
#     needs no redeploy; Caddy asks the API that the school exists first.
#     Turned off after the first pilot deploys with it left every host
#     without a certificate (2026-10-08); not to be enabled until that is
#     understood on a test server.
#   CADDY_LOCAL_CA=1 issues certificates from Caddy's own CA instead (testing),
#     and adds wildcard sites so schools created during a test need no
#     redeploy. CADDY_LOCAL_CA_ROOT=<dir inside the caddy container> makes
#     that CA's root the one in <dir>/ca.crt and ca.key (the CI stack uses
#     the internal CA, which every service already trusts).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
: "${ROOT_DOMAIN:?ROOT_DOMAIN is not set in .env}"

web_hosts="admin.$ROOT_DOMAIN"
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
if [ -n "${CLOUDFLARE_API_TOKEN:-}" ] && [ "${CADDY_LOCAL_CA:-}" != 1 ]; then
  # Exact hosts above (platform hosts and any schools still in SCHOOLS) keep
  # their own certificates and take precedence, so a DNS or token problem
  # can only affect schools that are not listed.
  # The token is read from Caddy's environment, never written to the file.
  on_demand_sites="
*.$ROOT_DOMAIN {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
		resolvers 1.1.1.1 1.0.0.1
	}
	import web_site
}

*.api.$ROOT_DOMAIN {
	tls {
		dns cloudflare {env.CLOUDFLARE_API_TOKEN}
		resolvers 1.1.1.1 1.0.0.1
	}
	import api_site
}
"
  wildcard_dns=1
elif [ "${CADDY_LOCAL_CA:-}" = 1 ]; then
  web_hosts="$web_hosts, *.$ROOT_DOMAIN"
  api_hosts="$api_hosts, *.api.$ROOT_DOMAIN"
  on_demand_sites=""
elif [ "${CADDY_ON_DEMAND:-}" != 1 ]; then
  on_demand_sites=""
else
  # Exact hosts above take precedence over these wildcards.
  on_demand_sites="
*.$ROOT_DOMAIN {
	tls {
		on_demand
	}
	import web_site
}

*.api.$ROOT_DOMAIN {
	tls {
		on_demand
	}
	import api_site
}
"
fi

{
  echo '{'
  [ -n "${ACME_EMAIL:-}" ] && echo "  email $ACME_EMAIL"
  [ "${CADDY_LOCAL_CA:-}" = 1 ] && echo '  local_certs'
  if [ "${CADDY_LOCAL_CA:-}" = 1 ] && [ -n "${CADDY_LOCAL_CA_ROOT:-}" ]; then
    printf '  pki {\n    ca local {\n      root {\n        cert %s/ca.crt\n        key %s/ca.key\n      }\n    }\n  }\n' \
      "$CADDY_LOCAL_CA_ROOT" "$CADDY_LOCAL_CA_ROOT"
  fi
  if [ -n "$on_demand_sites" ] && [ -z "${wildcard_dns:-}" ]; then
    # Caddy asks the API before requesting a certificate for an unlisted host,
    # so nobody can make it request certificates for invented names.
    printf '  on_demand_tls {\n    ask http://api:3001/v1/health/tls-ask\n  }\n'
  fi
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

(web_site) {
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

(api_site) {
	import common
	import maintenance_flag
	handle @maintenance {
		import api_unavailable
	}
	# Caddy's own certificate check, never the public's.
	handle /v1/health/tls-ask {
		respond 404
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

$web_hosts {
	import web_site
}

$api_hosts {
	import api_site
}
$on_demand_sites
# The public marketing site (ADR-0034) on the root domain; www redirects to
# it. Not behind the maintenance flag: platform maintenance leaves it up.
$ROOT_DOMAIN {
	import common
	handle {
		reverse_proxy marketing:3100
	}
	handle_errors 502 503 504 {
		import maintenance_page
	}
}

www.$ROOT_DOMAIN {
	import common
	redir https://$ROOT_DOMAIN{uri} permanent
}

# Uploaded files are never pages: the API forces each signed link's type,
# and these headers stop any object the browser does open as a document from
# running script on this host, which shares the schools' site (P0-1).
media.$ROOT_DOMAIN {
	import common
	header {
		Content-Security-Policy "sandbox"
		X-Content-Type-Options "nosniff"
	}
	request_body {
		max_size 100MB
	}
	reverse_proxy minio:9000
}
CADDY
} > Caddyfile
if [ -n "${wildcard_dns:-}" ]; then
  school_hosts=" | every school host from *.$ROOT_DOMAIN and *.api.$ROOT_DOMAIN (Cloudflare DNS)"
else
  school_hosts=${on_demand_sites:+ | other school hosts on demand}
fi
echo "Caddyfile written for: $ROOT_DOMAIN, www.$ROOT_DOMAIN (marketing) | $web_hosts | $api_hosts | media.$ROOT_DOMAIN$school_hosts"
