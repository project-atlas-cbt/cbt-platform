# CLAUDE.md

## Project

**Project Atlas**
Commercial multi-tenant Computer-Based Testing (CBT) platform for secondary schools, initially targeting Nigeria.

> The internal codename "Project Atlas" is temporary unless/until a final commercial product name is established.

---

## Project Status

**Current Stage:** Specification audit, roadmaps, and all 33 architecture decisions completed. Implementation has not yet started, but is now unblocked.

The project has completed:

- Product vision and scope
- Role and permission model
- School lifecycle definition
- Module and screen hierarchy
- Functional requirements
- Domain and data model
- ERD and state-transition specification
- Technical architecture
- Technology stack evaluation
- Specification audit (cross-document verification)
- Backend, frontend, and integration roadmaps
- All 33 architecture decision records

The current objective is to **begin the engineering foundation (`B0`)**.

All decision gates are cleared. `B0` may start, and `F0`'s design system plus `F13`'s offline exam engine may proceed in parallel.

---

## Source of Truth

The project specifications live in `/docs`.

Current specification set:

1. `docs/01-product-vision.md`
2. `docs/02-roles-permissions.md`
3. `docs/03-school-lifecycle.md`
4. `docs/04-module-screen-map.md`
5. `docs/05-functional-requirements.md`
6. `docs/06-domain-data-model.md`
7. `docs/07-erd-state-transitions.md`
8. `docs/08-technical-architecture.md`
9. `docs/09-technology-selection-and-technical-stack-evaluation.md`

`PROJECT.md` contains the project identity and high-level context.

These specification documents are the primary authority for product behaviour and architecture.

Do not duplicate their full contents here.

### Derived planning documents

| Document                            | Purpose                                                                                        |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `docs/audit/specification-audit.md` | Cross-document audit — 88 findings, 18 BLOCKER, 40 HIGH                                        |
| `docs/roadmaps/roadmap-index.md`    | Phase pairing, integration contracts, decision gates                                           |
| `docs/roadmaps/backend-roadmap.md`  | 24 backend phases, `B0`–`B23`                                                                  |
| `docs/roadmaps/frontend-roadmap.md` | 22 frontend phases, `F0`–`F21`                                                                 |
| `docs/decisions/`                   | Architecture Decision Records — **33 of 33 decided**; see its `README.md` for outcomes by gate |

The audit does not modify any specification. Where a specification and an ADR appear to conflict, **the ADR is the current decision** — it records a resolution the specifications left open or contradictory. Read the ADR's Context section for what it settled.

---

## Product Definition

This is a **school examination / CBT platform**, not an LMS.

The product focuses on:

- Question bank management
- Academic question review and approval
- Examination creation
- Examination activation and batch administration
- Individual student exam attempts
- Automatic objective marking
- Results and publication
- Assessment analytics
- School administration
- Academic structure
- Subscription-controlled school access
- Historical examination records

Do not introduce LMS functionality, learning materials, homework, attendance management, social features, or unrelated education-platform features unless explicitly approved.

---

## Core Product Principles

1. A school is an isolated tenant.
2. Permissions are determined by role plus academic/resource scope.
3. Historical academic records must be preserved.
4. Approved question revisions are immutable.
5. Exams reference specific approved question revisions.
6. An exam may be administered through multiple sessions/batches.
7. There is no mandatory global exam start/end clock.
8. Each student's attempt has its own timer.
9. Absence is separate from score and attempt state.
10. Makeup access creates a new attempt and never erases the original absence.
11. Submitted attempts are immutable by default.
12. Results must always be traceable to attempts and recorded answers.
13. Result adjustments must be explicit and auditable.
14. Student exam state must tolerate temporary connectivity loss.
15. Subscription expiry must never delete academic data.
16. Sensitive administrative actions must be auditable.
17. Student UX should remain focused on assessment, not become an LMS/social experience.

---

## Canonical Roles

### Platform

- Software Admin

### School

- School Admin
- Moderator
- HOD
- Teacher
- Student

The canonical permission model is defined in:

`docs/02-roles-permissions.md`

Do not invent additional permanent roles without explicit product approval.

---

## Canonical Technical Direction

The approved architectural direction is a modular monolith with clear domain boundaries and the ability to extract services later if justified.

Current technology baseline:

- TypeScript
- Node.js 24 LTS
- NestJS
- Fastify
- Next.js
- React
- PostgreSQL
- Prisma
- Redis-compatible infrastructure
- BullMQ
- IndexedDB/Dexie for resilient CBT client state
- Workbox/service-worker strategy
- REST/OpenAPI
- SSE initially for operational realtime
- Amazon S3-compatible object storage
- AWS ECS/Fargate
- AWS RDS PostgreSQL
- Managed Redis-compatible infrastructure
- Vercel for the Next.js application
- OpenTelemetry
- Sentry
- GitHub Actions
- Docker

