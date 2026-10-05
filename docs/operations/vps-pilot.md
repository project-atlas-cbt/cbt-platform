# Single-server pilot (VPS)

**Status:** B23 (2026-10-04). The project owner chose one VPS for the pilot instead of the AWS
design, for cost (ADR-0032 amendment, same date). The AWS code in `infra/cdk` and its runbooks
([infrastructure.md](infrastructure.md), [deploy-and-rollback.md](deploy-and-rollback.md)) stay
in the repository for when the platform outgrows one server. This document is the runbook for
the server.

## What runs where

Everything is on one machine, in Docker Compose (`infra/vps/compose.yml`). Only Caddy publishes
ports (80, 443).

| Host                             | Service                        |
| -------------------------------- | ------------------------------ |
| `<root>`                         | marketing site (ADR-0034)      |
| `www.<root>`                     | redirect to `<root>`           |
| `admin.<root>`                   | web (`next start`)             |
| `<school>.<root>`                | web, for each school           |
| `api.<root>`, `admin.api.<root>` | API                            |
| `<school>.api.<root>`            | API, resolving that school     |
| `media.<root>`                   | MinIO (S3 API), presigned only |
| (no host)                        | worker, PostgreSQL 18, Redis 8 |

The tenant still comes from the host name (ADR-0005), the API keeps its own hosts (ADR-0022
amendment), and cookies are same-site under `<root>`. The web app calls `<school>.api.<root>`
because it is built with an empty `NEXT_PUBLIC_API_PORT` (`apps/web/lib/api/resolve-origin.ts`).
`media` is a reserved label, so no school can take it (`apps/api/src/common/subdomain.ts`).

What the AWS design guarantees and this one does not, accepted for the pilot:

- **No failover.** A dead disk or host means restoring from the last nightly backup onto a new
  server. Recovery point: up to 24 hours; recovery time: about an hour with the steps below.
- **No managed point-in-time restore.** Nightly `pg_dump` only.
- **Capacity is one machine.** Size for the pilot school; re-measure before adding schools.

What stays the same:

- PostgreSQL and Redis are reached over **TLS**, verified against a private CA
  (`infra/vps/bin/internal-tls.sh`), because production configuration refuses plaintext (B20).
- API and worker connect as `atlas_app` (RLS-bound). The schema owner password is given only to
  the `ops` service, which runs migrations and operator CLIs.
- Migrations stay expand-only (`pnpm lint:migrations`), so a rollback to the previous release
  works against the migrated database.
- Email goes through SMTP (`NOTIFICATION_TRANSPORT=smtp`, ADR-0019 amendment), with STARTTLS or
  implicit TLS required.

## Server

- **Size:** 4 vCPU, 8–12 GB RAM, 80 GB+ NVMe. Building the web image needs the memory.
- **OS:** Ubuntu 24.04 LTS.
- **Off-site backup storage:** any S3-compatible bucket in another provider (for example
  Backblaze B2), with a lifecycle rule keeping 30 days of `db/` objects.

## First-time setup

1. **Prepare the server** (as root, once):

   ```sh
   bash setup-server.sh "<the deploy SSH public key>"
   ```

   `infra/vps/bin/setup-server.sh` installs Docker, allows only SSH, HTTP and HTTPS through the
   firewall, turns on unattended security updates, adds swap, creates the `atlas` user with
   key-only SSH, and installs the nightly backup cron entry (01:30 UTC).

2. **DNS.** Point these A records at the server's IP: `<root>`, `www.<root>`, `*.<root>` and
   `*.api.<root>`. With Cloudflare, every one must be **DNS only** (grey cloud): Caddy answers the
   HTTP-01 challenge itself.
   Caddy obtains one certificate per host from Let's Encrypt over HTTP, so no DNS API access is
   needed, but every host must resolve before its first request.

3. **Clone and configure** (as `atlas`). The repository is private, so first create a key for the
   server (`ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N ""`, with an `IdentityFile` entry
   for github.com in `~/.ssh/config`) and add its public half under the repository's Settings,
   Deploy keys, read-only:

   ```sh
   git clone git@github.com:project-atlas-cbt/cbt-platform.git ~/cbt-platform
   cd ~/cbt-platform/infra/vps
   bin/init-env.sh <root> "<product name>"
   ```

   This writes `.env` (Compose: domain and infrastructure passwords) and `app.env` (application
   secrets), each with fresh random secrets and mode 600. Then fill in:
   - `.env`: `SCHOOLS` (comma-separated school labels), `ACME_EMAIL`, and the `BACKUP_S3_*` values.
     `SUPPORT_EMAIL` and `SUPPORT_WHATSAPP` set the contacts on staff Help screens (ADR-0035); they
     are built into the web image, so changing them needs a rebuild. `MARKETING_LEAD_EMAIL_*`
     send the marketing site's demo requests (`apps/marketing/README.md`); left empty, the form
     says it cannot send. The site's contact details and price are built in from
     `apps/marketing/.env.production`.
   - `app.env`: `OPS_ALERT_EMAILS` and the `SMTP_*` values from the email provider. The sender
     domain must be verified with that provider (SPF and DKIM records).

