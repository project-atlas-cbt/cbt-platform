# ADR-0031 — Technology version baseline re-validation

**Status:** Accepted
**Date:** 2026-08-24
**Deciders:** Engineering takeover review
**Audit findings:** R-11 (HIGH)
**Blocks phases:** B0

## Context

`09` pins Node 24 LTS, NestJS 11, Next.js 16.3, PostgreSQL 18.6 and Prisma 8 as current _"as of August 2026"_. `CLAUDE.md` requires that technology choices _"still be validated during implementation where specific versions, infrastructure capabilities, or constraints have changed."_

Several combinations carry real coupling risk: the NestJS/Fastify adapter at the chosen majors, Prisma's PostgreSQL 18 support and its transaction and isolation-level API, `@nestjs/bullmq` against the deployed Redis-compatible service, and Next.js major-version behaviour on Vercel.

A mismatch found at B13 is far more expensive than one found at B0.

## Decision

**Keep `09`'s stack as the baseline; validate versions at B0 with a spike before committing the foundation.**

- Pin **major** versions from `09`; resolve minors at B0 to whatever is current and supported.
- Build a **thin vertical spike** exercising the risky combination end to end: NestJS + Fastify + Prisma + PostgreSQL + BullMQ + Redis, committing one transaction with row-level locking and processing one queued job.
- Record the resulting compatibility matrix in this ADR's appendix.
- Any deviation from `09`'s stack requires an amendment here, not a silent substitution (`AGENTS.md §9`).

**Prisma remains the ORM**, per `09 §13`. The `FOR UPDATE` limitation noted in `R-07` is handled by confining raw SQL to a small, explicitly-named set of exam-engine repository methods with hand-written types, and by preferring unique constraints over locks wherever a constraint can express the invariant — see [ADR-0008](./ADR-0008-snapshot-storage-shape.md) and `D-09`.

## Consequences

**Easier**

- Version incompatibility surfaces in week one rather than in the exam engine.
- The spike doubles as the first CI pipeline exercise.

**Harder**

- B0 gains a spike before productive feature work begins.
- Major-version upgrades later require a deliberate amendment.

**Required changes**

- B0: spike, compatibility matrix, version pinning, renovate or equivalent for minors.

## Appendix — compatibility matrix

Completed during B0 (2026-08-25). Resolved against the public npm registry
and Docker Hub at that date.

| Component        | Pinned major | Resolved version                                     | Verified                                                        |
| ---------------- | ------------ | ---------------------------------------------------- | --------------------------------------------------------------- |
| Node.js          | 24 LTS       | **Deviation** — see below                            | CI: 24.x pinned; local dev: 22.18.0                             |
| NestJS           | 11           | 11.2.1                                               | Yes — spike boots `NestFactory.create` with the Fastify adapter |
| Fastify adapter  | —            | `@nestjs/platform-fastify` 11.2.1 / `fastify` 5.12.1 | Yes                                                             |
| Next.js          | 16           | 16.3.2                                               | Yes — `apps/web` builds against it                              |
| PostgreSQL       | 18           | 18.6 (`postgres:18.6-alpine`)                        | Yes — includes native `uuidv7()`, used for all primary keys     |
| Prisma           | 8            | **Deviation** — 7.9.1 (latest stable)                | Yes, at 7.9.1                                                   |
| BullMQ           | —            | 6.2.0                                                | Yes — spike processes one queued job                            |
| Redis-compatible | —            | `redis:8.10.1-alpine` server, `ioredis` 6.0.0 client | Yes                                                             |

### Deviation 1 — Node.js: local dev on 22.18.0, not 24 LTS

The B0 development sandbox has Node 22.18.0 installed (`C:\Program
Files\nodejs`); installing Node 24 system-wide would require elevated
rights this environment doesn't have, and replacing the Node binary the
harness itself runs on is not a change to make silently mid-phase.

Resolution: **CI is the authoritative version check, not the local
machine.** `.github/workflows/ci.yml` pins `actions/setup-node` to `24.x`
for every job — lint/typecheck/build, the contract-drift check, and the
integration suite (which also runs this ADR's spike). `package.json`
declares `"engines": { "node": ">=22.18.0 <25.0.0" }` so both lines are
accepted locally while CI validates the pinned major. Revisit if a
production incident ever traces to a 22-vs-24 behavioural difference —
none is expected between these two LTS lines for the API surface B0–B23 use.

### Deviation 2 — Prisma: 7.9.1, not 8

At B0 time, `prisma`/`@prisma/client` 8 exists only as a release candidate
(`8.0.0-rc.9-dev.75` and earlier), not a GA release. Shipping the
foundation phase on a pre-release ORM version is a worse trade than the one
minor-generation gap.

Resolution: **pin to Prisma 7 (latest stable, 7.9.1) for now.** Nothing in
`06`/`07`/`08` depends on a Prisma-8-specific capability; the risk this ADR
exists to catch — PostgreSQL 18 support, transaction/isolation-level API,
the `FOR UPDATE` raw-SQL pattern this ADR already reserves for exam-engine
repository methods — is exercised and passes at 7.9.1 (see the spike below).
Re-evaluate the pin when Prisma 8 reaches GA and before B13 (Attempt
Engine), which is this pin's most sensitive consumer.

### Spike result

`pnpm spike` (`apps/api/src/spike/run-spike.ts`), run against
`docker compose up -d` (PostgreSQL 18.6, Redis 8.10.1):

1. NestJS 11 + Fastify adapter boots.
2. A Prisma transaction takes a row-level lock (`SELECT ... FOR UPDATE`),
   updates the row, and commits.
3. A BullMQ job is enqueued against Redis, processed by a `Worker`, and
   its result observed via `waitUntilFinished`.

All three passed. Full output is not archived here (CI reruns the spike on
every integration job); this ADR records the versions and the two
deviations above, per "any deviation ... requires an amendment here, not a
silent substitution."