The detailed technical decision record is:

`docs/09-technology-selection-and-technical-stack-evaluation.md`

Technology choices must still be validated during implementation where specific versions, infrastructure capabilities, or constraints have changed.

---

## Frontend Design Governance

Authoritative for all frontend visual/UX decisions:

- [`docs/design/ui-ux-principles.md`](docs/design/ui-ux-principles.md) — the design specification
  and rationale.
- [`.claude/skills/project-atlas-ui/SKILL.md`](.claude/skills/project-atlas-ui/SKILL.md) — the
  project-specific operational doctrine.

These specialize two project-scoped, vendored skills rather than replacing them:

- **`frontend-design`** (Anthropic, `.claude/skills/frontend-design/`) — general doctrine for
  deliberate, non-templated visual design. Selected as the primary aesthetic-direction skill per
  explicit instruction; it is the only skill of its kind installed.
- **`web-design-guidelines`** (Vercel, `.claude/skills/web-design-guidelines/`) — fetches and
  applies Vercel's live Web Interface Guidelines (~79 rules across accessibility, forms, motion,
  performance, i18n, and more) against implemented screens. Selected because it is a distinct
  capability — compliance _review_, not aesthetic _generation_ — from a reputable source, with no
  overlap with `frontend-design`'s doctrine.

Considered and **not installed**: a generic third-party `baseline-ui` skill (no single reputable,
identifiable source found under that name) and `nextlevelbuilder/ui-ux-pro-max-skill` (community-
maintained, ships an executable Python script as part of the skill, and its large stock style/
palette/animation database — including GSAP motion presets — skews toward marketing-site
aesthetics and would conflict with this product's restrained-motion, anti-generic-dashboard
doctrine). `web-design-guidelines`'s own accessibility coverage was judged sufficient that a
fourth, separate accessibility-only skill would be redundant.

All three skills are vendored directly into `.claude/skills/` (not installed via a plugin
marketplace) so they travel with the repository and are available to any future Claude Code
session working on it without extra setup.

---

## Implementation Status

### Completed

- [x] Product definition
- [x] Roles and permissions
- [x] School lifecycle
- [x] Module/screen map
- [x] Functional requirements
- [x] Domain/data model
- [x] ERD and state transitions
- [x] Technical architecture
- [x] Technology selection evaluation
- [x] Specification audit
- [x] Backend implementation roadmap
- [x] Frontend implementation roadmap
- [x] Roadmap cross-reference/index
- [x] Architecture decision records (33 of 33)
- [x] Repository engineering foundation (`B0`)
- [ ] Product implementation

### Current Phase

**`B0 — Engineering Foundation & Contracts`** — complete. `B1 — Identity & Authentication` is next.

Delivered: pnpm/Turborepo monorepo (`apps/api`, `apps/worker`, `apps/web`, five `packages/*`, `tests/`); NestJS 11 + Fastify skeleton; Prisma 8→7.9.1 against PostgreSQL 18.6 with a migration workflow and seed harness; Docker Compose for local Postgres + Redis (and, optionally, containerized `api`/`worker`); fail-fast env validation with the product name read from environment only; the ADR-0033 error envelope and idempotency contract, published in the OpenAPI document; UTC `timestamptz` storage with per-school timezone rendering (ADR-0027); the tenancy convention — denormalised `school_id`, composite FKs, and RLS with `FORCE ROW LEVEL SECURITY` — enforced by a schema lint and proved by an integration test against a real non-superuser application role; BullMQ wired end to end; the ADR-0031 technology-validation spike (NestJS + Fastify + Prisma + PostgreSQL + BullMQ + Redis, one transaction with a row-level lock, one queued job); and a four-job CI pipeline (lint/typecheck/unit/build, OpenAPI contract-drift check, integration tests, secret scanning).

One real bug the isolation test itself caught and B0 fixed: the local Postgres image's migration role is a superuser, which bypasses Row-Level Security unconditionally regardless of `FORCE` — so the running application now connects as a separate, non-superuser `atlas_app` role (`infra/postgres/init.sql`, `DATABASE_APP_URL`), never as the migration owner. See `docs/decisions/ADR-0023-row-level-security.md`'s neighbouring migration comment and `tests/tenancy/rls.integration.test.ts`.

`packages/contracts`' consumability by `apps/web` is proven (the web app imports and builds against it); F0 itself hasn't started, so B0's DoD item 9 ("F0 has confirmed it") stays open until F0 does.

