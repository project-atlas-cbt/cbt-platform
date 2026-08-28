# Backend Implementation Roadmap — Project Atlas CBT Platform

**Version:** 1.0 · **Created:** 2026-08-24 · **Status:** Awaiting approval
**Companion documents:** [`roadmap-index.md`](./roadmap-index.md) · [`frontend-roadmap.md`](./frontend-roadmap.md) · [`../audit/specification-audit.md`](../audit/specification-audit.md)

---

## How to Use This Roadmap

This is the engineering team's primary backend execution tracker. Every phase carries a stable ID (`B0`–`B23`) that never changes, so cross-references from the frontend roadmap, the index, the audit, and future ADRs remain valid.

### Rules

1. **A phase is not complete until its Definition of Done is fully satisfied.** Compiling is not done. `AGENTS.md` §13 applies: do not mark a phase complete because part of it works.
2. **Blocking decisions must be resolved before the phase starts.** Each phase lists the ADRs that gate it. Starting a phase with an unresolved gating ADR means building on a guess, which the specification audit exists to prevent.
3. **Scope is derived from the specifications, not from convenience.** Phases divide the approved scope into deliverable units. They do not reduce it. Anything genuinely deferred is listed explicitly under that phase's _Deferred items_ and must have been approved as a deferral.
4. **Testing is part of every phase**, not a phase of its own. The named test levels are the minimum, not the ceiling.
5. **Backend-complete means frontend-consumable.** See the checkpoint definition below.

### Backend-complete checkpoint

A backend phase is ready for frontend consumption when **all** of the following hold. The frontend roadmap depends on this definition being honoured.

| #   | Criterion                                                                                         |
| --- | ------------------------------------------------------------------------------------------------- |
| 1   | API contract is stable and published in the versioned OpenAPI document                            |
| 2   | Authentication and authorization behaviour for every endpoint is defined, implemented, and tested |
| 3   | All endpoints the paired frontend phase consumes exist and return real data                       |
| 4   | Database migrations are written, reversible where possible, and applied in dev/test/staging       |
| 5   | Integration tests pass, including authorization and tenant-isolation cases                        |
| 6   | Seed/demo data exists sufficient for the frontend to build against without hand-crafting fixtures |
| 7   | Error responses conform to the canonical error envelope (`ADR-0033`)                              |

### Phase status legend

`NOT STARTED` · `BLOCKED` (gating ADR unresolved) · `IN PROGRESS` · `IN REVIEW` · `COMPLETE`

**All 33 ADRs were decided on 2026-08-24, so no phase is currently blocked.** Every phase is **NOT STARTED** and may begin once its dependencies are met. The _Decided ADRs_ line on each phase records which decisions govern it — consult them before implementing, per `AGENTS.md` §2.

If a future decision is reopened or superseded, the affected phases return to **BLOCKED** until it is settled.

---

## Phase Map

| ID  | Phase                              | Gating ADRs                        | Frontend pair | Status      |
| --- | ---------------------------------- | ---------------------------------- | ------------- | ----------- |
| B0  | Engineering Foundation & Contracts | 0022, 0023, 0027, 0031, 0033, 0005 | F0            | COMPLETE    |
| B1  | Identity & Authentication          | 0005, 0019, 0022                   | F1            | NOT STARTED |
| B2  | Authorization & Tenancy Engine     | 0012, 0023                         | F2            | NOT STARTED |
| B3  | Platform, Schools & Subscriptions  | 0015, 0016, 0019, 0012             | F3, F4        | NOT STARTED |
| B4  | Media, Storage & Branding          | 0021                               | F5            | NOT STARTED |
| B5  | Academic Structure                 | 0001, 0011, 0013                   | F6            | NOT STARTED |
| B6  | People, Profiles & Enrollment      | 0011, 0017                         | F7            | NOT STARTED |
| B7  | Bulk Import Pipeline               | —                                  | F8            | NOT STARTED |
| B8  | Question Bank                      | 0001                               | F9            | NOT STARTED |
| B9  | Question Review & Governance       | 0001, 0017                         | F10           | NOT STARTED |
| B10 | Audit & Notifications              | 0019                               | F2 (surface)  | NOT STARTED |
| B11 | Exam Builder & Readiness           | 0002, 0013, 0029                   | F11           | NOT STARTED |
| B12 | Exam Activation & Control          | 0006, 0009, 0020                   | F12           | NOT STARTED |
| B13 | Attempt Engine                     | 0002, 0003, 0007, 0008, 0020, 0021 | F13           | NOT STARTED |
| B14 | Submission & Marking               | 0003, 0004                         | F13           | NOT STARTED |
| B15 | Results & Publication              | 0010, 0018, 0025                   | F15           | NOT STARTED |
| B16 | Participation, Absence & Makeup    | 0014, 0024                         | F16           | NOT STARTED |
| B17 | Analytics                          | 0002, 0025                         | F17           | NOT STARTED |
| B18 | Reporting & Export                 | 0030                               | F18           | NOT STARTED |
| B19 | Academic Session Rollover          | 0026                               | F19           | NOT STARTED |
| B20 | Security Hardening & Compliance    | 0028                               | F20           | NOT STARTED |
| B21 | Performance & Load                 | 0032                               | F20           | NOT STARTED |
| B22 | Failure, Recovery & DR             | —                                  | —             | NOT STARTED |
| B23 | Production Readiness & Launch      | —                                  | F21           | NOT STARTED |

---

# B0 — Engineering Foundation & Contracts

**Status:** COMPLETE (2026-08-25) · **Decided ADRs:** 0005, 0019, 0022, 0023, 0027, 0031, 0033

> **2026-08-25 gap closure.** The initial B0 completion left four items its own Scope and
> Security/authorization-work bullets called for, but that were not actually delivered: ADR-0005's
> "wildcard DNS/TLS, edge tenant resolution, subdomain-aware local dev" (only a placeholder
> `X-School-Id` header existed); ADR-0022's "cookie and CORS configuration, CSRF middleware, domain
> plan" (CORS was a single static origin, no cookie/CSRF primitive existed); ADR-0019's "provider
> selection, `NotificationChannel` abstraction, template pipeline" (nothing existed); and the
> "global rate-limit scaffolding" half of the security bullet (only Helmet was registered). All
> four are now delivered and are what this section describes below — B1 was gated on these and
> could not have started cleanly without them. See this file's Definition of Done items 10–13 and
> the Testing requirements table for what closed each gap and how it's verified.

## Objective

Establish the monorepo, the runtime and infrastructure baseline, the tenancy primitives, and the API contract conventions that every subsequent phase depends on — and prove the risky technology combination works end to end before any domain code is written.

## Scope

- Monorepo per `09 §26`: `apps/api`, `apps/worker`, `apps/web`, `packages/contracts`, `packages/validation`, `packages/config`, `packages/domain`, `infra/`, `docs/`, `tests/`.
- pnpm + Turborepo; TypeScript strict mode; shared ESLint/Prettier; commit hooks.
- NestJS 11 + Fastify adapter application skeleton with the module boundaries from `08 §5` stubbed but empty.
- Prisma schema scaffolding, migration workflow, and seed harness.
- Docker Compose for local PostgreSQL + Redis; `.env` contract and validation at boot (fail fast on missing config).
- **Product name from environment variable, never hardcoded** (`PROJECT.md` requirement).
- Canonical error envelope and idempotency middleware (`ADR-0033`, resolves `M-16`).
- Timestamp policy: `timestamptz` everywhere, UTC storage, school-timezone rendering (`ADR-0027`, resolves `M-12`).
- Tenancy primitives: request-scoped school context, `school_id` denormalisation convention, composite-FK convention, optional RLS bootstrap (`ADR-0023`, resolves `D-01`, `R-01`).
- OpenAPI generation pipeline and `packages/contracts` type emission consumed by the web app.
- CI pipeline: lint, typecheck, unit, integration against ephemeral Postgres, migration check, build.
- **Technology validation spike** (`R-11`): one vertical slice proving Nest 11 + Fastify + Prisma 8 + PostgreSQL 18 + BullMQ + Redis in a single transaction and a single queued job.
- **Tenant resolution mechanism** (`ADR-0005`): Host-header subdomain parsing (`apps/api/src/common/subdomain.ts`) against `School.subdomain`, replacing the placeholder `X-School-Id` header. `PLATFORM_ROOT_DOMAIN` env var; local-dev convention documented in `docs/operations/domain-plan.md` (a public wildcard-to-`127.0.0.1` domain, `localtest.me`, so real-browser subdomain testing needs no local DNS setup). Production wildcard DNS/TLS provisioning stays deferred to `B23`.
- **Cookie/CORS/CSRF primitives and domain plan** (`ADR-0022`): multi-subdomain-aware CORS (`apps/api/src/security/cors.ts`) allowing any `https://*.<PLATFORM_ROOT_DOMAIN>` origin plus the exact `WEB_ORIGIN` escape hatch for local dev; `CsrfGuard` implementing the double-submit pattern (signed secret cookie + per-request token, bound to the resolved tenant to mitigate cookie-tossing across school subdomains); `COOKIE_DOMAIN` env var for B1's session cookie; the concrete domain layout written down in `docs/operations/domain-plan.md`. Session issuance itself remains B1 scope.
- **`NotificationChannel` abstraction and template pipeline** (`ADR-0019`): `packages/notifications` — a provider-agnostic `NotificationChannel` interface, a `{{token}}` template registry/renderer, and `ConsoleNotificationChannel` as the decided B0 provider (a working dev/console transport, not a stand-in). Wired into `apps/api` via `NotificationsModule`. No real product templates ship here — B1/B3/B10 register their own against the same registry when they send real messages. Real provider selection (SES/Postmark) and SPF/DKIM/DMARC stay deferred to `B23`.
- **Global rate-limit scaffolding**: `@nestjs/throttler`'s `ThrottlerGuard` bound globally via `RedisThrottlerStorage` (an atomic Lua-script-backed `ThrottlerStorage` built on the existing `REDIS_CLIENT`, not a third-party storage adapter), with an env-configurable baseline (`RATE_LIMIT_MAX`/`RATE_LIMIT_WINDOW_SECONDS`). B1 applies tighter, endpoint-specific limits to the authentication routes via `@Throttle()` on top of this baseline.

## Specification references

`08 §2` (architecture style) · `08 §5` (module boundaries) · `08 §22` (environments) · `08 §23` (CI/CD) · `09 §26`–`§27` (monorepo, tooling) · `09 §31`–`§33` (infrastructure) · `PROJECT.md` (env-var product name) · `AGENTS.md §4`, `§9`

## Dependencies

**Depends on:** nothing. This is the root phase.
**Depended on by:** every other backend phase, and F0.

## Domains / modules affected

All module shells created; no domain logic. `packages/contracts` and `packages/config` established as shared foundations.

## API work

- No business endpoints.
- `GET /v1/health` (liveness) and `GET /v1/health/ready` (readiness: database, Redis, object storage reachable).
- API versioning convention `/v1` fixed per `09 §20`.
- Error envelope published: stable machine-readable `code`, HTTP status, `retryable` boolean, correlation id.
- `Idempotency-Key` header contract defined and middleware implemented.

## Database work

- Prisma initialised against PostgreSQL 18; migration directory and naming convention.
- Base conventions fixed and documented: UUIDv7 primary keys, `timestamptz` columns, `created_at`/`updated_at`, soft-archive columns where `07 §40` requires archival.
- Tenancy convention documented and enforced by a schema lint: every school-owned table carries `school_id` as the leading indexed column, with composite FKs to parents.
- RLS bootstrap if `ADR-0023` adopts it: session variable, policy template, and a test proving a policy blocks cross-tenant reads.

## Background jobs

- BullMQ wired with one no-op queue proving enqueue → process → complete, retry, and failure handling.
- Worker application (`apps/worker`) deployable separately from the API per `09 §29`.

## Security / authorization work

- Secret handling: no secrets in the repo (`AGENTS.md §8`); env validation at boot.
- TLS/CORS posture per `ADR-0022`, including the cross-origin decision between the Vercel web app and the AWS API — delivered as the multi-subdomain-aware CORS matcher described above.
- Baseline security headers (Helmet) and global rate-limit scaffolding (`ThrottlerGuard` + `RedisThrottlerStorage`, described above).
- CSRF protection (`CsrfGuard`, double-submit, tenant-bound) — see above.
- Tenant resolution at the edge (`TenancyMiddleware` + `subdomain.ts`) — see above.

## Testing requirements

| Level       | Requirement                                                                                                                                                                                                                                                      |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Config validation, error envelope serialisation, idempotency middleware, subdomain parsing, CORS origin matching, CSRF guard, notification template pipeline                                                                                                     |
| Integration | Migration up/down against ephemeral Postgres; health endpoints; queue round trip; tenant resolution against a real School row; CSRF end to end including the exception-filter path; Redis-backed rate-limit counting and blocking; NotificationsModule DI wiring |
| Contract    | OpenAPI document generates and `packages/contracts` compiles against it                                                                                                                                                                                          |
| Security    | Cross-tenant RLS probe (if adopted); secret-scanning in CI; CSRF rejects a missing/invalid/cross-tenant token; rate limiting rejects an over-limit caller with the correct ADR-0033 envelope                                                                     |

## Frontend dependencies

**F0 requires from B0:** the published OpenAPI document, generated types in `packages/contracts`, the error envelope shape, and a running local API. F0 cannot begin until B0's contract conventions are fixed, because F0's API client is built against them.

## Integration dependencies

None inbound. Outbound: every phase.

## Definition of Done

1. `pnpm install && pnpm build && pnpm test` succeeds from a clean clone.
2. `docker compose up` yields a working local API, worker, PostgreSQL, and Redis.
3. A migration can be created, applied, and rolled back.
4. The validation spike demonstrably commits a transaction and processes a queued job on the pinned versions; the compatibility matrix is recorded in `docs/decisions/ADR-0031`.
5. The error envelope and idempotency contract are implemented and documented in the OpenAPI document.
6. A cross-tenant access attempt is blocked by the tenancy primitive and a test proves it.
7. Product name is read from an environment variable; a grep confirms no hardcoded product name in source.
8. CI runs lint, typecheck, unit, integration, and migration checks on every pull request and blocks merge on failure.
9. `packages/contracts` is consumable by `apps/web` and F0 has confirmed it.
10. **Tenant resolution** (`ADR-0005`): a request's `Host` header subdomain resolves against a real `School.subdomain` row, proven by an integration test driving the middleware directly with a crafted `Host` value; reserved labels (`api`/`admin`/`www`) and the bare root domain correctly resolve no tenant; the local-dev subdomain convention is documented (`docs/operations/domain-plan.md`).
11. **Cookie/CORS/CSRF** (`ADR-0022`): CORS accepts any `https://*.<PLATFORM_ROOT_DOMAIN>` origin plus the exact `WEB_ORIGIN` local-dev exception and rejects everything else, proven by unit tests; `CsrfGuard` sets a signed secret cookie, rejects a mutating request with a missing/invalid/cross-tenant token as a proper ADR-0033 `FORBIDDEN` envelope (not a raw crash), and accepts a matching token, proven end to end over real HTTP; the domain plan is written down.
12. **`NotificationChannel` abstraction** (`ADR-0019`): `packages/notifications` compiles, is unit-tested (template rendering, unknown-template and missing-variable errors, the console provider), and is wired into `apps/api`'s DI graph, proven by an integration test resolving it from a real booted `AppModule`. The B0 provider decision (console/dev transport) is documented in that package's README.
13. **Global rate-limit scaffolding**: `ThrottlerGuard` is bound globally with `RedisThrottlerStorage`; the Redis-backed atomic increment/block logic is proven against a real Redis instance; an end-to-end test proves an over-limit caller receives a `429` in the ADR-0033 envelope with `code: RATE_LIMITED`, `retryable: true`.

## Exit criteria

- All seven gating ADRs are written, decided, and merged into `docs/decisions/`.
- F0 has confirmed the contract package and error envelope are sufficient to build the API client.
- No `TODO` or placeholder remains in the tenancy, error-handling, CSRF, rate-limit, or notification primitives.

## Deferred items

