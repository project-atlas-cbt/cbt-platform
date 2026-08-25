# Integration tests

Require live infrastructure — never run as part of `pnpm test`.

```bash
docker compose up -d
pnpm db:migrate:deploy   # against DATABASE_URL_TEST
pnpm test:integration
```

- `health.integration.test.ts` — boots the real Nest/Fastify app and hits
  `/v1/health` and `/v1/health/ready` over HTTP.
- `migrations.integration.test.ts` — proves a migration can be created,
  applied, and rolled back (`prisma migrate reset`) against an ephemeral
  database, per B0 Definition of Done #3.
- `../tenancy/rls.integration.test.ts` — proves a cross-tenant read is
  blocked by Row-Level Security even when the query itself omits the
  `school_id` filter (ADR-0023), per B0 Definition of Done #6.
- `queue.integration.test.ts` — proves BullMQ enqueue → process → complete,
  and retry-then-succeed, against the real Redis instance.
