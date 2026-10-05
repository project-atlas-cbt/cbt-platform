#!/usr/bin/env bash
# Switches the maintenance page on or off for every host (docs/operations/vps-pilot.md).
#   bin/maintenance.sh on    web hosts show maintenance/index.html (503); API
#                            hosts answer 503 SERVICE_UNAVAILABLE, retryable
#   bin/maintenance.sh off
#   bin/maintenance.sh       prints the current state
# Caddy checks for the flag file on every request, so no reload is needed.
# Caddy also shows the same page on its own whenever web or API is down.
set -euo pipefail
cd "$(dirname "$0")/.."
flag=maintenance/ON
case "${1:-}" in
  on) date -u +%FT%TZ > "$flag"; echo "maintenance ON" ;;
  off) rm -f "$flag"; echo "maintenance OFF" ;;
  "") [ -f "$flag" ] && echo "maintenance ON since $(cat "$flag")" || echo "maintenance OFF" ;;
  *) echo "usage: $0 [on|off]" >&2; exit 2 ;;
esac
