# ExamKeep

Multi-tenant Computer-Based Testing platform for secondary schools. See
[`PROJECT.md`](./PROJECT.md) and [`CLAUDE.md`](./CLAUDE.md) for product
context, and [`docs/`](./docs) for the full specification, audit, roadmaps,
and architecture decision records.

> ExamKeep was developed under the temporary codename "Project Atlas", which internal identifiers
> (`@atlas/*`, `atlas_app`, the repository name) still carry. The name shown to users always comes
> from `PRODUCT_NAME` — see `PROJECT.md`.

## Status

Engineering foundation (`B0`) — see
[`docs/roadmaps/backend-roadmap.md`](./docs/roadmaps/backend-roadmap.md).

## Requirements

- Node.js 22.18+ (CI validates against the ADR-0031 baseline, Node 24 LTS —
  see that ADR's appendix for why local dev and CI differ here)
- pnpm 11 (`corepack enable` or `npm install -g pnpm`)
- Docker (for local PostgreSQL 18 + Redis)

## Quick start

Two ways to run `apps/api`/`apps/worker` locally — pick one.

**Native (recommended for day-to-day dev — hot reload, faster iteration):**

```bash
cp .env.example .env             # edit if you changed docker-compose defaults
docker compose up -d postgres redis
pnpm install
pnpm --filter @atlas/config run build   # prisma.config.ts needs this before db:generate
pnpm db:generate
pnpm db:migrate                  # applies migrations, prompts to name new ones
pnpm db:seed
pnpm build
pnpm dev                         # apps/api, apps/worker, apps/web in parallel
```

**Fully containerized** (api + worker run inside Docker too — no hot reload,
but proves the whole stack starts from nothing but Docker + a `.env` file;
migrations run automatically on container start):

```bash
cp .env.example .env
docker compose up -d --build     # postgres, redis, api, worker
```

Either way: API: http://localhost:3001/v1/health · Web (native workflow
only — not containerized in B0): http://localhost:3000

## Common commands

| Command                 | Does                                                             |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm lint`             | ESLint across every workspace + the tenancy schema lint          |
| `pnpm typecheck`        | `tsc --noEmit` across every workspace                            |
| `pnpm test`             | Unit tests (no infrastructure required)                          |
| `pnpm test:integration` | Integration tests — requires `docker compose up -d`              |
| `pnpm spike`            | ADR-0031 technology validation spike                             |
| `pnpm generate`         | Regenerates `apps/api/openapi.json` and `@atlas/contracts` types |
| `pnpm db:migrate`       | Creates/applies a Prisma migration (dev)                         |

## Monorepo layout

```text
apps/
  api/          NestJS 11 + Fastify — the platform API
  worker/       BullMQ background job processor
  web/          Next.js 16 — the frontend
packages/
  contracts/    Generated API types, consumed by apps/web
  validation/   Error envelope, idempotency key, timezone helpers (ADR-0033, ADR-0027)
  config/       Env validation and the single PRODUCT_NAME accessor
  domain/       Roles, base error codes — shared vocabulary with no framework dependency
  db/           Prisma schema, migrations, seed harness, tenancy primitives (ADR-0023)
tests/          Cross-cutting integration/tenancy tests (migrations, RLS isolation, queue)
infra/          Local infrastructure config (docker-compose init scripts)
docs/           Specifications, audit, roadmaps, ADRs — the source of truth
```

Before implementing anything, read `CLAUDE.md` §"Working Rules for Claude".
Phase IDs (`B0`, `F13`, …) are permanent — see `docs/roadmaps/roadmap-index.md`.