**2026-08-25 gap closure (same day, before `B1` began):** the initial B0 pass left four items its own Scope and Security/authorization-work bullets called for, undelivered — B1 was gated on all four and could not have started cleanly without them. All are now closed; see `docs/roadmaps/backend-roadmap.md`'s B0 section (DoD items 10–13) and this file's Change Log entry below for detail: ADR-0005's tenant-resolution mechanism (Host-header subdomain parsing, replacing the `X-School-Id` placeholder), ADR-0022's cookie/CORS/CSRF primitives and domain plan, ADR-0019's `NotificationChannel` abstraction with a console/dev provider, and global rate-limit scaffolding (`ThrottlerGuard` + a Redis-backed storage).

May proceed in parallel with the rest of `B1`:

- `F0` design system and theming engine — no API surface.
- `F13` offline exam engine (Dexie schema, sync queue, state machine, timer) built against the published `attempt.v1` contract. This is the longest-lead frontend item.

---

## Roadmap

The authoritative implementation roadmap lives in `docs/roadmaps/`:

```text
docs/roadmaps/
├── roadmap-index.md      phase pairing, contracts, decision gates
├── backend-roadmap.md    B0–B23
└── frontend-roadmap.md   F0–F21
```

Phase IDs are **permanent**. Never renumber them — the audit, the index, and the ADRs all reference them. New work takes the next unused number.

Every phase defines its objective, scope, specification references, dependencies, API and database work, background jobs, security work, testing requirements, cross-project dependencies, Definition of Done, exit criteria, and deferred items.

### Critical path

```text
Gate 1 ADRs → B0 → B1 → B2 → B3 → B5 → B6 → B8 → B9 → B11 → B12 → B13 → B14 → B15 → …
```

`B13` (Attempt Engine) and `B14` (Submission & Marking) carry the most risk in the plan: gated by six ADRs, concentrating 8 of the 18 BLOCKER findings, and the phases where a defect surfaces during a live examination.

---

## Working Rules for Claude

Before implementing any meaningful feature:

1. Read the relevant specification(s).
2. Read the relevant roadmap phase in `docs/roadmaps/`.
3. **Check the phase's gating ADRs. If any is unresolved, stop — do not guess.**
4. Check the audit findings assigned to that phase (`docs/audit/specification-audit.md` §10).
5. Check current project state in this file.
6. Check `docs/decisions/` for existing ADRs.
7. Implement only within the approved scope.
8. Test to the level the phase requires.
9. Update relevant documentation if behaviour or architecture changed.
10. Update the roadmap status when a roadmap item is completed.
11. Update this file after meaningful project-state changes.

A phase marked `BLOCKED` in the roadmap means its gating decision has not been made. Starting it means building on a guess — which is exactly what the audit exists to prevent.

Do not silently change product requirements.

Do not silently change architecture.

If a new requirement or architectural need conflicts with the specifications, document the conflict and propose an explicit decision rather than silently choosing one.

---

## Definition of Done Principle

A feature is not "done" merely because the code compiles.

A roadmap item is complete only when its defined implementation, integration, validation, testing, and documentation requirements have been satisfied.

The relevant roadmap phase must define the exact Definition of Done.

---

## Decisions & Deferred Items

### Approved decisions

- Modular-monolith architecture initially
- PostgreSQL as authoritative system of record
- Individual attempt timer rather than global exam timer
- Exam sessions/batches instead of duplicate batch exams
- Immutable question revisions
- Immutable attempt snapshots
- Separate participation/absence from attempt/result
- Makeup as a new attempt against the same examination
- Audit-first approach for sensitive actions
- Resilient/offline-tolerant CBT client
- REST/OpenAPI API approach
- SSE initially for operational realtime
- AWS backend infrastructure + Vercel Next.js frontend

### Architecture decisions — all 33 resolved (2026-08-24)

Full outcomes: `docs/decisions/README.md`. The decisions that most change how the system is built:

**Identity and tenancy**

- Per-school subdomains; `login_identifier` unique **per school**, not globally (ADR-0005).
- Shared parent domain with the API on a sibling subdomain, giving same-site `HttpOnly` cookies (ADR-0022).
- Tenant isolation in three layers: denormalised `school_id` on every school-owned table (including execution tables), composite FKs, and RLS (ADR-0023).

**Academic model**

- `Subject.department_id` (one department, nullable) resolves HOD scope; `Question.level` (e.g. `SS2`, not `SS2A`) resolves teacher scope; `Topic` is a first-class entity (ADR-0001).
- `StudentSubjectRegistration` — auto-registered from class offerings, deregisterable for electives (ADR-0011).
- `ExamClass` join — one exam may serve several arms of the same level (ADR-0013).

