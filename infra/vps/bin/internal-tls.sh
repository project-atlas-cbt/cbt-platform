#!/usr/bin/env bash
# Creates a private CA and server certificates for PostgreSQL and Redis on
# the Compose network. Production configuration requires TLS to both (B20,
# packages/config env.schema.ts); the apps trust this CA through
# NODE_EXTRA_CA_CERTS and verify the hostnames `postgres` and `redis`.
# Idempotent: existing certificates are kept. Run from infra/vps.
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
mkdir -p certs
if [ ! -f certs/ca.key ]; then
  openssl req -x509 -newkey rsa:3072 -nodes -days 3650 -subj "/CN=Atlas internal CA" \
    -keyout certs/ca.key -out certs/ca.crt 2>/dev/null
fi
chmod 644 certs/ca.crt

issue() { # name uid gid
  local name=$1 uid=$2 gid=$3 dir=certs/$1
  mkdir -p "$dir"
  if [ ! -f "$dir/server.crt" ]; then
    openssl req -newkey rsa:2048 -nodes -subj "/CN=$name" \
      -keyout "$dir/server.key" -out "$dir/server.csr" 2>/dev/null
    printf 'subjectAltName=DNS:%s\nextendedKeyUsage=serverAuth\n' "$name" > "$dir/ext.cnf"
    openssl x509 -req -in "$dir/server.csr" -CA certs/ca.crt -CAkey certs/ca.key \
      -CAcreateserial -days 3650 -extfile "$dir/ext.cnf" -out "$dir/server.crt" 2>/dev/null
    rm -f "$dir/server.csr" "$dir/ext.cnf"
  fi
  cp certs/ca.crt "$dir/ca.crt"
  # The key is readable only by the service's own user inside its image.
  chown -R "$uid:$gid" "$dir"
  chmod 750 "$dir"
  chmod 600 "$dir/server.key"
  chmod 644 "$dir/server.crt" "$dir/ca.crt"
}
issue postgres 70 70    # postgres:18-alpine
issue redis 999 1000    # redis:8-alpine
echo "internal TLS ready in infra/vps/certs"
