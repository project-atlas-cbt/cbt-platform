#!/usr/bin/env bash
# B21 (R-08, R-09): start a shaped relay in front of the local API and object
# storage. Usage:  tools/load/netem/run.sh <ng-typical|ng-congested|stop> [apiPorts]
# Then point the harness at the relay:  --target http://127.0.0.1:13001/v1 --media-host 127.0.0.1:19000
# netem shapes the container's egress — i.e. both directions of every
# request (responses toward the students, requests toward the API) — so the
# configured delay is added once each way.
set -euo pipefail
PROFILE="${1:?profile}"
API_PORTS="${2:-3001}"
NAME=atlas-netem
docker rm -f "$NAME" >/dev/null 2>&1 || true
[ "$PROFILE" = stop ] && exit 0
case "$PROFILE" in
  ng-typical)   NETEM="delay 75ms 20ms distribution normal loss 0.5%" ;;   # ≈150 ms RTT ±40, ~1 % round-trip loss
  ng-congested) NETEM="delay 150ms 50ms distribution normal loss 1.5% rate 2mbit" ;; # ≈300 ms RTT ±100, ~3 % loss, 2 Mbit shared
  *) echo "unknown profile $PROFILE"; exit 2 ;;
esac
ROUTES=""; PUBLISH=""
for p in $API_PORTS; do ROUTES="$ROUTES,1$p:host.docker.internal:$p"; PUBLISH="$PUBLISH -p 1$p:1$p"; done
ROUTES="${ROUTES#,},19000:host.docker.internal:9000"; PUBLISH="$PUBLISH -p 19000:19000"
DIR="$(cd "$(dirname "$0")" && pwd -W 2>/dev/null || pwd)"
# shellcheck disable=SC2086
docker run -d --name "$NAME" --cap-add NET_ADMIN $PUBLISH -e ROUTES="$ROUTES" \
  -v "$DIR/proxy.mjs:/proxy.mjs:ro" node:24-alpine \
  sh -c "apk add --no-cache iproute2 >/dev/null && tc qdisc add dev eth0 root netem $NETEM && tc qdisc show dev eth0 && node /proxy.mjs" >/dev/null
sleep 5
docker logs "$NAME"