**Exam engine**

- **Question pools deferred.** Fixed selection only; per-attempt question-order and option-order randomisation retained (ADR-0002).
- Post-expiry grace: 60s against **server receipt time**, flagged; non-retryable beyond (ADR-0003).
- Auto-submission: BullMQ sweeper **plus** opportunistic finalisation, sharing one idempotent routine (ADR-0004).
- Exam-level `access_mode`; participant rows always written; **one** eligibility predicate for both visibility and start (ADR-0006).
- Answers: mutable row + append-only event log, same transaction; per-question sequence numbers prevent out-of-order replay overwriting a newer answer (ADR-0007).
- Snapshot: **one JSONB document per attempt**, orders materialised, seed stored, client projection omits the answer key (ADR-0008).
- Question media cached into the client at attempt start; Start blocked until cached (ADR-0021).

**Results and operations**

- Publication lives in `ResultPublication` **per exam**; `Result.state` is marking-only (`PROCESSING/FINAL/ADJUSTED/VOIDED`) (ADR-0010).
- Software Admin: read + **audited break-glass**; content authoring denied; `ExamAdministrator` delegation for invigilation (ADR-0012).
- `AttemptAuthorization` (`MAKEUP`/`RETRY`), single-use, consumed atomically with attempt creation (ADR-0014).
- Subscription expiry: **14-day grace**; running attempts finish and mark; new activity blocked (ADR-0015).
- `PAUSED` is **not** a state — it is the UI label for `OPEN → CLOSED` (ADR-0009).

### Defect to prevent, not a decision (audit `X-05`)

`07 §9.2` places `correct_answer_snapshot` in the attempt snapshot; `08 §11.1` sends the attempt package to the client; `09 §8` stores it in IndexedDB. **The student-facing payload must never contain correct answers.** Handled by ADR-0008's client projection and enforced by a release-blocking contract test in `B13`. There is no ADR for this by design.

### Conditional decisions to carry forward

- **ADR-0028** — retention schedule is provisional; legal review is a gating item in `B20`.
- **ADR-0032** — `eu-west-1` chosen on reasoning; RTT must be measured from real Nigerian networks in `B21` and may trigger an amendment before `B23`.

### Deferred / intentionally not part of the immediate implementation

- Advanced AI proctoring
- Facial recognition
- Full LMS functionality
- Parent portal
- Advanced remote examination monitoring
- Other features explicitly classified as future expansion in the specifications

Deferred features must not be implemented opportunistically.

### Newly deferred by explicit decision (2026-08-24)

Deferred, not dropped. Must not be implemented opportunistically:

| Item                              | ADR      | Re-entry cost                                                                                 |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| Question pools (per-attempt draw) | ADR-0002 | Respecify snapshot construction, marks equality, and question analytics; `B11` and `B13` grow |
| Server-rendered PDF reporting     | ADR-0030 | `B18` gains a rendering pipeline, worker, artefact storage                                    |
| Multi-section exam authoring UI   | ADR-0029 | UI only — schema already supports it                                                          |
| HOD request/approval subsystem    | ADR-0017 | An entirely new phase; not costed anywhere                                                    |

### Scope added by the decisions

The decisions **added** three things the specifications did not model: `StudentSubjectRegistration` (ADR-0011), `ExamClass` multi-class targeting (ADR-0013), and `Topic` as a first-class entity (ADR-0001). Affected phases: `B5`, `B6`, `B8`, `B11`, `B12`, `B15`, `B17`, `B19`, `F6`, `F7`, `F9`, `F11`, `F12`.

### Gaps the specifications did not cover — now closed by ADRs

The audit found these required by the product lifecycle but absent from all nine documents. Each is now settled: transactional messaging (`M-07` → ADR-0019), student subject registration (`M-02` → ADR-0011), grading scale (`M-06` → ADR-0018), integrity signals (`M-08` → ADR-0020), attempt liveness (`M-09` → ADR-0020), session rollover mechanics (`M-10`/`M-11` → ADR-0026), timezone policy (`M-12` → ADR-0027), data protection and retention (`M-13`/`M-14` → ADR-0028), exam-operator delegation (`M-15` → ADR-0012), idempotency and error contract (`M-16` → ADR-0033).

---

## Change Log

Claude should append meaningful project-state changes here rather than rewriting historical entries.

### Initial State

- Product and architecture specification completed.
- Implementation has not started.
- Roadmap generation is the immediate next activity.

### 2026-08-24 — Specification audit and roadmaps