4. **Deploy:** `bin/deploy.sh`. It builds the images (marketing site included), starts PostgreSQL, Redis and MinIO,
   creates the media bucket (versioned) and the application's storage user, runs migrations, starts
   Caddy, web, API and worker, and fails unless `/v1/health/ready` reports every dependency up.

5. **First Software Admin:**

   ```sh
   docker compose --profile ops run --rm ops \
     pnpm --filter @atlas/api ops:create-software-admin -- \
     --email <address> --first <name> --last <name> --reason "pilot operator" --apply
   ```

   The password goes to that address by email only. Sign in at `https://admin.<root>/admin/login`.

6. **Back up once by hand** (`bin/backup.sh`) and check the objects arrived off-site.

## Adding a school

Create the school in the Software Admin console, add its subdomain label to `SCHOOLS` in `.env`,
and run `bin/deploy.sh`. Caddy fetches the new certificates on start.

## Demo school (staging only)

Before the pilot the server is staging and may hold the fictional demo school (Oakridge College and
Riverside Grammar School, `tools/load/src/demo-school.ts`). Never run it once a real school is on
the server. It goes straight to the API inside the network, so it needs no certificates yet:

```sh
docker compose --profile ops run --rm --no-deps \
  -e DEMO_API_TARGET=http://api:3001/v1 -e DEMO_PASSWORD='<a password for every demo user>' \
  ops pnpm --filter @atlas/load demo-school seed
```

Then add `oakridge,riverside` to `SCHOOLS` and run `bin/deploy.sh`. The demo staff have
`@….example` addresses; the email transports skip those reserved names, so no invitation is sent
or bounces.

## Deploying and rolling back

- **Deploy:** `bin/deploy.sh <ref>` checks out a tag or commit, then deploys it. After the
  readiness check it runs the post-deploy smoke (`tools/load/src/smoke.ts` through the `ops`
  service, against Caddy): API readiness and host shapes, the marketing site on `<root>` and the
  `www` redirect, then every critical web route, the 404
  page, the nonce CSP, the service worker's caching headers, immutable hashed assets and no
  published source maps. A failed smoke prints the rollback command and stops; only a passing
  release is appended to `releases.log`.
- **Roll back:** `bin/deploy.sh <previous ref>`. Migrations are expand-only, so the previous
  release runs against the newer schema; never roll a migration back by hand.
- **Never during a sitting.** Deploying restarts API and worker; attempts tolerate it (offline
  queue, server-side timers), but do not deploy while an exam is running.

## Maintenance page

`bin/maintenance.sh on` makes Caddy answer every school and admin page (not the marketing site,
which stays up) with a static "briefly
unavailable" page (503, `Retry-After`, refreshes itself every minute) and every API request with
the canonical error envelope (`SERVICE_UNAVAILABLE`, `retryable: true`), which the exam client
already retries. `bin/maintenance.sh off` lifts it; `status` reports it. Caddy serves the same
page and envelope by itself whenever the web or API container is down (502–504), so a restart or a
crash shows the page rather than a raw proxy error. The page is `infra/vps/maintenance/index.html`:
no script, no product name, no external requests.

## The CI copy of this stack

Every pull request runs this same Compose stack in CI (`pilot-stack` job, `infra/vps/ci/stack.sh`)
in place of preview deployments and a staging server (F21 owner decision, 2026-10-04): production
images, `CADDY_LOCAL_CA=1` with a CI-only root CA (`ci/compose.ci.yml`), Mailpit as the SMTP
server, the hosts `*.atlas.test` mapped to the runner. It runs `bin/deploy.sh` (readiness and
smoke), the golden path against that throwaway database, and the browser checks in
`apps/web/e2e/stack` (sign-in page under the real CSP and HSTS, the service worker, the error
pages, maintenance on and off). Screenshots are uploaded as the `stack-preview` artifact.
`stack.sh down` removes the stack, its volumes and every generated secret. It never touches a
real server, and refuses to run where `.env` belongs to another domain.

## Restore

On a fresh server after setup steps 1 to 3 (with the old `.env` and `app.env`, which you must keep
in a password manager: the database roles and MFA secrets depend on them):

```sh
cd ~/cbt-platform/infra/vps
docker compose up -d --wait postgres redis minio
# fetch the latest dump from off-site storage into backups/, then:
docker compose exec -T postgres pg_restore -U atlas -d atlas --clean --if-exists < backups/db-<stamp>.dump
# copy media back:
docker compose exec -T -e MC_HOST_local=... -e MC_HOST_offsite=... minio \
  mc mirror offsite/<bucket>/media local/atlas-media
bin/deploy.sh
```

Then run `ops:restore-verify` and `ops:attempts-affected` through the `ops` service as
[backup-and-restore.md](backup-and-restore.md) describes, to list attempts that changed after
the dump.

## Watching it

- `docker compose ps` and `docker compose logs -f api worker` (JSON logs, redacted by
  `@atlas/observability`).
- Exam Health Monitor alerts reach `OPS_ALERT_EMAILS` through SMTP.
- `backups/backup.log` after each night; an empty off-site setting prints a warning there.
- An external uptime check (any free service) on `https://api.<root>/v1/health`.
