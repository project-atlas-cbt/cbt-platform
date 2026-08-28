# CLAUDE.md

## Project

**Project Atlas**
Commercial multi-tenant Computer-Based Testing (CBT) platform for secondary schools, initially targeting Nigeria.

> The internal codename "Project Atlas" is temporary unless/until a final commercial product name is established.

---

## Project Status

**Current Stage:** Implementation, in progress. Specification audit, roadmaps, and all 33
architecture decisions were completed first (see below); backend phases `B0`–`B6` and frontend
phases `F0`–`F3` are now complete. See "Implementation Status" and "Change Log" further down in
this file for what has actually shipped and what's next.

The planning phase completed:

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

All decision gates are cleared — no roadmap phase is blocked on an undecided ADR.

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

**`B1 — Identity & Authentication`** — complete. **`F0 — Frontend Foundation & Design System`** —
complete. **`F1 — Authentication & Tenant Entry`** — complete (two DoD items honestly partial —
Software Admin login functionality and real per-school branding colour, both deferred by design,
not oversight; see this file's Change Log entry below). **`B2 — Authorization & Tenancy Engine`**
— complete (one DoD item, the generated cross-tenant test-suite generator, honestly deferred
forward — the underlying cross-tenant guarantee itself is proven two other ways; see this file's
Change Log entry below). **`F2 — App Shell, Navigation & Notifications`** — complete (three DoD
items honestly partial, all gated on backend phases that don't exist yet — the context switcher's
session/term half and Teacher/HOD historical-session viewing on `B5`, notifications on `B10`; see
this file's Change Log entry below). **`B3 — Platform, Schools & Subscriptions`** — complete: the
full platform tenant lifecycle, Software Admin authentication (closing the deferral `B2` pushed
here), and the ADR-0015/0016 access gate — one DoD-adjacent item (the generated cross-tenant
test-suite generator) still honestly deferred forward again, plus a handful of newly-scoped-down
items recorded below. **`F3 — Platform Admin Workspace`** — complete: the real Software Admin
dashboard, school list/detail/create, and subscription/activation-key management, closing the real
gap of the admin shell having been wired to the school session instead of the platform one — two
DoD items honestly partial (four School Detail tabs gated on `B10`/`B11`; Schools-list pagination,
closed the same day as `B4` — see below), plus two small additive `B3` gap-closures found and fixed
along the way (recorded below and in `backend-roadmap.md`'s B3 section). **`B4 — Media, Storage &
Branding`** — complete:
tenant-isolated object storage (`ObjectStorageService`, MinIO locally/AWS S3 in production) and the
school branding system, resolving audit finding A-18 (colour is freely editable, not one-time) and
closing F1's second honestly-flagged partial DoD item — the branded login page now renders a
school's real logo and colour. Two DoD items honestly partial (asset-immutability and
branding-doesn't-alter-history proven structurally/narrowly now, fully only once `B8`/later phases
exist), plus real virus scanning and AWS bucket-policy provisioning explicitly out of scope (see
this file's Change Log entry below). **`B5 — Academic Structure`** — complete: the session-scoped
academic hierarchy (`AcademicSession`/`AcademicTerm`/`Department`/`ClassGroup`/`Subject`/
`ClassSubject`/`HODAssignment`) every later phase depends on, `GET /v1/academics/context`, and the
real `DEPARTMENT` scope resolver closing B2's fail-closed placeholder — built **ahead of `F5`, at
explicit project-owner instruction**, a deliberate, stated deviation from the frontend/backend
phase-pairing default (not a silent skip — see this file's Change Log entry below for the full
reasoning and the honestly-scoped-down items). **`B6 — People, Profiles & Enrollment`** — complete:
`people.v1` (student/teacher/HOD/moderator directories and lifecycle), `StudentEnrollment`/
`TeacherAssignment`/`StudentSubjectRegistration` added to `AcademicsModule`, the real `ASSIGNED`
scope resolver closing B2's other fail-closed placeholder, and ADR-0011's mandatory registration
auto-registration/reconciliation/deregistration — built immediately after `B5`, continuing straight
down the backend critical path per the same explicit project-owner instruction (see this file's
Change Log entry below). No DoD item was left partial. **`F5 — School Settings & Branding`**,
**`F6 — Academic Structure Workspace`**, and **`F7 — People Management Workspace`** are all now
open; any may proceed next per the pairing rule, and **`F4 — School Onboarding Wizard`** is reachable
for the first time (its pair needed `B3`+`B4`+`B5`+`B6` together).

B3 delivered: the platform tenant lifecycle end to end — `platform.v1`/`schools.v1`/
`subscriptions.v1`, all published in `apps/api/openapi.json`/`packages/contracts`. Software Admin
now has a real session (`PlatformSession`/`PlatformSessionService`/`PlatformAuthGuard`/
`PlatformAuthService`, paralleling identity's own `Session`/`AuthGuard` by convention, not shared
code) — `POST/GET /v1/platform/auth/{login,logout,me}` — closing the deferral `B2` recorded
explicitly for this phase. `POST /v1/platform/schools` creates a school (`PROVISIONAL`) + its
initial School Admin (`User.status = INVITED`, no password yet) + a `PENDING` subscription + an
`INITIAL_ACTIVATION`-purpose `ActivationGrant`, atomically (a manual `prisma.$transaction` sets the
RLS session variable mid-transaction, since the school's own id — needed for `withTenant` — doesn't
exist until partway through). `POST /v1/activation/{verify,redeem}` complete the flow — redemption
sets the admin's password and flips School/Subscription to `ACTIVE`; both purposes (initial
activation and renewal) share one endpoint, authorized purely by key possession (a simplification
found during implementation, dropping an originally-planned additional "renewal requires an
authenticated session" check as redundant — the key is already single-use and school-scoped).
Suspend/reactivate/deactivate (`SchoolPlatformOverride`) block access **immediately** — enforced
centrally by `AuthGuard`, for an already-open session and a fresh login attempt alike, not only new
platform actions. The access gate is genuinely two functions, not one column
(`@atlas/domain/platform/access-gate.ts`): `resolveSchoolStatus` (the persisted, cached
`School.status` label) and `resolveAccessGate` (the live, grace-aware capability ADR-0015's 14-day
window actually depends on — `School.status` can already read `EXPIRED` while capability is still
`FULL`). Wrapped by `AccessGateService`, deliberately registered in its own `@Global()`
`AccessGateModule` rather than inside `PlatformModule`, specifically so identity's own `AuthGuard`
can inject it without `IdentityModule` importing `PlatformModule` (which itself imports
`IdentityModule` — a real cycle this avoids). `apps/worker` gained its first BullMQ **repeatable**
job (`Queue.upsertJobScheduler` — BullMQ 6 removed `Queue.add`'s old `repeat` option, a real API
difference from the original plan) — a combined subscription-expiry sweep and platform-metrics
aggregation pass, iterating every school one at a time via `withTenant` rather than one global
query, because `FORCE ROW LEVEL SECURITY` means `atlas_app` cannot see rows across schools in an
unscoped query (a real constraint found while implementing, not anticipated in the original plan).
Platform metrics are consequently cached in Redis (`@atlas/domain`'s `PLATFORM_METRICS_CACHE_KEY`)
and read-only from the API side — computed periodically, never live per request.

Two real bugs found only by integration testing, not by inspection: re-issuing an activation key
via `POST .../activation-grants` always sent the renewal-wording email regardless of the grant's
actual purpose, so a re-issued _initial_ activation key told the new School Admin to "enter it from
your subscription screen," which doesn't exist yet (fixed to branch on `purpose`); and the sweep's
warning-threshold selection picked the _largest_ crossed threshold (30) instead of the tightest/
most urgent one (7), caught by a table-driven integration test asserting the real value.

Honestly scoped down, not silently dropped: **Moderator activation-key redemption delegation**
stays `deferred()` in the permission table exactly as B2 left it (no delegation mechanism is
specified anywhere — that's `ADR-0017` territory) — School Admin only, for now. **Subscription-
level suspend/cancel** (as opposed to school-level `SchoolPlatformOverride`) — the enum values exist
to match `07 §4.2`, but no B3 endpoint ever sets them. **Self-service Software Admin password
change** — the seeded account ships with a directly-usable password (dev/ops bootstrap via
`packages/db/prisma/seed.ts`), not a forced-change one; no `/v1/platform/auth/password/change`
endpoint exists. **The generated cross-tenant test-suite generator** B2 deferred here specifically —
still not built; B3 proved cross-school isolation the same two ways B2 did instead (a real
integration test for the cross-school activation-key case, plus an extended RLS suite covering
`Subscription`/`ActivationGrant`), pushed forward again rather than silently dropped.

F2 delivered: the real role-aware application shell (`components/shell/`) replacing F1's five
placeholder per-role landing pages — `AppShell`, `RoleNavigation`, `ContextSwitcher`,
`NotificationPanel`, `ProfileMenu`, `OfflineIndicator`, all wired into six new route-group layouts
(`/admin`, `/school`, `/moderator`, `/hod`, `/teacher`, `/student`). Navigation is computed live
from `GET /me/permissions` (`lib/nav/`), not hand-maintained per role — `nav-model.ts` pins every
role's item list verbatim against `04 §68`'s own per-role "Primary Navigation" lists, and excludes
break-glass-only grants (ADR-0012) from routine nav. `RouteGuard` gained a `requireRole` prop
(replacing the removed `RoleLandingPage`) as the one shared place a wrong-role visitor is bounced
to their own workspace. Every nav destination without a built screen yet renders through one
`[...slug]` catch-all per role (not ~30 empty stub files) — a later phase's real `page.tsx`
supersedes it automatically. Three DoD items are honestly partial, all blocked on backend phases
that don't exist yet, not silently faked or dropped: the context switcher shows the school name
and a working multi-role switcher today, but no session/term (`B5`); Teacher/HOD historical-session
viewing, same `B5` gap; the notification bell/panel is real chrome over an honest "not yet
available" empty state (`B10`). Real browser E2E remains deferred (as F1 already recorded) —
substituted with component tests exercising the real `useNavigation`/`usePermissions`/`apiClient`
stack for all six roles. Two gaps found and explicitly deferred, not fixed opportunistically
(`AGENTS.md` §14): self-service password change has real backend support (B1) but no frontend
entry point — `ProfileMenu` deliberately omits a link to the forced-only `/password/change` screen
rather than shipping one that would immediately bounce the user back out; and School Admin's `04
§11` "highly visible Subscription indicator" has no data source until `B3`. See
`docs/roadmaps/frontend-roadmap.md`'s F2 section for the full DoD/Implementation-notes breakdown.

F0 delivered: the Next.js 16 App Router application (`apps/web`) with Tailwind v4 + a
shadcn/ui-pattern component library restyled to Project Atlas's semantic design tokens; an
OKLCH-based branding derivation engine (`lib/theme/derive-palette.ts`) that guarantees WCAG AA
contrast on every school colour, adjusting lightness/chroma (never hue) and reporting when it
does; a typed API client (`lib/api/client.ts`, `openapi-fetch` against `@atlas/contracts`'s
generated types) with a normalised `ApiError`/`NetworkError` type the UI branches on; TanStack
Query for admin server state (explicitly never the exam runtime); and PWA/service-worker
scaffolding (`@serwist/next`) that precaches the app shell. A dev-only component workbench
(`/workbench`, not `/_workbench` — see the roadmap's own note on why) demonstrates every component
in its default/loading/error/empty states. See `docs/roadmaps/frontend-roadmap.md`'s F0 section
for the full DoD breakdown and three real implementation gotchas found while building it (Serwist
vs. Turbopack's webpack-config conflict, a Serwist build-time bug from referencing
`self.__SW_MANIFEST` twice, and `apps/web`'s relative imports needing to be extensionless rather
than the backend packages' `.js`-suffixed NodeNext convention).

Delivered: the `User`/`SchoolMembership`/`RoleAssignment`/`StudentProfile`/`TeacherProfile`/`Session`/`PasswordResetToken` schema (RLS-protected where school-owned; `User` itself is tenant-independent by design); the `auth.v1` contract — `GET /tenant/resolve`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`, `POST /auth/password/change`, `POST /auth/password/reset/request`, `POST /auth/password/reset/confirm` — published in `apps/api/openapi.json` and consumed by `packages/contracts`; Argon2id hashing (`@node-rs/argon2`); session cookies (sign/rotate/revoke, reusing B0's cookie-signing convention); forced first-login password change enforced centrally by `AuthGuard`; staff password reset over the `NotificationChannel` abstraction (B0); per-`(school, identifier)` lockout plus tighter per-route rate-limit overrides on the auth endpoints; and the credential-sheet one-time-reveal primitive (`CredentialSheetService`), scoped down from the roadmap's literal "per class" wording since `ClassGroup`/bulk import don't exist yet — confirmed with the project owner before implementation.

Two engineering decisions worth knowing about going forward: `login_identifier` lives on `SchoolMembership`, not `User` (07 §5.1's literal placement doesn't survive ADR-0005's per-school-uniqueness requirement without breaking the multi-school membership model — see `backend-roadmap.md`'s B1 section for the full reasoning); and Software Admin login is explicitly out of B1's scope (no `SchoolMembership` model for a platform-level account yet — that's B2/B3's job).

See this file's Change Log for two real bugs B1 found in B0-owned infrastructure and fixed as part of closing B1 out (`HttpExceptionFilter` never applying to any test that boots `AppModule` directly, and `tsx` crashing `NestFactory.create(AppModule)` with no error output once `IdentityService` existed).

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

### Frontend/backend phase pairing (2026-08-25)

Default posture going forward, per explicit project-owner instruction: **once a frontend phase's
corresponding/depending backend phase(s) are built, build that frontend phase too**, before moving
further down the backend critical path — unless there is a strong, stated reason to defer it for
that specific phase (say so explicitly; don't skip silently). Reasons: proves the contract end to
end rather than in isolation, and lets manual testing against a real UI start as early as possible
instead of waiting for the whole backend critical path to finish. `F0`/`F13` have no backend
dependency and may proceed independently at any time. See `AGENTS.md` §19 for the full rule; this
does not retroactively require building frontend for phases already completed before this
instruction, only going forward from `B1`/`F1`.

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

**Documentation inconsistency, noted during `B5` (2026-08-28), not silently resolved**: ADR-0001's own "Required changes" list names `Topic` under `B5`'s work — but `backend-roadmap.md`'s phase-by-phase Scope sections for both `B5` and `B8` independently place `Topic` in `B8` instead (it needs `Subject` to exist, which `B5` provides, but `B5`'s own Scope/DoD never lists it). `B5` followed the roadmap's phase-by-phase split as authoritative and did not build `Topic` — building it in `B5` would have double-delivered against `B8`'s own Definition of Done. The ADR's decision text is unedited; this note exists so a future reader isn't confused by the mismatch.

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

### 2026-08-25 — `B1` complete: identity, sessions, and authentication

Followed the working-rules checklist first: read `07 §5.1`–`§5.5`/`06 §6`–`§12` (identity domain
model), `02` (login/reset/force-reset rows), `03 §11`–`§17` (credential distribution), the B1
roadmap phase, its three gating ADRs (0005/0019/0022), and audit findings A-01/A-02/C-14 — then
verified B0's own 2026-08-25 gap-closure deliverables were real (not just documented) by re-running
the full pipeline before building on them, per the user's explicit instruction earlier that session.

**Schema** (`packages/db/prisma/schema.prisma`, one migration
`20260825143757_b1_identity_and_auth`): `User` (tenant-independent — no `school_id` at all, exempted
in `scripts/lint-schema-tenancy.mjs` alongside `School`), `SchoolMembership`, `RoleAssignment`,
`StudentProfile`, `TeacherProfile`, `Session`, `PasswordResetToken` — all RLS-protected where
school-owned, following B0's `(school_id, id)` composite-FK convention. `TenancyProbe`/
`TenancyProbeChild` dropped in the same migration per their own doc comment ("safe to delete once a
real school-owned table exists to carry the isolation-test suite instead") —
`tests/tenancy/rls.integration.test.ts` now proves cross-tenant isolation against
`school_memberships` instead.

**Two schema decisions made during implementation, both confirmed with the project owner first
(`AGENTS.md §3`) rather than guessed:**

- `login_identifier` moved from `User` (07 §5.1's literal placement) to `SchoolMembership`. `User`
  has no `school_id` — one person can hold membership at more than one school (06 §7/§9's own
  example) — so a field ADR-0005 requires unique _per school_ can't live there without either
  breaking that model or falling back to global uniqueness (which breaks two schools both having
  student "ST001", the exact thing ADR-0005 exists to fix). `SchoolMembership` already represents
  "this person's relationship with this school" (07 §5.2), so the field — and
  `@@unique([school_id, login_identifier])` — moved there instead.
- `User.email` was added even though no B1 source document lists it. Staff-facing `NotificationChannel`
  sends (ADR-0019) need an address to send _to_, and nothing in `06`/`07` puts one anywhere — a real
  gap the schema design surfaced, not present in any earlier draft. Nullable: students never have
  one, by ADR-0019's own design.

**`auth.v1`** (`apps/api/src/modules/identity/`, published in `apps/api/openapi.json`):
`GET /tenant/resolve` (branding placeholder + a CSRF token — B4 adds real branding fields to `School`
later, not replaces this response), `POST /auth/login|logout|refresh`, `GET /auth/me`,
`POST /auth/password/change|reset/request|reset/confirm`. Session cookies reuse B0's
`cookie`/`cookie-signature` signing convention (`SessionService`) rather than introducing a second
one; the raw bearer token is never stored, only its sha256. Refresh creates a new `Session` row and
revokes the old one atomically (rotation, not reuse) — DoD item 6. `AuthGuard` re-reads
`User`/`SchoolMembership`/`RoleAssignment` from the database on every request (09 §25's rule, which
B1's own roadmap text names as the phase that establishes it) and centrally enforces the forced-
password-change gate (`PASSWORD_CHANGE_REQUIRED`, new in `packages/domain`'s `BASE_ERROR_CODES`) —
one `@AllowPendingPasswordChange()` decorator on `POST /auth/password/change` is the only exception,
so the gate can't be bypassed by calling any other route (DoD item 8). Argon2id via `@node-rs/argon2`
(prebuilt binaries, not the source-compiling `argon2` package — matters concretely on this Windows
dev box) with OWASP-profile parameters passed explicitly. Enumeration resistance: every login
failure branch (unknown identifier, wrong password, locked out, `INVITED`/`SUSPENDED`/`INACTIVE`
user, `ENDED` membership) collapses to one identical `UNAUTHENTICATED` response — `IdentityService
.evaluateLogin`'s internal `LoginOutcome` union is what tests assert the _distinct_ server-side
reasoning against (DoD item 3's "distinct handling"), never the wire response. Lockout
(`AuthLockoutService`, Redis, per `(school_id, login_identifier)`) layers under `@Throttle()`
per-route IP overrides on the auth endpoints, per `SecurityModule`'s own anticipated design.

**Credential sheets, scoped down explicitly (confirmed with the user before implementing):**
`CredentialSheetService` delivers the one-time-reveal primitive only — issue a system-generated
initial password for a given list of student `SchoolMembership` ids, store only its hash
(`MUST_CHANGE_PASSWORD`), render the CSV. No controller route in B1. `ClassGroup` (B5) and bulk
import (B7) don't exist yet, so "generate correctly for a class, after import" (the roadmap's
literal DoD item 7 wording) can't be built end to end yet — `B6`'s own Background jobs already list
"Credential-sheet generation for a class after import" as that phase's job, so this isn't scope
newly deferred, just the primitive it will wrap arriving early.

**Software Admin login is explicitly out of scope.** ADR-0005 names a distinct platform host for it,
but Software Admin has no `SchoolMembership` in this model (`PLATFORM_ROLES` vs `SCHOOL_ROLES`,
`packages/domain`) and B1's login path is tenant-scoped by construction. Platform-level account
provisioning belongs to B2 (`ADR-0012` break-glass authority) / B3 (school creation) — recorded as a
deferred item in `backend-roadmap.md`'s B1 section rather than guessed at.

**Two real bugs found only by testing, not by inspection — both in B0-owned infrastructure, both
fixed as part of closing B1 out:**

1. `AppModule` never registered `HttpExceptionFilter` — only `main.ts`'s imperative `bootstrap()`
   did, via `app.useGlobalFilters(...)`. Every integration test that boots `AppModule` directly via
   `NestFactory.create()` (the established pattern — `health.integration.test.ts`,
   `notifications.module.integration.test.ts`) therefore never got the real ADR-0033 envelope on an
   error path; it just happened not to matter before because none of those tests exercised one.
   B1's own integration suite does, extensively, and every guard-thrown `AppHttpException`
   (`AuthGuard`'s `UNAUTHENTICATED`, etc.) came back as a bare framework 500 instead of the correct
   401/403 envelope. Fixed at the source, not per-test: `HttpExceptionFilter` is now bound via
   `APP_FILTER` in `AppModule` itself, so any harness that boots the module graph gets it — and
   `main.ts`'s own manual registration was removed (keeping both would double-handle every
   exception, since the filter calls `res.send()` directly).
2. `tsx`'s esbuild-based transform crashes `NestFactory.create(AppModule)` with **no error output at
   all** (not a catchable exception — the process just exits 1) specifically once `IdentityService`
   is registered as a provider — bisected by commenting providers/controllers out one at a time.
   The identical boot succeeds under Vitest's transform (proven repeatedly — the whole integration
   suite exercises it) and under plain `node` against the compiled `dist/` output. This broke
   `pnpm generate` (`openapi:emit` runs `tsx src/openapi/emit.ts`) locally, and would have broken
   CI's OpenAPI contract-drift job too — that job already runs `nest build` immediately before
   calling `openapi:emit`, but the script itself still read live TypeScript source via `tsx`,
   unaffected by the build having just happened. Fixed by changing `openapi:emit` itself to
   `nest build && node dist/openapi/emit.js` — the only one of the package's three standalone
   scripts (`dev`, `spike`, `openapi:emit`) that boots the _whole_ `AppModule`, which is exactly
   the condition that triggers this.

Also caught while writing `rate-limit.integration.test.ts` down further (pre-existing B0 test, not
new B1 code): it used a fixed default `remoteAddress` with no variance, so its Redis-backed
per-IP/per-route throttle counter accumulates across separate `vitest run` invocations against the
same long-lived local Redis (docker compose, not a fresh-per-run CI container) — re-running
`pnpm test:integration` twice within the 60s window failed the _first_ request instead of the
third. Fixed with a randomised-per-process fake IP, the same fix applied to B1's own
`identity.integration.test.ts` (which hit the identical class of issue with its per-identifier
lockout test) from the start.

Full pipeline green, each run repeated at least twice to specifically confirm neither of the two
flakiness bugs above still reproduces: `pnpm lint && pnpm typecheck && pnpm test && pnpm build &&
pnpm test:integration && pnpm spike`, plus `pnpm generate` (OpenAPI + `packages/contracts`
regeneration) and a live `node dist/main.js` verification — real HTTP via `curl` against a seeded
school and student, Host-header subdomain resolution, the CSRF cookie/token dance, login, session
cookie, `/auth/me`, logout, and a correctly-401'd post-logout `/auth/me` — before tearing the
process and its seed data back down.

`docs/roadmaps/backend-roadmap.md`'s B1 section gained DoD-item checkmarks, the `login_identifier`
placement rationale under Database work, and Deferred-items entries for credential-sheet class
grouping and Software Admin login. `docs/roadmaps/roadmap-index.md`'s Current State and Immediate
Next Actions moved from "B1 next" to "B2 next, F1 can start now that `auth.v1` is frozen."
Project state moves from _Implementation (B1)_ to _Implementation (B2)_.
**Next: `B2 — Authorization & Tenancy Engine`.**

### 2026-08-25 — New rule: frontend/backend phase pairing; `F0` started same day

Immediately after B1 closed out, the project owner set a new standing rule (not a one-off
decision): once a frontend phase's corresponding backend phase(s) are built, build that frontend
phase too, before continuing further down the backend critical path — so contracts get proven end
to end and manual testing against a real UI can start as early as possible. Recorded in
`AGENTS.md` §19 and this file's Working Rules section. `F0`'s backend pair (`B0`) was already
done, so F0 started the same day, ahead of `B2`.

### 2026-08-25 — `F0` complete: frontend foundation and design system

Followed the working-rules checklist: read `frontend-roadmap.md`'s F0 section, `docs/design/
ui-ux-principles.md`, and `.claude/skills/project-atlas-ui/SKILL.md` before writing any code. No
gating ADR blocks F0. Planned and scoped in a dedicated plan-mode pass, explicitly narrowed to F0
only at the project owner's instruction — F1 was deliberately left out of this pass.

**Tooling landed in `apps/web`** (previously the bare B0 placeholder — `app/layout.tsx`/
`app/page.tsx` only): Tailwind CSS v4 + a shadcn/ui-pattern component library (owned source,
restyled to this project's tokens — not shadcn's default styling), Radix primitives per component,
`culori` for OKLCH colour math, `react-hook-form` + `@hookform/resolvers` + `zod` for the shared
form-validation pattern, `openapi-fetch` for the typed API client, `@tanstack/react-query` for
admin server state, `@serwist/next` for Workbox-based PWA scaffolding, `lucide-react` for icons,
and `vitest` + `@testing-library/react` + `jsdom` for component/unit tests (matching every other
workspace's existing Vitest convention — apps/web had none before this). Every dependency is tied
to a specific F0 scope line, not added for convenience (`AGENTS.md` §9).

**Theming engine** (`lib/theme/derive-palette.ts`): one school primary colour derives the full
brand/neutral token set in OKLCH — perceptually uniform, so lightness/chroma adjustments predict
their effect on contrast accurately. **Accessibility outranks exact colour reproduction**: every
derived brand-primary/foreground pairing is verified against WCAG AA (>=4.5:1); a colour that can't
clear that bar unadjusted has its lightness swept first, then chroma as a last resort — hue is
never touched — and the adjustment is reported (`PaletteAdjustment`), not applied silently, so a
future branding screen (F5) can explain it. Calibrated and tested against 8 sample colours
including one mid-tone teal-gray (`#5E8284`) that clears AA with neither white nor black text —
found by a real contrast sweep, not guessed — specifically to prove the adjustment path, not just
the happy path. Status tokens (success/warning/danger/info) are fixed constants, independently
calibrated against WCAG AA, never derived from a school's colour.

**Component library** (`components/ui/`): Button, Input, Label, Form (a react-hook-form context
wrapper wiring `aria-describedby`/`aria-invalid`/`role="alert"` automatically — errors
programmatically associated with their field, not just visually adjacent), Select, Checkbox,
RadioGroup, Table primitives + a generic `DataTable` (caller-owned sort/pagination state, so it's
server-side-pagination-ready without F0 inventing the real data-fetching layer), Dialog, Tabs,
Badge (semantic status, never colour-only), Skeleton, EmptyState, ErrorState (branches on the
ADR-0033 envelope's `retryable` flag), and ErrorBoundary (contains a render failure to one section
rather than blanking the whole screen, per doctrine's explicit rule). A dev-only workbench route
(`app/workbench/` — **not** `app/_workbench/`, since a leading underscore is Next's "private
folder" convention and would make the route unreachable rather than merely hidden) demonstrates
every component across its default/loading/error/empty states, gated by `notFound()` outside
development (verified: 404 under `next start`, 200 under `next dev`).

**Typed API client** (`lib/api/client.ts`): `openapi-fetch` typed directly against
`@atlas/contracts`'s generated `ApiPaths`, always `credentials: 'include'` (the session is an
`HttpOnly` cookie per ADR-0022, never a token this code could read), with an `X-CSRF-Token`
attach point wired but unset until F1 supplies a real token from `tenant/resolve`. Proven end to
end against B0's Definition of Done item 9 (the one thing it left open): a real `GET /v1/health`
call from the workbench succeeds against a running API.

**Three real implementation problems found only by actually building and running this, not by
inspection** — all fixed, all now documented inline where the fix lives:

1. **Serwist vs. Next 16's Turbopack default.** `@serwist/next`'s stable integration mode injects
   a `webpack` config; Turbopack refuses to run with an unexplained `webpack` key present (a real,
   tracked upstream gap — `github.com/serwist/serwist/issues/54` — not a misconfiguration here).
   Fixed with an explicit empty `turbopack: {}` in `next.config.ts` (Next's own documented way to
   say the `webpack` key isn't a mistake), which lets `next dev` run under Turbopack with Serwist
   genuinely inert there; `package.json`'s `build` script explicitly passes `next build --webpack`
   for production, where Serwist actually needs to run.
2. **A genuine Serwist build-time bug**, found while fixing the above: `app/sw.ts` originally
   referenced `self.__SW_MANIFEST` twice (once to check truthiness, once to use the value) —
   Serwist's build-time injector does a literal single-occurrence text replace in the compiled SW
   bundle and refuses to build if it finds the string more than once. Fixed by reading it into a
   local `const` exactly once.
3. **`apps/web`'s relative imports needed to be extensionless, not `.js`-suffixed.** Every backend
   package in this monorepo uses `moduleResolution: "NodeNext"` and writes relative imports as
   `./file.js` (resolving to the sibling `.ts` source) — the convention this session initially
   (incorrectly) carried into `apps/web`. `apps/web` has always used `moduleResolution: "Bundler"`
   instead (a pre-existing B0 choice, for unrelated reasons), where the idiomatic and actually-
   portable form is extensionless (`./file`). The `.js`-suffixed form typechecked fine and even
   resolved under Turbopack, but broke with a real `Module not found` under `next build --webpack`
   — found only by actually running that build, not by `tsc` or `next dev`. Fixed by writing every
   `apps/web`-internal relative import without an extension.

Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` at both the
`apps/web` and full-monorepo level (9/9 turbo tasks). 53 tests in `apps/web` alone (14 files) —
the OKLCH contrast sweep plus a default/loading/error/empty (or equivalent) test per component.
Manually verified beyond the automated suite: `next build --webpack` produces a real `public/sw.js`
(confirmed served with the correct content-type) and the built client bundle contains genuine
`serviceWorker.register(...)` calls; `next dev` and `next start` both verified live via `curl` for
the home route, the workbench route's dev/production gating, and the SSR-rendered default theme
tokens appearing correctly in the initial HTML (no flash-of-unbranded-content).

`docs/roadmaps/frontend-roadmap.md`'s F0 section gained status `COMPLETE`, DoD items checked off
with file references, and an "Implementation notes" subsection covering the three problems above
plus the dependency list and the "tenant-branded theming isn't wired yet, by design" scoping note.
`docs/roadmaps/roadmap-index.md`'s Current State, P0 status, and Immediate Next Actions all moved
from "F0 next" to "F1 next, ahead of B2." `.gitignore` gained an entry for Serwist's generated
`public/sw.js` (regenerated by every build, same treatment as `.next/`). New env var
`NEXT_PUBLIC_API_ORIGIN` documented in `.env.example`.
Project state moves from _Implementation (B0/B1/F0)_ to _Implementation (F1)_.
**Next: `F1 — Authentication & Tenant Entry`.**

### 2026-08-26 — `F1` complete: authentication and tenant entry

Followed the working-rules checklist: read `frontend-roadmap.md`'s F1 section, ADR-0005 and
ADR-0022, `apps/api/src/modules/identity/*` (the real B1 contract, not just its OpenAPI shape —
controller, service, guard, DTOs), and `docs/operations/domain-plan.md` before writing any code.
No gating ADR is unresolved.

**Delivered:** tenant-resolved school-branded login (`lib/tenant/tenant-context.tsx` →
`GET /tenant/resolve` → nested `<ThemeProvider>`, F0's own layout.tsx comment anticipated exactly
this pattern), a session/auth context (`lib/auth/auth-context.tsx`) built on TanStack Query rather
than hand-rolled state, forced first-login password change enforced client-side by
`<RouteGuard>` on top of B1's server-side `AuthGuard` gate, staff password reset (request→confirm,
verified live end to end with a real token), generic-error/enumeration-resistant login matching
`IdentityService.evaluateLogin`'s server design, opportunistic session refresh, a platform-branded
(non-functional) `/admin/login`, and role-priority post-login routing to five placeholder
workspaces that F2 replaces. `/`, `/login`, `/admin/login`, `/password/forgot`, `/reset-password`,
`/password/change`, `/school`, `/moderator`, `/hod`, `/teacher`, `/student`.

**Three scope realities handled honestly, not silently smoothed over** (frontend-roadmap.md's F1
section has the full detail):

1. **No real per-school branding data exists yet.** `tenant/resolve`'s `school` object is
   `{name, subdomain, timezone}` only — B4 hasn't shipped logo/colour columns. The login page shows
   the real school name; the _colour_ stays the platform default until B4, by design.
2. **Software Admin login has no backing API.** B1 already recorded this deferral explicitly.
   `/admin/login` is a real, platform-branded screen; submitting it cannot succeed until B2/B3.
3. **API origin is derived dynamically from the page's own hostname**
   (`lib/api/resolve-origin.ts`), mirroring `domain-plan.md`'s `greenfield.localtest.me:3001`
   local-dev convention exactly — this is what makes ADR-0005's Host-header tenant resolution work
   for a real cross-origin browser call. The production hostname pattern (ADR-0022's diagram shows
   a single flat `api.<root>`, which can't carry a per-school subdomain via Host header the same
   way) is a **deliberately flagged open question for B23** — the same class of gap wildcard
   DNS/TLS already is deferred there, not a silently-invented answer.

**Two real bugs found only by building a real typed consumer against B1's contract, not by
inspection — both fixed at the source in B1-owned `apps/api`, mirroring B1's own precedent of
fixing B0-owned infrastructure it found broken while building on top of it:**

1. Every one of `IdentityController`'s endpoints (`tenant/resolve`, `login`, `logout`, `refresh`,
   `me`, `password/change`, `password/reset/request`, `password/reset/confirm`) had no
   `@ApiOkResponse` decorator — `@atlas/contracts`'s generated types collapsed every response to
   `content?: never`, invisible until F1 tried to build a genuinely typed client against it (F0's
   only consumed endpoint, `/health`, already had one). Fixed with real response DTOs
   (`dto/status-response.dto.ts`, `dto/tenant-resolve-response.dto.ts`, `dto/me-response.dto.ts`)
   and `@ApiOkResponse` + explicit return-type annotations on every method; `pnpm generate`
   regenerated a genuinely typed contract, so no F1 call site needed an `as`-cast.
2. Real per-subdomain local browser testing
   (`greenfield.localtest.me:3000` calling `greenfield.localtest.me:3001`) was silently rejected by
   CORS — `isAllowedOrigin` (`apps/api/src/security/cors.ts`) only ever allowed `https:` under the
   wildcard-subdomain rule; `WEB_ORIGIN`'s `http:` exception only covered the single fixed
   `localhost:3000` case F0 needed. Fixed with a new `allowInsecureSubdomains` parameter, wired
   from `NODE_ENV !== 'production'` in `main.ts` — never relaxed in production regardless of what a
   caller passes. New `cors.test.ts` cases plus live verification cover it.

**One naming correction, not a new decision:** the route is `/reset-password`, not the roadmap's
originally-listed `/password/reset` — `IdentityService.requestPasswordReset` (B1, already frozen)
hardcodes that exact link, confirmed by reading the real URL off `ConsoleNotificationChannel`'s
console output during manual verification.

**A third mid-implementation correction, not a bug in shipped code:** the first version of
`AuthProvider`'s session bootstrap used a hand-rolled `useEffect`/`useState` pair; React's
`react-hooks/set-state-in-effect` lint rule flagged it immediately (calling `setState`
synchronously within an effect). Rewritten on `useQuery` — this codebase's own established pattern
for exactly this fetch-on-mount shape (F0's `use-health.ts`) — before any test or manual run.

**Verification, in increasing scope:** full monorepo `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build` green (16/16 turbo tasks), `apps/api`'s integration suite green (32 tests, unaffected
by the DTO/CORS changes), 103 tests in `apps/web` (25 files — component tests per screen covering
default/loading/error/empty-equivalent states, `auth-context.test.tsx` proving the `AuthStatus`
state machine including the page-refresh-preserves-session case with no `login()` call at all).
Beyond automated tests: a full live `curl`-driven walk against a real running API and a real seeded
school/user — tenant resolution, CORS with the new local-subdomain exception, wrong-password 401,
correct-password login with real CSRF/cookie mechanics, `/auth/me`, `/auth/refresh` rotation,
logout + post-logout 401, the platform host resolving `school: null` — plus a second full pass
proving the password-reset request→confirm round trip end to end with a real token read off the
console notification output, confirming both that it works and that the old password stops
working. `next build --webpack` and `next start` verified live too (all 14 routes render
correctly, including `/reset-password`'s dynamic `searchParams` handling). All seed data and
temporary verification scripts were removed afterward — nothing manual-verification-only was
committed.

`docs/roadmaps/frontend-roadmap.md`'s F1 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-deferred-with-reason and file references, an "Implementation
notes" subsection covering the items above, and expanded Deferred items.
`docs/roadmaps/roadmap-index.md`'s Current State, P1 status, and Immediate Next Actions moved from
"F1 next" to "B2 next." New env var `NEXT_PUBLIC_API_PORT` documented in `.env.example`.
Project state moves from _Implementation (F1)_ to _Implementation (B2)_.
**Next: `B2 — Authorization & Tenancy Engine`.**

### 2026-08-26 — `B2` complete: authorization and tenancy engine

Followed the working-rules checklist first: read `02` (the full permission matrix) end to end,
`07 §41`/`§42` invariants 1/3/4, `08 §10`, `09 §25`, ADR-0012 and ADR-0023 in full, and audit
findings A-03/C-06/C-07/M-15/D-01/R-01 — then inspected the existing B0/B1 implementation
(`AuthGuard`, `TenancyContextService`, `withTenant`'s own closing comment, which explicitly names
break-glass as "B2's authorization engine, not a B0 primitive") before writing any code.

**Three structural gaps surfaced during planning — each confirmed with the project owner before
implementation, not guessed**, mirroring B1's own precedent:

1. **`PlatformRoleAssignment` (new schema model).** `SOFTWARE_ADMIN` had no representation at all —
   `RoleAssignment` lives under `SchoolMembership`, and a platform account has none. Tenant-
   independent (no `school_id`), exempted in `scripts/lint-schema-tenancy.mjs` alongside `User`; a
   database `CHECK` constraint (`role = 'SOFTWARE_ADMIN'`) guards the shared `Role` enum at the row
   level.
2. **`ExamAdministrator` deferred to `B12`**, building only the generic delegation concept now (the
   `OWNED` scope resolver's extension point) — `Exam` doesn't exist until `B11`, so the table would
   need a dangling FK today.
3. **Software Admin platform login deferred to `B3`.** No endpoint anywhere is in scope for it yet;
   break-glass and the authorization truth table are tested via constructed `AuthorizedActor`
   fixtures, not a real session — B2's own roadmap text already listed no login endpoint as B2 API
   work.

**The normalised permission table** (B2's own DoD item 1 — "reviewed and approved before guards are
written"): `packages/domain/src/authorization/permission-table.ts`, 139 rows across 16 sections,
covering every labelled row of `02`'s matrix. A-03's ~22 undefined terms ("Limited", "Own",
"Assigned", "Department", "Scoped", "System", "Limited/request", "Configurable", ...) are resolved
into the seven-predicate closed vocabulary (`PLATFORM`/`SCHOOL`/`DEPARTMENT`/`ASSIGNED`/`OWNED`/
`SELF`/`NONE`) crossed with five actions, via twelve documented resolution rules (R1–R12, in the
file's own header) rather than 150 independent ad hoc judgment calls. The riskiest rule (R4:
extending ADR-0012's _named_ break-glass examples — invalidate attempt, grant makeup, archive
question, force reset, deactivate account — to the rest of the "school academic writes" category,
i.e. account create/edit/remove/import too) is flagged inline for explicit review rather than
silently applied: the reasoning is that a Software Admin who could freely create a fresh account
while being blocked from editing an existing one could trivially defeat the restriction. A
generated, human-reviewable Markdown rendering (`docs/architecture/permission-table.md`,
`pnpm generate:permission-table-doc`) is produced from this file, never hand-duplicated — same
principle as `openapi.json`.

**The authorization engine** (`apps/api/src/modules/authorization/`, new `@Global()` module):
`AuthorizationService.evaluate(actor, permissionId, resource?)` implements the `08 §10` formula —
a cross-tenant `resource.schoolId` mismatch is checked and rejected (`NOT_FOUND`) before any
role/grant logic runs at all (DoD item 11); then every one of the actor's _active roles_ is tried
in turn (a membership may hold more than one — e.g. `TEACHER` + `HOD` — and effective access is
their union, not just the first match), falling back to reporting `requiresBreakGlass` rather than
ever silently treating a `BREAK_GLASS`-kind grant as an ordinary allow. `ScopeResolverRegistry`
implements `PLATFORM`/`SCHOOL`/`SELF`/`OWNED` concretely now; `ASSIGNED`/`DEPARTMENT` are
registered as fail-closed placeholders (denying, with a one-time warning) since `TeacherAssignment`
(`B6`) and `Department` (`B5`) don't exist yet — `.register()` is the extension point those phases
plug a real resolver into without this module ever depending on tables that don't exist. `AuthGuard`
(B1) now also loads the caller's active `RoleAssignment` rows live in the same request and attaches
them to `req.user.roles` (09 §25 — never cached, never from a token). `PermissionGuard` +
`@Authorized(permissionId)` (bundling `@UseGuards(AuthGuard, PermissionGuard)` in the correct order)
replace every bare `@UseGuards(AuthGuard)` in `IdentityController`; every pre-authentication route
(`login`, `tenant/resolve`, password-reset request/confirm, `refresh`) and both health probes get
`@PublicRoute(reason)` instead. `PolicyCoverageService` (`OnApplicationBootstrap`, using
`DiscoveryService`/`MetadataScanner` to find real HTTP route handlers specifically, not just any
controller method) throws — failing app boot itself, for the real server and every integration test
alike — if any route declares neither decorator (DoD item 2's "startup assertion... enforced").

**`GET /v1/me/permissions`** (`AuthorizationController`) returns the actor's declarative capability
list straight off the permission table (no per-instance scope-resolver call needed — it's "can you
ever do X", not "can you do X to this specific resource"), excluding `SYSTEM`-kind rows. Contract-
tested for shape stability, per B2's own Testing requirement.

**Break-glass** (`BreakGlassService`, plus a new minimal `AuditService` populating the
previously-empty `OperationsModule`): validates the actor is genuinely a Software Admin, validates
the target permission's grant is actually `BREAK_GLASS`-graded (not just "any Software Admin
action"), requires a non-empty reason, runs the caller's operation, then writes a real `AuditEvent`
row under the _affected_ school's tenant context (not the actor's, who has none) — proven against
real Postgres, RLS included. `AuditEvent` itself is a genuine, minimal, write-only primitive shipped
a phase ahead of `B10`'s full apparatus (canonical action vocabulary, retrieval endpoints, DB-
enforced append-only immutability, retention) — the same shape of decision as B0 shipping a minimal
`NotificationChannel` ahead of B10's full messaging system. No controller anywhere calls
`BreakGlassService` yet (no school-academic-write endpoint a Software Admin could reach exists
before `B3`+) — proven instead against a synthetic protected operation, ready for the first phase
that adds a real one.

**One real cross-module dependency-injection bug found only by actually booting the compiled app,
not by inspection, not by any unit test, and not by `tsc`:** `AuthorizationController` (living in
the new `AuthorizationModule`) uses `@Authorized(...)`, which references `AuthGuard` — a class
`IdentityModule` provides and exports. Nest resolves a guard class passed to `@UseGuards` by
building a fresh instance-wrapper scoped to the _consuming_ module's own injector, which only
reaches providers the providing module actually `exports` — not `AuthGuard`'s own private
constructor dependencies. `SessionService` (an `IdentityModule`-internal provider `AuthGuard` needs)
wasn't exported, so the real compiled app failed at boot with `UnknownDependenciesException` —
invisible to every unit test (none boot the whole module graph) and to `tsc`. Found via the same
technique B1's own two boot-only bugs used: a real `nest build && node dist/...` boot, not `tsx`
(B1's still-current documented gotcha: `tsx` cannot boot the full `AppModule` once enough providers
are registered, and fails with no error output at all). Fixed by exporting `SessionService`
alongside `AuthGuard` from `IdentityModule`, documented at the export site.

**Two DoD items honestly scoped down, not silently dropped:**

1. **`ExamAdministrator`** — deferred to `B12` as described above; B2 ships the extension point the
   real table plugs into.
2. **The generated cross-tenant test-suite generator** — B2's roadmap text asked for infrastructure
   that, for every school-scoped endpoint, proves a School A actor gets 404 on a School B resource,
   generated from the route table. No real `GET /.../:id`-shaped school-scoped endpoint exists
   anywhere in the app yet (identity has none), so there is nothing for a _generator_ to run against
   today. B2 instead proved the same guarantee two other ways: `AuthorizationService.evaluate()`'s
   unconditional tenant-boundary check (unit-tested), and a new RLS integration test proving the one
   new school-owned table B2 introduces (`AuditEvent`) is cross-tenant-isolated exactly like
   `SchoolMembership` already is. Building the actual _generator_ is recorded as `B3`'s job, against
   its first real `:id`-shaped endpoint (`GET /v1/platform/schools/:id`) — not silently marked done.

**Schema**: one migration (`20260826120305_b2_authorization_engine`) — `PlatformRoleAssignment`
(with its `CHECK` constraint) and `AuditEvent` (school-owned, RLS-protected the same way every
other school-owned table has been since `B0`'s bootstrap migration). One thing tried and reverted
during this migration, documented in its own SQL comment: a plain `REVOKE UPDATE` on `audit_events`
to approximate append-only enforcement early — reverted because `@atlas/db`'s `grantAppRole()`
(called after every `migrate reset`) unconditionally re-`GRANT`s `UPDATE`/`DELETE` on every table in
`public`, which would have silently undone the revoke and left a protection that looked enforced
without being enforced. Real immutability enforcement stays `B10`'s job, done properly.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm test:integration && pnpm spike`, plus `pnpm generate` (OpenAPI + contracts
regeneration — `GET /v1/me/permissions` now published) and `pnpm generate:permission-table-doc`.
124 new/changed tests across `packages/domain` (23, up from 7) and `apps/api` (86 unit + 38
integration, up from 74/34) — truth-table coverage for every DoD-numbered assertion (teacher
scoping, HOD department scoping, moderator cannot approve, student tiny surface, Software-Admin-
not-a-wildcard, break-glass reason/grant/audit requirements), a real compiled-app boot proving
`PolicyCoverageService` reports "11 route(s) checked" with zero violations, and the extended RLS
suite (`tests/tenancy/rls.integration.test.ts`, now 7 tests) covering `audit_events`. The existing
migrations reset/reapply integration test proves the new migration's hand-written SQL (the `CHECK`
constraint and RLS bootstrap) applies and rolls back cleanly, for free.

`docs/roadmaps/backend-roadmap.md`'s B2 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-deferred-with-reason, an "Implementation notes" subsection, and
expanded Database work / Deferred items reflecting the three confirmed scope decisions above.
`docs/roadmaps/roadmap-index.md`'s Current State, P2 status, and Immediate Next Actions moved from
"B2 next" to "F2 next" (the phase-pairing default — B2's contract is frozen for F2 to consume),
with B3 named as the right place to build the deferred cross-tenant generator against its first
real `:id`-shaped endpoint. New file `docs/architecture/permission-table.md` (generated) and new
script `scripts/generate-permission-table-doc.mjs`.
Project state moves from _Implementation (B2)_ to _Implementation (F2)_.
**Next: `F2 — App Shell, Navigation & Notifications`**, per the frontend/backend phase-pairing
policy (`AGENTS.md` §19) — ahead of `B3` on the backend critical path.

### 2026-08-26 — `F2` complete: app shell, navigation and notifications

Followed the working-rules checklist first: read `04` §4/§64–§68 (shared navigation, notifications,
search, context switcher, dashboard philosophy, complete module map) and each role's own "Primary
Navigation" section (§5, §11, §20, §28, §35, §52), the F2 roadmap entry and its backend-dependency
note, the `project-atlas-ui` skill, and the existing F1/B2 implementation (`RouteGuard`,
`RoleLandingPage`, `role-priority.ts`, `MePermissionsResponseDto`/`AuthorizationService
.effectivePermissions`) before writing any code.

**Nav is data, not six hand-written sidebars.** `apps/web/lib/nav/nav-model.ts` is the single place
every role's navigation lives — each item's `label`/`href` copied verbatim from `04`'s own per-role
lists, gated by a `match` id-prefix into `GET /me/permissions`'s `resource` field
(`packages/domain`'s `PERMISSION_TABLE`). `nav-model.test.ts` pins every role's label list directly
against the spec; `use-navigation.ts` derives visibility live (excluding break-glass-only grants —
ADR-0012's audited path isn't routine navigation), proven end to end by
`role-navigation.test.tsx`'s parameterised six-role test, which flattens every `match` prefix in
the model itself into a synthetic fully-granted permission set rather than hand-maintaining a
second parallel prefix list that could drift.

**`RouteGuard` gained `requireRole`**, replacing F1's `RoleLandingPage` entirely (both that
component and the now-superseded `LogoutButton` are deleted, not left dead — their own doc
comments already named this replacement). A wrong-role visitor is bounced to their own landing
route (`resolveLandingRoute`) rather than shown someone else's workspace or a blank screen.

**`AppShell`** (`components/shell/app-shell.tsx`) composes `RoleNavigation`, `ContextSwitcher`,
`NotificationPanel`, `ProfileMenu`, and `OfflineIndicator` behind one `RouteGuard`, wrapping only
`children` in F0's existing `ErrorBoundary` — a failing workspace screen degrades without taking
the header/sidebar chrome down with it (proven directly: `app-shell.test.tsx` throws inside
`children` and asserts the chrome survives). Six new route-group layouts wire it in:
`/admin`, `/school`, `/moderator`, `/hod`, `/teacher`, `/student`. `/student` is nested one level
under a `(shell)` route group specifically so a future sibling `student/exam/[attemptId]` (F13)
won't inherit this chrome, satisfying DoD item 10 structurally ahead of F13 needing it — route
groups are invisible in the URL, so `/student`/`/student/results` etc. are unaffected. Every real
screen behind a nav item that isn't built yet (People, Academics, Questions, ... — all later,
separately-scoped phases) renders through one `[...slug]/page.tsx` catch-all per role rather than
~30 empty stub files; it looks the destination up in `nav-model.ts` and renders
`WorkspacePlaceholder`, or `notFound()` for an unrecognised path — a later phase's real `page.tsx`
takes over automatically since Next.js prefers the more specific route.

**Three DoD items are honestly partial, all gated on backend phases that don't exist yet — not
silently faked or dropped, per the same discipline as F1's two and B2's one.** The context switcher
(`components/shell/context-switcher.tsx`) shows the school name and a genuinely new, working
capability — a role switcher for multi-role users (06 §7/§9, e.g. Teacher + HOD) that navigates
straight to the other workspace, something `role-priority.ts`'s fixed landing order never offered —
but no session/term: `GET /v1/academics/context` is `B5`, unbuilt, so it shows an explicit "not yet
available" note rather than fabricate one (doctrine §12). Teacher/HOD historical-session viewing
has the identical `B5` gap. The notification bell/panel (`notification-panel.tsx`) is real chrome
— trigger, panel, labelled empty state — over `B10`'s unbuilt `GET /v1/notifications`; an honest
"No notifications... once B10 ships" rather than a fabricated one.
`roadmap-index.md` §1 already named this pattern before F2 started: "B10 has no dedicated frontend
phase — it surfaces through F2." The real-E2E exit criterion is substituted, not silently claimed:
Playwright automation remains deferred exactly as F1's own Deferred items already recorded: the
component tests above (real `useNavigation`/`usePermissions`/`apiClient` stack, mocked only at the
HTTP boundary) are the closest available substitute today.

**Two real gaps found and explicitly recorded as Candidate/Deferred (`AGENTS.md` §14), not fixed
opportunistically.** Self-service password change: B1's `PasswordChangeDto` already supports an
already-authenticated, `credentialState: 'OK'` caller (`currentPassword` required in that branch),
but F1 only ever built the _forced_ first-login variant (`/password/change`, which redirects an
already-authenticated user straight back out) — no self-service entry point exists. `ProfileMenu`
deliberately omits a "Change password" item rather than link to a screen that would immediately
bounce the user back out; its natural home is a future Profile/Account settings screen, not named
in F2's own scope. School Admin's `04 §11` "highly visible Subscription indicator" has no data
source until `B3` ships subscriptions — not built against fabricated status.

**Software Admin's shell is code-complete but still unreachable end to end** — `/admin/(shell)/`
wires `SOFTWARE_ADMIN` through the identical role-agnostic `AppShell`/`RoleNavigation` every school
role uses, exercised by `role-navigation.test.tsx`'s mocked-session test, but Software Admin login
itself still isn't functional (B1's original deferral, not yet closed by B2 or B3 — unchanged by
this phase). Not a new gap; F2's architecture is simply ready for the moment `B3` closes it.

One new dependency: `@radix-ui/react-dropdown-menu` (`components/ui/dropdown-menu.tsx`, restyled to
this doctrine's tokens like every other Radix primitive F0 already established) — profile menu,
notification panel, and role switcher. Same vendor/API family already in the stack; no comparable
primitive existed (`AGENTS.md` §9).

Full pipeline green: `pnpm --filter @atlas/web lint && pnpm --filter @atlas/web typecheck &&
pnpm --filter @atlas/web test && pnpm --filter @atlas/web build` — 136 tests (up from 100), and the
production build's own route table confirms the intended shape: `/admin`, `/admin/[...slug]`,
`/hod`, `/hod/[...slug]`, `/school`, `/school/[...slug]`, `/student`, `/student/[...slug]`,
`/teacher`, `/teacher/[...slug]`, `/moderator`, `/moderator/[...slug]`, each route group correctly
invisible in the URL.

`docs/roadmaps/frontend-roadmap.md`'s F2 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-deferred-with-reason, an "Implementation notes" subsection, and an
expanded Deferred items list. `docs/roadmaps/roadmap-index.md`'s Current State and Immediate Next
Actions moved from "F2 next" to "B3 next" — no further frontend phase can proceed without a backend
phase it depends on (F3 needs B3; F13 continues independently in parallel, unaffected).
Project state moves from _Implementation (F2)_ to _Implementation (B3)_.
**Next: `B3 — Platform, Schools & Subscriptions`.**

### 2026-08-27 — `B3` complete: platform, schools and subscriptions

Followed the working-rules checklist first: read `03 §2–§3`/`§66–§67` (school lifecycle, subscription
expiry), `05 §2–§4`/`§3.1–§3.3` (platform/subscription screens), `06 §2`/`§4`/`§5`, `07 §4.1–§4.3`
(School/Subscription/ActivationGrant), `02`'s Platform/School/Subscription rows, `04 §5–§9`
(Software Admin workspace screens), the B3 roadmap phase, its four gating ADRs (0012/0015/0016/0019)
in full, and the pre-graded B3 permission-table rows B2 already shipped — then planned in a
dedicated plan-mode pass before writing any code, per the size of this phase.

**Confirmed-scope addition, not silently decided**: `docs/roadmaps/roadmap-index.md`'s own
Immediate-Next-Actions entry, and `CLAUDE.md`'s B1/B2 Change Log entries, all already named B3 as
where Software Admin platform login lands — B3's own roadmap-section endpoint table simply omitted
it. Built as originally intended; the table gained a corrective note rather than silently expanding
scope. See `backend-roadmap.md`'s B3 section for the full endpoint table, Database work, Background
jobs, and — most importantly — its "Implementation notes" subsection, which carries the detailed
reasoning for every schema/architecture decision this phase made (the two-function access gate,
`ActivationGrant.purpose`, `School.subdomain` as the generated identifier, `AccessGateModule`'s
separate `@Global()` registration, the BullMQ 6 API adaptation, the RLS cross-tenant-query
constraint that shaped both the sweeper and platform metrics). Not duplicated here in full — this
entry covers what changed and what was tested; that section covers why.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260826184802_b3_platform_schools_
subscriptions`): `School` gained `status`/`platformOverride`/`shortName`/`contactEmail`/
`contactPhone`/`address`; new `Subscription`, `ActivationGrant`, `PlatformSession` models, all
RLS-protected where school-owned (`PlatformSession` exempted, mirroring `PlatformRoleAssignment`'s
precedent). Hand-written migration SQL (matching B2's own precedent for beyond-the-DSL additions):
RLS bootstrap for the two new school-owned tables, plus two partial unique indexes Prisma's schema
DSL can't express — at most one non-terminal `Subscription` per school, at most one `ISSUED`
`ActivationGrant` per subscription.

**Two schema/architecture decisions confirmed as engineering-shaped rather than product-policy,
mirroring B1/B2's own precedent for this kind of call**: `ActivationGrant.purpose` (not named in
`07 §4.3`) distinguishes an unauthenticated first-activation redemption from an authenticated-by-
key-possession renewal; and `School.platformOverride` as a column separate from `School.status`,
so an explicit Software-Admin suspend/deactivate can take precedence over — and later fall back
cleanly from — whatever the subscription-derived state actually is.

**API work**: `platform.v1` (`PlatformAuthController`, `SchoolsAdminController`,
`PlatformMetricsController`), `schools.v1`/`subscriptions.v1` (`ActivationController`,
`SchoolProfileController`) — all in `apps/api/src/modules/platform/`, the module B0 had stubbed
empty specifically for this phase. A new `@AuthorizedPlatform(permissionId)` decorator alongside
the existing `@Authorized`/`@PublicRoute`, and `permission.guard.ts`'s `actorFromAuthenticatedUser`
— the exact function B2's own comment and `authorization.types.ts`'s doc comment predicted would
change once a Software Admin session existed — now branches on `req.user.kind`. Every one of B3's
permission checks reuses an id `packages/domain/src/authorization/permission-table.ts` had already
pre-graded in B2 (flagged `awaitingResource: '... (B3)'`) — no new permission ids were added.

**Two real bugs found only by integration testing, not by inspection** (full detail and the fixes
in `backend-roadmap.md`'s B3 Implementation notes): the activation-grant re-issue endpoint always
sent the renewal-wording email regardless of the grant's actual purpose; and the worker sweep's
warning-threshold selection picked the largest crossed threshold instead of the tightest one.

**One real cross-tenant architectural constraint found only while implementing** (not anticipated
in the original plan): RLS's `FORCE ROW LEVEL SECURITY` means `atlas_app` cannot see rows across
multiple schools in a single unscoped query. This shaped both the worker sweep (iterates every
school one at a time via `withTenant`) and platform metrics (consequently cached in Redis and
computed periodically, never live per API request — see `PlatformMetricsService`'s own doc
comment).

**Testing**: `packages/domain/src/platform/access-gate.test.ts` (19 tests, table-driven — every
`SubscriptionStatus` × `PlatformOverride` combination, plus the ADR-0015 grace-window boundary);
`apps/api/src/modules/platform/subdomain-generator.test.ts` (9 tests); `apps/api/src/modules/
platform/platform.integration.test.ts` (7 tests, real HTTP via `app.inject()` against real Postgres
— the full create→issue-key→verify→redeem→active flow, replay and cross-school rejection, the
access-gate blocking an existing session _and_ a fresh login attempt identically, the row-count
data-preservation assertion, and enumeration-resistant platform login); `apps/worker/src/queues/
subscription-expiry.integration.test.ts` (6 tests — PENDING never touched, ACTIVE→EXPIRING→EXPIRED
transitions, warning dispatch-once-per-threshold, the metrics snapshot written to Redis); two new
`describe` blocks in `tests/tenancy/rls.integration.test.ts` covering `Subscription`/
`ActivationGrant` (cross-tenant reads blocked even by primary key — the same mechanism that gives
`/v1/activation/verify` its cross-school rejection for free, no extra application-layer check
needed). `apps/worker` gained its own `test:integration` script/config, mirroring `apps/api`'s.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm test:integration && pnpm spike` (16 packages, all passing — 45 `apps/api`
integration tests, 6 `apps/worker`, 19 `tests/`), plus `pnpm generate` (three new contracts appear
in `apps/api/openapi.json`/`packages/contracts`) and `pnpm generate:permission-table-doc` (139
rows, unchanged — confirms no new permission ids were needed). Live-verified beyond the automated
suite: a real `node dist/main.js` (api) + `node dist/main.js` (worker) walk covering platform
login, school creation, cross-school activation-key rejection, redemption, School Admin login,
profile read/write, subscription status, the full suspend→reactivate→deactivate lifecycle
(including the access gate blocking a fresh login attempt during suspension), and the worker's
repeatable job firing on schedule and writing a real metrics snapshot the API then served
correctly. All verification schools, sessions, and scratch scripts were removed afterward.

New env var `SUBSCRIPTION_SWEEP_INTERVAL_MS` (default 6 hours) documented in `.env.example`. One
new package dependency: `@node-rs/argon2` added to `packages/db`'s `devDependencies` (the seed
script's Software Admin bootstrap needs to hash a real password; duplicates `PasswordService`'s
exact profile rather than introducing a cross-app import, the same "convention reuse, not literal
code sharing" precedent as `PlatformSessionService`'s cookie signing).

`docs/roadmaps/backend-roadmap.md`'s B3 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-deferred-with-reason, a full "Implementation notes" subsection,
and an expanded Deferred items list (Moderator activation-key delegation, subscription-level
suspend/cancel, self-service Software Admin password change, and the still-undelivered generated
cross-tenant test-suite generator B2 had deferred here — pushed forward again, not dropped).
`docs/roadmaps/roadmap-index.md`'s version, Current State, and Immediate Next Actions all moved
from "B3 next" to "F3 next" per the frontend/backend phase-pairing policy — `platform.v1` is frozen
and published for F3 to consume.
Project state moves from _Implementation (B3)_ to _Implementation (F3)_.
**Next: `F3 — Platform Admin Workspace`.**

### 2026-08-27 — `F3` complete: Platform Admin Workspace

Followed the working-rules checklist first: read `04 §5`–`§10` (Software Admin workspace screens),
`05 §2`–`§4` (dashboard/school-list/create-school/subscription functional detail), `01 §48`–`§49`,
the F3 roadmap phase and its backend-dependency note, ADR-0012 (break-glass), and the existing
B3/F2 implementation before writing any code. No gating ADR blocks F3. Planned in a dedicated
plan-mode pass given the phase's size, per the same precedent B3's own planning used.

**Two things surfaced during investigation, before any screen was built, that shaped the plan
beyond "build the screens":**

1. **The admin shell was wired to the wrong session.** F2 built `AppShell`/`RouteGuard`/
   `ProfileMenu`/`ContextSwitcher` against the **school** session (`GET /auth/me`) even for
   `SOFTWARE_ADMIN`, since no platform session existed when F2 was built — `/admin/(shell)/
layout.tsx`'s own doc comment recorded this honestly as a known gap. `B3` shipped a real,
   separate `PlatformSession` mechanism; F3 is the first phase to actually consume it, so closing
   this was necessary scope, not optional — without it no DoD item in this phase could be proven
   against a real session.
2. **Two small, additive gaps in `B3`'s own already-approved Scope text**, found by building a real
   consumer against the contract (the same discovery pattern every prior paired frontend phase
   used): `B3`'s Scope bullet named "renewal history" as in scope, and `05 §4.1`/`04 §8` call for
   it on the Subscription screen and `04 §5` pins "Subscriptions" as its own primary nav item — but
   no endpoint ever listed `ActivationGrant` rows, and the school-list endpoint carried no
   subscription data to power either. Both closed as part of this phase, documented in both
   roadmap files.

**Frontend: platform session plumbing** (`apps/web`) — mirrors the backend's own "parallel, not
shared" convention (B3's `PlatformSessionService`/`PlatformAuthGuard`/`PlatformAuthService`
alongside identity's own, by convention not shared code). New `lib/auth/platform-auth-context.tsx`
(`PlatformAuthProvider`/`usePlatformAuth`) mirrors `auth-context.tsx` structurally but is
deliberately smaller (no forced-password-change branch — B3 built no such endpoint for platform
accounts; no refresh-interval loop). New `components/auth/platform-route-guard.tsx`
(`PlatformRouteGuard`) and `components/auth/platform-login-form.tsx` (`PlatformLoginForm`, posting
`{email, password}` — a platform account authenticates by email, not a school-scoped
`login_identifier` — distinct from the identifier-based `LoginForm`). `AppShell` now dispatches to
one of two small sibling components — `SchoolAppShell` (unchanged `useAuth`/`RouteGuard`) or
`PlatformAppShell` (new `usePlatformAuth`/`PlatformRouteGuard`) — chosen by
`ROLE_WORKSPACES[role].variant` (present in `nav-model.ts` since F2, unused for this purpose until
now), since a single component can't call two different auth hooks conditionally (React's rules of
hooks). `ProfileMenu`/`ContextSwitcher` were refactored to receive identity via props instead of
calling `useAuth()` directly, so neither shared F2 component needs to know which session mechanism
is in play. `/admin/login` now actually works end to end against `POST /platform/auth/login`,
closing the deferral F1/F2/B2/B3 all separately recorded, redirecting straight to `/admin` (no
role-priority hand-off needed — Software Admin has exactly one landing route).

**Backend gap-closures** (`apps/api`, both additive-only, no schema migration, no business-rule
change, zero new permission ids — both reuse `platform.school.viewAll`): `GET /v1/platform/
schools/:id/activation-grants` lists `ActivationGrant` history (never `keyHash` — the email is the
one-time reveal channel, B3's own design); `SchoolListItemDto` gained `subscriptionStatus`/
`subscriptionExpiresAt`, and `SchoolSubscriptionSummaryDto.status` gained its missing OpenAPI
`enum:` (a real DTO-accuracy gap `tsc` caught building the frontend consumer, not a runtime bug).
Full detail and reasoning in `backend-roadmap.md`'s B3 section, "Post-completion gap closure."

**Screens** (`apps/web/app/admin/(shell)/`): the real Dashboard (SA-01, every `04 §6`/`05 §2.1`
metric, a "schools requiring attention" section, graceful degradation on a metrics-only failure);
Schools list (SA-02, search/filter/sort — no server-side pagination, `B3`'s endpoint has none);
Create School (SA-03, matches `CreateSchoolDto` exactly, never shows a raw activation key); School
Detail (SA-04, seven sections as real nested routes sharing one tab-strip layout rather than
client-only tab state — `04 §8`'s Overview/Subscription/Usage real, Users/Exams/Activity/Audit
honest "not yet available" placeholders naming what unlocks them, matching `NotificationPanel`'s
own F2 precedent); Subscription (SA-05, renewal, key re-issuance, and the new activation-history
endpoint's real table); a `/admin/subscriptions` nav view reusing the Schools-list data through a
subscription-attention lens (no dedicated screen is defined anywhere in `04`/`05` beyond the
per-school tab, but `04 §5` pins the nav item and it needed a real destination); and permanent,
specific "not yet available" states for Platform Analytics (`B17`) and platform Audit & Security
(`B10`), per this phase's own pre-approved "second pass" allowance.

**Break-glass** (ADR-0012): `<ReasonDialog variant="breakGlass">` implements the ADR's exact
reason-required, school-visible-audit-warning language, but is unused by any F3 screen — no
school-academic-write endpoint reachable by Software Admin exists yet (all later phases, `B5`+).
Platform lifecycle actions (suspend/reactivate/deactivate/renew) use `variant="platform"` instead,
since ADR-0012 marks those "Unrestricted," not break-glass grade. Recorded as Candidate/Deferred —
built and tested, ready for the first real caller, the same shape as `BreakGlassService`'s own
B2-era precedent.

**A real, pre-existing bug in `Button`, found only by this phase's own component tests, not by
inspection.** `<Button asChild loading={false}>` — the common case — always threw `"Slot failed to
slot onto its children"`: `{loading ? <Loader2/> : null}{children}` passes Radix's `Slot` two
children whenever not loading (`null` plus the real element), and `Slot`'s own
`React.Children.count(children) === 1` check counts `null` as an entry. Latent since `F0` — one
untested workbench usage existed, but nothing exercised `Button asChild` in a test before this
phase's Create-school/Schools-list screens, the first real `asChild` usage anywhere in the product.
Fixed at the source (a single conditional expression instead of two sibling expressions), not
worked around per call site. New `components/ui/textarea.tsx` primitive (mirrors `Input`) — a
genuine reusable base component every reason field needs, not a one-off.

**Testing**: 32 new/changed `apps/web` component tests (every new screen's default/loading/error/
empty states; `ReasonDialog` both variants; the platform auth plumbing; `AppShell`'s new platform
variant — unauthenticated redirect, chrome renders from the real platform session and never
touches `useAuth`, logout redirects to `/admin/login` not `/login`) — 182 total, up from 150. Two
new `apps/api` integration cases proving the new endpoint's real shape (newest-first ordering, a
re-issue revoking the prior grant, never a key hash) and the list endpoint's new fields — 47
integration tests total, unchanged elsewhere. Full pipeline green, run in full after every fix:
`pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration`, plus `pnpm
generate` and `pnpm generate:permission-table-doc` (139 rows, confirmed unchanged — no new
permission ids). Live-verified beyond the automated suite: a real `node dist/main.js` walk against
a real seeded Software Admin account and a real Postgres database — platform login, school
creation, the school list's new subscription fields, the new activation-grants endpoint (including
a real re-issue revoking the prior grant), and platform metrics — all schools/sessions cleaned up
afterward. `next build --webpack` confirmed the full intended route table.

`docs/roadmaps/frontend-roadmap.md`'s F3 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-partial-with-reason, a full "Implementation notes" subsection, and
an expanded Deferred items list. `docs/roadmaps/backend-roadmap.md`'s B3 section gained a
"Post-completion gap closure" note for the two additive endpoint/DTO changes. `docs/roadmaps/
roadmap-index.md`'s version, Current State, and Immediate Next Actions all moved from "F3 next" to
"B4 next" — `F3` has caught up to `B3`, so the backend critical path continues.
Project state moves from _Implementation (F3)_ to _Implementation (B4)_.
**Next: `B4 — Media, Storage & Branding`.**

### 2026-08-27 — `B4` complete: media, storage and branding

Followed the working-rules checklist first: read `03 §5` (branding onboarding step), `05 §6.1`
(branding functional detail), `06 §65`, `07 §7.4`/`§11.3` (`QuestionMedia`/`MediaAsset`), `09 §22`–
`§24`/`§34` (storage architecture, CDN), ADR-0021 in full, and audit findings R-06/D-13/X-10/A-18 —
then planned in a dedicated plan-mode pass given the phase's size, per B2/B3's own precedent.

**One genuine open product decision, confirmed with the project owner before implementation**:
audit finding A-18 flagged `02`'s permission matrix cell for School Admin's "Set primary colour" as
self-contradictory (`Full / One-time`). Resolved as **freely editable, not a one-time lock** —
matches `05 §6.1` (an ordinary settings screen) and the audit's own recommendation; every change is
audited (`AuditService`, action `SCHOOL_BRANDING_CHANGED`), never just the first one.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260827144014_b4_media_and_
branding`): `MediaAsset` (`07 §11.3`'s fixed type enum — `SCHOOL_LOGO`/`QUESTION_IMAGE`/
`QUESTION_DIAGRAM`/`REPORT`/`OTHER` — plus a `PENDING → READY/REJECTED` upload-lifecycle status),
RLS-protected like every other school-owned table since B0's bootstrap migration; `School` gained
`logoMediaId`/`primaryColor`. `MediaAsset.id` is application-generated (UUIDv7, not `dbgenerated`)
because it's embedded in the storage key computed before insert. D-13 ("never overwritten") is
satisfied **structurally**: there is no service method anywhere that mutates `storageKey`/
`declaredMimeType`/`declaredSizeBytes` after row creation — a "replace" is always a new row plus,
for logos, a pointer swap. No DB-level `REVOKE` was attempted for this (same caveat B2 already
recorded for `audit_events`: `grantAppRole()` unconditionally re-grants UPDATE/DELETE on every table
after `migrate reset`, which would silently undo it).

**A required architectural refactor, not optional polish**: F0's OKLCH, WCAG-AA-guaranteeing
palette-derivation engine (`apps/web/lib/theme/derive-palette.ts`) moved verbatim into
`packages/domain/src/branding/derive-palette.ts` so the API can compute the identical palette
server-side (`GET /v1/school/branding`) without a second, independently-drifting implementation.
`culori` became `@atlas/domain`'s first-ever runtime dependency — a clean fit (pure TS/JS, no
framework coupling). `apps/web`'s own copy is now a one-line re-export; its exhaustive 8-sample-
colour test suite moved with the real implementation, leaving a smoke test behind to prove the
re-export wiring.

**`MediaModule`** (new, top-level, registered in `AppModule`) owns the generic, type-polymorphic
upload/validate/sign pipeline — `POST /v1/media/uploads`, `POST /v1/media/uploads/:id/complete`,
`GET /v1/media/:id/url` — deliberately not nested under the still-empty `QuestionsModule` (B8
territory), since it's shared infrastructure Branding (this phase) and Questions (B8) both need,
the same shape of decision as `OperationsModule` owning cross-cutting Audit. `ObjectStorageService`
(`apps/api/src/storage/`, built on the official `@aws-sdk/client-s3` + `@aws-sdk/s3-request-
presigner`) abstracts the actual backend per `09 §23`'s own instruction — MinIO locally/in CI
(new `docker-compose.yml` service, mirroring the postgres/redis pattern exactly), real AWS S3 in
production, both through one client via `forcePathStyle`. Content validation is genuine magic-byte
sniffing (`file-type`) plus dimension checks (`image-size`, reading only the header, never decoding
pixel data) — SVG is excluded from every allow-list on purpose, since it can embed scripts and
can't be reliably sniffed that way.

**Logo upload/attach deliberately does not go through `MediaController`'s generic endpoints.** One
route can't cleanly enforce two different permission rows (`schoolConfig.logo.upload` for
`SCHOOL_LOGO` vs. `media.upload` for everything else) depending on request-body content under this
codebase's `@Authorized(single-id)` decorator model, so `school-branding.controller.ts` (the
existing `platform` module, sibling to `SchoolProfileController`) exposes its own small logo
upload-target/complete pair instead — both call into the same `MediaService` internals.
`PUT/GET /v1/school/branding` round out that controller; `GET /v1/tenant/resolve` (`IdentityModule`)
gained `logoUrl`/`primaryColor` on its `school` object, exactly the extension point that
endpoint's own DTO comment (and `apps/web`'s `TenantBrandLine`) had reserved for this phase.

**Two real cross-module dependency problems, both found only by a real compiled boot
(`node dist/main.js`), invisible to `tsc`/`tsx`/Vitest — this project's now-standing class of
gotcha (B1/B2 hit the identical shape of bug in their own phases):**

1. `storage.module.ts`'s factory provider and `object-storage.service.ts` both needed the
   `S3_CLIENT` DI symbol; defining it in one and importing it into the other created a circular ESM
   import, leaving the second-evaluated module with an uninitialised binding at class-definition
   time (`@Inject` runs immediately, not lazily) — crashing with "Cannot access 'S3_CLIENT' before
   initialization" only under a real `node` boot. Fixed by extracting the symbol into its own
   `storage.tokens.ts` both files import from.
2. `GET /v1/tenant/resolve` (`IdentityModule`) needs to resolve a school's logo to a signed URL, but
   `MediaModule`'s own controllers need `AuthGuard` (`IdentityModule`) — importing `MediaModule`
   into `IdentityModule` would create a real module cycle. Resolved the same way `AccessGateModule`
   solved B3's identical problem: `IdentityController` injects the `@Global()` `StorageModule`'s
   `ObjectStorageService` directly and calls a small shared function
   (`apps/api/src/storage/logo-resolver.ts`), never importing `MediaModule` at all.

**A correction to this phase's own planning, not a new engine finding**: `AuthorizationService
.evaluate()`'s resource/tenant-context parameter turned out to be dead code in practice — no
`@Authorized`/`@AuthorizedPlatform` call site anywhere passes one. The real cross-school-404
mechanism for `.../complete` and `GET /v1/media/:id/url` is RLS itself (`withTenant` returns `null`
for another school's row, turned into a 404 by the service) — correct and sufficient
(defense-in-depth per ADR-0023), just recorded accurately now rather than attributed to the wrong
layer.

**Two real bugs found only by writing and running the integration tests, not by inspection — both
in the tests' own shared HTTP helper, not the product**: the `post()` helper unconditionally set
`Content-Type: application/json` even for bodyless POST calls (e.g. `.../complete`), and Fastify's
default JSON body parser throws on that exact combination — surfacing as a generic framework `400
VALIDATION_ERROR` indistinguishable from a real product bug without printing the raw response body.
This was silently masking every `.../complete` assertion in the media integration suite, including
the happy path. Separately, a hand-picked `declaredSizeBytes` in one test case didn't match the
real byte length of the buffer being uploaded — since `Content-Length` is a _signed_ header on the
presigned PUT, the mismatch failed the PUT's own signature verification, so the object never
landed, and `complete()` correctly-but-misleadingly reported `MEDIA_UPLOAD_NOT_RECEIVED` instead of
exercising the content-mismatch rejection the test was actually written for. Both fixed at the
source.

**Orphan-media reporting** (`apps/worker`) reuses `PlatformMetricsSnapshot`'s exact Redis-cached,
worker-computed convention, read via `GET /v1/platform/metrics/media/orphan-report` (Software-
Admin-only). It classifies only what's honestly checkable today — expired-and-abandoned `PENDING`
uploads, and `READY` `SCHOOL_LOGO` assets no school's `logoMediaId` points to anymore — and counts
`READY` question-media assets under an explicit `uncheckedReadyCount` rather than either falsely
flagging all of them as orphaned or silently omitting the coverage gap (nothing references them
until `B8` gives `Question`/`QuestionMedia` a real referencing entity).

**Honestly scoped down or partial, not silently dropped:**

- **Real virus/malware scanning** (ClamAV or equivalent) — confirmed out of scope before
  implementation. Content-mismatch rejection via magic-byte sniffing is not malware detection;
  recorded as a Candidate for a future security-hardening phase.
- **DoD item 8** (asset referenced by a submitted revision cannot be replaced in place) — proven
  **structurally** (no update-in-place path exists in the API surface at all), not yet
  **behaviourally** against a real `QuestionRevision`, which doesn't exist until `B8`.
- **DoD item 9** (branding changes don't alter historical records) — no historical-record-bearing
  entity references branding yet. What's actually proven: a branding change touches only
  `School.logoMediaId`/`primaryColor` and is independently audited — narrower than the DoD text's
  eventual full claim, which waits for a phase (`B15`/`B18`) that introduces such a record.
- **Real AWS S3 bucket-policy/IAM provisioning** — this phase proves MinIO's default-private
  behaviour locally/in-CI only; real production provisioning is `B23`'s job (infra/IaC), matching
  `docker-compose.yml`'s own header comment.
- **Post-upload logo resize/re-encode job** — sketched in the original plan as optional; not built,
  since the synchronous `complete()` validation already guarantees a valid, correctly-dimensioned,
  servable image without it.
- **Real per-subject/class (`ASSIGNED`) Teacher scoping for `media.upload`** — `SCHOOL` scope is a
  temporary widening (flagged inline in the permission table) until `B8` gives `Question`/`Subject`/
  `ClassGroup` a real resource to scope against, mirroring B2's own `ASSIGNED`/`DEPARTMENT`
  placeholder precedent.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm test:integration && pnpm spike`, plus `pnpm generate` (media/branding/tenant-
resolve DTOs newly published in `apps/api/openapi.json`/`@atlas/contracts`) and `pnpm
generate:permission-table-doc` (143 rows, up from 139 — one new section, `Media`, three new rows,
plus the two pre-graded branding rows' `awaitingResource` flags cleared now the columns exist). 57
`apps/api` integration tests (up from 47, 10 new — media + branding), 10 `apps/worker` integration
tests total (4 new — orphan-media report), and the `media_assets` RLS block
(`tests/tenancy/rls.integration.test.ts`, now 17 tests)
all green against real Postgres and real MinIO. Live-verified beyond the automated suite: a real
`node dist/main.js` boot — the exact class of check that caught the `S3_CLIENT` bug — confirmed all
37 routes pass `PolicyCoverageService`'s startup assertion, including every new `MediaController`/
`SchoolBrandingController` route. A `docker compose up -d --build api worker` rebuild against the
real containerized stack hit unrelated npm-registry flakiness in this environment and did not
complete as a second confirmation; the native `node dist/main.js` boot plus the full integration
suite (already exercising real MinIO, not a mock) stands as the verification of record for this
phase. `apps/web`'s frontend seam (`TenantProvider`/`TenantBrandLine`) was updated as part of this
phase, not deferred to F5 — DoD item 1 ("renders on the branded login") requires it — closing F1's
second honestly-flagged partial DoD item; F5's own scope is the branding-authoring screen (upload
UI, colour picker, "Preview School Theme"), not this rendering path.

`docs/roadmaps/backend-roadmap.md`'s B4 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-partial-with-reason, a full "Implementation notes" subsection, a
corrected API-work table (the actual final endpoint shapes, including the logo-specific pair and
the orphan-report endpoint neither in the original plan), and an expanded Deferred items list.
`docs/roadmaps/roadmap-index.md`'s version, Current State, and Immediate Next Actions moved from
"B4 next" to "F5 next" per the frontend/backend phase-pairing policy — `B4`'s contract is frozen
for F5 to consume.
Project state moves from _Implementation (B4)_ to _Implementation (F5)_.
**Next: `F5 — School Settings & Branding`.**

### 2026-08-27 — F3 gap closure: pagination on the Schools list

Requested explicitly by the project owner, same day as `B4`, ahead of starting `F5`. Closed F3's
one remaining honestly-flagged partial DoD item: `GET /v1/platform/schools` had no pagination.

Pagination could not be closed in isolation from search/status-filter/sort: once the endpoint
returns only one page instead of the full list, the Schools list screen's existing client-side
search/sort would have silently started operating on just that page — a real regression, not a
neutral change. So this fix moved **search, status filter, sort, and pagination** to the server
together. `GET /v1/platform/schools` gained `q`/`page`/`pageSize`/`sortBy`/`sortDir`, validated by
a new `ListSchoolsQueryDto` — the first whole-object `@Query()` DTO in the codebase.
`SchoolsAdminService.list()` now does `prisma.$transaction([findMany, count])` with `skip`/`take`;
the existing per-row `studentCount`/subscription enrichment fan-out now only runs over the current
page's rows, a genuine efficiency improvement alongside the shape change. `SchoolListResponseDto`
gained `total`/`page`/`pageSize`. No permission-table change — `platform.school.viewAll` already
governs the resource regardless of query params.

**One scope decision, made and documented rather than asked (engineering-shaped, not product
policy — same class of call as B1/B2/B3's own precedent for this kind of decision):** sorting by
**Student count** is dropped, not offered server-side. It isn't a `School` column — it's a
per-school count of `RoleAssignment` rows, and `RoleAssignment` carries `FORCE ROW LEVEL SECURITY`
(ADR-0023). A single cross-school query ordering by it before pagination isn't available without
bypassing tenant isolation — the identical constraint already documented for `B3`'s own worker jobs
(the subscription-expiry sweep and platform metrics, both forced to iterate schools one at a time).
The column stays visible in the Schools list; it just isn't a sort key. The two other screens that
reuse the same `useSchools` hook for their own small "needs attention" lists (the platform dashboard
and `/admin/subscriptions`) don't build pager UI at all — they now request the server's capped
`pageSize: 100` in one call instead, preserving their existing "show everything, no pager" behaviour
rather than silently truncating to the new 25-row default.

**A real bug found only by this gap closure's own integration tests, not by inspection, and never
caught by any test across `B0`–`B4`:** the global `ValidationPipe` was registered only in
`main.ts`'s imperative `bootstrap()` — never as an `APP_PIPE` in `AppModule`. This is the exact same
class of gap `B1` already found and fixed for `HttpExceptionFilter` (same root cause: every
integration test in this codebase boots `AppModule` directly via `NestFactory.create()`, bypassing
`main.ts` entirely). The practical consequence: **no `@Body()` or `@Query()` DTO had ever actually
been validated or transformed by any integration test in this codebase's history** — invisible
until a test finally asserted behaviour that only holds if validation genuinely runs (an
out-of-allow-list `sortBy` value should 400, not reach Prisma's `orderBy` and 500; a query string
`"1"` should transform to the number `1` via `@Type(() => Number)`, not stay a string). Fixed at the
source, mirroring `HttpExceptionFilter`'s own fix exactly: `ValidationPipe` is now an `APP_PIPE`
provider in `app.module.ts`; `main.ts` no longer registers it separately (the identical
double-handling risk that provider's own comment already names). The full `apps/api` unit and
integration suites, `apps/web`'s suite, and the cross-cutting `tests/` suite were all re-run
afterward specifically to confirm real validation now actually applying didn't change any other
test's outcome — it didn't; every other existing caller was already sending well-formed input.

**Testing**: `platform.integration.test.ts` gained a new `describe` block (4 cases — search +
total count, `page`/`pageSize` slicing with `sortBy`/`sortDir` ordering, an out-of-range page
returning an empty page rather than an error, and the invalid-`sortBy` 400 case that is what caught
the `ValidationPipe` bug above). `apps/web`'s `schools/page.test.tsx` gained 3 cases (pager
rendering and `onPageChange` → URL; a filter change resetting `page` back to 1; the Students column
no longer exposing a sort control); `subscriptions/page.test.tsx`'s existing call-shape assertion
was updated for the new `useSchools({ status, pageSize })` object argument.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm test:integration && pnpm spike`, plus `pnpm generate` (three new query params,
three new response fields) and a real `node dist/main.js` boot re-confirming `PolicyCoverageService`
reports all 37 routes checked with zero violations after the `app.module.ts`/`main.ts` change.

`docs/roadmaps/frontend-roadmap.md`'s F3 section: DoD item 2 → `✅`, its Deferred-items pagination
line removed. `docs/roadmaps/backend-roadmap.md`'s B3 section gained a second "Post-completion gap
closure" entry with the full detail (schema/architecture reasoning, the `ValidationPipe` bug, the
`studentCount` scope decision). `docs/roadmaps/roadmap-index.md`'s Current State and Immediate Next
Actions both updated to reflect the closure. No schema change, no new migration, no
permission-table change, no ADR involved. Project state remains _Implementation (F5)_ — this was a
gap closure on already-complete phases, not a new phase.
**Next: `F5 — School Settings & Branding`.**

### 2026-08-27 — Cross-cutting bug fix: HSTS sent unconditionally in local dev

Found by live browser testing of the platform login flow (`/admin/login`), not by inspection or any
automated test — the first time this codebase's Software Admin login had actually been exercised
through a real browser rather than `app.inject()`/curl. Symptom: every login attempt failed with a
generic "Incorrect email or password" error, but the exact same credentials succeeded every time via
direct HTTP calls (curl) replicating the full browser contract (tenant-resolve → CSRF cookie/token →
CORS preflight → login POST), across both the `admin.localtest.me:3000→3001` and plain
`localhost:3000→3001` local-dev host pairs. The browser's Network tab showed the real cause:
`net::ERR_ALPN_NEGOTIATION_FAILED` on the login `fetch` — a TLS handshake failure, meaning the
browser was attempting HTTPS against a plain-HTTP Fastify dev server.

**Root cause**: `apps/api/src/main.ts`'s `app.register(helmet, { global: true })` (`B0`-era, never
touched since) left `@fastify/helmet`'s default `hsts` option on unconditionally, in every
environment — sending `Strict-Transport-Security: max-age=31536000; includeSubDomains` even over
plain HTTP in local dev. A browser that ever receives this (here, most likely from a prior visit to
the real `localtest.me` site, which is genuinely HTTPS-served, combined with `includeSubDomains`)
caches "always upgrade this host and every `*.<root>` subdomain to HTTPS" for up to a year — breaking
every subsequent plain-HTTP local-dev request to any `*.localtest.me` host at the TLS layer, not just
`/admin/login`, until the browser's cached policy is manually cleared
(`chrome://net-internals/#hsts`). Never caught before because every existing test drives the app via
`app.inject()` against `NestFactory.create(AppModule)` directly (the same "bypasses `main.ts`'s
imperative `bootstrap()`" gap-class `B1`'s `HttpExceptionFilter` fix and this same gap-closure's own
`ValidationPipe` fix above already document) — `helmet` itself is only ever registered in
`bootstrap()`, so no automated test in this codebase has ever exercised it at all.

**Fix**: `hsts: isProduction` (registered `false` outside production), mirroring
`allowInsecureSubdomains`' existing "only relaxed outside production" reasoning immediately below it
in the same function — the same shape of environment-gated relaxation, for the same underlying reason
(local dev has no TLS to offer). Live-verified both directions: a real `node dist/main.js` boot with
`NODE_ENV=production` still sends the header; the already-running dev instance (picked up via its own
hot-reload) stopped sending it immediately. `pnpm typecheck` and the full `apps/api` unit suite
(105 tests) reconfirmed green after the change. No test asserts HSTS presence/absence directly — the
same structural gap named above (only a real `bootstrap()` boot exercises `helmet` at all) — so this
was verified live rather than through the automated suite, matching the project's established
practice for `main.ts`-level bootstrap concerns.

No schema change, no migration, no permission-table change, no ADR involved, no roadmap phase status
changed — this is an environment-configuration correctness fix cutting across every phase's local-dev
experience, not scoped to any one of them.

### 2026-08-28 — `B5` complete: academic structure, built ahead of `F5` at explicit instruction

**Explicit deviation from the frontend/backend phase-pairing default, recorded per `AGENTS.md` §19's
own "say so explicitly" requirement.** The documented next step per `roadmap-index.md` and this
file's own prior entry was `F5 — School Settings & Branding`, proving `B4`'s contract before the
backend critical path continued to `B5`. The project owner instead explicitly asked to start `B5`.
Per `AGENTS.md` §2's source-of-truth hierarchy, an explicit current instruction outranks the
roadmap's default posture — this is a deliberate, stated deviation, not a silent skip. `F5` and `F6`
are both now open; either may proceed next.

Followed the working-rules checklist first: read `07 §6.1`–`§6.9`, `03 §6`–`§9`, `05 §7.1`–`§7.5`,
`06 §14`–`§19`/`§23`, the B5 roadmap phase, its three gating ADRs (0001/0011/0013, Gate 2, all
Accepted) in full, and audit findings C-04/M-01/D-02/D-10/D-11 — then planned in a dedicated
plan-mode pass (three parallel research agents covering the roadmap/ADRs, the specs, and the
existing implementation conventions, followed by a design agent) before writing any code, given the
phase's size, per B2/B3's own precedent for a phase this large.

**Scope, confirmed against three independent research passes converging on one reading**: exactly
seven models — `AcademicSession`, `AcademicTerm`, `Department`, `ClassGroup`, `Subject`,
`ClassSubject`, `HODAssignment` — matching `backend-roadmap.md`'s own B5 Scope section, not the
broader set ADR-0001's looser "Required changes" wording might suggest (see the Topic inconsistency
note in this file's Decisions & Deferred Items section above). `TeacherAssignment`/
`StudentEnrollment`/`StudentSubjectRegistration` stay `B6`; `Topic`/`Question.level` stay `B8`;
`ExamClass` stays `B11`; rollover automation stays `B19` — B5's only obligation toward those is
shaping `ClassSubject` and `ClassGroup.level` correctly as their future join targets, which this
phase delivers.

**Confirmed with the project owner during planning**: `ClassGroup.level` is a **fixed platform-wide
Prisma enum** (`JSS1`/`JSS2`/`JSS3`/`SS1`/`SS2`/`SS3`), not a per-school configurable list —
matching this codebase's existing controlled-vocabulary convention (`Role`, `SchoolStatus`, …) and
ADR-0001's own requirement that the value be load-bearing for B8/B9/B11's authorization/exam-
targeting joins. `arm` (e.g. `"A"`) is a separate free-text field, not folded into `level` — "JSS1A"
is `{level: JSS1, arm: "A"}`.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260827225729_b5_academic_structure`):
all seven models RLS-protected the same way every school-owned table has been since B0's bootstrap
migration, plus two hand-written partial unique indexes Prisma's DSL can't express
(`academic_sessions_one_current_per_school`, `academic_terms_one_current_per_session` — the latter
scoped per-session, not per-school, since at most one session is ever CURRENT so "the current term"
already resolves unambiguously through it). `Department`/`Subject` are deliberately **not**
session-scoped (persist across sessions, per `07 §6.3`/`§6.5`); `ClassGroup`/`ClassSubject`/
`HODAssignment` are. `ClassSubject`'s composite FK targets `ClassGroup(schoolId, id,
academicSessionId)` — not just `(schoolId, id)` — which is what makes `ClassSubject.academicSessionId`
structurally incapable of disagreeing with its own class's session (D-10, DoD item 7), a real
database guarantee, not a service-layer check. `ClassGroup.departmentId`/`Subject.departmentId` use
`onDelete: Restrict`, not `SetNull` as originally sketched — Prisma rejected the composite-FK
`SetNull` (a required `schoolId` column can't be nulled independently of `departmentId`), and
`Restrict` is the more correct choice anyway given the archival rule already blocks hard-deleting a
Department while dependents exist.

**API** (`apps/api/src/modules/academics/`, replacing B0's 12-line stub): `academics.v1` — full
CRUD-with-archival for all seven entities, `POST /v1/academics/sessions/:id/activate`,
`GET /v1/academics/context` (every role, DoD item 10), `GET /v1/academics/classes/:id/subjects`, and
one roadmap-unnamed addition, `POST /v1/academics/terms/:id/activate` — without it, `GET
/v1/academics/context`'s "current term" could never become non-null, making DoD item 10
unsatisfiable. Session/term activation each run one transaction that closes the previous CURRENT row
(if any) and activates the target; activating a session also bulk-closes any CURRENT term it's
closing, so no non-current session is ever left with a dangling CURRENT term. **A real engineering
refinement found during implementation**: the original plan called for explicit `SERIALIZABLE`
isolation to make concurrent activations race-safe; implementation found this unnecessary — the
partial unique index plus Postgres's own row-locking (two activations racing to close the same
previously-current row serialize on that row's lock; two racing with no shared row yet still
serialize via Postgres's uncommitted-unique-index-entry wait) already guarantee exactly one winner
under plain READ COMMITTED. Proven by a dedicated test forcing the exact interleaving with a
deliberate `pg_sleep`, rather than relying on incidental HTTP-request timing (which would have been
non-deterministic). `HODAssignment` rejects a membership lacking an active `HOD` `RoleAssignment` —
an application-layer check inside the same transaction as the insert, not a DB trigger (this
codebase avoids cross-table triggers; B2's own `PlatformRoleAssignment` CHECK constraint is
single-table only, not a precedent for this case).

**Authorization**: cleared the ten `awaitingResource: '... (B5)'` flags B2 pre-graded and waiting on
this phase (`schoolConfig.{department,class,subject,session,term}.{view,manage}`) plus
`assignments.hodToDepartment` (B5 delivers both `Department` and `HODAssignment`); narrowed
`assignments.studentToClass`/`assignments.moveStudent`'s flags to `Enrollment (B6)` only, and the two
`analytics.*` rows' flags to `B16/B17 analytics` only, now that `Department`/`ClassGroup` exist. New
row `academics.context.view`, granted `SELF` (not `SCHOOL`) to every school role — **a real DoD-8
test catch**: the permission table's own test suite enforces that a STUDENT grant may only ever be
`SELF`/`SYSTEM`/`DENIED` (one already-named `SCHOOL` exception, not this row), so the first draft's
`SCHOOL` grant for this row failed that test immediately; `SELF` is in fact the more correct
semantics anyway (every role reads its _own_ resolved context, not a whole-school listing). The real
`DEPARTMENT` scope resolver (`department-scope.resolver.ts`) closes B2's fail-closed placeholder —
checks the actor holds an active `HODAssignment` for the resource's department, registered via a
small `DepartmentScopeResolverProvider` (`OnModuleInit`) so `AcademicsModule` itself stays a plain
`@Module` decorator. Proven directly by a dedicated integration test (DoD item 6) rather than through
a live HTTP route: no B9 endpoint exists yet to pass a `ResourceContext` into
`AuthorizationService.evaluate()` (`PermissionGuard` never constructs one today), which is expected
and correct for this phase — B5's job is only to make the resolver exist and be correct.

**Two real bugs found only by writing and running the integration tests, not by inspection:**

1. Every create/update touching a `@@unique` constraint (class identity within a session, department/
   subject codes, term sequence, a subject offered twice to one class) had no unique-violation
   handling — the duplicate-class-identity test surfaced this as an unhandled 500 instead of a clean 409. Fixed with a shared `runUniqueGuarded()` helper (`prisma-error.util.ts`) wrapping every
   affected create/update, translating `PrismaClientKnownRequestError` `P2002` into a plain
   `CONFLICT` with a specific message — distinct from the activation-specific
   `ACADEMIC_ACTIVATION_CONFLICT` code, which stays reserved for the activation race. This is the
   first phase needing to catch a specific Prisma error class at runtime, which surfaced a real gap
   in `packages/db`: `Prisma` was exported as a type only (`export type { Prisma }`), never as the
   runtime namespace object `PrismaClientKnownRequestError` lives on — fixed with a small additive
   `export { Prisma } from './client.js'`.
2. This phase's own HTTP integration-test helper reproduced the exact bodyless-POST `Content-Type`
   bug `CLAUDE.md`'s B4 entry already documented once (copied from `platform.integration.test.ts`'s
   own `post()` helper, which carries the identical latent bug — it has simply never been triggered
   there, since none of its POST calls happen to be bodyless). B5's own action endpoints
   (activate/archive/deactivate/end) are bodyless POSTs, so every one of them failed with a generic
   400 until the helper was fixed to only set `Content-Type` when a payload is actually sent.

**Testing**: 22 tests in `academics.integration.test.ts` (full structure creation; session/term
activation switching including cascaded term closure; archival-with-dependents; destructive-deletion
refusal; cross-tenant isolation; teacher/student/HOD authorization boundaries; the HODAssignment
active-role invariant; `GET /v1/academics/context` for all five school roles) — all driven over real
HTTP (`app.inject()`) against the real `AppModule` and real Postgres, per this codebase's established
integration-test convention. A dedicated `session-activation-concurrency.integration.test.ts` proves
DoD item 2's database-level guarantee directly against Postgres (bypassing the NestJS/HTTP layer
entirely, since an ordinary `Promise.all([app.inject(...), app.inject(...)])` race isn't
deterministic enough to reliably prove a database-level guarantee). A dedicated
`department-scope.resolver.integration.test.ts` proves DoD item 6 directly against a real
`HODAssignment` row. `tests/tenancy/rls.integration.test.ts` gained a new block covering all seven
new tables (three-test shape × 7, matching B3/B4's own economy) — 38 tests in that file total, up
from 17.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm test:integration`, plus `pnpm generate` (`academics.v1` — 20 new routes — appears
in `apps/api/openapi.json`/`packages/contracts`) and `pnpm generate:permission-table-doc` (144 rows,
up from 143 — one new row, ten flags cleared, three narrowed). A real `node dist/main.js` boot
confirmed `PolicyCoverageService` reports 74 routes checked with zero violations (this codebase's
established pattern for catching the cross-module DI/boot-only bugs every prior phase has hit at
least once — none surfaced this time).

`docs/roadmaps/backend-roadmap.md`'s B5 section gained status `COMPLETE`, every DoD item checked with
notes on what's proven now versus what completes once B8/B11 exist, a full "Implementation notes"
subsection, and an expanded Deferred items list. `docs/roadmaps/roadmap-index.md`'s version, Current
State, and Immediate Next Actions all updated to record the explicit F5-skip and the new "F5 or F6,
either next" state. This file's Decisions & Deferred Items section gained the Topic/ADR-0001
documentation-inconsistency note.

**Honestly out of scope for this session**: `F6` (Academic Structure Workspace) and the F2
context-switcher gap-closure it would complete — not built here, per the user's explicit "start B5"
instruction (backend only). `StudentEnrollment`'s own dependent-check on `ClassGroup` deletion is a
real, named gap `B6` must close once that table exists — `B5` cannot check a table that doesn't
exist yet.

Project state moves from _Implementation (F5, pending)_ to _Implementation (B5 complete; F5 or F6
next)_. **Next: `F5 — School Settings & Branding` or `F6 — Academic Structure Workspace`** (either
may proceed per the frontend/backend phase-pairing default), or `B6 — People, Profiles & Enrollment`
if the backend critical path is prioritized instead.

### 2026-08-28 — `B6` complete: people, profiles and enrollment, continuing the backend critical path

Requested explicitly, same day as `B5`: continue straight down the backend critical path rather than
switch to a frontend phase — the identical class of instruction that prioritized `B5` over `F5`
earlier this session (`AGENTS.md` §2's source-of-truth hierarchy: an explicit current instruction
outranks the roadmap's phase-pairing default). Not a silent skip of `F5`/`F6`/`F7` — all three remain
open and are recorded as such below.

Followed the working-rules checklist first: read `07 §6.7`–`§6.9`, `03 §11`–`§17`/`§58`/`§68`–`§70`,
`05 §9`/`§11`–`§14`, `02`'s User Management/Assignments rows, the B6 roadmap phase, its two gating
ADRs (0011, 0017 — both Accepted) in full, and audit findings M-02/C-10/M-05 — then planned in a
dedicated plan-mode pass (two parallel research agents covering the roadmap/ADRs/specs and the
existing implementation conventions, followed by a design-and-review pass verifying the highest-risk
files directly) before writing any code, per B2/B3/B5's own precedent for a phase this size.

**One product-modeling question genuinely forked and was put to the project owner rather than
guessed, per `AGENTS.md` §3**: does `POST /v1/hods` create a brand-new person record, or promote an
existing teacher's membership? **Confirmed: promote an existing teacher** — `POST /v1/hods` takes an
existing teacher `membershipId` and adds an `HOD` `RoleAssignment` to it; no second, disconnected
person record is ever created. This matches the schema's own pre-existing documentation ("a
membership may hold more than one role, e.g. TEACHER + HOD") and avoids the real risk the rejected
alternative carried: the same person ending up as two unlinked rows if they're both a subject teacher
and later made HOD.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260828120000_b6_people_profiles_
enrollment`): three new tables — `StudentEnrollment` (07 §6.7, session-scoped placement, field names
following the ERD literally), `TeacherAssignment` (07 §6.8, "the core authorization entity"), and
`StudentSubjectRegistration` (ADR-0011, keyed on the _enrollment_, not the student directly — the
design choice that makes ADR-0011's "close registrations for subjects the new class doesn't offer"
fall out structurally on a class move, with no explicit close-loop needed, since a superseded
enrollment's own registrations are already historically frozen the moment it stops being `ACTIVE`).
Two purely additive changes to already-shipped B1/B5 tables — new `@@unique([schoolId, id])`
composite-FK-target indexes on `ClassSubject`, `StudentProfile`, and `TeacherProfile` (every other
such target already had this line; these three simply hadn't needed it until B6 gave them FK-
consuming children) — no behavior or data change. Hand-written migration SQL for RLS bootstrap (all
three new tables) plus two partial unique indexes Prisma's DSL can't express, mirroring B5's own
precedent exactly: `student_enrollments_one_active_per_session` (DoD item 9) and
`teacher_assignments_one_active_per_pair` (scoped to `ACTIVE` rows only, so a rehire after ending the
same pair stays possible).

**No `StudentProfileStatus` enum extension was needed** — verified directly before assuming
otherwise: `StudentProfileStatus` (`ACTIVE`/`GRADUATED`/`WITHDRAWN`/`ARCHIVED`, academic standing)
and `UserStatus` (`INVITED`/`ACTIVE`/`SUSPENDED`/`INACTIVE`, account status) together already cover
the roadmap's listed student lifecycle exactly as audit finding C-14's original account/academic
split intended.

**API work**: two modules, not the roadmap's literally-named three. A new `UsersModule`
(`apps/api/src/modules/users/`) owns person directories/lifecycle — Student/Teacher/HOD/Moderator,
built on B1's identity models — while `AcademicsModule` gained `StudentEnrollment`/
`TeacherAssignment`/`StudentSubjectRegistration` exactly as that module's own doc comment (written
during B5) already anticipated: "B6 adds StudentEnrollment/TeacherAssignment/
StudentSubjectRegistration on top of this same module." `UsersModule` imports `AcademicsModule`
one-directionally for `HodAssignmentService` (B5) — its first-ever export — needed only by
`PUT /v1/hods/:id/department`, a new `HodAssignmentService.reassign()` method mirroring
`SessionService`'s own close-then-activate transaction shape. `POST /v1/students/:id/enrollments`
serves both "enroll" and "move" behind one endpoint (the roadmap's own wording), with the ADR-0011
auto-registration/reconciliation logic in the same transaction. `PUT /v1/teachers/:id/assignments` is
a full-replace (matching `05 §12.1`'s checkbox-editor UI) that diffs against the teacher's current
`ACTIVE` assignments, ending removed pairs (never deleting — DoD item 5) and creating added ones.

**The real `ASSIGNED` scope resolver** (`assigned-scope.resolver.ts`) closes B2's other fail-closed
placeholder (`DEPARTMENT`, closed by B5, was the first), mirroring `department-scope.resolver.ts`'s
exact shape: checks the actor holds an active `TeacherAssignment` for the resource's
`classSubjectId`. `ResourceContext` gained that one field. Same caveat B5 already recorded for
`DEPARTMENT`: no controller anywhere constructs a `ResourceContext` yet, so this resolver is correct
and registered but reachable over HTTP only once a later phase (B8/B9) calls
`AuthorizationService.evaluate()` with one — proven directly here instead, against real
`TeacherAssignment` rows (DoD item 4: "assigning Mathematics/SS2A grants exactly that scope and
nothing adjacent").

**Staff invitation dispatch reuses B1's password-reset token mechanism directly**, exactly as
`templates.ts`'s own B1-era doc comment predicted: "also a staff member's initial invitation once B6
starts issuing those tokens the same way." A new `IdentityService.issueStaffInvitation(schoolId,
userId)` — deliberately not `requestPasswordReset` itself, which requires `user.status === 'ACTIVE'`,
an enumeration-resistance gate wrong for a freshly-created `INVITED` account. `IdentityService` is
now exported from `IdentityModule` for this. This closed a real roadmap ambiguity honestly rather
than assuming the conservative reading: "invitation dispatch for staff" (listed as a B6 Background
job) turned out to need no queue/batch mechanism at all — a single `POST /v1/teachers` (or `/hods`,
`/moderators`) call is itself the triggering event, dispatched synchronously. The sibling Background
job, "credential-sheet generation for a class after import," genuinely does need `B7`'s import
pipeline to trigger it and was pushed forward, not built here.

**Two response-shape decisions recorded, not silently defaulted**: teacher/HOD/moderator credential
reset returns a plain `{status: 'ok'}`, never a password — `CredentialState`'s own doc comment
("staff: invitation link; student: system-generated password") makes the shown-once-password shape
wrong for staff. `account.forcePasswordReset`'s HOD grant stays `limitedReadOnly('DEPARTMENT', ...)`
— no controller route ever grants HOD real write access to reset anyone's credentials — finalizing
that permission row's own B2-era "finalized when B6 builds the operation" comment consistent with
ADR-0017's general withdrawal of HOD operational authority over people/assignments.

**Permission table** (`packages/domain/src/authorization/permission-table.ts`): cleared eleven
`awaitingResource` flags this phase's routes finally satisfy, and added four new `.view` rows
(`users.{moderator,hod,teacher,student}.view`) — no roadmap document named a read permission distinct
from `.create`, and gating a `GET` behind a `CREATE`-typed id would have been a real semantic
mismatch; each mirrors its sibling `.create` row's grant shape exactly. `users.import.*` and
`users.export` stay flagged — B7's/a later phase's job, not B6's. Two new domain-specific error codes
registered in `packages/domain/src/error-codes.ts` alongside B5's own precedent
(`HOD_ASSIGNMENT_REQUIRES_ACTIVE_ROLE`): `STUDENT_ENROLLMENT_REQUIRES_ACTIVE_ROLE`,
`TEACHER_ASSIGNMENT_REQUIRES_ACTIVE_ROLE`, plus `HOD_PROMOTION_REQUIRES_ACTIVE_TEACHER_ROLE`,
`ACADEMIC_STRUCTURE_SESSION_MISMATCH`, and `CREDENTIAL_RESET_FAILED`.

**Two analogous `assertNoDependents` extensions, not just the one B5's own Change Log entry named in
advance.** `ClassGroupService.delete()` now also counts `StudentEnrollment` rows — the named,
expected extension. Found only while implementing, not anticipated: `ClassSubjectService.remove()`
(B5) needed the identical treatment, since `TeacherAssignment` and `StudentSubjectRegistration` both
FK against `ClassSubject` with `onDelete: Restrict` too — without it, a hard-delete attempt would
have surfaced as a raw, unfriendly database constraint error instead of a clean `409`.

**One real bug found only by the integration tests, not by inspection**:
`ReplaceTeacherAssignmentsDto.classSubjectIds` was originally validated with `@IsUUID('4', { each:
true })` — rejecting every real id in this codebase, which uses UUIDv7 primary keys throughout. Every
`PUT /v1/teachers/:id/assignments` call failed with a generic `VALIDATION_ERROR` until fixed to the
same version-less `@IsUUID()` every other id field in this codebase already uses.

**Testing**: `users.integration.test.ts` (14 tests — all four groups' create/edit/deactivate/
reactivate/reset-credentials, HOD promotion/reassignment/removal leaving prior assignments
attributed to the previous HOD, School-Admin-only moderator management, cross-tenant denied, teacher
cannot manage users); `student-enrollment.integration.test.ts` (9 tests — enroll, auto-registration,
idempotent re-enrollment, roster, deregister/re-register, the 07 §35 class-movement worked example,
ADR-0011 reconciliation, the sequential double-enrollment case, and `ClassGroupService.delete()`'s B6
extension); `teacher-assignment.integration.test.ts` (6 tests — the ASSIGNED resolver proven true/
false directly, full-replace diff semantics, historical preservation on removal, rehire after ending
the same pair, the active-role invariant, cross-tenant); `student-enrollment-concurrency.integration.
test.ts` (1 test, mirroring `session-activation-concurrency.integration.test.ts`'s own `pg_sleep`-
forced-interleaving technique exactly, proving DoD item 9 at the database level, not merely via HTTP
timing); `tests/tenancy/rls.integration.test.ts` gained the three new tables in its existing academic-
structure describe block's `tables` array (same "economy" precedent as B3/B4/B5 — no new describe
block), 47 tests total in that file, up from 38.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test && pnpm
build && pnpm test:integration && pnpm spike`, plus `pnpm generate` (`people.v1` and the extended
`academics.v1` routes appear in `apps/api/openapi.json`/`packages/contracts`) and `pnpm
generate:permission-table-doc` (148 rows, up from 144 — the four new `.view` rows). A real `node
dist/main.js` boot confirmed `PolicyCoverageService` reports 106 routes checked with zero violations
(this codebase's established way of catching the cross-module DI/boot-only bugs every prior phase has
hit at least once — none surfaced this time). One pre-existing, unrelated `apps/web` test flake
(`app/admin/(shell)/schools/new/page.test.tsx`, a fuzzed-email-string case) was observed during the
full-pipeline run and confirmed to pass in isolation — `apps/web` was not touched this session, so
this is recorded as a pre-existing flake, not a B6 regression, and left for whichever session next
touches that screen.

`docs/roadmaps/backend-roadmap.md`'s B6 section gained status `COMPLETE`, every DoD item checked, a
full "Implementation notes" subsection, and an expanded Deferred items list; its own B5 section's
Deferred items line for `StudentEnrollment`'s dependent-check was updated to record the closure.
`docs/roadmaps/roadmap-index.md`'s version, Current State, and Immediate Next Actions all updated to
record `B6` complete and `F4`/`F5`/`F6`/`F7` all now reachable.

Project state moves from _Implementation (B5 complete; F5 or F6 next)_ to _Implementation (B6
complete; F4/F5/F6/F7 all open, or `B7`/`B8` on the backend critical path)_.
**Next: `F5`, `F6`, `F7`, or `F4` (frontend/backend phase-pairing default), or `B7 — Bulk Import
Pipeline` / `B8 — Question Bank` if the backend critical path is prioritized instead — `B7` is worth
particular consideration since it directly extends the people/enrollment surface `B6` just shipped.**