- All nine specifications (18,271 lines) read and cross-audited.
- `docs/audit/specification-audit.md` created: **88 findings — 18 BLOCKER, 40 HIGH, 26 MEDIUM, 4 LOW** across contradictions, ambiguities, missing requirements, architectural risks, data-model risks, and exam-engine risks.
- `docs/roadmaps/` created: index, backend roadmap (`B0`–`B23`), frontend roadmap (`F0`–`F21`). Every phase has a Definition of Done, exit criteria, and named cross-project contract dependencies.
- `docs/decisions/` established as the ADR home. **33 ADR IDs reserved, none written.**
- No specification was modified. No contradiction was silently resolved.
- Full approved product scope retained; nothing removed.
- Highest-risk findings: `C-04`/`M-01` (academic scope uncomputable from the model), `C-09` (question pools in `05` but absent from `06`/`07`), `X-01`/`X-02` (auto-submission unowned, cutoff policy undefined), `X-05` (answer key reaching client storage), `A-01` (login has no tenant resolution).
- Project state moves from _Roadmap Definition_ to _Decision Resolution_. The blocker is now decisions, not planning.

### 2026-08-24 — All 33 architecture decisions resolved

- All 33 ADRs written and accepted in `docs/decisions/`. Every decision gate is cleared; no roadmap phase is blocked.
- Twelve decisions requiring product, commercial, or domain judgement were referred to the project owner: academic scope model, question level, electives, multi-class exams, question pools, tenant resolution, operator authority, HOD request workflow, messaging channel, subscription grace period, AWS region, and retention posture. Twenty-one engineering-shaped decisions were taken against the audit's recommendations.
- **Approved deferrals:** question pools, multi-section authoring UI, server-rendered PDF, HOD request subsystem. Per-attempt question-order and option-order randomisation remain fully in scope.
- **Scope added:** `StudentSubjectRegistration`, `ExamClass`, `Topic` entity.
- Two decisions carry conditions: ADR-0028 (retention — legal review at `B20`) and ADR-0032 (region — RTT measurement at `B21`).
- Roadmap phase statuses moved from BLOCKED to NOT STARTED. Audit §2 retained as the finding → ADR mapping.
- Project state moves from _Decision Resolution_ to _Implementation_. **Next: `B0`.**

### 2026-08-25 — `B0` complete

