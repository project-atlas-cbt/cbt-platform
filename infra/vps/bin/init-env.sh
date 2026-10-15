#!/usr/bin/env bash
# Creates .env and app.env with fresh random secrets, once. Never overwrites
# an existing file (rotating a database password needs a migration step,
# not a new random value). Run from infra/vps:
#   bin/init-env.sh <root-domain> "<product name>"
set -euo pipefail
cd "$(dirname "$0")/.."
umask 077
root=${1:?usage: bin/init-env.sh <root-domain> "<product name>"}
product=${2:?usage: bin/init-env.sh <root-domain> "<product name>"}
secret() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-48; }

if [ ! -f .env ]; then
  cat > .env <<ENV
# Compose settings (infra/vps/compose.yml). Never commit this file.
ROOT_DOMAIN=$root
PRODUCT_NAME="$product"
# Hosts that get a certificate, besides admin/api/media: one label per school.
# Optional once CLOUDFLARE_API_TOKEN is set (wildcard certificates).
SCHOOLS=
# Cloudflare token (Zone Read + DNS Edit, this zone only) for the wildcard
# school certificates; vps-pilot.md "Wildcard certificates".
CLOUDFLARE_API_TOKEN=
# Email for Let's Encrypt expiry notices.
ACME_EMAIL=
SENTRY_DSN=
# Support contacts on staff Help screens (ADR-0035). Empty = not shown.
SUPPORT_EMAIL=
SUPPORT_WHATSAPP=
POSTGRES_PASSWORD=$(secret)
DATABASE_APP_PASSWORD=$(secret)
DATABASE_AUDIT_READER_PASSWORD=$(secret)
REDIS_PASSWORD=$(secret)
MINIO_ROOT_PASSWORD=$(secret)
MINIO_APP_PASSWORD=$(secret)
# Demo-request emails from the marketing site (zeptomail, resend or brevo; see
# apps/marketing/README.md). Empty = the form shows an error instead.
MARKETING_LEAD_EMAIL_PROVIDER=
MARKETING_LEAD_EMAIL_API_KEY=
MARKETING_LEAD_EMAIL_TO=
MARKETING_LEAD_EMAIL_FROM=
# Lets the marketing site send visit counts and saved forms to the API
# (Software Admin > Website). Empty turns that off.
MARKETING_INGEST_KEY=$(secret)
# Off-site backups (S3-compatible, e.g. Backblaze B2). Empty = local only.
BACKUP_S3_ENDPOINT=
BACKUP_S3_BUCKET=
BACKUP_S3_ACCESS_KEY_ID=
BACKUP_S3_SECRET_ACCESS_KEY=
ENV
  echo "created .env"
fi

if [ ! -f app.env ]; then
  cat > app.env <<ENV
# Application settings for api, worker and ops. Never commit this file.
PRODUCT_NAME="$product"
SESSION_COOKIE_SECRET=$(secret)
CSRF_SECRET=$(secret)
MFA_ENCRYPTION_KEY=$(secret)
MEDIA_PRECACHE_SECRET=$(secret)
DEFAULT_SCHOOL_TIMEZONE=Africa/Lagos
OPS_ALERT_EMAILS=
NOTIFICATION_TRANSPORT=smtp
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_ADDRESS=
ENV
  echo "created app.env (fill in OPS_ALERT_EMAILS and the SMTP_* values)"
fi