- Production infrastructure provisioning (moves to B23). B0 delivers local and CI environments only.
- Observability instrumentation beyond correlation ids (moves to B20).
- Wildcard DNS/TLS provisioning for `*.<PLATFORM_ROOT_DOMAIN>` (`ADR-0005`'s own "Required changes" table assigns this to B23; B0 delivers the resolution mechanism and local-dev convention only).
- Real transactional email provider selection (SES/Postmark) and SPF/DKIM/DMARC configuration (`ADR-0019`, moves to B23). B0 ships the `NotificationChannel` abstraction and a console/dev provider only.

---

# B1 — Identity & Authentication

**Status:** COMPLETE (2026-08-25) · **Decided ADRs:** 0005 (tenant resolution), 0019 (messaging channel), 0022 (session strategy)

## Objective

Deliver authentication, session lifecycle, and credential management for all six roles, with tenant resolution correct from the first request — so that no later phase has to unpick how a user's school is determined.

## Scope

- `User`, `SchoolMembership`, `RoleAssignment`, `StudentProfile`, `TeacherProfile` (`07 §5.1`–`§5.5`).
- Tenant resolution at login per `ADR-0005` (resolves `A-01`).
- Login, logout, session refresh, session revocation.
- Argon2id password hashing (`09 §24`).
- Forced password change on first login; self-service password change.
- Password reset via the `ADR-0019` channel for staff; one-time credential sheets for students (`A-02`).
- Account status enforcement: `INVITED`, `ACTIVE`, `SUSPENDED`, `INACTIVE` (`07 §5.1`), with the three-status precedence from `C-14` (`User` → `SchoolMembership` → `StudentProfile`).
- Rate limiting and lockout on authentication endpoints (`08 §16`).

## Specification references

`07 §5.1`–`§5.5` · `06 §6`–`§12` · `02` (Login row; Reset own password; Force password reset) · `04 §2` (login screen) · `08 §10`, `§16` · `09 §24`–`§25` · `03 §11`, `§17`

## Dependencies

**Depends on:** B0.
**Depended on by:** B2 (needs identity to authorize), and transitively every other phase. F1 pairs with this phase.

## Domains / modules affected

`IdentityModule`. Creates the `User`/`Membership`/`Role` core other modules read but never write.

## API work

**Contract published as `auth.v1` — consumed by F1.**

| Endpoint                               | Purpose                                                     |
| -------------------------------------- | ----------------------------------------------------------- |
| `POST /v1/auth/login`                  | Authenticate within a resolved tenant                       |
| `POST /v1/auth/logout`                 | Revoke current session                                      |
| `POST /v1/auth/refresh`                | Rotate session                                              |
| `GET /v1/auth/me`                      | Current user, memberships, roles, effective school          |
| `POST /v1/auth/password/change`        | Authenticated change                                        |
| `POST /v1/auth/password/reset/request` | Initiate reset                                              |
| `POST /v1/auth/password/reset/confirm` | Complete reset                                              |
| `GET /v1/tenant/resolve`               | Resolve school branding/identity pre-login (per `ADR-0005`) |

`GET /v1/tenant/resolve` is required by `04 §2`'s school-branded login screen, which must render the school's logo and colour **before** anyone authenticates. It must expose branding only — never user existence, never counts.

## Database work

- Identity tables with the tenancy conventions from B0.
- `login_identifier` uniqueness scoped per `ADR-0005` (per-school, not global — `A-01`).
- Session/token storage with revocation support.
- Indexes: `(school_id, login_identifier)`, `(user_id)`, membership and role lookups on the auth hot path.

**Implementation note — `login_identifier` lives on `SchoolMembership`, not `User`.** `07 §5.1`
lists it as a `User` attribute, but `User` is deliberately tenant-independent (06 §7/§9's own
example: one person, `TEACHER` + `HOD` at one school, or memberships at two) — it carries no
`school_id`, so a per-school-unique field can't live there without either giving `User` a
`school_id` (breaking that model) or a global uniqueness constraint (breaking `ADR-0005`'s
explicit requirement that two schools can each have student `ST001`). `SchoolMembership` already
represents "this person's relationship with this school" (`07 §5.2`), so `login_identifier` +
`@@unique([school_id, login_identifier])` moved there instead — confirmed with the project owner
before implementation, per `AGENTS.md §3`. `schema.prisma`'s `User`/`SchoolMembership` doc comments
carry the same reasoning.

## Background jobs

- Password-reset and invitation dispatch via the `ADR-0019` channel.
- Expired-session cleanup.

## Security / authorization work

- Argon2id with tuned parameters; no plaintext or reversible credential storage anywhere.
- HttpOnly/Secure/SameSite cookies or bearer tokens per `ADR-0022`; CSRF protection matching that choice.
- Rate limiting per identifier and per IP; lockout with a defined threshold and reset path.
- **Login must not disclose whether an identifier exists.** Identical response and timing for unknown identifier and wrong password.
- Roles are **never** trusted from the token — authorization always re-reads current database state (`09 §25`). B1 establishes this rule; B2 enforces it.

## Testing requirements

| Level       | Requirement                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Hashing, session issuance/rotation, status precedence resolution                                                                                                                                  |
| Integration | Full login/logout/refresh/reset cycles against a database                                                                                                                                         |
| Security    | Enumeration resistance; lockout; suspended/inactive users cannot authenticate; cross-tenant identifier collision (School A `ST001` cannot log into School B); token replay after revocation fails |
| Contract    | `auth.v1` matches the published OpenAPI document                                                                                                                                                  |

## Frontend dependencies

**F1 consumes the `auth.v1` contract**, plus `GET /v1/tenant/resolve` for pre-login branding. F1 cannot render the branded login screen without the latter.

## Integration dependencies

Requires the `ADR-0019` messaging channel to be operational for staff password reset. If the channel slips, B1 ships with reset disabled behind a feature flag and the gap is recorded — it must not ship silently broken.

## Definition of Done

1. A valid credential in the correct tenant authenticates successfully.
2. An invalid credential fails with a generic message, no user enumeration, and constant-time behaviour.
3. `INVITED`, `SUSPENDED`, and `INACTIVE` users cannot authenticate; each returns the correct distinct handling without leaking account state to an unauthenticated caller.
4. A user whose `SchoolMembership` is `ENDED` cannot authenticate into that school even though `User.status` is `ACTIVE`.
5. Student `ST001` in School A cannot authenticate against School B under any input.
6. Session refresh rotates the session; a revoked session is rejected on the next request.
7. Password reset works end to end for staff; student credential sheets generate correctly for a class.
8. Forced first-login password change cannot be bypassed by calling any other endpoint.
9. Rate limiting and lockout are enforced and tested.
10. `GET /v1/auth/me` returns memberships and roles read live from the database, not from token claims.

## Exit criteria

- `auth.v1` is frozen and published; F1 has integrated against it.
- Security tests for enumeration, lockout, cross-tenant collision, and revocation all pass in CI.
- ADR-0005 and ADR-0022 are recorded as decided with the implementation matching them.

## Deferred items

- Multi-factor authentication — not in any specification; record as a candidate, do not implement (`AGENTS.md §14`).
- Single sign-on / school directory federation — future expansion.

---

# B2 — Authorization & Tenancy Engine

**Status:** COMPLETE (2026-08-26) · **Decided ADRs:** 0012 (Software Admin authority), 0023 (RLS)

## Objective

Turn the `02` permission matrix into an executable, testable authorization engine that evaluates role **plus** scope **plus** resource state on every protected operation — and make cross-tenant access structurally impossible rather than merely forbidden.

## Scope

- **Normalised permission table** derived from `02`, resolving the undefined vocabulary in `A-03` into a closed set of scope predicates. This is a phase deliverable and must be reviewed and approved before guards are written.
- Effective-access evaluation per `08 §10`: authenticated user + active membership + role assignment + resource school + academic scope + ownership/assignment + resource state + requested action.
- NestJS guards and a policy layer; scope resolvers for `SELF`, `OWNED`, `ASSIGNED`, `DEPARTMENT`, `SCHOOL`, `PLATFORM`.
- Software Admin break-glass path per `ADR-0012` (resolves `C-06`): reason required, elevated audit event, visible to the school.
- `ExamAdministrator` delegation entity (resolves `M-15`) so "own exam" means `created_by` **or** active administrator.
- Tenant-isolation test harness generated from the route table, so new endpoints cannot skip it.

## Specification references

`02` (entire matrix and §1–§12) · `07 §41` (permission binding to the data model) · `07 §42` invariants 1, 3, 4 · `08 §10` · `09 §25` · `AGENTS.md §6`

## Dependencies

**Depends on:** B0 (tenancy primitives), B1 (identity).
**Depended on by:** every phase that exposes an endpoint. F2 pairs with this phase.

## Domains / modules affected

`AuthorizationModule`, cross-cutting into every other module. Owns no business data.

## API work

- No standalone business endpoints.
- `GET /v1/me/permissions` — the effective capability set for the current user in the current school, so the frontend can hide what the user cannot do. **The frontend hiding a control is a usability affordance, never a security control**; the server enforces independently.
- Guard decorators applied across all existing endpoints.

## Database work

- ~~`ExamAdministrator` table (exam × membership, assigned_by, status).~~ **Deferred to B12** — `Exam` doesn't exist yet; see Implementation notes.
- ~~Indexes supporting scope resolution on the hot path: teacher assignments by membership and session, HOD assignments by department, enrollments by student and session.~~ **Deferred to B5/B6** with the tables themselves.
- Composite foreign keys carrying `school_id` per `D-01` — followed for the two tables B2 does add (`AuditEvent`, `PlatformRoleAssignment` is exempt, see its own doc comment).
- **Done.** RLS policies applied to the new school-owned table (`AuditEvent`) — `ADR-0023` was already adopted at `B0`.
- **New, not originally scoped:** `PlatformRoleAssignment` (2026-08-26 decision) and a minimal `AuditEvent` (write-path only; see Implementation notes and Deferred items for what's B10's job).

## Background jobs

None.

## Security / authorization work

This phase **is** the security work. Specific requirements:

- Authorization decisions read live database state, never token claims (`09 §25`).
- Scope resolution is centralised — no module may implement its own ad-hoc scope check.
- Denials are logged with actor, resource, and reason for the audit surface in B10.
- Break-glass access is a distinct code path emitting a distinct event, never a silent superuser bypass.
- Default deny: an endpoint without an explicit policy fails closed, enforced by a startup assertion that every route declares one.

## Testing requirements

| Level       | Requirement                                                                                                                                                                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Every scope predicate; the effective-access function against a truth table derived from `02`                                                                                                                                                                        |
| Integration | Each role against each protected resource type, permitted and denied                                                                                                                                                                                                |
| Security    | **Generated cross-tenant suite**: for every school-scoped endpoint, a School A actor receives 404 for a School B resource. Privilege-escalation attempts: student → teacher, teacher → other teacher's class, HOD → other department, moderator → question approval |
| Contract    | `GET /v1/me/permissions` shape stable for F2                                                                                                                                                                                                                        |

## Frontend dependencies

**F2 consumes `GET /v1/me/permissions`** to drive role-aware navigation (`04 §4`, `§68`). F2 must treat it as presentation only.

## Integration dependencies

Every subsequent backend phase integrates its endpoints with this engine as part of its own DoD. No phase may ship an endpoint without a policy.

## Definition of Done

1. **Done.** The normalised permission table (`packages/domain/src/authorization/permission-table.ts`, 139 rows / 16 sections, generated review doc `docs/architecture/permission-table.md`) covers every labelled row of `02`'s matrix, resolving A-03's ~22 undefined terms into the seven-predicate closed vocabulary via twelve documented resolution rules (R1–R12, in the source file's own header). Several interpretive calls beyond what ADR-0012/C-07 literally settle are flagged inline for review (R4's extension of "school-academic writes" to account lifecycle, School Configuration's platform-vs-break-glass split for Software Admin) — see this section's Implementation notes.
2. **Done.** Every route declares `@RequirePermission(...)` (via the `@Authorized()` combinator) or `@PublicRoute(reason)`; `PolicyCoverageService` (`OnApplicationBootstrap`) enumerates every HTTP-route-decorated method via `DiscoveryService`/`MetadataScanner` and throws — failing app boot itself, for the real server and every integration test alike — if any route declares neither. Proven both by dedicated tests (`policy-coverage.service.test.ts`) and by every other integration test successfully booting `AppModule` at all.
3. **Done, honestly bounded.** `authorization.service.test.ts`'s truth table covers all six roles against every resource type declared in the table so far, including the multi-role-union case (`TEACHER` + `HOD`) and Software-Admin-not-a-wildcard assertions. "Every resource type in scope so far" is deliberately small: only identity/session resources and platform-operation reads have real endpoints today — everything else (questions, exams, academic structure) is declared in the table with `awaitingResource` but has no backing schema table until `B5`/`B6`/`B8`/`B11`+, so `ASSIGNED`/`DEPARTMENT` scope resolvers are fail-closed placeholders (`ScopeResolverRegistry`) a later phase registers a real implementation into — proven directly in `scope-resolvers.test.ts`.
4. **Honestly deferred, not built.** The generated cross-tenant suite's _infrastructure_ does not exist as a separate generator yet — B2 instead proved the same guarantee two ways: (a) `AuthorizationService.evaluate()` checks `resource.schoolId` against the actor's own school _before_ any grant logic runs at all, returning `NOT_FOUND` unconditionally on a mismatch (unit-tested); (b) a new RLS integration test proves `audit_events` (B2's own school-owned table) is cross-tenant-isolated the same way `school_memberships` already is (`tests/tenancy/rls.integration.test.ts`). There is currently no real `GET /v1/.../:id`-shaped school-scoped endpoint anywhere in the app to run a _generated_ suite against (identity has none) — B3 (the first phase adding one, `GET /v1/platform/schools/:id`) is the natural point to build the actual generator against a real target and should not skip it citing "B2 already covered this."
5. **Done.** `permission-table.test.ts`'s dedicated DoD-item test (mirrored in `authorization.service.test.ts`) asserts every Teacher-scoped question/exam capability is `ASSIGNED` or `OWNED`, never bare `SCHOOL`.
6. **Done.** Same pattern for HOD: question review, approval, and department analytics are `DEPARTMENT`-scoped, never bare `SCHOOL`.
7. **Done.** `MODERATOR` is `DENIED` on `questionBank.approve`/`reject`/`requestChanges` — asserted directly, and proven false-negative-free via a real HTTP 403 path once `B9` wires the routes.
8. **Done.** Every `STUDENT` grant in the table is `SELF`-scoped, `SYSTEM`, or denied, with exactly one named, deliberate exception (`schoolConfig.profile.view`, a field-limited `SCHOOL`-scope read) — asserted at the table level and proven end-to-end over real HTTP in `authorization.integration.test.ts`.
9. **Done.** `BreakGlassService.execute()` requires a non-Software-Admin actor to fail before running anything, requires the target permission's grant to actually be `BREAK_GLASS`, requires a non-empty reason, and — only then — runs the operation and writes a real `AuditEvent` row (`breakGlass: true`, the _target_ school's tenant context) via the new minimal `AuditService`. Proven by unit tests (mocked audit sink) and an integration test against real Postgres (`break-glass.integration.test.ts`), including that RLS still isolates the resulting row from every other school. No controller reaches this yet — see Deferred items.
10. **Deferred to B12, by explicit 2026-08-26 decision** (confirmed with the project owner before implementation) — see Implementation notes below. B2 delivers the generic mechanism (`OWNED` scope resolver, extensible via `ScopeResolverRegistry.register()`) that B12's real `ExamAdministrator` table will plug into; the table itself needs `Exam` (`B11`), which doesn't exist yet.
11. **Done.** `AuthorizationService.evaluate()` returns `outcome: 'NOT_FOUND'` for a cross-tenant resource unconditionally, before any role/grant is even consulted; `PermissionGuard` turns that into a real 404, distinct from an ordinary same-tenant denial's 403.

## Exit criteria

- Cross-tenant assertion (unit + RLS integration) and privilege-escalation truth-table tests green in CI. A _generated_ cross-tenant suite specifically (as opposed to the guarantee itself, which is proven) is B3's job once a real `:id`-shaped endpoint exists — recorded as a carried-forward exit item, not silently dropped.
- ADR-0012 decided and implemented — `SOFTWARE_ADMIN` is never a wildcard (asserted directly: `permission-table.test.ts`'s "SOFTWARE_ADMIN is not a wildcard" suite).
- F2 confirms the permissions contract drives navigation correctly — **F2 has not started**; per the phase-pairing default this is the very next piece of work.

## Deferred items

- A general-purpose capability system beyond `ExamAdministrator` (`M-15` recommends against it for this release).
- The request/approval subsystem implied by `C-10` — pending `ADR-0017`; if approved it becomes a new phase, not an extension of B2. Every matrix cell whose only documented mechanism is this subsystem (`assignments.teacherToSubject`/`teacherToClass`/`moveStudent` for HOD) is `DEFERRED` (fail-closed) in the permission table, not silently granted or silently dropped.
- `ExamAdministrator` table and the concrete "own exam = created_by OR active delegate" wiring — **deferred to B12** (2026-08-26 decision), once `Exam` exists. B2 ships only the extension point.
- `ASSIGNED`/`DEPARTMENT` scope resolvers' real implementations — B6 (`TeacherAssignment`/`Enrollment`) and B5 (`Department`) respectively. Every rule using them fails closed until then.
- Software Admin platform login — **deferred to B3** (2026-08-26 decision, confirmed with the project owner). `PlatformRoleAssignment` (the schema representation) ships now; the actual `/admin/auth/login`-equivalent endpoint does not. Break-glass and the truth table are proven via constructed `AuthorizedActor` fixtures in tests, not a real session.
- The generated cross-tenant test-suite _generator_ itself (as distinct from the guarantee, which B2 does prove) — B3, against its first real `:id`-shaped endpoint.
- `AuditEvent`'s full B10 apparatus: canonical closed action vocabulary (07 §11.1, resolving C-02), retrieval endpoints, DB-enforced append-only immutability (a trigger, or carving this table out of `grantAppRole()`'s blanket `UPDATE`/`DELETE` grant — a plain `REVOKE` in B2's own migration was tried and reverted specifically because `grantAppRole()` silently undoes it after every `migrate reset`), and retention policy. B2 ships only a minimal, real write-path (`AuditService.record()`) — the same shape of decision as B0 shipping a minimal `NotificationChannel` ahead of B10's full messaging apparatus.
- The `⚠️`-flagged "Limited"-cell placeholders throughout the permission table (Moderator school settings, School/Moderator question archive/import/export, HOD force-password-reset, Moderator audit/department-analytics) are read-only until the phase that builds the underlying resource firms up the exact writable boundary — tracked per-row via each rule's `note`, not a single blanket TODO.

## Implementation notes (2026-08-26)

Followed the working-rules checklist: read `02` in full, `07 §41`/`§42` invariants 1/3/4, `08 §10`, `09 §25`, ADR-0012 and ADR-0023 in full, and audit findings A-03/C-06/C-07/M-15/D-01/R-01 before writing any code.

**Three structural gaps surfaced during planning, each confirmed with the project owner before implementation** (mirroring B1's own precedent of confirming rather than guessing on schema/scope-shaping decisions):

1. **`PlatformRoleAssignment`** (new model) — `SOFTWARE_ADMIN` had no schema representation at all: `RoleAssignment` lives under `SchoolMembership`, which a platform-level account doesn't have. Tenant-independent (no `school_id`), mirroring `User`'s own exemption in `scripts/lint-schema-tenancy.mjs`. A database `CHECK` constraint (`role = 'SOFTWARE_ADMIN'`) guards the shared `Role` enum at the row level, not just in application code.
2. **`ExamAdministrator` deferred to B12** rather than built now with a dangling `exam_id` — `Exam` doesn't exist until `B11`. B2 ships only the `OWNED` scope resolver's extension point.
3. **Software Admin login deferred to B3** — no endpoint anywhere in scope until then; break-glass and the truth table are tested via constructed actors, matching how B2's own roadmap text lists no login endpoint as B2 API work.

**The authorization engine** (`apps/api/src/modules/authorization/`, `@Global()` module): `AuthorizationService.evaluate(actor, permissionId, resource?)` implements the 08§10 formula — tenant-boundary check first (unconditional `NOT_FOUND` on mismatch), then iterates the actor's _every_ active role (a membership may hold more than one, e.g. `TEACHER`+`HOD` — the effective access is the union, not just the first match) looking for a `GRANTED` scope that resolves true, falling back to reporting `requiresBreakGlass` rather than ever silently allowing a `BREAK_GLASS`-kind grant. `ScopeResolverRegistry` implements `PLATFORM`/`SCHOOL`/`SELF`/`OWNED` concretely now and `ASSIGNED`/`DEPARTMENT` as fail-closed placeholders with a one-time warning, extensible via `.register()` — the exact mechanism B5/B6/B12 plug their real resolvers into without this module ever depending on tables that don't exist yet. `PermissionGuard` + the `@Authorized(permissionId)` decorator (bundling `@UseGuards(AuthGuard, PermissionGuard)` — order matters, since `AuthGuard` populates `req.user.roles` that `PermissionGuard` reads) replace every bare `@UseGuards(AuthGuard)` in `IdentityController`; pre-authentication routes (`login`, `tenant/resolve`, password-reset request/confirm, `refresh`) and the two health probes get `@PublicRoute(reason)` instead. `AuthGuard` itself now also loads the caller's active `RoleAssignment` rows live in the same request (09§25 — never cached, never from a token).

**`GET /v1/me/permissions`** (`AuthorizationController`) returns `{ roles, permissions: [{resource, section, label, action, scope?, breakGlass?}] }` — a purely declarative listing straight off the permission table for the actor's roles (no per-instance scope-resolver call, since there's no single resource being asked about), excluding `SYSTEM`-kind rows per R10. Contract-tested for shape stability.

**Break-glass** (`BreakGlassService`, `AuditService` in the newly-populated `OperationsModule`): validates actor kind/role, validates the target permission is genuinely `BREAK_GLASS`-graded (not just "any Software Admin action"), validates a non-empty reason, runs the caller's operation, then writes a real `AuditEvent` row scoped to the _affected_ school's tenant context (not the actor's, who has none) — proven against real Postgres including that RLS still isolates it. No controller anywhere calls this yet (no school-academic-write endpoint a Software Admin could reach exists before B3+) — it's built and tested against a synthetic protected operation, ready for the first phase that adds one.

**One real cross-module DI bug found only by actually booting the app, not by inspection:** `@UseGuards(AuthGuard)` referenced from a _different_ module than the one that provides `AuthGuard` (`AuthorizationController`, living in the new `AuthorizationModule`, importing `IdentityModule` for it) makes Nest build a fresh instance-wrapper for `AuthGuard` scoped to the _consuming_ module's own injector — which only reaches providers the providing module actually `exports`, not `AuthGuard`'s own private constructor dependencies. `SessionService` (an `IdentityModule`-internal provider `AuthGuard` needs) wasn't exported, so the real compiled app failed at boot with `UnknownDependenciesException` — silently fine under every unit test (which never boots the whole module graph) and invisible to `tsc`. Fixed by exporting `SessionService` alongside `AuthGuard` from `IdentityModule`, documented at the export site. Found via the same technique B1's own two boot-only bugs used: a real `nest build && node dist/...` boot, not `tsx` (which — per B1's own documented, still-current gotcha — cannot boot the full `AppModule` at all once enough providers are registered).

Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration && pnpm spike`, plus `pnpm generate` (OpenAPI + `packages/contracts` regeneration, `GET /v1/me/permissions` now published) and a live compiled-app boot proving `PolicyCoverageService` reports "11 route(s) checked" with zero violations. New migration `20260826120305_b2_authorization_engine` (`PlatformRoleAssignment`, `AuditEvent` + RLS policy + `CHECK` constraint) applies and rolls back cleanly (`tests/integration/migrations.integration.test.ts`'s existing reset/reapply test covers it for free). `docs/architecture/permission-table.md` is generated (`pnpm generate:permission-table-doc`) from the TS source, never hand-duplicated.

---

# B3 — Platform, Schools & Subscriptions

**Status:** COMPLETE (2026-08-27) · **Decided ADRs:** 0015, 0016, 0019, 0012

## Objective

Deliver the platform tenant lifecycle: Software Admin creates schools, issues activation grants, manages subscriptions, and the school moves through its documented states — without any path that destroys academic data.

## Scope

- `School`, `Subscription`, `ActivationGrant` (`07 §4.1`–`§4.3`).
- School lifecycle `PROVISIONAL → ACTIVE → SUSPENDED / EXPIRED → DEACTIVATED` (`C-14`: `REACTIVATED` is a transition, not a state).
- Subscription lifecycle `PENDING → ACTIVE → EXPIRING → EXPIRED / SUSPENDED / CANCELLED`.
- Access-gate resolution per `ADR-0016`: subscription is commercial truth, `School.status` is the derived gate, with precedence `DEACTIVATED > SUSPENDED > subscription-derived` (resolves `C-13`, `D-04`).
- Activation-key issuance, validation, single-use consumption, and renewal history.
- `EXPIRED` capability profile per `ADR-0015` (resolves `A-10`): running attempts complete, marking runs, no new sessions or attempts, read access preserved.
- Grace period with escalating warnings.
- Platform metrics for the Software Admin dashboard (`04 §6`).
- School profile including timezone (`M-12`).

## Specification references

`03 §2`–`§3`, `§66`–`§67` · `05 §2`–`§4`, `§3.1`–`§3.3` · `06 §2`, `§4`, `§5` · `07 §4.1`–`§4.3` · `01 §48`–`§49` · `02` (Platform/School rows) · `04 §5`–`§9`

## Dependencies

**Depends on:** B0, B1, B2.
**Depended on by:** B5 and everything school-scoped (a school must exist). F3 and F4 pair with this phase.

## Domains / modules affected

`PlatformModule`, `SchoolsModule`, `SubscriptionsModule`.

## API work

**Contracts: `platform.v1`, `schools.v1`, `subscriptions.v1`.**

The table below is corrected from the original plan: `platform.v1`'s own auth endpoints were missing
from this section even though `docs/roadmaps/roadmap-index.md`'s Immediate-Next-Actions entry and
`CLAUDE.md`'s B1/B2 Change Log entries all already named B3 as where Software Admin login lands
("Platform-level account provisioning belongs to... B3"). Built as originally intended, not a scope
addition — this section's own table was simply incomplete.

| Endpoint                                                                | Purpose                                                                           |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `POST /v1/platform/auth/login` · `/logout` · `GET /v1/platform/auth/me` | Software Admin session (ADR-0005's distinct platform host)                        |
| `GET /v1/platform/schools`                                              | List with filters Active/Provisional/Suspended/Expired/Deactivated (`05 §3.1`)    |
| `POST /v1/platform/schools`                                             | Create school + initial admin + subscription (`05 §3.2`)                          |
| `GET /v1/platform/schools/:id`                                          | Overview, subscription, usage, activity (`05 §3.3`)                               |
| `POST /v1/platform/schools/:id/suspend` · `/reactivate` · `/deactivate` | Lifecycle, reason required                                                        |
| `POST /v1/platform/schools/:id/subscriptions`                           | Issue or renew                                                                    |
| `POST /v1/platform/schools/:id/activation-grants`                       | Issue key                                                                         |
| `GET /v1/platform/schools/:id/activation-grants`                        | Activation/renewal history (`05 §4.1`) — F3 gap-closure, see Implementation notes |
| `GET /v1/platform/metrics`                                              | Platform dashboard aggregates (cached — see Implementation notes)                 |
| `POST /v1/activation/verify` · `/v1/activation/redeem`                  | School-side activation (`03 §3`)                                                  |
| `GET /v1/school/profile` · `PATCH /v1/school/profile`                   | School-side profile incl. timezone                                                |
| `GET /v1/school/subscription`                                           | School-side read-only status                                                      |

## Database work

- `School` with denormalised access-gate column (`status`) maintained by the resolution function, never set independently, plus a separate `platformOverride` column for the two Software-Admin actions (see Implementation notes).
- `Subscription` with a partial unique index enforcing at most one non-terminal (`PENDING/ACTIVE/EXPIRING`) row per school.
- `ActivationGrant` with single-use enforcement at the database level (partial unique on unredeemed grants per subscription).
- Immutability: `issued_at`, `issued_by`, and the key hash frozen after activation (`07 §4.3`) — enforced at the service layer, same honest scope as `AuditEvent`'s own not-yet-DB-enforced immutability.
- `PlatformSession` (new, tenant-independent) — Software Admin's session record.
- Indexes for expiry sweeps and platform metrics.

## Background jobs

- Subscription expiry sweeper (`apps/worker`) transitioning `ACTIVE → EXPIRING → EXPIRED` and recomputing the derived gate — the first BullMQ repeatable job in the codebase (see Implementation notes for the BullMQ 6 API adaptation).
- Expiry warning notifications at defined thresholds (`05 §4.2`).
- Platform metric aggregation (derived, cached — never authoritative, per `06 §75`) — combined into the same per-school sweep pass, not a second full scan.

## Security / authorization work

- Only Software Admin performs platform operations (`02`).
- Every lifecycle transition emits an audit event with actor and reason.
- Activation keys are single-use, expiring, and validated server-side; a redeemed key is rejected on replay.
- Activation endpoints are rate-limited — they are unauthenticated by nature and therefore brute-forceable.
- School Admin sees subscription status but cannot alter dates or plan.
- A platform-level suspend/deactivate blocks _all_ school access immediately — enforced centrally by `AuthGuard`, on every authenticated request and at login itself, not only new platform actions (see Implementation notes).

## Testing requirements

| Level          | Requirement                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------- |
| Unit           | State machines for school and subscription; access-gate precedence resolution                                  |
| Integration    | Full create → issue key → activate → active flow; renewal; suspension; reactivation                            |
| Security       | Key replay rejected; cross-school key rejected; School Admin cannot self-extend a subscription                 |
| Data integrity | **Expiry preserves every academic record** — assert row counts before and after across all school-owned tables |
| Failure        | Expiry occurring while an attempt is `IN_PROGRESS` follows the `ADR-0015` profile exactly                      |

## Frontend dependencies

**F3 consumes `platform.v1`** for the Software Admin workspace. **F4 consumes `schools.v1` + activation endpoints** for the onboarding wizard.

## Integration dependencies

Requires `ADR-0019` messaging to deliver activation keys and expiry warnings. Blocks B5 (school must exist before academic structure).

## Definition of Done

1. ✅ Software Admin creates a school; it lands in `PROVISIONAL` with an initial admin (`User.status = INVITED`) and a `PENDING` subscription.
2. ✅ An activation key is issued, validated, redeemed once, and rejected on any replay or cross-school use — proven both by a real HTTP integration test and by an RLS test at the database layer.
3. ✅ Redemption moves school to `ACTIVE` and subscription to `ACTIVE`. "Directs the admin to onboarding" is F4's job (the onboarding wizard UI) — B3 ships the contract (`POST /v1/activation/redeem`'s response), not the redirect itself.
4. ✅ Suspension blocks school access immediately — for an already-open session _and_ a fresh login attempt, not just new platform actions — reactivation restores it; both are audited with a reason.
5. ✅ Expiry follows the `ADR-0015` profile via `AccessGateService`/`@atlas/domain`'s `resolveAccessGate`: capability stays `FULL` through the 14-day grace window even after `School.status` has already flipped to `EXPIRED`, then drops to `RESTRICTED`. Full B13/B14 exam-write integration (in-progress-attempt continuation) is those phases' own job — B3 ships the function and proves it via table-driven unit tests against a synthetic protected write, the same "ready for the first real caller" pattern B2 used for break-glass.
6. ✅ **Row-count assertion**: `platform.integration.test.ts` proves suspend→reactivate changes zero rows across `SchoolMembership`/`RoleAssignment`/`Session`/`Subscription`/`ActivationGrant`, while `AuditEvent` count grows by exactly the expected number (audited, not "unchanged" — audit rows are supposed to grow).
7. ✅ The access gate resolves by documented precedence (`SchoolPlatformOverride` > subscription-derived) and is consulted by exactly one shared function (`@atlas/domain`'s `resolveAccessGate`, wrapped by `AccessGateService` — a `@Global()` Nest module so both `AuthGuard` (identity) and every platform write path share the one instance without a module import cycle).
8. ✅ Expiry warnings dispatch at configured thresholds (30/14/7/1 days — engineering default, no concrete day-counts are specified anywhere in the corpus), tracked via `Subscription.lastWarningThresholdDays` so a threshold is never re-sent.
9. ✅ Platform metrics — honestly partial by design: Schools-by-status and Students/Teachers counts are real (computed by the worker sweep, cached in Redis); Exams/Attempts are `0` with a documented reason (those tables don't exist until B11/B13). "Cached, never live-computed" is itself a real B3 finding, not the original plan text — see Implementation notes.
10. ✅ School timezone is stored (already existed since B0/B1) and returned via `GET /v1/school/profile`; per-school timestamp rendering in that timezone is a frontend (F3/F4) concern, unaffected by this phase.

## Exit criteria

- ✅ ADR-0015 and ADR-0016 decided and implemented.
- ✅ Data-preservation test wired (`platform.integration.test.ts`) — not yet wired as a distinct CI merge-blocker job (it runs as part of the ordinary `test:integration` suite, which CI already gates on).
- ⏳ F3 and F4 confirm their contracts — pending those frontend phases; `platform.v1`/`schools.v1`/`subscriptions.v1` are frozen and published in `apps/api/openapi.json`/`@atlas/contracts`.

## Implementation notes (2026-08-27)

**Software Admin authentication** (confirmed in-scope per the roadmap-index cross-reference, not
a silent addition — see the API work table's own note): `PlatformSession` (new, tenant-independent
table, mirroring `PlatformRoleAssignment`'s precedent exactly rather than a nullable-`schoolId`
`Session` row — RLS-protected infrastructure B1 already hardened shouldn't grow a carve-out).
`PlatformSessionService`/`PlatformAuthGuard`/`PlatformAuthService` parallel the identity module's
own `SessionService`/`AuthGuard`/`IdentityService` by convention, not by shared code. `req.user`
widened to a `{kind:'SCHOOL'|...} | {kind:'PLATFORM'|...}` union; `permission.guard.ts`'s
`actorFromAuthenticatedUser` — the exact function both B2's own comment and
`authorization.types.ts`'s doc comment predicted would change — now branches on `kind`. A new
`@AuthorizedPlatform(permissionId)` decorator (mutually exclusive with `@Authorized` by
construction: one guard requires a resolved tenant, the other requires none). The first Software
Admin account is provisioned by an idempotent `packages/db/prisma/seed.ts` addition — dev/ops
bootstrap, not self-service (nothing in any spec describes Software Admin signup). No forced-
password-change gate exists for platform accounts (no `/v1/platform/auth/password/change`
endpoint) — recorded as Candidate/Deferred, not built.

**The access gate is two functions, not one column.** `School.status` (persisted, cached label)
flips to `EXPIRED` exactly when `Subscription.status` does; the live _capability_ a guard actually
enforces is grace-aware and computed fresh every time (`@atlas/domain`'s `resolveAccessGate`) —
`School.status = EXPIRED` and capability `FULL` are simultaneously true throughout ADR-0015's
14-day window. `School.platformOverride` (`SUSPENDED|DEACTIVATED|null`) holds the explicit
Software-Admin action, independent of and taking precedence over the subscription-derived state,
so reactivating a suspended school falls back to whatever the subscription-derived state actually
is rather than unconditionally to `ACTIVE`. `DEACTIVATED` is terminal — no reactivate path out of
it. `reactivate` reuses the `platform.school.activate` permission id (no separate "Reactivate
school" row exists in `02`'s matrix); `deactivate` uses `platform.school.revokeAccess`.

**A real architectural constraint found only while implementing, not in the original plan**: RLS's
`FORCE ROW LEVEL SECURITY` means `atlas_app` cannot see rows across multiple schools in one
unscoped query — `Subscription`/`RoleAssignment` are school-owned. The worker's expiry sweeper and
the platform metrics aggregation therefore iterate every school one at a time via `withTenant`
(`School` itself carries no RLS, so listing school ids first is a single ordinary query), combined
into one per-school pass rather than two separate full scans. Platform metrics are consequently
**cached** (Redis, key/shape shared via `@atlas/domain`'s `PLATFORM_METRICS_CACHE_KEY`/
`PlatformMetricsSnapshot` so the reader and writer processes can't drift) and computed periodically
by the worker, never live per API request — this is _why_ "derived, cached" (already in this
phase's own Background-jobs bullet) turned out to be load-bearing, not just a nice-to-have.

**BullMQ 6 removed `Queue.add`'s `repeat` option** (the plan's original sketch assumed the older
shape) — `scheduleSubscriptionExpirySweep` uses `Queue.upsertJobScheduler` instead, which is
inherently idempotent across process restarts by its own `jobSchedulerId`.

**Activation redemption is one endpoint for both purposes, key possession is the only
authorization check.** `ActivationGrant.purpose` (`INITIAL_ACTIVATION|RENEWAL`, new field — a
mechanical necessity like B1's `User.email`) distinguishes an unauthenticated first-activation
redemption (target `User.status` still `INVITED`, body carries the chosen password) from a
renewal redemption (target user already `ACTIVE`). The original plan sketched an _additional_
"renewal redemption must also be authenticated as School Admin" check; dropped as redundant during
implementation — the key is already single-use and school-scoped (resolved against the
already-resolved tenant, `ActivationGrant` being RLS-protected — see `ActivationService`'s own doc
comment), and commercial dates are only ever changed by Software Admin's issuance, never by
redemption itself. **A real bug this simplification's own testing caught**: re-issuing a key via
`POST .../activation-grants` always sent the renewal-wording email regardless of the grant's actual
`purpose` — a re-issued _initial_ activation key (school still `PROVISIONAL`, original email lost)
told the new admin to "enter it from your subscription screen", which doesn't exist yet. Fixed to
branch on `purpose` and send the matching template — found by `platform.integration.test.ts`
asserting the real console-notification content, not by inspection.

**School identifier = `School.subdomain`.** `07 §4.1` lists a separate `school_code`; ADR-0005 says
the subdomain is "derived from school_code." Rather than add a redundant column, `subdomain` _is_
the generated identifier (slugified from name, collision-suffixed, never a reserved platform
label) — the same equivalence-decision shape as B1's `login_identifier` placement.

Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration
&& pnpm spike`, plus `pnpm generate` (OpenAPI + contracts — three new contracts appear) and
`pnpm generate:permission-table-doc` (139 rows, unchanged — B3 reused existing permission ids
throughout, adding none). Live-verified beyond the automated suite: a full `node dist/main.js` /
`node dist/main.js` (worker) walk — platform login, school creation, cross-school activation
rejection, redemption, School-Admin login, profile read/write, subscription status, suspend/
reactivate/deactivate (including the access-gate blocking a fresh login attempt and an existing
session identically), and the worker sweeper's repeatable job firing and writing a real metrics
snapshot the API then served. All verification schools/sessions were cleaned up afterward.

## Deferred items

- Payment gateway and billing automation (`01 §53` — future expansion). Subscriptions are administratively managed.
- Per-school resource limits (`01 §3` mentions "configure school limits if necessary") — not specified anywhere; record as a candidate.
- **Moderator activation-key redemption delegation** — `subscription.enterActivationKey`'s permission-table row still carries B2's `deferred()` grade for Moderator; no delegation mechanism is specified anywhere (that's `ADR-0017` HOD-request-subsystem territory). School Admin only, for now.
- **Subscription-level (as opposed to school-level) suspend/cancel as an independent commercial action** — `SubscriptionStatus.SUSPENDED`/`CANCELLED` exist in the schema enum to match `07 §4.2` exactly, but no B3 endpoint ever sets them; `@atlas/domain`'s `resolveAccessGate` defends against them defensively (collapsing to the same restricted `EXPIRED` label), ready for the phase that adds a real trigger.
- **Self-service Software Admin password change** — no `/v1/platform/auth/password/change` endpoint; the seeded account ships with a directly-usable password (dev/ops bootstrap), not a forced-change one. Same shape of gap as F2's already-recorded School-side self-service password-change omission.
- A distinct CI job specifically gating merges on the data-preservation test (DoD item 6) — it runs today as part of the ordinary `test:integration` suite, which CI already requires to pass; a dedicated named job is a documentation/CI-config nicety, not a missing guarantee.
- **The generated cross-tenant test-suite generator** (B2's own deferral, expected to land here per `roadmap-index.md`'s Immediate Next Actions) — still not built. B3 has several real `:id`-shaped endpoints now (`GET/POST /v1/platform/schools/:id/...`) that could drive one, but this phase proved cross-school isolation the same two ways B2 did instead (specific integration tests — the cross-school activation-key rejection case — plus the extended RLS suite covering `Subscription`/`ActivationGrant`), not via a generator. Pushed forward again, not silently dropped; `B5` or later is the next candidate.

## Post-completion gap closure (2026-08-27, via F3)

F3's own change-log entry has the full detail; recorded here per the same convention B0's
2026-08-25 gap-closure entry established. Both are small, additive reads over already-stored data —
no schema migration, no business-rule change, zero new permission ids — found by F3 building a real
consumer against this phase's own already-approved Scope bullet ("renewal history").

- `GET /v1/platform/schools/:id/activation-grants` — this phase's Scope text named "renewal
  history" as in scope, and `05 §4.1`/`04 §8` call for it on the Subscription screen, but no
  endpoint ever listed `ActivationGrant` rows (only issuance existed). Added by F3, gated by the
  same `platform.school.viewAll` permission `detail()` already uses.
- `SchoolListItemDto` gained `subscriptionStatus`/`subscriptionExpiresAt`, and
  `SchoolSubscriptionSummaryDto.status` gained its missing OpenAPI `enum:` (a real DTO-accuracy
  gap `tsc` caught in `apps/web`, not a runtime bug). Needed for `05 §2.1`'s "schools requiring
  attention" and the `04 §5` "Subscriptions" nav entry, neither of which had a data source before.

`pnpm generate` and `pnpm generate:permission-table-doc` were re-run (139 rows, confirmed
unchanged); `platform.integration.test.ts` gained two cases proving the new endpoint's real shape.

### 2026-08-27 — Second gap closure: pagination on `GET /platform/schools` (via F3, post-`B4`)

`frontend-roadmap.md`'s F3 section had flagged pagination on the Schools list as a deliberately
scoped-down partial DoD item ("fine at admin-scale school counts"). Closed at the project owner's
request. `GET /v1/platform/schools` gained `q`/`page`/`pageSize`/`sortBy`/`sortDir` — a new
`ListSchoolsQueryDto` (the first whole-object `@Query()` DTO in the codebase), validated the same
way `CreateSchoolDto` already is. Search/status-filter/sort all moved server-side alongside
pagination, not just pagination alone: once the endpoint returns one page instead of the full list,
client-side search/sort would otherwise have silently started operating on just that page — a real
regression the fix deliberately avoided rather than introduced. `SchoolsAdminService.list()` now
does `prisma.$transaction([findMany, count])` with `skip`/`take`, and the `studentCount`/
`currentSubscription` enrichment fan-out only runs over the current page's rows, not the whole
table — a genuine efficiency improvement alongside the shape change. `SchoolListResponseDto` gained
`total`/`page`/`pageSize`. No permission-table change — `platform.school.viewAll` already governs
the resource regardless of query params.

**Scope decision, made and documented rather than asked (engineering-shaped, not product policy):**
sorting by **Student count** is dropped. It isn't a `School` column — it's a per-school count of
`RoleAssignment` rows, and `RoleAssignment` carries `FORCE ROW LEVEL SECURITY` (ADR-0023). A single
cross-school query ordering by it before pagination isn't available without bypassing tenant
isolation — the identical constraint this phase's own worker jobs already document (subscription-
expiry sweep, platform metrics). The column stays visible; it just isn't a sort key.

**A real bug found only by this gap closure's own integration tests, not by inspection, and not
caught by any test in `B0`–`B4`:** the global `ValidationPipe` was registered only in `main.ts`'s
imperative `bootstrap()`, never as an `APP_PIPE` in `AppModule` — the exact same class of gap `B1`
already found and fixed for `HttpExceptionFilter`. Every integration test in the entire suite boots
`AppModule` directly via `NestFactory.create()`, bypassing `main.ts` entirely, so **no `@Body()` or
`@Query()` DTO had ever actually been validated or transformed by any integration test in this
codebase** — invisible until a test finally asserted DTO-level behaviour that only holds if
validation runs (an out-of-allow-list `sortBy` value should 400, not reach Prisma's `orderBy` and
500; a query-string `"1"` should transform to the number `1` via `@Type(() => Number)`). Fixed at
the source, mirroring `HttpExceptionFilter`'s own precedent exactly: `ValidationPipe` is now an
`APP_PIPE` provider in `app.module.ts`, and `main.ts` no longer registers it separately (the same
double-handling risk that comment already names). The full `apps/api` unit and integration suites,
`apps/web`'s suite, and the cross-cutting `tests/` suite were all re-run afterward specifically to
confirm real validation now actually applying across every existing endpoint changed nothing else —
it didn't; every prior test was already sending well-formed input.

`platform.integration.test.ts` gained a new `describe` block (4 cases: search + total count,
page/pageSize slicing with `sortBy`/`sortDir`, an out-of-range page returning an empty page rather
than an error, and the invalid-`sortBy` 400 case that caught the `ValidationPipe` bug above).
`apps/web`'s `useSchools` hook and its three call sites (`schools/page.tsx`, the platform dashboard,
`/admin/subscriptions`) were updated; the latter two now request `pageSize: 100` in one request
rather than building pager UI they don't need, preserving their existing "small attention list, no
pager" behaviour instead of silently truncating to the new 25-row default. `pnpm generate` was
re-run (three new query params, three new response fields); no permission-table change.

### 2026-08-28 — Third gap closure: onboarding-completion tracking + activation redeem's login identifier (via F4)

F4 (School Onboarding Wizard) surfaced two gaps in this phase's own scope while building a real
consumer against it — both confirmed with the project owner before implementation, both small and
additive, no product-behaviour change beyond what F4 itself needed.

**Onboarding-completion tracking, genuinely absent until now.** F4's resumability requirement
("wizard progress persisted server-side") and its re-entry-blocked security requirement ("a
completed school cannot re-enter onboarding") had no backing anywhere — `School` carried no
onboarding-completion concept, and no endpoint reported one. `School` gained two columns:
`onboardingCompletedAt` (`DateTime?`) and `onboardingState` (`Json?`, `{currentStep, skippedSteps}`
— UI-progress only, never consulted for business-rule enforcement, which is always recomputed live
from `AcademicSession`/`ClassGroup` state, the same "don't cache a derivable truth" discipline this
phase's own `PlatformMetricsSnapshot` and B3's access-gate already follow). New
`apps/api/src/modules/platform/school-onboarding.{controller,service}.ts`: `GET/PUT
/school/onboarding(/progress)`, `POST /school/onboarding/complete` — the latter reuses
`AcademicsContextService.get()` and `ClassGroupService.list()` (both already existed from `B5`)
rather than duplicating queries, is idempotent on a second call, and is the real server-side
enforcement of `05 §5.2`'s "no current session, no class" blockers (`ONBOARDING_FUNDAMENTALS_MISSING` 409) and the re-entry-blocked rule (`ONBOARDING_ALREADY_COMPLETE` 409 from the progress-PUT once
completed) — never trusted from F4's own client-side check alone. New permission row
`schoolConfig.onboarding.manage` (School Admin only) — 148→149 rows.

**Activation redemption never surfaced the new admin's login identifier.** Found only during
implementation verification, not anticipated in the original plan: `POST /activation/redeem`
returned `Promise<void>`; the `SchoolMembership.loginIdentifier` set at school-creation time
(`CreateSchoolDto.adminLoginIdentifier`, `schools-admin.service.ts`) was never surfaced back to the
admin anywhere — not the redeem response, not the activation email template — leaving F4's
`/activate` redeem-then-log-in handoff with nothing to log in with. Fixed by extending `redeem()`
to return `ActivationRedeemResponseDto {status, loginIdentifier}`. Security note recorded explicitly
at the time: this discloses a username (not a secret) only to a caller who already possesses a
valid, unexpired, unredeemed activation key for that school — no new disclosure risk beyond what key
possession already implies, the same reasoning `ActivationService` already uses for renewal's
no-extra-session-check design.

`pnpm generate` and `pnpm generate:permission-table-doc` re-run (149 rows). New
`school-onboarding.integration.test.ts` (default shape, PUT round-trip, both 409s, successful
completion with its audit event, idempotent re-completion, non-SCHOOL_ADMIN 403 on all three
routes). No schema change beyond the two additive `School` columns; no existing business rule
altered.

---

# B4 — Media, Storage & Branding

**Status:** COMPLETE (2026-08-27) · **Decided ADRs:** 0021 (offline media delivery)

## Objective

Deliver tenant-isolated object storage and the school branding system, including the media-access model the offline exam client depends on.

## Scope

- `MediaAsset` (`07 §11.3`) with school-namespaced storage paths (`09 §22`).
- Upload pipeline: validation, type and size limits, virus/content checks, dimension checks for logos.
- Private-by-default access with short-lived signed URLs; logo may be cacheable.
- **Offline media strategy per `ADR-0021`** (resolves `R-06`, `X-10`): question media is downloaded and cached into the client at attempt start, so signed URLs need only outlive the initial download.
- Branding: logo, primary colour, derived palette generation, theme preview payload (`03 §5`).
- Media immutability: assets referenced by a submitted revision are never overwritten (`D-13`).

## Specification references

`03 §5` · `05 §6` · `06 §65` · `07 §11.3`, `§7.4` · `08 §15` · `09 §22`–`§23`, `§34` · `01 §47`

## Dependencies

**Depends on:** B0, B2, B3.
**Depended on by:** B8 (question media), B13 (offline media). F5 pairs with this phase.

## Domains / modules affected

`MediaModule` (new, top-level — shared infrastructure, not nested under `QuestionsModule`; see
Implementation notes). Branding lives in the existing `platform` module (`SchoolBrandingController`/
`SchoolBrandingService`, sibling to `SchoolProfileController`) rather than a separate `SchoolsModule`
— no such module exists in this codebase; school-facing self-service already lives under `platform`.

## API work

| Endpoint                                                   | Purpose                                                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `POST /v1/media/uploads`                                   | Request upload target for question image/diagram/other, validated and school-scoped             |
| `POST /v1/media/uploads/:id/complete`                      | Finalise and register the asset (content-sniffed, dimension-checked)                            |
| `GET /v1/media/:id/url`                                    | Short-lived signed access URL (non-logo assets)                                                 |
| `POST /v1/school/branding/logo/upload-target`              | Logo-specific upload-target request (own permission: `schoolConfig.logo.upload`)                |
| `POST /v1/school/branding/logo/upload-target/:id/complete` | Logo-specific completion                                                                        |
| `PUT /v1/school/branding`                                  | Logo + primary colour — freely editable (A-18), audited                                         |
| `GET /v1/school/branding`                                  | Branding + derived palette (also served unauthenticated by `GET /v1/tenant/resolve` from B1)    |
| `GET /v1/platform/metrics/media/orphan-report`             | Software-Admin-only orphan-media report (report only, never deletes) — not in the original plan |

## Database work

- `MediaAsset` with `school_id`, type, storage reference, mime, size, uploader.
- Content-addressed or id-bearing storage keys so no key is ever overwritten (`D-13`).
- Branding columns on `School`; derived palette computed, not stored, unless caching proves necessary.

## Background jobs

- Post-upload processing: image validation, optional resizing for logos.
- Orphan-media reporting (cleanup deferred to `M-14`'s retention policy — report only, delete nothing).

## Security / authorization work

- Storage paths always include the school namespace (`08 §8`, `09 §22`).
- **Question media is never publicly addressable** (`09 §34`) — enforced by bucket policy, not only by application logic.
- Signed URLs are short-lived, single-purpose, and scoped to the requesting user's authorization.
- Upload validation rejects by content sniffing, not by extension.
- A cross-school media request returns 404.

## Testing requirements

| Level       | Requirement                                                                                                         |
| ----------- | ------------------------------------------------------------------------------------------------------------------- |
| Unit        | Palette derivation; colour validation; path construction                                                            |
| Integration | Upload → register → signed URL → fetch                                                                              |
| Security    | Cross-school media fetch denied; signed URL expiry enforced; direct bucket access denied; malicious upload rejected |
| Integrity   | An asset referenced by a submitted revision cannot be overwritten                                                   |

## Frontend dependencies

**F5 consumes `GET/PUT /v1/school/branding`** and the theme-preview payload for the branding screen (`05 §6.1`). **F13 depends on the `ADR-0021` media caching contract** — the attempt package must carry everything needed for offline rendering.

## Integration dependencies

B13 depends on the offline media decision. If `ADR-0021` is unresolved when B13 starts, B13 is blocked — media-bearing questions are common in Nigerian papers (`01 §43`), so this cannot be worked around.

## Definition of Done

1. ✅ A logo uploads, validates, stores under the school namespace, and renders on the branded login — `TenantBrandLine` (apps/web) now renders a real `<img>` from `GET /v1/tenant/resolve`'s `logoUrl`, closing the exact seam F1 flagged for this phase.
2. ✅ Primary colour saves and produces a full derived palette; `GET /v1/school/branding` returns it precomputed for the admin-facing preview. F5's actual branding _settings_ screen (upload UI, colour picker, "Preview School Theme" step) is separate, later scope — this phase ships the contract and the read-side rendering, not the authoring UI.
3. ✅ Question media uploads privately and is retrievable only through an authorized signed URL — proven end to end against real MinIO (`media.integration.test.ts`).
4. ✅ Direct public access to a question-media object is denied at the bucket level, proven by test — a raw, unsigned GET against the actual bucket object URL returns 403 (MinIO's real default-deny, not mocked). Real AWS S3 Block-Public-Access/IAM provisioning is `B23`'s job (infra/IaC) — see Deferred items.
5. ✅ A cross-school media request returns 404, even by primary key — RLS itself is the mechanism (`withTenant` returns `null` for another school's row), not an application-level ownership check; see Implementation notes for the correction this made to the original plan's assumption about `AuthorizationService`.
6. ✅ Signed URLs expire and are rejected after expiry — enforced by S3/MinIO's own signature verification (15 min for question media, 24h for the logo embedded in the public `tenant/resolve` response per ADR-0021's "logo may be cacheable" allowance).
7. ✅ Oversized, wrong-type, and content-mismatched uploads are rejected with clear, specific error codes (`MEDIA_TOO_LARGE`, `MEDIA_CONTENT_TYPE_MISMATCH`, `MEDIA_DIMENSIONS_INVALID`) — content-type is sniffed from real bytes (`file-type`), never trusted from the client's declared MIME type or filename extension.
8. ⚠️ **Structurally, not behaviourally, proven.** There is no update-in-place endpoint or service method for `MediaAsset` anywhere in the API surface — every mutation is a brand-new row plus, for logos, a pointer swap (`School.logoMediaId` reassigned). This satisfies D-13 today by construction. It cannot be proven _against a real `QuestionRevision`_ until `B8` exists — there is no revision to attempt to violate this against yet. Recorded honestly, not silently claimed as fully proven.
9. ⚠️ **Narrower than the DoD text implies, honestly.** No historical-record-bearing entity references branding yet (`Result`/attempt records don't exist until much later phases). What's actually proven: changing branding touches only `School.logoMediaId`/`primaryColor`, nothing else, and is independently audited (`SCHOOL_BRANDING_CHANGED`) — `school-branding.integration.test.ts` asserts exactly two audit rows for two changes. Full proof (a historical record retaining the branding active at the time it was created) waits for a phase that introduces such a record — likely `B15`/`B18`.
10. ✅ The offline media contract (ADR-0021: cache media into the client at attempt start; signed URLs only need to outlive that download) is documented in the ADR itself. F13 hasn't started yet, so its own confirmation is pending — this DoD item's second half moves with F13, not silently claimed done.

## Exit criteria

- ✅ ADR-0021 decided (already Accepted before this phase started); the attempt-package media contract is documented there for B13 to consume.
- ⚠️ Bucket policy verified in a real environment — **locally/in-CI only**, against real MinIO. Real AWS S3 Block-Public-Access/IAM provisioning is `B23`'s job (infra/IaC), matching `docker-compose.yml`'s own header comment that production provisioning is deferred there. This gap cannot be closed by B4 alone.

## Implementation notes (2026-08-27)

**Resolved audit finding A-18** (the self-contradictory "Full / One-time" permission-matrix cell
for School Admin's primary-colour capability) — confirmed with the project owner: **freely
editable**, not a one-time lock, matching `05 §6.1` and the audit's own recommendation. Every
branding change (logo or colour) is audited via the existing `AuditService.record(...)` convention
(`action: 'SCHOOL_BRANDING_CHANGED'`), not just the first one.

**A required architectural refactor, not optional polish**: `apps/web/lib/theme/derive-palette.ts`
(F0's OKLCH, WCAG-AA-guaranteeing palette derivation engine) moved verbatim into
`packages/domain/src/branding/derive-palette.ts` so the API can compute the identical palette
server-side (`GET /v1/school/branding`) without a second, independently-drifting implementation.
`apps/web`'s copy is now a one-line re-export; `culori` became `@atlas/domain`'s first-ever runtime
dependency (a clean fit — pure TS/JS, no framework coupling). The exhaustive 8-sample-colour test
suite moved with the implementation; `apps/web` keeps a smoke test proving the re-export wiring.

**Module placement**: a new top-level `MediaModule` (not nested under `QuestionsModule`, which is
still an empty B8-reserved stub) owns the generic, type-polymorphic upload/validate/sign pipeline —
shared infrastructure Branding (this phase) and, later, Questions (`B8`) both consume, the same
shape of decision as `OperationsModule` owning cross-cutting Audit. Logo upload/attach deliberately
does **not** go through `MediaController`'s generic endpoints — one route can't cleanly enforce two
different permission rows (`schoolConfig.logo.upload` for `SCHOOL_LOGO` vs `media.upload` for
everything else) depending on request-body content under this codebase's `@Authorized(single-id)`
decorator model, so `school-branding.controller.ts` (the `platform` module) exposes its own small
logo upload-target/complete pair instead, both delegating into the same `MediaService` internals.

**A real cross-module circular-dependency bug, found only by a real compiled boot** (`node
dist/main.js`), not `tsc`/`tsx`/Vitest — this project's now-standing class of gotcha (see B1/B2's
own identical discoveries). `storage.module.ts`'s factory provider and `object-storage.service.ts`
both needed the `S3_CLIENT` DI symbol; defining it in either file and importing it into the other
created a circular ESM import that left the second-evaluated module with an uninitialised binding
at class-definition time (`@Inject` runs immediately, not lazily) — crashing with "Cannot access
'S3_CLIENT' before initialization" only under a real `node` boot, invisible to every other tooling.
Fixed by extracting the symbol into its own `storage.tokens.ts` file both import from. The identical
class of problem shaped `resolveLogoSignedUrl` (`apps/api/src/storage/logo-resolver.ts`): `GET
/v1/tenant/resolve` (`IdentityModule`) needs to resolve a school's logo to a signed URL, but
`MediaModule`'s own controllers need `AuthGuard` (`IdentityModule`) for authorization — importing
`MediaModule` into `IdentityModule` would create a real module cycle. `IdentityController` instead
injects `ObjectStorageService` directly (the `@Global()` `StorageModule` needs no explicit import)
and calls this shared helper function, mirroring `AccessGateModule`'s own B3-era precedent for the
identical class of problem.

**`AuthorizationService.evaluate()`'s resource/tenant-context parameter is dead code in practice —
a correction to this phase's own planning assumption, not a new finding about the engine itself.**
It is never populated by the existing `@Authorized`/`@AuthorizedPlatform` decorator flow (confirmed
by reading `permission.guard.ts`: it calls `evaluate(actor, permissionId)` with no third argument,
and no call site anywhere passes one). The actual cross-school-404 mechanism for `.../complete` and
`GET /v1/media/:id/url` is **RLS itself**: `withTenant` returns `null` for another school's row,
which the service turns into a 404. Correct and sufficient (defense-in-depth per ADR-0023), just
worth recording accurately rather than attributing to the wrong layer.

**Local/CI object storage is MinIO** (S3-compatible, self-hosted), a new `docker-compose.yml`
service mirroring the existing postgres/redis pattern exactly (pinned image tag, named volume,
healthcheck). The running api/worker never provision the bucket via compose — `ObjectStorageService
.ensureBucket()` does it idempotently at boot, the same mechanism that has to work identically in
CI service containers, which (per B0's own precedent) can't run custom init scripts.

**Real virus/malware scanning is explicitly out of scope**, confirmed before implementation —
recorded as Candidate/Deferred below, not silently skipped. Content validation is real magic-byte
sniffing (`file-type`) + size/dimension checks (`image-size`, reading only the image header, never
decoding pixel data) — genuine content-sniffing, just not malware detection. SVG is excluded from
every allow-list on purpose: it can embed scripts and can't be reliably magic-byte-sniffed (it's
text, not a fixed binary signature), which would defeat "reject by content sniffing, not extension"
outright.

**Two real bugs found only by writing and running the integration tests, not by inspection** — both
in the tests' own shared HTTP helper, not the product:

1. The `post()` test helper unconditionally set `Content-Type: application/json` even for bodyless
   POST calls (e.g. `.../complete`, which takes no body). Fastify's default JSON body parser throws
   on that combination (`Content-Type: application/json` with zero bytes), surfacing as a generic
   framework `400 VALIDATION_ERROR` with empty `details` — indistinguishable, without printing the
   raw body, from a real product bug. Fixed by only setting the header when an actual payload is
   given. This was masking every one of `media.integration.test.ts`'s `.../complete` assertions,
   including the happy path.
2. A test fixture bug in the same file: a hand-picked `declaredSizeBytes` for a "reject by content
   sniffing" case didn't match the real byte length of the buffer being uploaded — since
   `Content-Length` is a _signed_ header on the presigned PUT, the mismatch made the PUT itself fail
   signature verification, so the object never landed and `complete()` correctly (but misleadingly)
   reported `MEDIA_UPLOAD_NOT_RECEIVED` instead of exercising the content-mismatch rejection the
   test was actually for. Fixed by deriving the declared size from the real buffer.

**Orphan-media reporting** (`apps/worker`) reuses `PlatformMetricsSnapshot`'s exact Redis-cached,
worker-computed, "honest zeros on a missing snapshot" convention (`OrphanMediaReportSnapshot`,
`@atlas/domain`), read via a new `GET /v1/platform/metrics/media/orphan-report`
(`platform.media.viewOrphanReport`, Software-Admin-only). It classifies only what's actually
checkable today: expired-and-abandoned `PENDING` uploads (any type), and `READY` `SCHOOL_LOGO`
assets no school's `logoMediaId` points to anymore. `READY` question-media assets are deliberately
**not** classified as orphaned or not — nothing references them until `B8` (`Question`/
`QuestionMedia` don't exist yet), so calling them all orphaned would be noise, not signal. Counted
instead under an explicit `uncheckedReadyCount` so the report is honest about its own coverage gap
rather than silently overstating it. The optional post-upload logo-resize job sketched in the
original plan was not built — the synchronous `complete()` validation already guarantees a valid,
correctly-dimensioned image is `READY` and servable without it, and no DoD item needs it.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm test:integration && pnpm spike`, plus `pnpm generate` (three DTOs/endpoints newly
published in `apps/api/openapi.json`/`@atlas/contracts`: the media pipeline, school branding, and
`tenant/resolve`'s extension) and `pnpm generate:permission-table-doc` (143 rows, up from 139 — one
new section, `Media`, three new rows, plus the two pre-graded branding rows' `awaitingResource`
flags cleared now that the columns exist). Live-verified beyond the automated suite: a real `node
dist/main.js` boot (the exact class of check that caught the `S3_CLIENT` bug) confirmed all 37
routes pass `PolicyCoverageService`'s startup assertion, including every new `MediaController`/
`SchoolBrandingController` route. A `docker compose up -d --build api worker` rebuild against the
real MinIO/Postgres/Redis containers hit unrelated npm-registry flakiness in this environment and
was not completed as a second confirmation — the native `node dist/main.js` boot plus the full
integration suite (which already exercises real MinIO, not a mock) is the verification of record
for this phase.

## Deferred items

- CDN tuning and edge caching (moves to B21/B23).
- Rich media beyond images — video, audio (not in scope per `05 §15.2`).
- **Real virus/malware scanning** (ClamAV or equivalent) — confirmed out of scope before
  implementation. Content-mismatch rejection (magic-byte sniffing) is not equivalent to
  malware-free; record as a candidate for a future security-hardening phase.
- **Real AWS S3 bucket-policy/IAM provisioning** — this phase proves MinIO's default-private
  behaviour locally/in-CI only, per the Exit criteria note above. `B23`'s job.
- **Post-upload logo resize/re-encode job** — sketched in the original plan as optional; not built,
  since no DoD item needs it and the synchronous validation path already guarantees a servable
  image.
- **Real per-subject/class (`ASSIGNED`) Teacher scoping for `media.upload`** — `SCHOOL` scope is a
  temporary widening (flagged inline in the permission table) until `B8` gives `Question`/`Subject`/
  `ClassGroup` a real resource to scope against, mirroring B2's own `ASSIGNED`/`DEPARTMENT`
  placeholder precedent.
- **F5's branding settings/authoring screen** (upload UI, colour picker, "Preview School Theme"
  step per `03 §5`) — this phase ships the backend contract and the read-side login-page rendering
  (DoD item 1) only, per the frontend/backend phase-pairing policy's normal division of labour.

---

# B5 — Academic Structure

**Status:** COMPLETE · **Decided ADRs:** 0001 (subject↔department, question level), 0011 (student subject registration), 0013 (exam↔multiple classes)

## Objective

Deliver the school's academic hierarchy — sessions, terms, departments, classes, subjects, and offerings — as the historical, session-scoped backbone every downstream phase depends on.

## Scope

- `AcademicSession`, `AcademicTerm`, `Department`, `ClassGroup`, `Subject`, `ClassSubject` (`07 §6.1`–`§6.6`).
- `Subject.department_id` per `ADR-0001` (resolves `C-04`, `M-01`, `D-02`).
- Session-scoped class identity: `SS2A 2026/27` ≠ `SS2A 2027/28` (`07 §6.4`).
- Single-`CURRENT`-session invariant enforced in the database (`07 §6.1`).
- `HODAssignment` referencing `membership_id` (resolves `D-11`).
- Archival semantics: deactivate, never delete, when history exists (`07 §40`).
- Redundant session-column integrity via composite FKs (resolves `D-10`).

## Specification references

`03 §6`–`§9` · `05 §7.1`–`§7.5` · `06 §14`–`§19`, `§23` · `07 §6.1`–`§6.6`, `§6.9` · `07 §42` invariant 2 · `04 §14`

## Dependencies

**Depends on:** B0, B2, B3.
**Depended on by:** B6, B8, B9, B11, B19. F6 pairs with this phase.

## Domains / modules affected

`AcademicsModule`.

## API work

**Contract: `academics.v1`.** Full CRUD-with-archival for sessions, terms, departments, classes, subjects, and class-subject offerings, plus:

| Endpoint                                   | Purpose                                                     |
| ------------------------------------------ | ----------------------------------------------------------- |
| `POST /v1/academics/sessions/:id/activate` | Make current, enforcing the single-current invariant        |
| `GET /v1/academics/context`                | Current school + session + term (`04 §66` context switcher) |
| `GET /v1/academics/classes/:id/subjects`   | Offerings for a class                                       |
| `POST /v1/academics/terms/:id/activate`    | Roadmap-unnamed addition — see Implementation notes         |

## Database work

- All six entities with session scoping and `school_id` leading indexes.
- **Partial unique index enforcing one `CURRENT` session per school** — the invariant must be structural, not application-level.
- Unique class identity within (school, session).
- Composite FKs so `ClassSubject.academic_session_id` cannot disagree with its `ClassGroup`'s.
- `Subject.department_id` nullable per `ADR-0001`.
- Archival columns; deletion blocked where dependent history exists.

## Background jobs

None. Rollover automation is B19.

## Security / authorization work

- School Admin and Moderator manage structure; HOD reads; Teacher reads their scope; Student reads own context only (`02`).
- Every mutation is school-scoped and audited.
- Deactivation of a department, subject, or class with dependent records must not break historical exams (`05 §7.3`–`§7.5`) — enforced by test.

## Testing requirements

| Level          | Requirement                                                                                                                                    |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | Session state machine; uniqueness rules                                                                                                        |
| Integration    | Full structure creation; activation switching; archival with dependents                                                                        |
| Security       | Cross-tenant structure access denied; teacher cannot mutate structure                                                                          |
| Data integrity | Two concurrent `CURRENT` activations — one must fail at the database level; deactivating a subject leaves historical exams intact and readable |

## Frontend dependencies

**F6 consumes `academics.v1`.** **F2 consumes `GET /v1/academics/context`** for the session context switcher (`04 §66`), which prevents the dangerous "working in the wrong session" error.

## Integration dependencies

`ADR-0001` gates B8 and B9 as well as this phase. `ADR-0011` gates B6. `ADR-0013` gates B11. All three should be decided together, since they concern the same scope model.

## Definition of Done

1. ✅ A full academic structure can be created: session, terms, departments, classes, subjects, offerings.
2. ✅ Exactly one session is `CURRENT`; a concurrent activation attempt fails at the database, not merely in application code.
3. ✅ `SS2A` in two sessions are distinct entities with distinct enrollments.
4. ✅ A deactivated department, subject, or class remains attached to historical records, which stay readable — proven within B5's own boundary (no exam/enrollment history exists yet to fully close the claim; B8/B11 complete it).
5. ✅ Destructive deletion is refused where history exists, with a clear error (`ACADEMIC_STRUCTURE_HAS_DEPENDENTS`).
6. ✅ `Subject.department_id` resolves an HOD's subject scope — proven directly against the real `DEPARTMENT` resolver (no B9 controller exists yet to exercise it through HTTP, which is expected; see Implementation notes).
7. ✅ Redundant session columns cannot diverge from their parents (`ClassSubject`'s composite FK against `ClassGroup(schoolId, id, academicSessionId)`).
8. ✅ `HODAssignment` references `membership_id` and rejects a membership lacking an active HOD role.
9. ✅ Cross-tenant reads and writes are denied.
10. ✅ `GET /v1/academics/context` returns the correct school/session/term for every role.

## Exit criteria

- ✅ ADR-0001, ADR-0011, ADR-0013 decided and reflected in the schema.
- ⏸ F6 confirms the contract; F2 confirms the context endpoint — **not yet**: this phase was built backend-only, ahead of `F5`, at explicit project-owner instruction (see `CLAUDE.md`'s B5 Change Log entry). `academics.v1` is frozen and published; F2's context-switcher already has the exact "not yet available" placeholder this phase's `GET /v1/academics/context` fills, and F6 is the natural next frontend phase to wire both.

## Implementation notes

- **`Topic` documentation inconsistency, not a schema decision**: ADR-0001's own "Required changes" list names `Topic` under B5, but this phase's own Scope section above (and B8's) both independently place it in B8. B5 does not build `Topic` — see `CLAUDE.md`'s B5 Change Log entry for the full note.
- **`ClassGroup.level`** is the confirmed fixed platform-wide `ClassLevel` enum (`JSS1`/`JSS2`/`JSS3`/`SS1`/`SS2`/`SS3`), not a per-school configurable list — confirmed with the project owner during planning, matching this codebase's existing controlled-vocabulary convention (`Role`, `SchoolStatus`, …) and ADR-0001's requirement that the value be load-bearing for B8/B9/B11.
- **`POST /v1/academics/terms/:id/activate`** is a roadmap-unnamed addition: `GET /v1/academics/context`'s "current term" can never become non-null without it (DoD item 10 would otherwise be unsatisfiable). Mirrors the session-activation endpoint's exact transaction shape, scoped to `(school, session)` instead of `(school)`.
- **Concurrency safety (DoD item 2) uses plain READ COMMITTED, not `SERIALIZABLE`.** The original plan called for explicit `SERIALIZABLE` isolation; implementation found this unnecessary — the partial unique index (`academic_sessions_one_current_per_school`) plus ordinary Postgres row-locking (two activations racing to close the same previously-current row serialize on that row's lock; two activations racing with no shared row yet still serialize via Postgres's own uncommitted-unique-index-entry wait) already guarantee exactly one winner and one clean rejection. Proven by a dedicated test (`session-activation-concurrency.integration.test.ts`) using a deliberate `pg_sleep` to force the exact interleaving, rather than relying on incidental HTTP-request timing.
- **DEPARTMENT scope resolver** (`department-scope.resolver.ts`) closes B2's fail-closed placeholder. No B5 endpoint itself uses `DEPARTMENT` scope (all of B5's own permission rows are `SCHOOL`/denied), so the resolver is proven directly by a dedicated test rather than through a live HTTP route — `PermissionGuard` never constructs a `ResourceContext` today, so the resolver becomes reachable through a real endpoint only once a later phase (B9) explicitly calls `AuthorizationService.evaluate()` with one.
- **Every unique-constraint violation is guarded**, not just the activation race: `runUniqueGuarded()` (`prisma-error.util.ts`) translates a raw Postgres unique violation into a clean `CONFLICT` on every create/update touching a `@@unique` (class identity, department/subject codes, term sequence, a subject offered twice to one class) — found by this phase's own integration tests (the duplicate-class-identity test originally surfaced as an unhandled 500), not by inspection.
- **`packages/db` gained its first runtime (not type-only) export of `Prisma`** (`export { Prisma } from './client.js'`) — B5 is the first phase needing to catch a specific `PrismaClientKnownRequestError` at runtime; the package previously only forwarded `Prisma` as a type.
- **A real bug in the test-authoring pattern, not the product**: the shared `post()` HTTP test helper (copied from `platform.integration.test.ts`'s own precedent) unconditionally set `Content-Type: application/json` even for bodyless POST calls — the exact class of bug `CLAUDE.md`'s B4 entry already documented once. B5's own action endpoints (activate/archive/deactivate/end) are bodyless POSTs, so this reproduced the identical failure (a generic 400 indistinguishable from a real bug) until fixed in this phase's own test file; `platform.integration.test.ts` itself was never affected only because none of its POST calls happen to be bodyless.

## Deferred items

- Session rollover automation → B19.
- Multi-department subjects (a `DepartmentSubject` join) unless `ADR-0001` selects it — not selected, stays out of scope entirely.
- `StudentEnrollment`'s own dependent-check on `ClassGroup` deletion — ~~B6 must extend~~ **closed by B6**: `ClassGroupService.delete()`'s dependent check now also counts `StudentEnrollment` rows (see B6's own Implementation notes).
- `AcademicTerm`'s own dependent-check on deletion — no B5 table references a term yet; a later phase (B11+) that adds one must extend `TermService.delete()`.
- F6 (Academic Structure Workspace) and the F2 context-switcher gap-closure — not built in this phase (backend-only per explicit instruction); natural next step per the frontend/backend pairing default.

---

# B6 — People, Profiles & Enrollment

**Status:** COMPLETE · **Decided ADRs:** 0011, 0017

## Objective

Deliver school-side people management and the assignment entities that the authorization engine resolves scope from — with academic placement recorded historically, never overwritten.

## Scope

- Student, teacher, HOD, and moderator management (create, edit, deactivate, reactivate, reset credentials).
- `StudentEnrollment` (`07 §6.7`) — per-session placement, never a mutable `current_class`.
- `TeacherAssignment` (`07 §6.8`) — the core authorization entity.
- `HODAssignment` activation and reassignment.
- Class movement preserving the original enrollment (`07 §35`).
- `StudentSubjectRegistration` per `ADR-0011` (resolves `M-02`) if approved.
- Student lifecycle `INVITED → ACTIVE → SUSPENDED → INACTIVE → GRADUATED → ARCHIVED` on the profile, per `C-14`'s split.
- Departure handling: deactivate, preserve authorship and history (`03 §68`–`§70`).

## Specification references

`03 §11`–`§17`, `§58`, `§68`–`§70` · `05 §9`, `§11`–`§14` · `06 §20`–`§23` · `07 §6.7`–`§6.9` · `02` (User Management, Assignments) · `04 §22`–`§25`

## Dependencies

**Depends on:** B1, B2, B5.
**Depended on by:** B7, B8, B11, B12, B16, B19. F7 pairs with this phase.

## Domains / modules affected

`UsersModule`, `AssignmentsModule`, extending `IdentityModule`.

## API work

**Contract: `people.v1`.**

| Endpoint                                                                  | Purpose                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------ |
| `GET/POST /v1/students`, `GET/PATCH /v1/students/:id`                     | Student directory and profile (`05 §9.1`–`§9.2`) |
| `POST /v1/students/:id/enrollments`                                       | Enroll or move class, preserving history         |
| `POST /v1/students/:id/deactivate` · `/reactivate` · `/reset-credentials` | Lifecycle                                        |
| `GET/POST /v1/teachers`, `PATCH /v1/teachers/:id`                         | Teacher directory                                |
| `PUT /v1/teachers/:id/assignments`                                        | Subject × class assignment (`04 §25`)            |
| `GET/POST /v1/hods`, `PUT /v1/hods/:id/department`                        | HOD management                                   |
| `GET/POST /v1/moderators`                                                 | Moderator management                             |
| `GET /v1/classes/:id/students`                                            | Class roster                                     |

## Database work

- Profiles, enrollments, assignments with effective-date ranges and status.
- Enrollment history preserved on movement — a new record or a closed-and-reopened range, never an in-place class overwrite.
- Unique active enrollment per (student, session).
- Indexes tuned for scope resolution, which B2 calls on every request.
- `StudentSubjectRegistration` if `ADR-0011` approves.

## Background jobs

- Credential-sheet generation for a class after import (`A-02`).
- Invitation dispatch for staff.

## Security / authorization work

- Moderator manages students, teachers, HODs; School Admin additionally manages moderators (`02`).
- HOD cannot change assignments (per `C-10`'s recommended resolution, pending `ADR-0017`).
- Credential reset is audited; the resetter never sees the resulting password in a retrievable form.
- Deactivation never deletes authored content (`03 §68`).

## Testing requirements

| Level          | Requirement                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Unit           | Enrollment date-range logic; assignment effective periods                                                                                                                |
| Integration    | Create → enroll → assign → move class → deactivate                                                                                                                       |
| Security       | Moderator cannot approve questions; teacher cannot manage users; cross-tenant denied                                                                                     |
| Data integrity | **Class movement leaves prior enrollment and any historical exam context unchanged**; deactivating a teacher preserves their questions and exams with attribution intact |

## Frontend dependencies

**F7 consumes `people.v1`.** **F8 (import) depends on the same profile and enrollment contracts.**

## Integration dependencies

B2's scope resolvers read `TeacherAssignment` and `HODAssignment` — changes to their shape must be coordinated with B2.

## Definition of Done

1. ✅ All four user groups can be created, edited, deactivated, and reactivated within scope.
2. ✅ A student enrolls into a class for a session; the enrollment is session-scoped.
3. ✅ Moving a student to another class preserves the original enrollment; a historical exam still reports the original class (`07 §35`) — proven directly (no exam module exists yet to prove it via a real exam, so the enrollment row itself is the historical record proven untouched).
4. ✅ Teacher assignments drive real access: assigning Mathematics/SS2A grants exactly that scope and nothing adjacent — proven directly against the real `ASSIGNED` scope resolver.
5. ✅ Removing an assignment revokes future access but leaves historical authorship intact — the row is ended (`status: ENDED`), never deleted.
6. ✅ A deactivated teacher's profile, assignments, and (once B8/B11 exist) questions/exams remain, still attributed to them — proven structurally now: deactivation touches only `User.status`.
7. ✅ An HOD change leaves prior approvals attributed to the previous HOD (`03 §69`) — the prior `HODAssignment` is ended, never deleted or rewritten.
8. ✅ Credential reset works and is audited — a system-generated one-time password for students (`CredentialSheetService`), a fresh invitation link for staff (`IdentityService.issueStaffInvitation`).
9. ✅ A student cannot be enrolled twice concurrently in one session — a partial unique index (`student_enrollments_one_active_per_session`), proven both sequentially and under a genuine forced database-level race.
10. ✅ Students auto-register for class offerings and can be deregistered from electives (ADR-0011 — mandatory, not conditional; the roadmap's original "if approved" wording predates the ADR being locked in).

## Exit criteria

- ✅ ADR-0011 decided (mandatory); ADR-0017 decided — HOD cells explicitly withdrawn (zero authority over assignments/student moves, not "request").
- ✅ Historical-preservation tests green.
- F7 confirms the contract — not yet started; `people.v1` is frozen and published for it to consume.

## Implementation notes

- **Two modules, not three.** The roadmap's own "Domains / modules affected" line named `UsersModule`/`AssignmentsModule`/"extending IdentityModule" — implementation instead built a new `UsersModule` (person directories/lifecycle: Student/Teacher/HOD/Moderator, on top of B1's identity models) plus an _extended_ `AcademicsModule` (`StudentEnrollment`/`TeacherAssignment`/`StudentSubjectRegistration`), exactly as `academics.module.ts`'s own doc comment — written during B5 — already anticipated: "B6 adds StudentEnrollment/TeacherAssignment/StudentSubjectRegistration on top of this same module." `UsersModule` imports `AcademicsModule` one-directionally for `HodAssignmentService` (department (re)assignment); no cycle.
- **Confirmed with the project owner before implementation**: creating an HOD promotes an existing teacher's membership (adds an `HOD` `RoleAssignment` to it) rather than creating a second, disconnected person record — matching the schema's own pre-existing "a membership may hold TEACHER + HOD" documentation. `POST /v1/hods` therefore takes a `membershipId`, not a name/staffId.
- **The real `ASSIGNED` scope resolver** (`assigned-scope.resolver.ts`) closes B2's fail-closed placeholder, mirroring B5's `DEPARTMENT` resolver exactly. `ResourceContext` gained one field (`classSubjectId`). Same caveat B5 already recorded for `DEPARTMENT`: no controller anywhere constructs a `ResourceContext` yet, so this resolver is correct and registered but reachable over HTTP only once a later phase (B8/B9) calls `AuthorizationService.evaluate()` with one — proven directly here instead, against real `TeacherAssignment` rows.
- **`StudentSubjectRegistration` is keyed on the enrollment, not the student directly.** This is what makes ADR-0011's "close registrations for subjects the new class doesn't offer" fall out structurally on a class move: a superseded enrollment's own registrations are already historically frozen the moment it stops being `ACTIVE` — no explicit close-loop over old rows was needed.
- **Class-movement concurrency reuses B5's own finding**: plain `READ COMMITTED` + the partial unique index (`student_enrollments_one_active_per_session`) + Postgres row-locking is sufficient for "exactly one ACTIVE enrollment per (student, session)" — no `SERIALIZABLE` needed. Proven both by a sequential re-submit test and a dedicated `pg_sleep`-forced concurrency test (`student-enrollment-concurrency.integration.test.ts`), mirroring `session-activation-concurrency.integration.test.ts` exactly. The identical partial-unique-index technique covers `TeacherAssignment` ("at most one ACTIVE assignment per (teacher, classSubject) pair," scoped to `ACTIVE` rows only so a rehire after ending the same pair stays possible).
- **Two additive schema changes to already-shipped B5/B1 tables**, both purely new unique indexes over already-unique `id` columns, no behavior/data change: `ClassSubject` gained `@@unique([schoolId, id])` (needed as a composite-FK target for `TeacherAssignment`/`StudentSubjectRegistration` — every other composite-FK-target table already had this line; `ClassSubject` simply hadn't needed it until B6 gave it FK-consuming children), and the same for `StudentProfile`/`TeacherProfile` (targets for `StudentEnrollment`/`TeacherAssignment` respectively).
- **Two analogous `assertNoDependents` extensions**, not just the one the B5 Change Log named in advance: `ClassGroupService.delete()` now also counts `StudentEnrollment` rows (the named, expected extension), and — found only while implementing, not anticipated — `ClassSubjectService.remove()` (B5) needed the identical treatment, since `TeacherAssignment` and `StudentSubjectRegistration` both FK against `ClassSubject` with `onDelete: Restrict` too.
- **Staff invitation dispatch reuses B1's password-reset token mechanism directly**, exactly as `templates.ts`'s own B1-era doc comment predicted ("also a staff member's initial invitation once B6 starts issuing those tokens the same way"): a new `IdentityService.issueStaffInvitation(schoolId, userId)`, deliberately not `requestPasswordReset` itself (that method requires `user.status === 'ACTIVE'`, an enumeration-resistance gate wrong for a freshly-created `INVITED` account). `IdentityService` is now exported from `IdentityModule` for this — its first-ever export beyond the identity-session primitives. This closed a roadmap ambiguity honestly rather than guessing: "invitation dispatch for staff" (listed as a B6 Background job) turned out to need no queue/batch mechanism at all — a single person-creation call is itself the triggering event, dispatched synchronously.
- **Two response-shape decisions, not scope gaps**: teacher/HOD/moderator credential reset returns a plain `{status: 'ok'}` (`StatusResponseDto`), never a password — CredentialState's own doc comment ("staff: invitation link; student: system-generated password") makes the shown-once-password shape wrong for staff, so it isn't reused there merely for DTO uniformity. `account.forcePasswordReset`'s HOD grant stays `limitedReadOnly('DEPARTMENT', ...)` — i.e. no controller route ever grants HOD real write access to reset anyone's credentials — a deliberate finalization of that row's own B2-era "finalized when B6 builds the operation" comment, consistent with ADR-0017's general withdrawal of HOD operational authority.
- **Four new `.view` permission ids** (`users.{moderator,hod,teacher,student}.view`) were added — no roadmap document named a read permission distinct from `.create`, and gating a `GET` behind a `CREATE`-typed id would have been a real semantic mismatch. Each mirrors its sibling `.create` row's grant shape exactly.
- **A real bug caught only by the integration tests, not by inspection**: `ReplaceTeacherAssignmentsDto.classSubjectIds` was originally validated with `@IsUUID('4', { each: true })` — rejecting every real id in this codebase, which uses UUIDv7 primary keys throughout. Every `PUT /v1/teachers/:id/assignments` call failed with a generic `VALIDATION_ERROR` until fixed to the same version-less `@IsUUID()` every other id field in this codebase already uses (`CreateHodAssignmentDto`'s own precedent).
- **Two small, roadmap-unnamed route additions**, matching B5's own `POST .../terms/:id/activate` precedent for this same class of gap: `GET /v1/teachers/:id/assignments` (needed to render the `PUT` endpoint's own pre-filled state) and the `StudentSubjectRegistration` deregister/re-register/list routes (the roadmap's endpoint table never literally lists them, but DoD item 10 requires the _capability_, which needs some endpoint).

## Deferred items

- Parent/guardian records — explicitly out of scope (`01 §53`).
- Staff HR attributes beyond `TeacherProfile` (`07 §5.5`).
- Bulk import — explicitly B7's phase; `users.import.{teachers,students}` stay `awaitingResource`.
- Two Background-jobs bullets this phase's own Scope text listed but honestly could not build in isolation: "credential-sheet generation for a class after import" needs `B7`'s import pipeline to trigger it (no batch "class full of freshly-imported students" event exists in B6 alone) — pushed forward to `B7`, which already owns this exact line in its own Background jobs list. "Invitation dispatch for staff," by contrast, **was** built in B6 — it turned out not to need bulk import at all; a single `POST /v1/teachers` (or `/hods`, `/moderators`) creation is itself the triggering event, dispatched synchronously via `IdentityService.issueStaffInvitation`, reusing `templates.ts`'s own `PASSWORD_RESET_TEMPLATE_NAME` exactly as that file's B1-era doc comment anticipated.

---

# B7 — Bulk Import Pipeline

**Status:** NOT STARTED · **Gating ADRs:** none (settle `A-17` within the phase)

## Objective

Deliver the validate-preview-confirm import pipeline for students, teachers, and questions, sized for real schools — 1,500 students in one file — with no silent partial imports.

## Scope

- Import pipeline `Upload → Parse → Validate → Preview → Confirm → Import → Summary` (`05 §10.1`).
- Student and teacher imports (`03 §15`–`§16`).
- Question import producing `DRAFT` revisions only, never auto-approved (`05 §18.1`).
- Full validation catalogue: required fields, duplicate IDs, duplicate accounts, invalid class, invalid department, invalid session, type errors (`05 §10.2`).
- Error reporting per row with a downloadable correction file.
- Format, size, and row limits; template versioning (resolves `A-17`).
- Background processing reconciled with the interactive preview.

## Specification references

`01 §7`, `§42` · `03 §15`–`§16` · `05 §10`, `§18` · `08 §14` · `02` (Import rows)

## Dependencies

**Depends on:** B5, B6; B8 for question import.
**Depended on by:** onboarding at scale. F8 pairs with this phase.

## Domains / modules affected

`ImportModule`, writing through `UsersModule` and `QuestionsModule` services — never directly to their tables.

## API work

| Endpoint                          | Purpose                                     |
| --------------------------------- | ------------------------------------------- |
| `POST /v1/imports`                | Upload file, declare type, start validation |
| `GET /v1/imports/:id`             | Status and validation report                |
| `POST /v1/imports/:id/confirm`    | Commit valid rows                           |
| `GET /v1/imports/:id/errors`      | Downloadable error rows                     |
| `GET /v1/imports/templates/:type` | Versioned template download                 |

## Database work

- `ImportJob` with type, status, counts, uploader, expiry.
- `ImportRow` (or a stored report artefact) holding per-row validation outcomes.
- Staged uploads expire after a defined window.

## Background jobs

- Validation job producing the report.
- Import job committing confirmed rows, chunked and resumable.
- Both idempotent — a re-run must not double-create (`08 §3`).

## Security / authorization work

- Import is school-scoped; rows may never target another school.
- Uploaded files are validated by content and stored privately.
- Row limits and file-size caps prevent resource exhaustion.
- Import actions are audited with counts.

## Testing requirements

| Level       | Requirement                                                        |
| ----------- | ------------------------------------------------------------------ |
| Unit        | Every validation rule; template parsing including encodings        |
| Integration | 1,500-row student import end to end                                |
| Concurrency | Two simultaneous imports of the same file — no duplicate creation  |
| Failure     | Worker crash mid-import; re-run resumes without duplicating        |
| Security    | Cross-tenant rows rejected; malformed and malicious files rejected |

## Frontend dependencies

**F8 consumes the import contract**, including the polling model for validation status and the per-row error shape.

## Integration dependencies

Question import (`05 §18`) requires B8's question model. Sequence student/teacher import first if B8 is not ready.

## Definition of Done

1. A 1,500-row student file uploads, validates in the background, and reports valid and invalid counts matching a hand-checked fixture.
2. The preview shows exactly what will happen before anything is written (`05 §10.2`).
3. Confirm imports **only** valid rows; invalid rows are never silently imported.
4. Duplicate student IDs within the file and against existing records are both detected.
5. Invalid class, department, and session references are rejected with actionable per-row messages.
6. An error file downloads and can be corrected and re-uploaded.
7. Imported questions land as `DRAFT` and are never auto-approved.
8. A crashed import job resumes without duplicating rows.
9. Row limit and file-size cap are enforced with clear errors.
10. Import completion is audited with counts.

## Exit criteria

- `A-17` decisions recorded (formats, limits, template versioning, staging expiry).
- Performance verified: a 1,500-row import completes within an agreed time budget.
- F8 confirms the contract.

## Deferred items

- Direct Excel formula evaluation — parse values only.
- Import of results or attempts — not in scope; academic evidence is generated, never imported.

---

# B8 — Question Bank

**Status:** NOT STARTED · **Decided ADRs:** 0001 (question level / subject-department)

## Objective

Deliver the question bank with immutable revisions, options, media, and taxonomy — the academic asset store the entire assessment engine builds on.

## Scope

- `Question`, `QuestionRevision`, `QuestionOption`, `QuestionMedia` (`07 §7.1`–`§7.4`).
- Question types: single-choice MCQ and True/False (`05 §15.2` core scope), with the model open to future types without redesign.
- Revision lifecycle `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED → DRAFT`, plus `ARCHIVED` (`07 §18`).
- Immutability of approved revisions; substantive edits create a new revision (`A-C7`).
- Question level per `ADR-0001` (resolves `C-04`) and teacher scope validation against `TeacherAssignment`.
- `Topic` as a first-class entity scoped to (school, subject) per `A-16`.
- Validation catalogue from `05 §15.4`.
- `Question.current_status` derived, not stored (resolves `D-12`).
- Rich content and media attachment (`01 §43`).

## Specification references

`03 §19`–`§24` · `05 §15`, `§17` · `06 §24`–`§31` · `07 §7.1`–`§7.4`, `§18`, `§37` · `02` (Question Bank, Question Lifecycle) · `04 §38`–`§40`

## Dependencies

**Depends on:** B2, B4, B5, B6.
**Depended on by:** B9, B11, B13. F9 pairs with this phase.

## Domains / modules affected

`QuestionsModule`.

## API work

**Contract: `questions.v1`.**

| Endpoint                                       | Purpose                                                                        |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /v1/questions`                            | Scoped bank with filters: subject, level, topic, difficulty, status (`04 §38`) |
| `POST /v1/questions`                           | Create question + initial draft revision                                       |
| `GET /v1/questions/:id`                        | Question with revision history                                                 |
| `PATCH /v1/questions/:id/revisions/:rev`       | Edit a draft revision only                                                     |
| `POST /v1/questions/:id/revisions`             | New revision from an approved one                                              |
| `POST /v1/questions/:id/revisions/:rev/submit` | Submit for review                                                              |
| `POST /v1/questions/:id/archive`               | Archive                                                                        |
| `GET /v1/questions/counts`                     | Status counts for the bank home (`05 §15.1`)                                   |
| `GET/POST /v1/topics`                          | Topic management                                                               |

## Database work

- Question and revision tables with monotonic `revision_number` per question.
- `QuestionOption` rows with `original_order` and `correct_flag` (`07 §7.3`) — never four hard-coded columns (`06 §27`).
- `Topic` scoped to (school, subject); case-insensitive resolution for imports.
- **Database-level immutability for approved revisions**: a trigger or equivalent constraint rejecting updates to content, options, correct answer, marks, or approval fields once `APPROVED`.
- Indexes: `(school_id, subject_id, level, status)` for the bank; `(school_id, status)` for counts.

## Background jobs

- Question import validation and creation (shared with B7).
- Media post-processing (shared with B4).

## Security / authorization work

- A teacher may create and edit questions only within an active `TeacherAssignment` scope, validated against both subject and level (`05 §15.4`).
- A teacher may edit only their **own draft** revisions (`02`).
- An approved revision cannot be edited by anyone, including School Admin — enforced in the database, not only in application code.
- HOD and School Admin have read oversight per `02`.
- Cross-tenant question access denied.

## Testing requirements

| Level          | Requirement                                                                                                                                                                                           |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | Revision numbering; validation catalogue; option correctness rules                                                                                                                                    |
| Integration    | Create → edit draft → submit → reject → revise → resubmit → approve                                                                                                                                   |
| Security       | Teacher cannot create outside assigned subject/level; cannot edit another teacher's draft; moderator cannot approve                                                                                   |
| Data integrity | **An approved revision cannot be mutated by any code path** — asserted with a direct database update attempt; editing an approved question creates a new revision leaving the original byte-identical |

## Frontend dependencies

**F9 consumes `questions.v1`** for the teacher question bank, editor, and rejected-question workflow.

## Integration dependencies

B11's exam builder consumes approved revisions. B13's snapshot reads revision content. Both depend on this contract being stable.

## Definition of Done

1. A teacher creates an MCQ with at least two options, exactly one correct, within their assigned scope.
2. Creating outside assigned subject or level is refused.
3. Draft revisions are freely editable and deletable by their author.
4. Submission transitions to `SUBMITTED` and locks editing.
5. A rejected revision can be revised, producing a new revision with the history retained.
6. An approved revision is immutable — a direct database update is rejected by constraint.
7. Editing an approved question produces a new revision; the approved one is unchanged and still bound to any exam using it.
8. Validation refuses: empty text, fewer than two options, missing correct answer, correct answer referencing a non-existent option, invalid marks, out-of-scope subject or class.
9. Topics resolve case-insensitively and auto-create on first use.
10. Media attaches to a revision and is retrievable only through authorized signed URLs.
11. Status counts match a hand-computed fixture.
12. Cross-tenant access denied.

## Exit criteria

- ADR-0001 decided and reflected in the schema.
- Immutability constraint verified at the database level.
- F9 confirms the contract.

## Deferred items

- Multiple-select, fill-in-the-blank, short answer, essay, matching, ordering (`05 §15.2` — model supports future addition; not enabled).
- Mathematical notation rendering beyond rich text — confirm the editor capability in F9 and record any gap.

---

# B9 — Question Review & Governance

**Status:** NOT STARTED · **Decided ADRs:** 0001, 0017

## Objective

Deliver the HOD academic governance workflow — the review queue, approval and rejection with mandatory feedback, and an immutable review history.

## Scope

- `QuestionReview` (`07 §7.5`) as an append-only decision record.
- HOD review queue scoped by `HODAssignment → Department → Subject → Question` (depends on `ADR-0001`).
- Decisions `APPROVED`, `REJECTED`, `REQUEST_CHANGES` with mandatory reason on the latter two (`05 §16.2`).
- Review history visible to teacher and HOD (`03 §23`, `04 §31`).
- Reassignment of a pending queue when an HOD changes (`03 §69`, `05 §13`).
- Notifications to teachers on decisions (via B10).

## Specification references

`01 §16`–`§17` · `03 §22`–`§24`, `§69` · `05 §16`, `§17` · `06 §29` · `07 §7.5`, `§18` · `02` (Review rows) · `04 §29`–`§31`, `§70`

## Dependencies

**Depends on:** B5 (department↔subject), B6 (HOD assignment), B8 (questions).
**Depended on by:** B11 (only approved revisions enter exams). F10 pairs with this phase.

## Domains / modules affected

`QuestionReviewModule`.

## API work

**Contract: `question-review.v1`.**

| Endpoint                                         | Purpose                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `GET /v1/reviews/queue`                          | Pending questions in the HOD's department, grouped by subject with queue age (`04 §29`)             |
| `GET /v1/reviews/questions/:id`                  | Full review workspace: content, options, correct answer, metadata, revision history, prior comments |
| `POST /v1/reviews/questions/:id/approve`         | Approve, optional note                                                                              |
| `POST /v1/reviews/questions/:id/reject`          | Reject, reason required                                                                             |
| `POST /v1/reviews/questions/:id/request-changes` | Request changes, reason required                                                                    |
| `GET /v1/reviews/history/:questionId`            | Full immutable review history                                                                       |

The queue endpoint must support the "Approve → Reject → Comment → Next" flow `04 §70` calls for, so it returns enough context to review without a second round trip.

## Database work

- `QuestionReview` append-only; updates and deletes blocked by constraint.
- Revision status transitions written in the **same transaction** as the review record (`08 §7.3`).
- Indexes for queue retrieval by department and submission age.

## Background jobs

- Notification dispatch on decisions.
- Optional queue-age reporting for the HOD dashboard.

## Security / authorization work

- Only an HOD with an active assignment covering the question's department may decide.
- **A teacher may never approve their own question**, including a teacher who also holds an HOD role for that department — this combination is explicitly permitted by `07 §5.3`, so it must be blocked as a distinct rule.
- Moderators cannot approve (`02 §3`).
- Every decision emits an audit event with actor, decision, and reason.
- Review records are immutable once written.

## Testing requirements

| Level          | Requirement                                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | Decision validation; mandatory-reason enforcement                                                                                   |
| Integration    | Submit → review → reject → revise → resubmit → approve, with full history preserved                                                 |
| Security       | HOD cannot review outside their department; **teacher-who-is-also-HOD cannot approve their own question**; moderator cannot approve |
| Data integrity | Review history is append-only; an HOD change leaves prior decisions attributed to the previous HOD                                  |

## Frontend dependencies

**F10 consumes `question-review.v1`** for the HOD review workspace — `04 §70` identifies this as the second most important screen in the product.

## Integration dependencies

B11 depends on approval status being reliable. B10 delivers the notifications this phase emits.

## Definition of Done

1. The queue returns only questions in the HOD's assigned department, grouped by subject with counts matching `04 §29`'s shape.
2. Approving transitions the revision to `APPROVED` and records an immutable review.
3. Rejecting requires a reason; rejection without one is refused.
4. Request-changes behaves equivalently and returns the revision to the teacher.
5. Review history is complete, ordered, and never overwritten across multiple cycles.
6. An HOD cannot decide outside their department scope.
7. A user holding both Teacher and HOD roles cannot approve a question they authored.
8. Changing the HOD leaves prior approvals attributed to the previous HOD; the pending queue can be reassigned.
9. Decisions emit audit events and notifications.
10. Approved revisions immediately become selectable in the exam builder; rejected ones do not.

## Exit criteria

- ADR-0001 decided (the queue query depends on it).
- Self-approval prevention tested and green.
- F10 confirms the contract.

## Deferred items

- Multi-reviewer or quorum approval — not specified.
- Review SLAs and escalation — not specified; record as a candidate.

---

# B10 — Audit & Notifications

**Status:** NOT STARTED · **Decided ADRs:** 0019 (messaging channel)

## Objective

Deliver the append-only audit trail and the operational notification system that make sensitive actions traceable and actionable.

## Scope

- `AuditEvent` (`07 §11.1`) — append-only, tamper-resistant, school-scoped.
- Canonical action vocabulary from `07 §11.1` (resolves `C-02`'s stray action).
- Audit retrieval scoped per role (`02`: Software Admin full, School Admin own school, HOD department, Teacher own actions, Student own account).
- `Notification` (`07 §11.2`) — operational only, never social (`04 §64`).
- Notification types: question approved/rejected, result published, exam opened, makeup granted, subscription expiring, unassigned students.
- Delivery through the `ADR-0019` channel for out-of-band types; in-app for the rest.

## Specification references

`03 §57` · `05 §56`–`§57` · `06 §63`–`§64` · `07 §11.1`–`§11.2`, `§3.4`, `§42` invariant 15 · `02` (Audit rows) · `04 §10`, `§64` · `08 §16`, `§18`

## Dependencies

**Depends on:** B1, B2, B3.
**Depended on by:** every phase emitting audit events — all of them. Surfaces in F2, F3.

## Domains / modules affected

`AuditModule`, `NotificationsModule`. Cross-cutting.

## API work

| Endpoint                          | Purpose                                                                     |
| --------------------------------- | --------------------------------------------------------------------------- |
| `GET /v1/audit`                   | Scoped audit retrieval with filters: actor, action, entity type, date range |
| `GET /v1/platform/audit`          | Platform-wide (Software Admin only)                                         |
| `GET /v1/notifications`           | Current user's notifications                                                |
| `POST /v1/notifications/:id/read` | Mark read                                                                   |
| `POST /v1/notifications/read-all` | Bulk mark read                                                              |

## Database work

- `AuditEvent` with actor, actor role, action, entity type and id, reason, timestamp, before/after metadata.
- **Append-only enforced at the database level**: updates and deletes rejected by trigger or by restricted grants. `07 §42` invariant 15 requires audit records be unalterable through ordinary product operations.
- Indexes for the retrieval filters; partitioning strategy considered given growth.
- `Notification` with recipient, type, payload, read state.

## Background jobs

- Notification dispatch and fan-out.
- Digest generation where a type warrants it.
- Audit retention per `M-14` once decided — archival, never deletion of academic-relevant events.

## Security / authorization work

- Audit writes go through a single service; no module writes audit rows directly.
- Audit reads are scoped — a teacher sees only their own actions, an HOD their department.
- Audit records **must not contain credentials, password hashes, or full answer content**.
- Software Admin break-glass events are distinctly typed and visible to the affected school (`ADR-0012`).

## Testing requirements

| Level          | Requirement                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | Event construction; scope filters                                                                                                             |
| Integration    | Sensitive actions across modules produce the expected events                                                                                  |
| Security       | Audit rows cannot be updated or deleted through any application path or direct SQL under the application role; cross-tenant audit read denied |
| Data integrity | Every action in `07 §11.1`'s vocabulary is emitted by the module that owns it — verified by a coverage test                                   |

## Frontend dependencies

**F2 surfaces notifications** in the app shell. **F3 consumes `GET /v1/platform/audit`** for the Software Admin audit screen (`04 §10`).

## Integration dependencies

Every phase from B3 onward emits audit events. A coverage test asserts each vocabulary action has a producer — preventing actions from being quietly dropped.

## Definition of Done

1. Every action in `07 §11.1`'s vocabulary has an emitting code path, proven by the coverage test.
2. Audit rows cannot be updated or deleted; attempts fail at the database.
3. Audit retrieval is correctly scoped for all six roles.
4. Audit entries capture actor, role, school, action, target, timestamp, and reason where applicable.
5. No credential material or full answer content appears in any audit payload.
6. Notifications generate for all specified types and mark read correctly.
7. Out-of-band notifications dispatch through the `ADR-0019` channel with retry.
8. Cross-tenant audit and notification access is denied.
9. Break-glass events are distinctly typed and visible to the affected school.

## Exit criteria

- Append-only enforcement verified at the database level.
- Action coverage test green and wired as a merge blocker.
- ADR-0019 operational.

## Deferred items

- Audit export and SIEM integration (candidate, moves to B20 if approved).
- Real-time audit streaming — not specified.

---

# B11 — Exam Builder & Readiness

**Status:** NOT STARTED · **Decided ADRs:** 0002 (question pools), 0013 (multi-class), 0029 (sections)

## Objective

Deliver exam construction from approved question revisions, exam configuration, and the readiness validation that prevents a malformed examination from ever being administered.

## Scope

- `Exam`, `ExamSection`, `ExamQuestion` (`07 §8.1`–`§8.3`).
- Exam identity: session, term, class, subject, department, type, title (`03 §25`).
- Configuration: duration, attempt limit, navigation policy, randomization flags, result policy, instructions, accommodations (`05 §22`).
- Question selection from **approved revisions only** (`A-C8`), with the binding immutable once operational.
- Marks precedence per `A-15`: `ExamQuestion.marks` authoritative, defaulted from the revision, locked at `READY`.
- **Readiness validation** as a process, not a boolean (`06 §39`, `05 §72`) — the full checklist.
- `DRAFT → READY` transition gated on validation; `CANCELLED` from `DRAFT` or `READY`.
- Default `ExamSection` created invisibly per `A-12`.
- Instructions as a first-class object (`05 §71`).
- Multi-class targeting if `ADR-0013` approves (resolves `M-03`, `D-03`).

## Specification references

`03 §25`–`§28` · `05 §19`–`§24`, `§71`–`§72` · `06 §33`–`§39` · `07 §8.1`–`§8.3`, `§14`, `§20` · `02` (Exam Management) · `04 §41`–`§44`

## Dependencies

**Depends on:** B5, B6, B8, B9.
**Depended on by:** B12, B13. F11 pairs with this phase.

## Domains / modules affected

`ExamsModule`.

## API work

**Contract: `exams.v1`.**

| Endpoint                                | Purpose                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| `GET /v1/exams`                         | Tabs Draft/Ready/Open/Closed/Completed/Archived/Cancelled with filters (`05 §19.1`) |
| `POST /v1/exams`, `PATCH /v1/exams/:id` | Create and edit draft                                                               |
| `PUT /v1/exams/:id/questions`           | Set selection from approved revisions                                               |
| `PUT /v1/exams/:id/configuration`       | Rules and policies                                                                  |
| `GET /v1/exams/:id/readiness`           | **Readiness checklist with per-item pass/fail** (`05 §72`)                          |
| `POST /v1/exams/:id/ready`              | Transition `DRAFT → READY`                                                          |
| `POST /v1/exams/:id/cancel`             | Cancel with reason                                                                  |
| `POST /v1/exams/:id/archive`            | Archive                                                                             |

`GET /v1/exams/:id/readiness` returns each check individually so F11 can render the checklist and link to the resolution, exactly as `05 §72` describes — not a single boolean.

## Database work

- `Exam` with configuration columns and status.
- `ExamQuestion` binding `question_revision_id` with sequence and marks; **constraint requiring the referenced revision be `APPROVED`**.
- Default `ExamSection` per exam; `ExamQuestion.exam_section_id` non-nullable.
- Immutability: once the exam leaves `DRAFT`, question bindings and configuration are locked by constraint (`07 §8.3`).
- `ExamClass` join if `ADR-0013` approves.
- Composite FKs ensuring the exam, its class, its subject, and its questions all belong to one school.

## Background jobs

None. Readiness is synchronous — it is an interactive gate.

## Security / authorization work

- Teachers create and edit exams only within active assignment scope.
- School Admin and Moderator per the resolution of `C-07`.
- **Bypassing the approved-question rule is impossible** — enforced by database constraint, not only application logic (`03 §27`).
- Configuration changes after `READY` are refused.
- `EXAM_READY` and `EXAM_CANCELLED` audited.

## Testing requirements

| Level          | Requirement                                                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Unit           | Readiness checklist items; marks precedence; state transitions                                                                           |
| Integration    | Build → configure → validate → ready; each failure mode blocks the transition                                                            |
| Security       | Teacher cannot build for an unassigned class; unapproved revision cannot be bound even by direct insert                                  |
| Data integrity | A `READY` exam's questions and configuration cannot be mutated; an approved revision later superseded stays bound to the exam (`07 §37`) |

## Frontend dependencies

**F11 consumes `exams.v1`**, especially the itemised readiness contract that drives the `04 §44` review screen.

## Integration dependencies

B12 opens exams that are `READY`. B13 snapshots from `ExamQuestion`. If `ADR-0002` approves pools, B11 grows a pool-configuration surface and B13's start path changes materially.

## Definition of Done

1. A teacher builds an exam from approved revisions within their scope.
2. Selecting an unapproved revision is refused by the API **and** by database constraint.
3. Configuration covers duration, attempts, navigation, randomization, result policy, and instructions.
4. Readiness returns each check individually; every failure listed in `05 §23` blocks the transition: no questions, unapproved questions, invalid scope, invalid marks, zero duration, no eligible students, incomplete details, missing result policy.
5. `DRAFT → READY` succeeds only when all mandatory checks pass.
6. A `READY` exam's questions and configuration are immutable.
7. Cancelling from `DRAFT` or `READY` records a reason and is audited.
8. Creating a later revision of a bound question does not alter the exam's binding.
9. Marks default from the revision and may be overridden while `DRAFT`, then lock.
10. Cross-tenant question binding is impossible.

## Exit criteria

- ADR-0002, ADR-0013, ADR-0029 decided.
- Approved-only constraint verified at the database level.
- F11 confirms the readiness contract.

## Deferred items

- Question pools — **deferred pending `ADR-0002`**. If approved, scope returns to this phase and B13.
- Multi-section authoring UI (`A-12`) — schema present, UI deferred.
- Section-level marks as a stored value (`A-15` recommends derived or dropped).

---

# B12 — Exam Activation & Control

**Status:** NOT STARTED · **Decided ADRs:** 0006 (authorization mode), 0009 (PAUSED), 0020 (liveness)

## Objective

Deliver exam sessions, student authorization, batch control, and the live Exam Control Center — the operational heart of physical CBT administration, and the screen `04 §69` identifies as the most important in the product.

## Scope

- `ExamSession`, `ExamSessionParticipant` (`07 §8.4`–`§8.5`).
- Exam lifecycle `READY → OPEN → CLOSED → COMPLETED` with the transitions attributed to explicit operator actions (resolves `A-14`).
- Session lifecycle `READY → OPEN → CLOSED → COMPLETED / CANCELLED`.
- `access_mode` per `ADR-0006` — `OPEN_TO_ELIGIBLE` or `EXPLICIT_AUTHORIZATION` (resolves `C-08`, `A-04`).
- Batch control: authorize selected students, revoke before start (`05 §29`–`§30`).
- Close new attempts while running attempts continue (`05 §27`) — and the `PAUSED` resolution per `ADR-0009`.
- Exam Control Center aggregates: registered, not started, in progress, submitted, absent (`05 §28`).
- Live attempt table with per-student status and time remaining (`04 §46`).
- SSE realtime stream with Redis pub/sub fan-out (`09 §21`).
- Attempt liveness / `last_seen_at` per `ADR-0020` (resolves `M-09`, `X-09`).
- `AttemptEvent` integrity signals (resolves `M-08`).
- End Examination with absence confirmation (`03 §41`, `05 §42`).

## Specification references

`01 §15`–`§16` (second half) · `03 §29`–`§31`, `§37`–`§41` · `05 §25`–`§30`, `§42`, `§73` · `06 §40`–`§43` · `07 §8.4`–`§8.5`, `§15`, `§21`–`§22` · `02` (Exam Administration) · `04 §45`–`§46`, `§69` · `09 §21`

## Dependencies

**Depends on:** B6, B11.
**Depended on by:** B13, B16. F12 pairs with this phase.

## Domains / modules affected

`ExecutionModule` (session/participant portion), `RealtimeModule`.

## API work

**Contract: `exam-control.v1`.**

| Endpoint                                               | Purpose                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| `POST /v1/exams/:id/sessions`                          | Open a session (creates `ExamSession`, moves exam to `OPEN`) |
| `POST /v1/exam-sessions/:id/close`                     | Close for new attempts; running attempts continue            |
| `POST /v1/exam-sessions/:id/reopen`                    | Reopen for new starts                                        |
| `POST /v1/exam-sessions/:id/participants`              | Authorize selected students                                  |
| `DELETE /v1/exam-sessions/:id/participants/:studentId` | Revoke **before start only**                                 |
| `GET /v1/exams/:id/control`                            | Control Center aggregates + live attempt table               |
| `GET /v1/exams/:id/control/stream`                     | SSE live updates                                             |
| `POST /v1/exams/:id/complete`                          | End examination; confirm absences                            |
| `GET /v1/exams/:id/eligible-students`                  | Roster with eligibility and current state                    |

## Database work

- `ExamSession` and `ExamSessionParticipant` with school-scoped composite FKs.
- `ExamSessionParticipant.status` restricted to authorization semantics only — `AUTHORIZED`, `REVOKED` (resolves `D-07`; `COMPLETED` moves to participation).
- Unique participant per (session, student).
- `ExamAttempt.last_seen_at` written on a path that does **not** touch the parent attempt row on every answer save (`R-03`).
- `AttemptEvent` table, written off the critical path.
- Indexes for the Control Center query: attempts by exam and state, participants by session.

## Background jobs

- Control Center aggregate refresh on a short interval, cached in Redis, so live teacher polling never hits attempt tables directly (`R-03`).
- Stale-exam detection flagging exams left `OPEN` beyond a threshold (`A-14`).

## Security / authorization work

- Only Teacher (own exam or delegated `ExamAdministrator`), HOD (scoped), Moderator, School Admin may operate sessions (`02`).
- Revoking access is permitted **only before an attempt starts**; afterwards the action is invalidation, requiring a reason (`03 §76`, `05 §30`).
- The Control Center exposes no answer content — only status and timing.
- Every session transition, authorization, and revocation is audited.
- SSE streams are authorized per connection and scoped to one exam; a teacher cannot subscribe to another school's stream.

## Testing requirements

| Level       | Requirement                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Session state machine; eligibility predicate; aggregate computation                                                              |
| Integration | Open → authorize batch 1 → close → reopen → authorize batch 2 → complete                                                         |
| Concurrency | Simultaneous authorization of the same student; simultaneous close and start                                                     |
| Realtime    | SSE delivers start, submit, and disconnect events; reconnection replays missed events via `Last-Event-ID`                        |
| Security    | Cross-tenant session access denied; teacher cannot control another teacher's exam without delegation; revoke after start refused |
| Failure     | API node restart drops SSE; client reconnects and reconciles without losing state                                                |

## Frontend dependencies

**F12 consumes `exam-control.v1`** including the SSE stream. This is the pairing that must be exercised hardest — `04 §69` describes a teacher standing in a lab with 40 students and 20 computers, and the screen has to make that effortless.

## Integration dependencies

B13 creates attempts against sessions authorized here. B16 consumes participation state established at exam completion.

## Definition of Done

1. Opening a session moves a `READY` exam to `OPEN` and creates an `ExamSession`.
2. Under `OPEN_TO_ELIGIBLE`, every currently eligible student is authorized automatically and sees the assessment.
3. Under `EXPLICIT_AUTHORIZATION`, no student may start until named; unnamed students see nothing.
4. Authorizing a second batch after closing the first works without creating a second exam (`03 §39`).
5. Closing for new attempts stops new starts while running attempts continue to completion, unaffected.
6. Reopening permits new starts again.
7. Revoking before start removes access; revoking after start is refused and directs the operator to invalidation.
8. The Control Center reports registered, not started, in progress, submitted, and absent counts matching a hand-built fixture.
9. The live table shows per-student status and server-derived time remaining.
10. SSE pushes start, submit, and disconnect events within an agreed latency budget; a dropped stream reconnects and replays.
11. `last_seen_at` drives a "disconnected" indicator per `05 §73`.
12. End Examination requires zero in-progress attempts, prompts to mark non-participants absent, and is audited.
13. An exam left `OPEN` beyond the staleness threshold is flagged, never auto-closed.
14. Cross-tenant and cross-teacher access denied.

## Exit criteria

- ADR-0006, ADR-0009, ADR-0020 decided.
- Concurrency and realtime tests green.
- F12 confirms the contract and the SSE reconnection model.

## Deferred items

- Advanced proctoring, webcam, facial recognition (`01 §53`, `CLAUDE.md` deferred list).
- Automated cheating judgements — signals are recorded as events only (`03 §78`, `08 §17`).

---

# B13 — Attempt Engine

**Status:** NOT STARTED · **Decided ADRs:** 0002, 0003, 0007, 0008, 0020, 0021

## Objective

Deliver the highest-integrity path in the product: attempt creation, immutable question snapshots, resilient answer persistence, and offline synchronisation — server-authoritative throughout, with the client never able to mint authority or extend time.

> `AGENTS.md` §5 designates this subsystem as one where attempt timing, ownership, snapshots, answer persistence, and submission state must never be compromised. This phase carries the heaviest testing burden in the roadmap.

## Scope

- `ExamAttempt` (`07 §9.1`) with server-derived `started_at`, `duration_granted_seconds`, `expires_at`.
- **Attempt creation transaction** (`07 §23`, `09 §47`): validate eligibility under lock, create attempt, build snapshot, commit atomically.
- `AttemptQuestionSnapshot` (`07 §9.2`) — immutable, capturing content, options, marks, display order, and randomized option order.
- **Answer-key exclusion from the client payload** (resolves `X-05`) — a release-blocking contract rule.
- Per-attempt randomization with stored seed (`A-08`).
- `AttemptAnswer` persistence with the model chosen in `ADR-0007`, plus ordering protection against out-of-order replay (`X-04`).
- Idempotent answer sync with `Idempotency-Key` and per-question sequence numbers.
- Post-expiry cutoff and grace window per `ADR-0003` (resolves `X-02`, `A-06`).
- Duplicate-start prevention by partial unique index (resolves `D-09`, `X-03`).
- Attempt resume after refresh, crash, or reconnection (`03 §36`, `05 §36`).
- Accommodation resolution frozen at attempt creation (resolves `X-11`).
- Offline media contract per `ADR-0021` (resolves `X-10`).
- Invalidation of a running attempt with a distinct non-retryable client error (resolves `X-13`).

## Specification references

`03 §32`–`§36` · `05 §31`–`§36`, `§38` · `06 §44`–`§53` · `07 §9.1`–`§9.3`, `§16`, `§23`–`§26`, `§42` invariants 6–8 · `08 §11.1`–`§11.4`, `§12` · `09 §8`–`§10`, `§17`, `§45`, `§47`–`§48` · `AGENTS.md §5`

## Dependencies

**Depends on:** B4 (media), B8 (revisions), B11 (exam), B12 (sessions and authorization).
**Depended on by:** B14, B16, B17. F13 pairs with this phase.

## Domains / modules affected

`ExecutionModule` (attempt portion). The most performance- and correctness-sensitive module in the system.

## API work

**Contract: `attempt.v1` — the narrowest and most carefully designed surface in the product (`08 §9`).**

| Endpoint                                     | Purpose                                                                       |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /v1/student/assessment`                 | The single available assessment, or none (`04 §53`)                           |
| `GET /v1/student/assessment/:examId/preview` | Instructions and rules before starting (`04 §54`)                             |
| `POST /v1/exams/:id/attempts`                | **Start attempt** — idempotent, transactional                                 |
| `GET /v1/attempts/:id`                       | Resume: attempt state, snapshot payload, saved answers, server remaining time |
| `PUT /v1/attempts/:id/answers/:questionId`   | Save one answer — idempotent, sequenced                                       |
| `POST /v1/attempts/:id/answers/batch`        | Flush an offline queue                                                        |
| `POST /v1/attempts/:id/heartbeat`            | Liveness (`ADR-0020`)                                                         |
| `POST /v1/attempts/:id/events`               | Integrity signals, off critical path                                          |

**The student payload never contains correct answers, marking metadata, or other students' data.** A contract test asserts this and blocks release on failure.

## Database work

- `ExamAttempt` with timing columns and state.
- **Partial unique index: at most one active attempt per (student, exam)** — `X-03`/`D-09`.
- `AttemptQuestionSnapshot` in the shape chosen by `ADR-0008` (per-question rows or one JSONB document).
- `AttemptAnswer` per `ADR-0007`, with a per-question sequence column for replay ordering.
- Snapshot immutability enforced by constraint once the attempt exists.
- Indexes tuned for the write path: answer upsert by (attempt, question) must be a single indexed operation.
- `school_id` denormalised onto attempt, snapshot, and answer tables per `D-01`.

## Background jobs

- **None on the answer path.** `09 §17` explicitly prohibits routing answer saves through the queue; answers commit synchronously to PostgreSQL and are acknowledged.
- Snapshot media prefetch coordination if `ADR-0021` requires it.

## Security / authorization work

- A student may act only on their **own** attempt; ownership is re-verified on every request.
- Attempt start re-validates the full eligibility predicate under lock (`07 §23`) — visibility alone is never sufficient.
- Client-supplied timestamps are **never** trusted for admissibility (`08 §11.4`); the server uses receipt time.
- Client-supplied `expires_at`, duration, marks, or scores are never accepted.
- Answers are rejected once the attempt is not writable, with a distinct non-retryable error code.
- Rate limiting sized so legitimate answer traffic is never throttled but abuse is bounded.

## Testing requirements

This phase's test list is the acceptance contract. **`09 §39`'s golden-path test and `09 §48`'s three conservative areas both land here.**

| Level                    | Requirement                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                     | Timer arithmetic; eligibility predicate; randomization determinism; sequence-ordering rules                                                                                                                      |
| Integration              | Start → snapshot → answer → resume → answer → submit against a real database                                                                                                                                     |
| **Concurrency**          | Simultaneous duplicate start (double-click, refresh, retry) creates exactly one attempt; 20, 100, 500, 1,000 simultaneous starts (`09 §40`)                                                                      |
| **Timer**                | Timer starts at `started_at`, not at session open; two students starting 15 minutes apart expire 15 minutes apart; a device clock changed backward does not extend the attempt; refresh does not reset the timer |
| **Refresh**              | Mid-attempt refresh restores identical question order, identical option order, and all saved answers                                                                                                             |
| **Network loss**         | Answers recorded while offline; queue flushed on reconnect; no answer lost                                                                                                                                       |
| **Reconnect**            | Out-of-order replay does not overwrite a newer answer (`X-04`)                                                                                                                                                   |
| **Duplicate submission** | Repeated identical answer writes are idempotent                                                                                                                                                                  |
| **Timeout**              | Writes past `expires_at` + grace are rejected; writes inside grace are accepted and flagged                                                                                                                      |
| **Invalidation**         | Invalidating a running attempt stops further writes with a non-retryable error                                                                                                                                   |
| **Makeup**               | A makeup attempt creates a new attempt without touching the original record                                                                                                                                      |
| **Security**             | Student A cannot read or write Student B's attempt; **the attempt payload contains no correct answers** (release-blocking); cross-tenant attempt access denied                                                   |
| Failure                  | Database transient failure during start does not create a partial attempt; snapshot creation failure rolls the attempt back entirely                                                                             |

## Frontend dependencies

**F13 consumes `attempt.v1`** and implements the offline engine against it. This is the deepest backend/frontend coupling in the product: the offline queue's correctness depends on the idempotency contract (`M-16`), the error envelope's `retryable` flag, and the sequence-ordering rule. F13 cannot be built correctly against an unstable `attempt.v1`.

## Integration dependencies

B14 finalises attempts created here. B12's Control Center reflects attempt state. B16 reads participation.

## Definition of Done

1. Starting an attempt creates the attempt and its complete snapshot in **one transaction**; failure of either leaves nothing behind.
2. A duplicate start — double-click, refresh, or retried request — yields exactly one attempt, enforced by database constraint.
3. `expires_at` is server-derived from `started_at` + granted duration; the client cannot influence it.
4. Two students starting at different times have independent, correct expiries.
5. Refresh mid-attempt restores byte-identical question and option ordering and every saved answer.
6. Answers persist synchronously and are acknowledged only after commit.
7. Offline answers queue locally, flush on reconnect, and none are lost.
8. Out-of-order replay never overwrites a newer answer.
9. Repeated identical writes are idempotent.
10. Writes after expiry plus grace are rejected; writes inside grace are accepted and flagged.
11. A device clock moved backward does not extend the attempt.
12. **The student-facing payload contains no correct-answer field** — asserted by a release-blocking contract test.
13. Snapshots are immutable; later revision of a bound question does not alter any existing snapshot.
14. Accommodations resolve at creation and freeze for the attempt's life.
15. Invalidating a running attempt stops writes with a distinct non-retryable error.
16. A student cannot access another student's attempt; cross-tenant access denied.
17. Question media is available offline per `ADR-0021`.
18. 1,000 concurrent attempts sustain the answer-save rate within the latency budget agreed in B21.

## Exit criteria

- ADR-0002, 0003, 0007, 0008, 0020, 0021 all decided.
- Every test in the table above passes in CI, with concurrency and timer suites wired as merge blockers.
- `09 §39`'s golden-path test passes end to end (jointly with B14).
- F13 confirms the contract is sufficient for the offline engine.

## Deferred items

- Question pools — pending `ADR-0002`; if approved, the start transaction gains a draw step and this phase's scope grows.
- Advanced anti-cheating enforcement — signals recorded only.

---

# B14 — Submission & Marking

**Status:** NOT STARTED · **Decided ADRs:** 0003 (cutoff), 0004 (auto-submission ownership)

## Objective

Deliver exactly-once submission, reliable auto-submission for abandoned attempts, and automatic objective marking that is idempotent and fully traceable to recorded answers.

## Scope

- Manual submission with confirmation, including the unanswered-count warning (`05 §37`).
- **Auto-submission per `ADR-0004`** (resolves `X-01`): a repeatable sweeper as the authority plus opportunistic finalisation, sharing one idempotent routine.
- Exactly-once submission via conditional state transition (resolves `X-07`).
- `AttemptQuestionResult` per question (`07 §9.4`) with `CORRECT / INCORRECT / UNANSWERED / PARTIAL`.
- Marking against the **snapshot's** correct answer, never the live question bank (`06 §72`).
- Marking idempotency — a re-queued job overwrites rather than duplicates.
- Submission → queue marking, keeping the interactive path minimal (`09 §18`, `§46`).
- Attempt finalisation durable before any downstream worker runs (`08 §14`).

## Specification references

`03 §46`–`§47`, `§74` · `05 §34`, `§37`, `§43` · `06 §56`–`§57` · `07 §9.4`, `§26`–`§29` · `08 §11.3`, `§14`, `§25` · `09 §18`, `§46`

## Dependencies

**Depends on:** B13.
**Depended on by:** B15, B16, B17. Pairs with F13 (submission UX) and F14.

## Domains / modules affected

`ExecutionModule` (submission), `ResultsModule` (marking).

## API work

| Endpoint                       | Purpose                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `POST /v1/attempts/:id/submit` | Submit — idempotent; returns final state                      |
| `GET /v1/attempts/:id/status`  | Post-submission status for the confirmation screen (`04 §59`) |

## Database work

- Attempt transition columns: `submitted_at`, final state.
- `AttemptQuestionResult` rows keyed on (attempt, snapshot) with a uniqueness constraint making re-marking an upsert.
- Answer immutability after submission enforced by constraint (`07 §38`).
- Index supporting the sweeper: attempts by state and `expires_at`.

## Background jobs

- **Auto-submission sweeper** — repeatable, finding `IN_PROGRESS` attempts past `expires_at` + grace, finalising idempotently.
- **Marking job** — per attempt, idempotent, retryable; a crash leaves the attempt finalised and marking resumable (`08 §25`).

## Security / authorization work

- Only the attempt's owner may submit manually; system paths submit on the student's behalf without an actor.
- Submission verifies attempt state and deadline server-side (`08 §11.3`).
- Marking runs server-side only; no client input influences a score.
- `ATTEMPT_SUBMITTED` and `ATTEMPT_AUTO_SUBMITTED` audited.

## Testing requirements

| Level           | Requirement                                                                                                          |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| Unit            | Marking arithmetic across correct, incorrect, unanswered; percentage and counts                                      |
| Integration     | Submit → mark → question results → totals                                                                            |
| **Concurrency** | Simultaneous manual submit + sweeper + opportunistic finalisation produce exactly one submission and one marking run |
| **Timeout**     | An abandoned attempt (browser closed, machine powered off) is auto-submitted by the sweeper and marked               |
| Idempotency     | Repeated submit returns the same final state without re-marking or duplicating results                               |
| Failure         | Marking worker crash mid-run; re-run completes correctly without duplicates; attempt remains finalised throughout    |
| Data integrity  | Marking uses snapshot answers; changing the question bank afterwards does not alter any mark                         |

## Frontend dependencies

**F13 consumes the submit contract** and the confirmation flow; **F14 consumes attempt status**.

## Integration dependencies

B15 creates results from marking output. The sweeper must coordinate with B12's Control Center so counts update.

## Definition of Done

1. Manual submission transitions `IN_PROGRESS → SUBMITTED`, freezes answers, and records the timestamp.
2. The confirmation warns of unanswered questions with an accurate count (`05 §37`).
3. Repeated submission is idempotent — one result, one marking run, same response.
4. Time expiry produces `AUTO_SUBMITTED` with no student interaction and no confirmation prompt (`05 §34`).
5. **An attempt abandoned entirely — browser closed, power lost — is auto-submitted by the sweeper and marked**, without which the exam could never reach `COMPLETED`.
6. A race between manual submit, sweeper, and opportunistic finalisation yields exactly one submission.
7. Marking evaluates every snapshot question and produces correct per-question results.
8. Totals, percentage, and correct/incorrect/unanswered counts are arithmetically correct against fixtures.
9. Marking is idempotent; re-running produces identical results without duplication.
10. A marking worker crash leaves the attempt finalised and marking resumable.
11. Editing the source question after the exam does not change any recorded mark.
12. Answers cannot be modified after submission — enforced by constraint.
13. Submissions are audited.

## Exit criteria

- ADR-0003 and ADR-0004 decided and implemented.
- Concurrency, timeout, and failure suites green as merge blockers.
- `09 §39`'s golden-path test passes end to end with B13.

## Deferred items

- Marking of non-objective question types (essay, short answer) — out of scope for this release (`05 §15.2`); `PARTIAL` exists in the model for future use.

---

# B15 — Results & Publication

**Status:** NOT STARTED · **Decided ADRs:** 0010 (publication model), 0018 (grading), 0025 (invalidation effect)

## Objective

Deliver result finalisation, grading, publication control, and the audited adjustment workflow — with every result traceable to its attempt and no path that silently changes a score.

## Scope

- `Result` (`07 §10.1`) derived from marking, never manually entered (`06 §56`).
- Result lifecycle per `ADR-0010`: marking states `PROCESSING → FINAL → ADJUSTED`, with visibility held in `ResultPublication` (resolves `C-05`).
- `VOIDED` state for results whose attempt was invalidated (resolves `A-11`, `D-08`).
- `ResultPublication` scoped per exam (resolves `A-09`).
- Publication policies: teacher publishes, School Admin publishes, automatic (`05 §47`), with the school-default/exam-override rule from `C-12`.
- Result detail visibility as a separate axis: score only / score + counts / full question review (`C-12`).
- `GradingScale` versioned per `ADR-0018` (resolves `M-06`); grade stored at finalisation with its scale version.
- `ResultAdjustment` (`07 §10.2`) with types `VOID_QUESTION`, `AWARD_MARK`, `DEDUCT_MARK`, `RECALCULATE`, `MANUAL_OVERRIDE`.
- Bulk adjustment as a resumable parent operation (resolves `X-14`).
- Student result access limited to published results (`05 §51`).

## Specification references

`01 §26`–`§28` · `03 §47`–`§53`, `§73` · `05 §43`–`§54` · `06 §54`–`§59` · `07 §10.1`–`§10.3`, `§19`, `§30`, `§34` · `02` (Results rows) · `04 §48`–`§49`, `§60`–`§61`

## Dependencies

**Depends on:** B14.
**Depended on by:** B17, B18. F15 and F14 pair with this phase.

## Domains / modules affected

`ResultsModule`.

## API work

**Contracts: `results.v1`, `student-results.v1`.**

| Endpoint                                            | Purpose                                               |
| --------------------------------------------------- | ----------------------------------------------------- |
| `GET /v1/exams/:id/results`                         | Scoped result list with summary statistics (`04 §48`) |
| `GET /v1/results/:id`                               | Individual result with per-question breakdown         |
| `POST /v1/exams/:id/results/publish` · `/unpublish` | Publication control                                   |
| `POST /v1/results/adjustments`                      | Create an adjustment (single or bulk)                 |
| `GET /v1/results/adjustments/:id`                   | Adjustment progress and outcome                       |
| `GET /v1/student/results`                           | Published results only (`04 §60`)                     |
| `GET /v1/student/results/:id`                       | Detail, gated by the visibility policy (`04 §61`)     |
| `GET/PUT /v1/school/grading-scales`                 | Grading configuration                                 |

## Database work

- `Result` with marks, percentage, counts, grade, grading scale version, state.
- **Uniqueness: one result per attempt** (`07 §13`), preserving the 1:1 cardinality.
- `ResultPublication` per exam.
- `ResultAdjustment` append-only with old/new values, reason, authoriser.
- `GradingScale` with versioned bands; editing creates a version rather than mutating.
- Indexes for the results list, student results, and analytics aggregation.

## Background jobs

- Result finalisation following marking.
- Automatic publication where policy dictates.
- **Bulk adjustment processing** — chunked, idempotent, resumable, with per-result child records and per-child audit events.
- Recalculation after adjustment.

## Security / authorization work

- **No generic "edit score" endpoint exists** (`05 §53`, `02 §6`). Score changes are only possible through `ResultAdjustment`.
- Publication is permission-gated per the resolved `C-12` rule; a teacher cannot override a locked school policy.
- Students see only published, non-voided results, and only their own.
- Every adjustment and publication change is audited with actor and reason.
- `MANUAL_OVERRIDE` is the most restricted operation in the product — School Admin only, reason mandatory, elevated audit event.

## Testing requirements

| Level              | Requirement                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | Percentage and count arithmetic; grade band resolution; adjustment recalculation                                                                                                 |
| Integration        | Mark → finalise → publish → student sees; unpublish → student no longer sees                                                                                                     |
| **Data integrity** | Every result traces to an attempt; a result cannot exist without one; adjustments replay in order to reproduce the original (`D-08`)                                             |
| **Adjustment**     | Void a question across 1,200 results — atomic or resumable, no partial visible state; re-run is idempotent                                                                       |
| Security           | Student cannot see unpublished, another student's, or voided results; teacher cannot see results outside assigned scope; no path mutates a score outside the adjustment workflow |
| Failure            | Adjustment worker crash mid-run resumes correctly; publication racing an adjustment resolves deterministically                                                                   |

## Frontend dependencies

**F15 consumes `results.v1`** for staff result views and publication. **F14 consumes `student-results.v1`.**

## Integration dependencies

B17 aggregates results and must exclude `VOIDED`. B18 exports results preserving statuses rather than converting to zeros (`05 §54`).

## Definition of Done

1. Marking produces a result with correct marks, percentage, and counts.
2. `PROCESSING → FINAL` occurs only after all question marking completes.
3. A result cannot exist without an attempt; the 1:1 constraint holds.
4. Invalidating an attempt moves its result to `VOIDED`; the result is retained, excluded from all aggregates, and hidden from the student while remaining visible to authorized staff with the reason.
5. Publication makes results visible to students; unpublishing reverses it; both are audited.
6. Automatic publication works where the policy selects it.
7. A teacher cannot override a school-locked publication policy.
8. Grades derive from the school's scale, are stored with the scale version, and do not change when the scale is later edited.
9. Raw marks and percentage remain available regardless of grading configuration (`05 §46`).
10. **No endpoint permits direct score modification.**
11. Voiding a question across an entire exam recalculates every affected result, is auditable per result, and is resumable after a crash without partial application.
12. Adjustment history replays to reproduce the original result.
13. Students see only their own published results, with detail gated by the visibility policy.
14. Cross-tenant and cross-scope access denied.

## Exit criteria

- ADR-0010, ADR-0018, ADR-0025 decided.
- Adjustment resumability and data-integrity suites green.
- F14 and F15 confirm their contracts.

## Deferred items

- Report cards and transcripts (`01 §53` — future expansion).
- Cross-exam aggregate grading (term averages, position in class) — not specified; record as a candidate.

---

# B16 — Participation, Absence & Makeup

**Status:** NOT STARTED · **Decided ADRs:** 0014 (reattempt authorization), 0024 (participation roll-up)

## Objective

Deliver participation and absence as first-class records separate from attempts and scores, plus the makeup workflow that creates a new attempt while preserving the original absence.

## Scope

- `ExamParticipation` (`07 §9.5`) as the authoritative participation record (resolves `D-07`).
- Participation roll-up across sessions per `ADR-0024` (resolves `A-05`).
- Absence confirmation at exam completion (`03 §41`, `05 §42`).
- `MakeupAuthorization` generalised to `AttemptAuthorization` per `ADR-0014` (resolves `C-11`, `M-04`).
- Makeup session creation and attempt linkage (`07 §33`).
- Attempt-limit interaction rules (resolves `X-12`): invalidated and cancelled attempts do not count; authorizations are single-use.
- Attempt invalidation with mandatory reason (`05 §30`).
- Removal of `participation_status` from `ExamAttempt` as an independent field (`D-07`).

## Specification references

`01 §8`–`§10` (second half) · `03 §42`–`§45`, `§75`–`§76` · `05 §39`–`§41`, `§42` · `06 §60`–`§61` · `07 §9.5`–`§9.6`, `§17`, `§33`, `§42` invariants 9–10 · `02` (Exam Administration rows) · `04 §47`

## Dependencies

**Depends on:** B12, B13, B14.
**Depended on by:** B17, B18. F16 pairs with this phase.

## Domains / modules affected

`ExecutionModule` (participation), `ResultsModule` (reporting integration).

## API work

| Endpoint                                            | Purpose                                                 |
| --------------------------------------------------- | ------------------------------------------------------- |
| `GET /v1/exams/:id/participation`                   | Participation across all sessions with the roll-up view |
| `POST /v1/exams/:id/participation/confirm-absences` | Confirm absences at completion                          |
| `POST /v1/exams/:id/makeup-authorizations`          | Grant makeup, reason captured                           |
| `DELETE /v1/makeup-authorizations/:id`              | Revoke before use                                       |
| `POST /v1/exams/:id/retry-authorizations`           | Exceptional reattempt (`ADR-0014`)                      |
| `POST /v1/attempts/:id/invalidate`                  | Invalidate with mandatory reason                        |

## Database work

- `ExamParticipation` per (exam, session, student) with the documented roll-up rule.
- `AttemptAuthorization` with `type` (`MAKEUP` / `RETRY`), single-use enforced by constraint, transitioning to `USED` atomically with attempt creation.
- Attempt-limit check expressed as a database-enforced invariant where possible.
- `ExamAttempt.participation_status` removed or made a generated projection.

## Background jobs

- Absence derivation at exam completion.
- Notification on makeup grant.

## Security / authorization work

- Only authorized roles grant makeup or retry (`02`).
- Invalidation requires a reason and emits `ATTEMPT_INVALIDATED`.
- **Makeup never modifies the original participation record** — enforced by test.
- Authorizations are single-use; replay is refused.
- All actions audited.

## Testing requirements

| Level              | Requirement                                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | Roll-up rule; attempt-limit arithmetic across invalidated and authorized cases                                                          |
| Integration        | Absent → grant makeup → student sees exam → new attempt → result; original absence intact                                               |
| **Data integrity** | **An absent student receives no result and no zero score** (`07 §42` invariant 9); makeup preserves the original absence (invariant 10) |
| Concurrency        | Two simultaneous attempts to consume one authorization — exactly one succeeds                                                           |
| Security           | Student cannot self-authorize; teacher cannot grant outside scope; cross-tenant denied                                                  |

## Frontend dependencies

**F16 consumes the participation and makeup contracts**; **F12 surfaces makeup access from the Control Center** (`04 §47`).

## Integration dependencies

B17's analytics must count participation correctly using the roll-up rule. B18's exports must preserve `ABSENT` (`05 §54`).

## Definition of Done

1. A student who never starts is recorded `ABSENT` at exam completion, with **no attempt and no result**.
2. An absent student never receives an automatic zero.
3. Granting makeup creates an authorization with a reason and makes the exam visible to that student.
4. The makeup attempt is a new attempt against the **same exam**, not a new exam.
5. The original absence record is unchanged after the makeup completes; both facts are reportable (`03 §43`).
6. An authorization is single-use; a second consumption attempt fails.
7. Two concurrent consumptions of one authorization yield exactly one attempt.
8. Retry authorization permits an attempt beyond `attempt_limit` where approved, and is audited distinctly.
9. Invalidated and cancelled attempts do not count toward `attempt_limit`.
10. Invalidating an attempt requires a reason, is audited, and voids its result (`A-11`).
11. Participation roll-up produces the correct exam-level view across multiple sessions without double-counting.
12. Cross-tenant and out-of-scope actions denied.

## Exit criteria

- ADR-0014 and ADR-0024 decided.
- Absence and makeup integrity tests green as merge blockers.
- F16 confirms the contract.

## Deferred items

- Excused-absence policy detail — `EXCUSED` exists in the model (`07 §9.5`) but no document defines who grants it or its reporting treatment. Record as a candidate.

---

# B17 — Analytics

**Status:** NOT STARTED · **Decided ADRs:** 0002 (pools affect question analytics), 0025 (voided exclusion)

## Objective

Deliver derived performance analytics for teachers, HODs, School Admins, and the platform — computed from authoritative records, never stored as the academic truth.

## Scope

- Teacher analytics: average, highest, lowest, pass rate, completion, question performance, class comparison (`05 §55.1`).
- HOD analytics: subject, class, and exam comparison; question difficulty; department trend (`05 §55.2`).
- School analytics: participation, performance, department comparison, session trends, assessment volume (`05 §55.3`).
- Platform analytics: schools, usage, activation, exam volume, subscription state (`05 §55.4`).
- Question performance: attempts, correct %, incorrect %, unanswered % (`05 §52`).
- **All aggregates exclude `VOIDED` results** and count participation via the `ADR-0024` roll-up.
- Analytics are derived and cacheable but never authoritative (`06 §75`).

## Specification references

`01 §44`–`§46` · `03 §52`–`§54` · `05 §52`, `§55` · `06 §75` · `02` (Analytics rows) · `04 §34`, `§50`

## Dependencies

**Depends on:** B15, B16.
**Depended on by:** B18. F17 pairs with this phase.

## Domains / modules affected

`AnalyticsModule` — reads across domains, owns no authoritative academic facts (`08 §5`).

## API work

**Contract: `analytics.v1`.**

| Endpoint                                | Purpose                          |
| --------------------------------------- | -------------------------------- |
| `GET /v1/analytics/exams/:id`           | Exam summary and distribution    |
| `GET /v1/analytics/exams/:id/questions` | Question performance (`04 §50`)  |
| `GET /v1/analytics/classes/:id`         | Class performance                |
| `GET /v1/analytics/departments/:id`     | Department comparison (`04 §34`) |
| `GET /v1/analytics/school`              | School-wide dashboard            |
| `GET /v1/analytics/students/:id`        | Student performance history      |
| `GET /v1/platform/analytics`            | Platform business analytics      |

## Database work

- No new authoritative tables.
- Materialised views or cached aggregate tables where query cost requires, always rebuildable from source.
- Indexes supporting aggregation over results and question results.

## Background jobs

- Aggregate refresh on a schedule and on result finalisation.
- Cache invalidation on publication, adjustment, and invalidation.

## Security / authorization work

- Every analytics query is scoped: teacher to assigned classes and own exams, HOD to department, Moderator and School Admin school-wide, Software Admin platform (`02`).
- **Analytics must never leak individual student data outside the caller's scope** — an aggregate over a scope the caller cannot read is itself a leak.
- Small-cohort aggregates must not become a re-identification channel; consider a minimum-cohort threshold for cross-student comparisons.
- Cache keys include tenant and scope (`08 §13`).

## Testing requirements

| Level              | Requirement                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | Every statistic against hand-computed fixtures                                                                                                    |
| Integration        | Aggregates recompute correctly after publication, adjustment, and invalidation                                                                    |
| **Data integrity** | Voided results excluded from every aggregate; absent students excluded from score averages but counted in participation                           |
| Security           | Teacher cannot obtain aggregates for unassigned classes; HOD confined to department; cache does not serve one tenant's data to another (`08 §13`) |
| Performance        | Analytics queries meet the latency budget on a realistic dataset (validated in B21)                                                               |

## Frontend dependencies

**F17 consumes `analytics.v1`** for all role dashboards.

## Integration dependencies

Depends on `VOIDED` semantics from B15 and the participation roll-up from B16. If `ADR-0002` approves pools, question analytics requires an exposure-weighted design (`C-09`).

## Definition of Done

1. Every statistic matches a hand-computed fixture.
2. Absent students are excluded from score averages and included in participation counts (`05 §54`).
3. Voided results are excluded from every aggregate.
4. Question performance correctly reports correct, incorrect, and unanswered percentages.
5. Aggregates refresh after publication, adjustment, and invalidation.
6. Every role sees only aggregates within its scope.
7. Cache entries are tenant- and scope-keyed; no cross-tenant serving is possible.
8. Analytics remain fully derivable — clearing every cache and rebuilding produces identical results.
9. Latency budget met on a realistic dataset.

## Exit criteria

- ADR-0002 decided (question analytics design depends on it).
- Derivability test green: caches cleared, aggregates rebuilt, results identical.
- F17 confirms the contract.

## Deferred items

- Advanced psychometrics and difficulty indices beyond correct-rate (`01 §44` mentions a difficulty index as a later possibility).
- Predictive or AI-driven analytics (`01 §53`).

---

# B18 — Reporting & Export

**Status:** NOT STARTED · **Decided ADRs:** 0030 (PDF versus print)

## Objective

Deliver scoped CSV exports and printable reports that preserve academic statuses truthfully rather than flattening them into numbers.

## Scope

- CSV export for results, student lists, teacher lists, class lists, question banks, participation (`05 §54`, `02`).
- **Status preservation**: `ABSENT`, `NOT ATTEMPTED`, `COMPLETED`, `AUTO-SUBMITTED` exported as themselves, never converted to zeros (`05 §54`).
- Printable reports per `ADR-0030` (browser print stylesheets recommended).
- Large exports generated asynchronously and delivered via controlled object-storage access (`08 §14`, `§15`).
- Role-aware search (resolves `M-17`) using PostgreSQL full-text search with per-corpus scope enforcement.

## Specification references

`01 §25` · `03 §51` · `05 §54`, `§18` · `02` (Reporting/Export rows) · `04 §51`, `§65` · `08 §14`–`§15`

## Dependencies

**Depends on:** B15, B16, B17.
**Depended on by:** none. F18 pairs with this phase.

## Domains / modules affected

`ReportsModule`, `SearchModule`.

## API work

| Endpoint              | Purpose                                               |
| --------------------- | ----------------------------------------------------- |
| `POST /v1/exports`    | Request an export by type and scope                   |
| `GET /v1/exports/:id` | Status and download reference                         |
| `GET /v1/search`      | Role-aware search across permitted corpora (`04 §65`) |

## Database work

- `ExportJob` with type, scope, requester, status, artefact reference, expiry.
- Full-text indexes on searchable columns.

## Background jobs

- Export generation, chunked for large datasets, writing to object storage.
- Export artefact expiry and cleanup.

## Security / authorization work

- Exports are generated only from the requester's authorized scope (`08 §8`).
- Download links are short-lived and single-recipient; an export artefact is not shared across users.
- **Search re-applies scope per corpus** — the highest-risk leak surface in the product (`M-17`), so each corpus needs its own isolation test.
- Export requests are audited, since they move academic data out of the system.

## Testing requirements

| Level          | Requirement                                                                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Unit           | CSV formatting; status mapping; escaping (including formula-injection defence in spreadsheet output)                   |
| Integration    | Export request → generation → download                                                                                 |
| **Security**   | Per-corpus scope enforcement in search; cross-tenant export impossible; download link cannot be reused by another user |
| Data integrity | Exported statuses match source records exactly; absent students are not exported as zeros                              |
| Performance    | A school-wide result export completes within budget                                                                    |

## Frontend dependencies

**F18 consumes the export and search contracts.**

## Integration dependencies

Depends on B17's aggregates for report content.

## Definition of Done

1. CSV exports generate for every specified type within the requester's scope.
2. `ABSENT` and `NOT ATTEMPTED` appear as statuses, never as `0`.
3. Large exports process asynchronously without blocking the API.
4. Download links are short-lived and cannot be used by another user.
5. Search returns only results within the caller's scope, verified per corpus.
6. Students have no global search access (`04 §65`).
7. Exports are audited.
8. CSV output is injection-safe when opened in a spreadsheet application.
9. Printable reports render correctly for the specified report types.

## Exit criteria

- ADR-0030 decided.
- Per-corpus search isolation tests green.
- F18 confirms the contract.

## Deferred items

- Server-rendered PDF (`A-13`) unless `ADR-0030` selects it.
- Scheduled or emailed recurring reports — not specified.

---

# B19 — Academic Session Rollover

**Status:** NOT STARTED · **Decided ADRs:** 0026 (rollover mechanics)

## Objective

Deliver session close, student promotion, and the structural rollover that carries a school into a new academic year without recreating its entire configuration by hand.

## Scope

- Session close with pre-flight validation (`03 §60`): no active exams, no pending results.
- Promotion candidate generation, review, and exception handling (`03 §61`–`§62`).
- Promotion outcomes: promote, repeat, change department, transfer, graduate, withdraw.
- Structural rollover per `ADR-0026` (resolves `M-10`, `M-11`): clone classes, class-subject offerings, and optionally teacher assignments into the new session as reviewable drafts.
- Session transition `CURRENT → CLOSED → ARCHIVED`, new session becomes `CURRENT`.
- Graduation moving students to `GRADUATED` without deletion (`03 §58`).
- Every promotion decision audited (`03 §62`).

## Specification references

`01 §35`–`§36` · `03 §60`–`§65`, `§58`, `§80` · `05 §7.1` · `06 §20`–`§22` · `07 §6.1`, `§6.7`, `§35` · `02` (Academic Progression rows)

## Dependencies

**Depends on:** B5, B6, B15 (pending results must be resolved before close).
**Depended on by:** none. F19 pairs with this phase.

## Domains / modules affected

`AcademicsModule`, `UsersModule`.

## API work

| Endpoint                                         | Purpose                                  |
| ------------------------------------------------ | ---------------------------------------- |
| `GET /v1/academics/sessions/:id/close-readiness` | Pre-flight checks (`03 §60`)             |
| `POST /v1/academics/sessions/:id/rollover/plan`  | Generate the rollover and promotion plan |
| `GET /v1/academics/rollovers/:id`                | Review the plan                          |
| `PATCH /v1/academics/rollovers/:id/decisions`    | Override individual student outcomes     |
| `POST /v1/academics/rollovers/:id/commit`        | Execute                                  |
| `POST /v1/academics/sessions/:id/close`          | Close and archive                        |

## Database work

- `RolloverPlan` and `RolloverDecision` capturing proposed and final outcomes per student.
- Cloned structure written as draft records in the new session.
- New `StudentEnrollment` rows for the new session; prior enrollments closed but preserved (`07 §35`).
- **Commit runs in one transaction** (`08 §7.3`) so a partial rollover is impossible.

## Background jobs

- Plan generation for large schools.
- Commit execution, chunked and resumable if the school is large enough that one transaction is impractical — in which case a documented compensating strategy is required, since `08 §7.3` prefers a single transaction.

## Security / authorization work

- Only School Admin and Moderator perform rollover (`02`).
- Every decision, including overrides, is audited with actor and reason.
- Rollover **never deletes** historical enrollments, exams, attempts, or results.
- Graduation deactivates accounts without removing academic history (`03 §58`).

## Testing requirements

| Level              | Requirement                                                                                                                                                          |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit               | Promotion candidate rules; exception handling                                                                                                                        |
| Integration        | Full rollover for a school with multiple levels and arms                                                                                                             |
| **Data integrity** | **Historical enrollments, exams, and results are unchanged after rollover**, asserted by full comparison; `SS2A 2026/27` and `SS2A 2027/28` remain distinct entities |
| Concurrency        | Two simultaneous commits — exactly one succeeds                                                                                                                      |
| Failure            | Interrupted commit leaves no partial state                                                                                                                           |
| Security           | Close is refused while active exams or pending results exist                                                                                                         |

## Frontend dependencies

**F19 consumes the rollover contract**, including the reviewable plan — `03 §61` insists promotion is never an instant mass update.

## Integration dependencies

Requires B15 so pending results can be detected. Requires B12 so active exams block closure.

## Definition of Done

1. Close readiness reports active exams and pending results and refuses closure until resolved (`05` edge-case matrix).
2. A rollover plan generates promotion candidates by level.
3. Individual outcomes can be overridden with a reason before commit.
4. Commit creates new-session enrollments, closes prior ones, and preserves them.
5. Cloned classes and offerings appear in the new session as editable records.
6. Teacher assignments carry forward or start empty per `ADR-0026`, and are reviewable either way.
7. Graduating students move to `GRADUATED` with history intact and accounts deactivated.
8. The old session becomes `CLOSED` then `ARCHIVED`; the new session becomes `CURRENT`; the single-current invariant holds throughout.
9. **A full before/after comparison proves no historical academic record changed.**
10. Every decision is audited.
11. Concurrent commits cannot both succeed.
12. An interrupted commit leaves no partial state.

## Exit criteria

- ADR-0026 decided.
- Historical-preservation comparison test green as a merge blocker.
- F19 confirms the contract.

## Deferred items

- Automatic promotion based on academic performance — `03 §61` requires human review; automation is not specified.
- Multi-year bulk archival tooling.

---

# B20 — Security Hardening & Compliance

**Status:** NOT STARTED · **Decided ADRs:** 0028 (data protection, retention)

## Objective

Harden the platform to production security standards and establish the data-protection posture a commercial platform holding minors' academic records requires.

## Scope

- Full security review against `08 §16`: hashing, session security, server-side authorization, input validation, upload isolation, rate limiting, administrative controls, encryption in transit, secret management, least privilege.
- Penetration-style testing of tenant isolation and privilege escalation.
- Dependency and container vulnerability scanning in CI.
- Security headers, CORS lockdown, CSP for the web tier.
- Observability per `08 §18`: OpenTelemetry traces on start-attempt, answer-sync, submit, and result generation; structured logs with correlation ids and tenant context; Sentry error tracking.
- **Exam Health Monitor** (`09 §37`): alerting on answer-save success rate, submission latency, active attempts, queue depth.
- Data-protection posture per `ADR-0028` (resolves `M-13`): controller/processor roles, DPA, subject-access and deletion handling consistent with `07 §42` invariant 14.
- Retention schedule (resolves `M-14`).
- Log hygiene: no credentials, no answer content, no unnecessary PII.

## Specification references

`08 §16`–`§18` · `09 §35`–`§37` · `02 §5`–`§6` · `07 §42` invariants 1, 14, 15 · `AGENTS.md §6`, `§8`

## Dependencies

**Depends on:** B1–B19 (there must be a system to harden).
**Depended on by:** B23. F20 pairs with this phase.

## Domains / modules affected

Cross-cutting.

## API work

- No new business endpoints.
- Security headers and CORS applied globally.
- Rate limiting tuned per endpoint class — authentication strictest, answer-save most permissive but still bounded.

## Database work

- Least-privilege database roles: the application role cannot alter audit rows or drop tables.
- Encryption-at-rest verification.
- Retention and archival jobs per `ADR-0028`.

## Background jobs

- Retention and archival execution.
- Security alert dispatch.

## Security / authorization work

This phase **is** the security work. Deliverables: a completed threat model, a remediated findings list, and evidence for each control in `08 §16`.

## Testing requirements

| Level         | Requirement                                                                                                                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Security**  | Full tenant-isolation suite across every endpoint; privilege escalation across all six roles; session fixation, replay, and CSRF; injection across all input surfaces; upload attacks; IDOR probes on every id-bearing endpoint |
| Integration   | Rate limits enforced without breaking legitimate exam traffic                                                                                                                                                                   |
| Observability | Traces present for the four critical flows; alerts fire under simulated degradation                                                                                                                                             |
| Compliance    | Retention jobs behave per policy and never delete records protected by invariant 14                                                                                                                                             |

## Frontend dependencies

**F20 pairs on CSP, secure headers, and client-side security posture.**

## Integration dependencies

The Exam Health Monitor depends on B13/B14 metrics being emitted.

## Definition of Done

1. Every control in `08 §16` is implemented and evidenced.
2. The full tenant-isolation suite passes against every endpoint in the product.
3. Privilege-escalation attempts fail for all six roles.
4. Dependency and container scans run in CI and block on high-severity findings.
5. Traces cover start-attempt, answer-sync, submit, and result generation.
6. Logs carry correlation ids and tenant context, and contain no credentials, answer content, or unnecessary PII.
7. The Exam Health Monitor alerts on a simulated drop in answer-save success (`09 §37`).
8. Rate limits protect the platform without throttling legitimate exam traffic under B21's load profile.
9. The data-protection posture is documented: controller/processor roles, DPA, subject-access handling.
10. The retention schedule is defined and implemented, and never deletes what invariant 14 protects.
11. Database roles follow least privilege; the application role cannot alter audit records.
12. Threat model completed and findings remediated or accepted with a recorded rationale.

## Exit criteria

- ADR-0028 decided.
- No unresolved high-severity findings.
- Security suites wired as merge blockers.

## Deferred items

- Third-party penetration test and formal certification (recommend scheduling before general availability; record as a launch-readiness item).

---

# B21 — Performance & Load

**Status:** NOT STARTED · **Decided ADRs:** 0032 (region selection)

## Objective

Prove the platform sustains real examination load — including the write pressure of concurrent answer persistence — and fix what the evidence shows is inadequate.

## Scope

- Load testing at the specified levels: 20, 100, 500, 1,000 concurrent attempts, plus stress beyond expected production load (`09 §40`).
- Exam write-pressure model: concurrent attempts × answer-save frequency × payload size (`08 §20`).
- Connection pooling and pooler introduction (`R-03`).
- Query and index tuning for attempt, answer, and result access paths (`08 §19`).
- Snapshot storage growth measurement (`R-05`).
- SSE connection scaling (`R-04`).
- Latency testing under simulated Nigerian network conditions (`R-08`, `R-09`).
- Load shedding and graceful degradation (`R-12`).
- Analytics query performance on realistic data volumes.

## Specification references

`08 §19`–`§20` · `09 §36`, `§40`–`§41`, `§48` · `01 §10`

## Dependencies

**Depends on:** B13, B14, B15, B17.
**Depended on by:** B23. F20 pairs with this phase.

## Domains / modules affected

Cross-cutting, concentrated on `ExecutionModule`.

## API work

Optimisation only. Any contract change must be coordinated with the paired frontend phase.

## Database work

- Index tuning informed by measured query plans, not by assumption.
- Connection pooler (PgBouncer or RDS Proxy) introduced and validated.
- Partitioning or archival strategy for snapshot and answer tables if growth warrants.

## Background jobs

- Queue throughput tuning; worker concurrency sizing.
- Confirmation that background work never starves the interactive path.

## Security / authorization work

- Rate limits validated against real load so they protect without throttling legitimate traffic.
- Load-shedding priority verified to preserve exam-execution endpoints over reporting.

## Testing requirements

| Level              | Requirement                                                                                                      |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Load**           | 20 / 100 / 500 / 1,000 concurrent attempts sustained for a realistic exam duration                               |
| **Concurrency**    | 500 simultaneous starts within a short window; 500 simultaneous submissions                                      |
| **Write pressure** | Sustained answer-save rate at each level, measuring latency percentiles and success rate                         |
| Network            | Simulated high latency and packet loss; lab burst of 40 clients starting within 60 seconds on a constrained link |
| Failure            | Load shedding preserves answer saves and submissions while degrading reporting                                   |
| Endurance          | A full-length exam at target concurrency without degradation or connection exhaustion                            |

## Frontend dependencies

**F20 participates** in client-side performance and the constrained-network profile — the client's batching and debouncing behaviour is part of what is being measured.

## Integration dependencies

Results feed B23's capacity plan and may require revisiting `ADR-0008` (snapshot shape) or the heartbeat interval from `ADR-0020`.

## Definition of Done

1. 1,000 concurrent attempts sustained with answer-save success and latency within agreed budgets.
2. 500 simultaneous starts create exactly 500 attempts — no duplicates, no failures.
3. 500 simultaneous submissions produce exactly 500 results.
4. Answer-save p95 and p99 latency meet budget at every level.
5. Connection pooling prevents exhaustion under horizontal scaling.
6. Snapshot and answer growth is measured and projected; the storage strategy is confirmed adequate.
7. SSE connection scaling validated for the expected number of simultaneous Control Centers.
8. The system behaves acceptably under simulated Nigerian network conditions, including the 40-client lab burst.
9. Load shedding preserves exam execution while degrading reporting, verified under stress.
10. Analytics queries meet budget on realistic data volumes.
11. Capacity plan and scaling runbook documented from measured evidence, not estimates.

## Exit criteria

- ADR-0032 decided; region validated with measured RTT.
- All load levels pass; regressions are tracked in CI where practical.
- Capacity plan reviewed and accepted.

## Deferred items

- Multi-region deployment (`08 §26` lists it as a decision topic; single-region initially).
- Read replicas unless load evidence requires them.

---

# B22 — Failure, Recovery & Disaster Recovery

**Status:** NOT STARTED · **Gating ADRs:** none

## Objective

Prove the platform survives component failure without corrupting examination data, and that backups actually restore a working system.

## Scope

- Failure-mode verification against `08 §25`'s table: network loss, transient database failure, worker crash, client crash, node crash, cache outage, object-storage outage, result-worker failure.
- Automated backups with point-in-time recovery (`08 §21`, `09 §32`).
- **Restore drills** into a non-production environment (`08 §21`).
- RPO and RTO targets defined and verified.
- Object-storage redundancy and versioning (`09 §22`).
- Runbooks for each failure mode.
- Chaos testing of the exam path specifically.

## Specification references

`08 §21`, `§25` · `09 §32` · `AGENTS.md §10`

## Dependencies

**Depends on:** B13, B14, B15, B21.
**Depended on by:** B23.

## Domains / modules affected

Cross-cutting; infrastructure-heavy.

## API work

- Health and readiness endpoints extended to report dependency status accurately for orchestration.

## Database work

- Automated backups with PITR configured and verified.
- Restore procedure documented and executed.

## Background jobs

- Job retry, dead-letter handling, and replay verified.

## Security / authorization work

- Backups encrypted; restore access is least-privilege and audited.
- Restored non-production environments must not contain live personal data unless anonymised (`08 §22`).

## Testing requirements

| Level          | Requirement                                                                                                                                        |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Failure**    | Every row of `08 §25`'s table verified by an actual induced failure, not by inspection                                                             |
| **Recovery**   | Full restore from backup into a clean environment; PITR to a chosen timestamp                                                                      |
| **Chaos**      | Kill an API node mid-exam; kill a worker mid-marking; drop Redis; drop object storage — assert no attempt, answer, or result is lost or duplicated |
| Data integrity | Post-restore verification that attempts, answers, and results are internally consistent                                                            |

## Frontend dependencies

None directly. The client's offline behaviour is exercised as part of the network-loss scenarios.

## Integration dependencies

Depends on B21's load profile so failures are induced under realistic conditions rather than on an idle system.

## Definition of Done

1. Every failure mode in `08 §25` is induced and the documented behaviour observed.
2. Killing an API node mid-exam loses no answers; clients reconnect and reconcile.
3. Killing a marking worker leaves attempts finalised; marking resumes without duplication.
4. A Redis outage degrades caching and realtime without corrupting the database.
5. An object-storage outage does not mark file-dependent content as permanently successful (`08 §25`).
6. **A full restore from backup produces a working system**, verified by running the golden-path test against it.
7. PITR to an arbitrary timestamp within the retention window works.
8. RPO and RTO targets are defined, measured, and met.
9. Runbooks exist for every failure mode and have been followed at least once by someone who did not write them.
10. Post-restore data-integrity checks pass.

## Exit criteria

- A restore drill completed successfully end to end.
- RPO/RTO documented and accepted.
- Chaos scenarios pass without data loss or duplication.

## Deferred items

- Multi-region failover (single-region initially).
- Automated continuous restore verification (recommend as a post-launch improvement).

---

# B23 — Production Readiness & Launch

**Status:** NOT STARTED · **Gating ADRs:** none (consumes prior decisions)

## Objective

Provision production infrastructure, complete the deployment pipeline, finish operational documentation, and take the platform live.

## Scope

- Production infrastructure: AWS ECS/Fargate, RDS PostgreSQL with Multi-AZ, managed Redis, S3, load balancer, DNS, TLS (`09 §31`–`§33`).
- Wildcard DNS and TLS if `ADR-0005` selected per-school subdomains.
- Vercel production deployment for the web tier (`09 §28`).
- CI/CD with migration safety, rollback strategy, and feature flags (`08 §23`).
- Environment separation: local, development, staging, production (`08 §22`, `PROJECT.md`).
- Backward-aware migrations so rollout never leaves old and new versions corrupting each other (`08 §22`).
- Operational documentation: runbooks, on-call, escalation, incident response.
- School onboarding documentation and lab-preparation guidance (`R-09`, `R-10`).
- Launch checklist and go/no-go review.

## Specification references

`08 §22`–`§23`, `§27`–`§28` · `09 §28`–`§34`, `§43` · `PROJECT.md` (environments) · `AGENTS.md §16`

## Dependencies

**Depends on:** B20, B21, B22.
**Depended on by:** nothing. F21 pairs with this phase.

## Domains / modules affected

Infrastructure and operations.

## API work

- Production configuration; no functional change.

## Database work

- Production RDS provisioning with backups, PITR, and the HA configuration chosen from B21 evidence.
- Migration rollout procedure rehearsed on a production-like dataset.

## Background jobs

- Production worker sizing from B21 measurements.
- Scheduled jobs enabled: expiry sweeps, auto-submission sweeper, retention, aggregate refresh.

## Security / authorization work

- Production secret management; no secrets in source (`AGENTS.md §8`).
- Least-privilege IAM for every service.
- Production access controls and break-glass procedures for operators.

## Testing requirements

| Level     | Requirement                                                                                                     |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| **E2E**   | The full golden-path test (`09 §39`) executed against staging with production-like configuration                |
| Smoke     | Post-deployment verification of every critical path                                                             |
| Migration | Forward and rollback rehearsed on a production-like dataset                                                     |
| **Pilot** | A real examination conducted end to end in a controlled pilot with a willing school before general availability |

## Frontend dependencies

**F21 pairs on production build, deployment, and the launch checklist.**

## Integration dependencies

Requires every prior phase complete. This is the final integration gate.

## Definition of Done

1. Production infrastructure is provisioned as code and reproducible.
2. Staging mirrors production configuration with non-production data.
3. CI/CD deploys to staging automatically and to production under control, with rollback rehearsed.
4. Migrations are backward-aware; a rollout window with mixed versions does not corrupt data.
5. The golden-path test passes against staging with production-like configuration.
6. Monitoring, alerting, and the Exam Health Monitor are live and routed to on-call.
7. Backups run in production and a restore has been verified there.
8. Runbooks and incident response are documented and rehearsed.
9. School onboarding and lab-preparation documentation exists.
10. The launch checklist is complete and go/no-go review has passed.
11. **A pilot examination has been conducted end to end with a real school**, and findings have been addressed.
12. `CLAUDE.md` and the roadmaps reflect the delivered state (`AGENTS.md §12`–`§13`).

## Exit criteria

- Pilot examination completed successfully.
- No unresolved BLOCKER or HIGH audit findings remain open.
- Go/no-go review passed.

## Deferred items

- Multi-region deployment.
- Formal certification and third-party penetration testing (schedule post-launch unless commercially required earlier).

---

## Cross-Phase Requirements

These apply to **every** phase and are part of every Definition of Done.

| Requirement                                                                                            | Source                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| Every school-scoped endpoint enforces tenant isolation and is covered by the generated isolation suite | `07 §42` invariant 1, `AGENTS.md §6` |
| Every sensitive action emits an audit event                                                            | `07 §42` invariant 15                |
| Every state transition is validated against its documented state machine                               | `07 §14`–`§19`                       |
| Historical records are never rewritten                                                                 | `07 §42` invariant 13                |
| No academic data is destroyed by any lifecycle operation                                               | `07 §42` invariant 14                |
| Authorization is evaluated from live database state, never from token claims                           | `09 §25`                             |
| Multi-record state changes are transactional                                                           | `08 §7.3`                            |
| Retry-sensitive operations are idempotent                                                              | `08 §3`                              |
| Errors conform to the canonical envelope                                                               | `ADR-0033`                           |
| Documentation and `CLAUDE.md` are updated when behaviour or architecture changes                       | `AGENTS.md §11`–`§12`                |

---

## Phase Completion Tracking

| Phase | Status      | Started    | Completed  | Notes                                           |
| ----- | ----------- | ---------- | ---------- | ----------------------------------------------- |
| B0    | COMPLETE    | 2026-08-25 | 2026-08-25 | Decided: ADR-0005, 0022, 0023, 0027, 0031, 0033 |
| B1    | NOT STARTED | —          | —          | Decided: ADR-0005, 0019, 0022                   |
| B2    | NOT STARTED | —          | —          | Decided: ADR-0012, 0023                         |
| B3    | NOT STARTED | —          | —          | Decided: ADR-0015, 0016, 0019, 0012             |
| B4    | NOT STARTED | —          | —          | Decided: ADR-0021                               |
| B5    | NOT STARTED | —          | —          | Decided: ADR-0001, 0011, 0013                   |
| B6    | NOT STARTED | —          | —          | Decided: ADR-0011, 0017                         |
| B7    | NOT STARTED | —          | —          | Settle A-17 in phase                            |
| B8    | NOT STARTED | —          | —          | Decided: ADR-0001                               |
| B9    | NOT STARTED | —          | —          | Decided: ADR-0001, 0017                         |
| B10   | NOT STARTED | —          | —          | Decided: ADR-0019                               |
| B11   | NOT STARTED | —          | —          | Decided: ADR-0002, 0013, 0029                   |
| B12   | NOT STARTED | —          | —          | Decided: ADR-0006, 0009, 0020                   |
| B13   | NOT STARTED | —          | —          | Decided: ADR-0002, 0003, 0007, 0008, 0020, 0021 |
| B14   | NOT STARTED | —          | —          | Decided: ADR-0003, 0004                         |
| B15   | NOT STARTED | —          | —          | Decided: ADR-0010, 0018, 0025                   |
| B16   | NOT STARTED | —          | —          | Decided: ADR-0014, 0024                         |
| B17   | NOT STARTED | —          | —          | Decided: ADR-0002, 0025                         |
| B18   | NOT STARTED | —          | —          | Decided: ADR-0030                               |
| B19   | NOT STARTED | —          | —          | Decided: ADR-0026                               |
| B20   | NOT STARTED | —          | —          | Decided: ADR-0028                               |
| B21   | NOT STARTED | —          | —          | Decided: ADR-0032                               |
| B22   | NOT STARTED | —          | —          |                                                 |
| B23   | NOT STARTED | —          | —          |                                                 |