- Monorepo scaffolded per `09 §26`: `apps/{api,worker,web}`, `packages/{contracts,validation,config,domain,db}`, `tests/`, `infra/`. pnpm + Turborepo, shared ESLint (flat config, type-aware) + Prettier, commit hooks.
- NestJS 11 + Fastify skeleton; `GET /v1/health` and `/v1/health/ready`; global `HttpExceptionFilter` and `IdempotencyInterceptor`; the ADR-0033 error envelope and `Idempotency-Key` contract are both implemented and published as reusable components in the generated OpenAPI document.
- Prisma against PostgreSQL 18.6 via a driver adapter (Prisma 8 doesn't exist as a GA release yet — pinned to 7.9.1, see ADR-0031's appendix); UUIDv7 primary keys; `timestamptz` everywhere; a migration proven to apply and roll back (`migrate deploy` / `migrate reset`) by an integration test.
- Tenancy convention (ADR-0023) enforced two ways: a custom ESLint-adjacent schema lint requiring `school_id` as the leading indexed column on every school-owned table, and an RLS bootstrap migration (`ENABLE` + `FORCE ROW LEVEL SECURITY` + policy) proven by a real cross-tenant-blocked integration test.
- That RLS test caught a genuine defect before it could ship: it initially passed for the wrong reason, because the local Postgres image's migration role is a superuser and superusers bypass RLS unconditionally (`FORCE` only affects non-superuser owners). Fixed by introducing a separate, non-superuser `atlas_app` role (`infra/postgres/init.sql`) that the running application connects as via a new `DATABASE_APP_URL`, and by adding `packages/db`'s `grantAppRole()` to re-assert that role's grants after any `migrate reset` (a full schema drop/recreate silently wipes them). `DATABASE_URL` is now the migration/schema-owner connection only.
- All five `packages/*` (`domain`, `contracts`, `config`, `validation`, `db`) build to real `dist/` output (`main`/`exports` point there, not at `.ts` source). Two different reasons forced this, discovered separately: Next.js/Turbopack cannot resolve the NodeNext `./file.js`-style relative imports these packages use when consumed as raw TypeScript source (`packages/domain`, `packages/contracts` — needed for `apps/web`'s build); and `apps/api`/`apps/worker`'s real `start` script (`node dist/main.js`, used by Docker and eventually production) uses plain `node` with no TypeScript loader, which can't import `.ts` source either (`packages/config`, `packages/validation`, `packages/db` — this only surfaced once `node dist/main.js` was actually run for the first time, since every earlier verification went through `tsx`, which papers over exactly this gap). `tsconfig.base.json` now pins `tsBuildInfoFile` inside `dist/` — TypeScript's default location sits next to `tsconfig.json`, outside it, so `nest-cli.json`'s `deleteOutDir: true` was wiping `dist/` without invalidating the matching incremental-build cache, leaving a rebuild's `tsc` believing (wrongly) that nothing had changed and silently emitting nothing. `turbo.json` gained `globalDependencies` for the shared config files every package extends, for the same class of reason: a change to `tsconfig.base.json` wasn't invalidating any package's turbo cache before this.
- `packages/db`'s generated Prisma client lives outside `node_modules` by design (a committed custom `output` path) — its CJS runtime bundle resolves its own dependencies by climbing `node_modules` from _that_ location, which pnpm's strict linking doesn't populate with `@prisma/client`'s own transitive dependencies. Fixed by declaring `@prisma/client-runtime-utils` as an explicit dependency of `packages/db` (see `prisma/schema.prisma`'s generator comment) — without it, `node dist/main.js` fails at boot with `Cannot find module '@prisma/client-runtime-utils'`.
- Making `packages/config` dist-based surfaced a genuine ordering cycle in the documented setup sequence: `packages/db/prisma.config.ts` imports `@atlas/config`, so `pnpm db:generate` needs `@atlas/config` built _first_ — but `packages/db`'s own build needs `db:generate`'s output (the generated Prisma Client) to typecheck against. Neither a plain `pnpm build` nor the old `pnpm db:generate` quickstart step alone can come first. Resolved by inserting an explicit `pnpm --filter @atlas/config run build` step before `db:generate`, in both `README.md`'s quickstart and `infra/docker/Dockerfile.node`.
- BullMQ wired end to end (enqueue → process → complete → retry), proven by both a unit-level probe queue and an integration round trip against real Redis.
- ADR-0031's technology-validation spike passes: NestJS 11 + Fastify + Prisma 7.9.1 + PostgreSQL 18.6 + BullMQ + Redis, one transaction with a row-level lock, one queued job — compatibility matrix and the Node-24-vs-22.18 / Prisma-7-vs-8 deviations recorded in that ADR's appendix.
- CI (`.github/workflows/ci.yml`): lint/typecheck/unit/build; an OpenAPI contract-drift check that fails the build if `openapi.json`/`packages/contracts` generated types don't match committed source; the full integration suite plus the spike, against ephemeral Postgres/Redis service containers (with the same `atlas_app` role bootstrapped by hand, since GitHub Actions' `services:` containers can't mount a custom init script); Gitleaks secret scanning.
- Docker Compose covers local Postgres + Redis always, and optionally `api`/`worker` too (`docker compose up -d --build`) via a shared dev Dockerfile — not the production image, which stays deferred to `B23`.
- `pnpm generate` produces `apps/api/openapi.json`; `packages/contracts` compiles against it and `apps/web` (Next.js 16, Turbopack) builds importing it — B0 Definition of Done item 9's "F0 has confirmed it" stays open, since F0 hasn't started yet.
- No `TODO`/placeholder remains in the tenancy or error-handling primitives. Full pipeline (`pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration && pnpm spike`) green.
- Project state moves from _Implementation (B0)_ to _Implementation (B1)_. **Next: `B1 — Identity & Authentication`.**

### 2026-08-25 — Frontend design governance established (preparation only, no UI built)

- Prepared the repository for frontend implementation without building any screens, per explicit
  instruction. `apps/web` remains the `B0`-era placeholder; `F0` has not started.
- Inspected candidate skills and installed three, vendored (not marketplace-installed) into
  `.claude/skills/` so they travel with the repo and load for any future session:
  `frontend-design` (Anthropic — aesthetic-direction doctrine), `web-design-guidelines` (Vercel —
  live-fetched accessibility/UX compliance checklist, ~79 rules), and a new project-specific
  `project-atlas-ui` skill that specializes both for this product.
  `nextlevelbuilder/ui-ux-pro-max-skill` and a generic `baseline-ui` skill were inspected and
  rejected — see "Frontend Design Governance" above for the reasoning.
- Created `docs/design/ui-ux-principles.md`: product character, per-role UX philosophy (School
  Admin, Moderator, HOD, Teacher, Student), CBT-runtime and Exam-Control-Center design principles,
  branding/token architecture (one school colour + logo → derived, accessibility-guaranteed
  tokens — never a hard-coded school colour), anti-patterns, accessibility, network-resilient UX,
  motion, and component philosophy (shadcn/ui as implementation foundation, restyled to Project
  Atlas's own tokens).
- `AGENTS.md` gained a "Frontend / UI Work" section (§18) pointing at both design-governance
  documents, with a before-building and before-declaring-complete checklist; renumbered the old
  §18 ("Default Behaviour") to §19.
- `CLAUDE.md` gained the "Frontend Design Governance" section above.
- No product/architecture specification was changed. No roadmap phase status changed — `F0` is
  still NOT STARTED. No UI feature, screen, or component was implemented.

### 2026-08-25 — `B0` gap closure: tenant resolution, cookie/CORS/CSRF, notifications, rate limiting

Four items `B0`'s own Scope and Security/authorization-work bullets called for were not actually
delivered when `B0` was first marked complete. `B1` was gated on all four and could not have
started cleanly without them. Closed as a continuation of `B0`, not new `B1` scope — `B1`
(login/session/reset flows themselves) is untouched.

- **ADR-0005 tenant resolution.** `apps/api/src/common/tenancy.middleware.ts` now does real
  Host-header subdomain parsing (`subdomain.ts`, pure/unit-tested) against `School.subdomain`,
  replacing the `X-School-Id` placeholder header entirely — nothing in the codebase referenced it
  outside that one file, so the replacement was clean. `PLATFORM_ROOT_DOMAIN` is a new required
  env var; reserved labels (`api`/`admin`/`www`) and the bare root domain correctly resolve no
  tenant. `TenancyContextService` now also carries the raw parsed `subdomain` (not just
  `schoolId`), so a future "unknown subdomain" response can be distinguished from "no subdomain
  present at all." Local-dev convention: `PLATFORM_ROOT_DOMAIN=localtest.me`, a public domain
  whose wildcard record already resolves every subdomain to `127.0.0.1` — real browser testing of
  subdomain resolution needs no `/etc/hosts` edits or local DNS. Documented in the new
  `docs/operations/domain-plan.md`. Production wildcard DNS/TLS stays deferred to `B23` per the
  ADR's own "Required changes" table — B0's job was the mechanism, not the certificate.
- **ADR-0022 cookie/CORS/CSRF.** CORS (`apps/api/src/security/cors.ts`) is now genuinely
  multi-subdomain-aware: any `https://*.<PLATFORM_ROOT_DOMAIN>` origin is allowed, plus the exact
  configured `WEB_ORIGIN` as a local-dev escape hatch (a single static origin couldn't express
  ADR-0022's "every school's subdomain" topology). CSRF protection is a double-submit primitive —
  a signed, `HttpOnly` secret cookie plus a per-request token the client echoes back in
  `X-CSRF-Token` on mutating requests — built on `@fastify/csrf` (token logic) and `cookie` /
  `cookie-signature` (parsing/signing) rather than `@fastify/csrf-protection`, whose enforcement
  hook writes its own raw Fastify error response directly and would have bypassed the ADR-0033
  envelope entirely. The token is bound to the resolved tenant (`userInfo`) specifically to
  mitigate cookie-tossing across school subdomains, a threat ADR-0022's shared-parent-domain
  topology invites and `@fastify/csrf`'s own docs name `userInfo` as the mitigation for. New
  `COOKIE_DOMAIN` env var for B1's session cookie. Domain plan written down in
  `docs/operations/domain-plan.md`. Session issuance itself remains B1 scope untouched.
- **ADR-0019 `NotificationChannel` abstraction.** New `packages/notifications`: a
  `NotificationChannel` interface, a `{{token}}`-substitution `TemplateRegistry`, and
  `ConsoleNotificationChannel` — the decided B0 provider (a working dev/console transport, not a
  stand-in; real SES/Postmark selection and SPF/DKIM/DMARC stay deferred to `B23` per the ADR).
  Wired into `apps/api` via a new `NotificationsModule` (`NOTIFICATION_CHANNEL` /
  `NOTIFICATION_TEMPLATE_REGISTRY` DI tokens). No real product templates ship here by design —
  B1/B3/B10 register their own against the same registry when they send real messages
  (password reset, activation keys, staff invitations, expiry warnings).
- **Global rate-limit scaffolding.** `@nestjs/throttler`'s `ThrottlerGuard` is bound globally via
  `APP_GUARD` with a generous, env-configurable baseline (`RATE_LIMIT_MAX` /
  `RATE_LIMIT_WINDOW_SECONDS`, defaults 300/60s). Storage is `RedisThrottlerStorage` — a small,
  purpose-built `ThrottlerStorage` implementation using an atomic Lua script against the existing
  `REDIS_CLIENT`, not a third-party community storage adapter of uncertain maintenance status for
  what's fundamentally a well-specified atomic counter. `B1` layers tighter, endpoint-specific
  limits onto the authentication routes via `@Throttle()` on top of this baseline — the whole
  point of choosing `@nestjs/throttler` (a Nest-native decorator-driven primitive) over a raw
  Fastify-level limiter.

**Two real bugs found only by writing and running the integration tests, not by inspection:**

1. `CsrfGuard` was originally `CsrfMiddleware`. Under `@nestjs/platform-fastify`, an exception
   _thrown from NestMiddleware_ reaches `HttpExceptionFilter` with the **raw** Node
   `http.IncomingMessage`/`ServerResponse` standing in for `FastifyRequest`/`FastifyReply` — not
   the Fastify-decorated objects a controller-thrown exception gets. `req.raw` and `res.status()`
   don't exist there, so the filter crashed (`Cannot read properties of undefined (reading
'correlationId')`) and the request hung until timeout instead of ever returning a response.
   Guards run inside Nest's real request-handling pipeline (after routing, before the handler) and
   receive the genuine Fastify-decorated request/reply, so `CsrfMiddleware` became `CsrfGuard`,
   bound via `APP_GUARD` alongside `ThrottlerGuard` instead of `consumer.apply(...)`. The
   AsyncLocalStorage-based `CsrfContextService` this depended on was deleted along with it — a
   guard's return value doesn't keep executing "underneath" it the way a middleware's `next()`
   callback does, so that hand-off pattern only ever worked for `TenancyMiddleware` (still genuine
   middleware) in the first place. A later handler that needs the current CSRF secret now reads
   `request.csrfSecret`, set directly on the shared Fastify request object instead.
2. `TenancyContextService` was originally provided directly by `AppModule` and exported from it —
   fine for anything else `AppModule` itself provides, but invisible to `SecurityModule`'s own
   `CsrfGuard` provider, which depends on it. Extracted into a new `@Global() TenancyModule`
   (mirroring `RedisModule`/`AppConfigModule`'s existing pattern for shared singletons) so the
   _same_ `AsyncLocalStorage`-backed instance `TenancyMiddleware` populates is reachable from any
   module, not just ones that happen to import `AppModule` directly (which nothing can, being the
   root). Without this, `NestFactory.create(AppModule)` failed outright with
   `UnknownDependenciesException`, first surfacing (confusingly) as a native V8 crash inside
   Vitest's worker-fork pool rather than a readable error — diagnosed by reproducing the same boot
   via a plain `node dist/main.js`/`tsx` run outside Vitest's crash-swallowing wrapper, which
   printed the real dependency-resolution error clearly.

Also caught and fixed during this pass, smaller: a third-party type-declaration bug in
`@fastify/csrf@8.1.0` (`Parameters<T>`/`ReturnType<T>` on an overloaded constructor type collapses
to the last signature, so the `userInfo: true` variant is mistyped as the plain `TokensSimple`
shape) — worked around with a narrow, documented local type assertion after confirming the
_runtime_ behaviour is correct; a `cookie@2.0.1` API rename (`parse`/`serialize` →
`parseCookie`/`stringifySetCookie` in that major version); and an `AsyncLocalStorage` test-authoring
mistake of its own (reading `TenancyContextService`'s live getters _after_ `.run()`'s callback had
already resolved and returned, which always sees the "no active context" default regardless of
what was actually resolved inside — fixed by snapshotting the store from inside the callback).

Full pipeline green after every fix: `pnpm lint && pnpm typecheck && pnpm test && pnpm build &&
pnpm test:integration && pnpm spike`, plus a live `docker compose up -d --build api worker`
verification — health, readiness, a Host-header subdomain request, and the CSRF cookie / rate-limit
headers all confirmed correct against the real containerized stack before tearing the app
containers back down to the native-dev-recommended state.

`docs/roadmaps/backend-roadmap.md`'s B0 section gained DoD items 10–13 covering these four items,
an updated Security/authorization-work and Testing requirements section, `ADR-0019` added to B0's
Decided ADRs list, and explicit Deferred-items entries for the two things that genuinely do stay
deferred to `B23` (wildcard DNS/TLS; real email provider + SPF/DKIM/DMARC).
`docs/roadmaps/roadmap-index.md`'s Immediate Next Actions corrected two items that had overstated
what blocks `B1` — provisioning real DNS and selecting a real email provider are `B23` scope, not
prerequisites `B1` needs to start, now that B0 delivers working local-dev/CI equivalents of both.
