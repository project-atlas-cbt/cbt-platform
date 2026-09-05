# CLAUDE.md

## Project

**Project Atlas**
Commercial multi-tenant Computer-Based Testing (CBT) platform for secondary schools, initially targeting Nigeria.

> The internal codename "Project Atlas" is temporary unless/until a final commercial product name is established.

---

## Project Status

**Current Stage:** Implementation, in progress. Specification audit, roadmaps, and all 33
architecture decisions were completed first (see below); backend phases `B0`–`B12` and every
frontend phase through `F11` are now complete (this line itself had drifted stale — kept at
"`B0`–`B6`"/"`F0`–`F7`" long after later phases shipped; corrected 2026-09-04, see "Current Phase"
below for a note on why this section can lag and the Change Log's own dated entries are the actual
source of truth). See "Implementation Status" and "Change Log" further down in this file for what
has actually shipped and what's next.

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
Change Log entry below). No DoD item was left partial. **`F4 — School Onboarding Wizard`** — complete:
the guided, resumable ten-step flow (`/activate` → `/onboarding/[step]` `ON-01`..`ON-10`) taking a
school from a redeemed activation key to operational — the first phase to consume `B3`+`B4`+`B5`+`B6`
together as one real user journey. One DoD item honestly partial (staff/student creation is
one-at-a-time only; real bulk import waits on `F8`/`B7`, per the roadmap's own named fallback), plus
a small, confirmed backend gap-closure this phase required (onboarding-completion tracking on
`School`; the activation-redeem response gained the new admin's login identifier — see this file's
Change Log entry below). **`F5 — School Settings & Branding`** — complete: the real Profile/
Branding/Results/Subscription settings screens (`/school/settings/*`), reusing F4's exact logo-
upload sequence and `BrandingPreview` rather than duplicating them, a genuinely new dirty-state/
unsaved-changes guard, and the first real per-control frontend permission check enforcing
Moderator's confirmed view-only posture. Two DoD items honestly deferred by design (Assessment
Rules, Grading Scale — both wait on `B11`/`B15` to exist), plus a confirmed small backend gap-
closure ADR-0010 had assigned to `B3`/`B5` but neither built (`School.resultPolicy`/
`resultDetailVisibility`/`resultPolicyLocked`, `GET/PUT /v1/school/result-policy` — see this file's
Change Log entry below). **`F6 — Academic Structure Workspace`** is now complete: real CRUD-with-
lifecycle screens for sessions/terms/departments/classes/subjects/offerings across all three role
roots that need them (School Admin/Moderator full manage, HOD read-only via a confirmed nav
gap-closure), one shared `components/academics/*` component library rather than three separate
implementations, the real `ContextSwitcher` session/term wiring (closing F2's own honestly-flagged
partial DoD item), and one confirmed small additive backend gap-closure (`GET /v1/classes/:id/
teachers`). Four scope questions were confirmed with the project owner before implementation — see
this file's Change Log entry below for the full reasoning. **`F7 — People Management Workspace`**
is now complete: real Student/Teacher/HOD/Moderator directories and profile screens across School
Admin and Moderator (HOD gets zero F7 screens per ADR-0017), the `TeacherAssignmentMatrix` (this
codebase's first matrix/grid component), and three confirmed small backend gap-closures (server-side
pagination extended to all four directories, a class-level credential-sheet CSV download endpoint,
and dedicated HOD edit/reset-credentials routes) — proving `B6`'s own contract. Every frontend phase
through F7 is now complete. **`B7 — Bulk Import Pipeline`** is now complete too: the full
validate-preview-confirm-import-summary pipeline (`imports.v1`) for student and teacher bulk import —
CSV and `.xlsx` both supported (confirmed with the project owner), chunked/resumable/idempotent
commit processing reusing `StudentEnrollmentService.enroll()`/`IdentityService
.issueStaffInvitation()` directly rather than reimplementing them, and every A-17 decision this
phase was scoped to settle (formats, 5,000-row/5MB caps, versioned templates, 24h staging expiry).
Question import stays deferred, waiting on `B8`'s `Question` model. See this file's Change Log entry
below for the full reasoning, including a genuine architecture deviation on where its background job
processors run. **`B8 — Question Bank`** is now complete too: `Question`/`QuestionRevision`/
`QuestionOption`/`QuestionMedia`/`Topic` (`questions.v1`), immutable approved revisions enforced by
three real Postgres triggers (this codebase's first trigger-enforced constraint and first
parent+versioned-child pattern), the `Question.currentRevisionId` pointer design resolving D-12 by
construction, and question bulk import/export extending `B7`'s pipeline in this same pass rather
than deferred. Closed two genuine pre-existing gaps found only by routing real HTTP traffic through
them for the first time: the `ASSIGNED`/`DEPARTMENT` scope resolvers' missing "no resource yet"
optimistic-pass case, and three `ImportsModule` routes gated by a permission id Teacher/HOD don't
hold. `QuestionReview` (B9's approve/reject/comment workflow) is explicitly not built. See this
file's Change Log entry below for the full reasoning. **`F8 — Bulk Import UI`** is now complete too:
one shared `<BulkImportFlow>` state machine consuming `imports.v1` across six routes (Student/Teacher
import for School Admin and Moderator, Question import for Teacher) and a new manual/import mode
toggle inside the onboarding wizard's Staff/Students steps — closing `F4`'s own last honestly-partial
DoD item. **`F9 — Question Bank Workspace`** is now complete too: the teacher's question authoring
workspace at `/teacher/question-bank` (corrected from the roadmap's own literal `/teacher/questions`
against the already-shipped nav item and F8's own stub), proving `B8`'s `questions.v1` contract end
to end for the first time, including this codebase's first rich-text editor (Tiptap) and first
`dompurify`-sanitized render of stored user content. Honestly partial on the one DoD item gated on
`B9` (the HOD's rejection reason — no such field exists anywhere in `B8`'s schema yet); everything
else `B8` supports is built and proven. Every currently-open frontend phase through `F9` is now
closed out. **`B9 — Question Review & Governance`** is now complete too: `question-review.v1` — the
HOD review queue, review workspace, approve/reject/request-changes decisions with mandatory reasons,
and a complete immutable review history — reusing `B8`'s own two-hop department-scope join pattern
and requiring zero changes to `B8`'s existing resubmission gate (`REQUEST_CHANGES` writes the same
`REJECTED` revision status `REJECTED` itself does, distinguished only by the new `QuestionReview
.decision` field). Self-review prevention blocks a Teacher-who-is-also-HOD from approving their own
question; HOD reassignment needed no new mechanism, since the queue always re-resolves live
`HODAssignment` rows against B6's already-shipped removal/reassignment endpoints. Notifications reuse
the existing B0 `NotificationChannel` synchronously rather than waiting on the still-unbuilt `B10`,
matching B1/B3/B6's own precedent. **`F10 — Question Review Workspace`** is now complete too,
closing the "F10 confirms the contract" exit criterion `B9` left open: the HOD review queue
(`/hod/question-review`, grouped by subject), review workspace (approve with an optional note and no
dialog; reject/request-changes each behind a mandatory-reason dialog; queue-order prefetching for an
instant "Next"; keyboard shortcuts), department bank oversight (`/hod/question-bank`, reusing F9's
`QuestionBankScreen`/`QuestionDetailScreen` verbatim once a real hardcoded-path bug in the former was
fixed), and the dashboard's pending-review widget. Every currently-open frontend phase is now closed
out. **`B11 — Exam Builder & Readiness`** is now complete too: `exams.v1` — exam construction from
approved question revisions only, full configuration (duration/attempts/navigation/randomization/
result policy/instructions), and the itemised (never boolean) readiness checklist gating
`DRAFT → READY`, with the approved-revision-only rule and READY-immutability both enforced by real
Postgres triggers, each proven independently of the service layer by a direct-Prisma-bypass test.
ADR-0013's multi-class targeting is enforced at the service layer (mirroring `HODAssignment`'s own
precedent for this class of cross-table check) rather than a novel schema scheme, leaving every
already-shipped table untouched. **`B10 — Audit & Notifications`** is now complete too (2026-09-03,
built after `B11` — no gating dependency between the two): real, per-role-scoped audit retrieval
(`GET /v1/audit` school-scoped; `GET /v1/platform/audit` Software-Admin-only and genuinely
cross-school via a new privileged Postgres role, `atlas_audit_reader`, rather than a per-school
query loop), a canonical action vocabulary enforced at the application layer without mass-renaming
the ~55 already-shipped action strings, real database-level append-only enforcement, and a genuine
in-app `Notification` system built from nothing (persisted rows with read state, a real BullMQ
retry queue for out-of-band dispatch, and a new unassigned-students digest job for Moderator).
Frontend wiring was included in the same pass — F2's `NotificationPanel` and F3's three audit
screens now consume real data. See this file's Change Log entry below for full detail.
**`F11 — Exam Builder`** is complete too (2026-09-04): the Details→Questions→Rules→Review wizard at
`/teacher/exams/*`, plus confirmed read/administer-only oversight screens for School Admin/
Moderator/HOD. **`B12 — Exam Activation & Control`** is complete too (2026-09-04): `exam-control.v1`
— session open/close/reopen at both exam and session level, batch authorize/revoke sharing one
eligibility predicate across both `access_mode`s, the Control Center, this codebase's first SSE
implementation, End Examination, and `ExamAdministrator` delegation. **`F12 — Exam Control Center`**
is complete too (2026-09-04), built the same day as `B12` at explicit project-owner instruction — a
deliberate deviation from the frontend/backend phase-pairing default (which had named `B13` "next"),
the same shape as the earlier B5-before-F5 precedent. Delivers the live invigilation console for all
four school-side roles (a confirmed scope extension beyond Teacher+Moderator, mirroring F11's own
precedent), the delegate-management panel, and SSE consumed end to end with an injectable,
unit-tested connection-status mapping. Every frontend phase through `F12` and every backend phase
through `B12` are now closed out. **`B13 — Attempt Engine`** is complete too (2026-09-05): `attempt.v1`
— attempt creation under a `pg_advisory_xact_lock` with a partial-unique-index backstop, the
ADR-0008 JSONB snapshot (immutable, materialised order), ADR-0007 answer persistence via one atomic
`INSERT ... ON CONFLICT ... WHERE` upsert, the structural X-05 guarantee (no `correctFlag` field
exists anywhere in the student-facing DTO type), heartbeat/integrity-event signals, submit, and
staff-initiated end. Both decisions the roadmap flagged as needing resolution during this phase's
planning were confirmed with the project owner and built, not left open: the `B12`-carried-forward
remote-impersonation signal (device/session-binding fields + a `BINDING_MISMATCH` `AttemptEvent`,
detected via the heartbeat endpoint, never a block) and the `StudentAssessmentAccommodation` gap
(resolved by extending `ExamSessionParticipant` with `extraTimeSeconds` rather than a new entity).
Un-stubs both of `B12`'s own honest Control Center placeholders in both independent implementations.
Every frontend phase through `F12` and every backend phase through `B14` are now closed out —
`B14 — Submission & Marking` is complete too (2026-09-05): exactly-once submission, ADR-0004's
auto-submission (a sweeper in `apps/worker` plus opportunistic finalisation across every relevant
`apps/api` touchpoint), and automatic objective marking (`AttemptQuestionResult`, read only from the
frozen snapshot, idempotent via upsert) — deliberately entity-free of `Result` itself (a confirmed
decision; `Result`/`GradingScale`/publication are all `B15`'s job). `B15 — Results & Publication` is
next on the backend critical path. See this file's Change Log entries below (dated 2026-09-04 and
2026-09-05) for full detail on all five phases.

**Note on this section's own staleness, found while updating it for `B12` (2026-09-04):** the
paragraph above had fallen behind — it still named `B12` as "next" and left `F11` marked as a
future phase, even though both `F11` and (now) `B12`/`F12` are complete and the Change Log below
already recorded `F11`, the `B12`-adjacent process-management fix, and everything through this entry
accurately the whole time. This "Current Phase" summary is a hand-maintained rolling status, not
generated from the Change Log, so it can drift if a completing session updates the Change Log but
skips back up to refresh this section — exactly what happened here. Flagged so a future session
doesn't assume this section is authoritative over the Change Log's own dated entries if the two
ever disagree again; the Change Log is always the source of truth for exactly what shipped and
when.

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

### 2026-08-28 — `F4` complete: School Onboarding Wizard

Requested explicitly: start `F4`. Followed the working-rules checklist first: read `03 §3`–`§9`
(activation and the ten onboarding steps in full), `04 §3` (the module/screen map's own ten-step
list), `05 §5.1`–`§5.2` (the `ON-01`..`ON-10` wizard spec and completion validations), the F4
roadmap phase, and the existing `B3`/`B4`/`B5`/`B6` implementation (`activation.service.ts`,
`school-branding.controller.ts`, `academics-context.service.ts`, `class-group.service.ts`,
`permission-table.ts`) before writing any code — planned in a dedicated plan-mode pass given the
phase's size, per `B2`/`B3`/`B5`/`B6`'s own precedent. No gating ADR blocks F4.

**Resolved a real spec inconsistency, not silently picked a side**: `04 §3`'s own ten-item list
folds "Verify School" in as step 1 and merges session/terms into one step, while `05 §5.1`'s own
ten-item list separates session/terms into two steps but doesn't count key-verification as a wizard
step at all. F4's own route table (`/activate` vs `/onboarding/[step]` `ON-01`..`ON-10`) is
authoritative and was followed literally: "Verify School" lives at the separate pre-wizard
`/activate` route, not as one of the ten in-wizard steps — recorded in
`lib/onboarding/steps-config.ts`'s own doc comment, not just this entry.

**One confirmed, small, additive backend gap-closure** (the same shape of decision as
`B3`/`B4`/`F3`'s own precedent — confirmed before implementation, not silently expanded scope):
F4's resumability requirement ("wizard progress persisted server-side") and its re-entry-blocked
security requirement ("a completed school cannot re-enter onboarding") had no backing anywhere —
`School` carried no onboarding-completion concept, and no endpoint reported one. `School` gained
two columns (`onboardingCompletedAt: DateTime?`, `onboardingState: Json?` — UI-progress only, never
consulted for business-rule enforcement, which is always recomputed live from
`AcademicSession`/`ClassGroup` state); new `apps/api/src/modules/platform/school-onboarding.
{controller,service}.ts` (`GET/PUT /school/onboarding(/progress)`, `POST
/school/onboarding/complete`) reuses `AcademicsContextService.get()` and `ClassGroupService.list()`
(both already existed from `B5`) rather than duplicating queries, is idempotent on a second call,
and is the real server-side enforcement of `05 §5.2`'s completion blockers
(`ONBOARDING_FUNDAMENTALS_MISSING` 409) and the re-entry-blocked rule
(`ONBOARDING_ALREADY_COMPLETE` 409) — never trusted from the client's own check alone. New
permission row `schoolConfig.onboarding.manage` (School Admin only) — 148→149 rows.

**A second, smaller gap found only during implementation verification, not anticipated in the
original plan**: `POST /activation/redeem` returned `Promise<void>`; the newly-activated School
Admin's `login_identifier` (set at school-creation time, `CreateSchoolDto.adminLoginIdentifier`)
was never surfaced anywhere — not the redeem response, not the activation email template — leaving
`/activate`'s redeem-then-log-in handoff with nothing to log in with. Fixed by extending `redeem()`
to return `{status, loginIdentifier}`; recorded explicitly that this discloses a username (not a
secret) only to a caller who already possesses a valid, unexpired, unredeemed key for that school —
the same reasoning `ActivationService` already uses for renewal's no-extra-session-check design.

**Frontend**: `/activate` (pre-auth, `(school)` route group — verify→redeem→login for
`INITIAL_ACTIVATION`; a `RENEWAL` key has no password to log in with, so it shows "renewal
complete, please log in" instead of attempting a login it structurally cannot perform); `/onboarding`

- `/onboarding/[step]` (a new top-level, pre-shell route group — no `AppShell`/nav, since no
  nav-model entry exists for a one-time setup flow), guarded by a new `OnboardingGuard` layered on top
  of F2's `RouteGuard` (kept deliberately onboarding-agnostic — zero blast radius on `AuthMe`/
  `/auth/me`). `TenantEntryPage` (`app/page.tsx`) gained one branch: a SCHOOL_ADMIN whose onboarding
  isn't complete is routed to `/onboarding` instead of `/school`; every other role's landing is
  unaffected. Ten step components each follow the existing `schools/new`-style form pattern
  (`react-hook-form` + `zodResolver`, committing real data immediately via its own mutation — no
  cross-step client draft store, since resumability is itself server-persisted). `WizardShell` owns
  all navigation centrally (one footer Continue/Skip/Back) — Continue is disabled on the two
  hard-blocker steps (3 Session, 6 Classes) until a shared `useOnboardingStepStatus` aggregator
  (reusing each step's own list queries, no duplicate fetches) reports that step done.

**A real architectural pitfall found and avoided during implementation, not shipped and fixed
later**: `BrandingPreview` (the six `03 §5` preview contexts) deliberately does **not** reuse
`<ThemeProvider>` directly — that component writes a global `:root{...}` style tag, which would have
overridden the whole page's theme the instant the preview mounted inside step 2, not just the
preview area (`:root` is never subtree-scoped). Fixed by deriving the same palette and scoping the
generated CSS custom properties to a unique class instead, proven by a dedicated test asserting the
generated style block never contains `:root`.

**One pre-existing, cross-cutting test-environment gap found only by this phase's own tests, not by
inspection**: Radix `Checkbox`'s indicator sizing (`@radix-ui/react-use-size`) calls
`ResizeObserver`, which jsdom doesn't implement — invisible until step 3's "make this the current
session" checkbox became this codebase's first `<Checkbox>` usage that mounts already `checked`
(every prior `<Checkbox>` test started unchecked). Fixed once, globally, in `vitest.setup.ts`
alongside the existing pointer-capture/scroll polyfills, not worked around per test file.

**Honestly partial, not silently dropped**: staff and students can be created individually only —
real bulk import is `F8`/`B7`, confirmed not built anywhere in `apps/api` yet (no `/imports` path
exists), matching the roadmap's own named fallback ("if F8 is not ready, staff and student steps
allow manual entry and defer import"). Class-Subject matrix authoring and teacher-to-subject/class
assignment during onboarding are deferred to `F6`/`F7` — onboarding only creates the bare
`ClassGroup`/`Subject` entities. Browser E2E remains deferred exactly as F1/F2/F3 already recorded —
substituted with the component/integration test suite below, including a dedicated resumability
test.

**Testing**: component tests for all ten step components (default/valid/invalid/empty-upstream
states), `WizardShell`, `StepProgress`, `OnboardingGuard`, `ReviewSummary`, `BrandingPreview`, and
`ActivateForm` (verify→redeem→login, the `RENEWAL` messaging branch, all three verify error codes) —
218 tests in `apps/web` (up from 187). A dedicated resumability integration test
(`app/onboarding/resumability.integration.test.tsx`) proves DoD item 3 by discarding the
`QueryClient` and fully unmounting between two renders (not a re-render), asserting resumption comes
from the server-persisted state alone. Backend: `school-onboarding.integration.test.ts` (default
shape, PUT round-trip, both 409s, successful completion with its audit event, idempotent
re-completion, non-SCHOOL_ADMIN 403 on all three routes) — 126 tests in `apps/api`'s integration
suite (up from 121 before this phase's own fix to two mis-shaped error-envelope assertions the tests
themselves had wrong, not the product).

Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration`
at the monorepo root, plus `pnpm generate` (new onboarding + activation-redeem contracts) and `pnpm
generate:permission-table-doc` (149 rows).

`docs/roadmaps/frontend-roadmap.md`'s F4 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-partial-with-reason, a full "Implementation notes" subsection, and
an expanded Deferred items list. `docs/roadmaps/backend-roadmap.md`'s B3 section gained a "Third gap
closure" note for the two additive schema/endpoint changes. `docs/roadmaps/roadmap-index.md`'s
version, Current State, and Immediate Next Actions all updated to record `F4` complete.

Project state moves from _Implementation (B6 complete; F4/F5/F6/F7 all open)_ to _Implementation
(F4 complete; F5/F6/F7 all open, or `B7`/`B8` on the backend critical path)_.
**Next: `F5`, `F6`, or `F7` (frontend/backend phase-pairing default), or `B7 — Bulk Import
Pipeline` / `B8 — Question Bank` if the backend critical path is prioritized instead — `B7` would
additionally let F4's Staff/Students steps close their one remaining honestly-partial DoD item.**

### 2026-08-28 — `F5` complete: School Settings & Branding

Requested explicitly: start `F5`. Followed the working-rules checklist first: read `04 §19`
(Settings screen breakdown), `05 §6`, `§46`–`§47`, `§58`, `§66` (branding, grading, publication,
settings module, configurable-policy list), `03 §5`/`§49`, `02`'s School Configuration rows, ADR-0010
in full, the F5 roadmap phase, and the existing B3/B4 implementation (`school-profile.*`,
`school-branding.*`, the onboarding wizard's branding step) — then planned in a dedicated plan-mode
pass (two parallel Explore agents covering existing frontend/backend conventions) before writing any
code, per this project's own precedent for a phase of this shape.

**A real scope fork, resolved by asking rather than guessing (`AGENTS.md` §3), not silently decided
either way.** F5's own roadmap text lists "Assessment rules" (default duration/attempt-limit/
navigation-policy) as in scope, but research surfaced that — unlike Result Policy — no ADR or schema
anywhere defines a school-level default for these: they're `Exam`-level fields that only come into
existence with `B11` (Exam Builder, not yet built), and nothing today would ever consume such a
default even if one existed. Confirmed with the project owner: **deferred, exactly like Grading
Scale** (which the roadmap's own text already treats this way) — building it now would mean
inventing vocabulary `B11` might define differently. Three further confirmed decisions from the same
question round: **Result Policy defaults/lock built now** (a genuine already-approved gap — see
below); **Moderator is view-only across every F5 screen**, no edit rights anywhere in this phase;
**"User Policies" omitted entirely** — no spec detail exists beyond a bare nav label, and it isn't
even in F5's own route table, so it's recorded as Candidate/Deferred rather than invented.

**The Result Policy gap-closure** (full detail in `backend-roadmap.md`'s B3 "Fourth gap closure"
note): ADR-0010's own "Required changes" list states "B5/B3: school-level defaults and the lock
flag" — approved scope neither phase actually built, with a permission-table row
(`schoolConfig.settings.manage`) that had been sitting pre-graded and waiting on exactly this since
`B2`. Closed as a small, confirmed additive change, the same shape as F3/F4's own precedent for this
class of discovery: new `School.resultPolicy`/`resultDetailVisibility`/`resultPolicyLocked` columns
(two new Prisma enums, `packages/domain/src/platform/result-policy.ts`), a new `GET/PUT
/v1/school/result-policy` endpoint, and a split of the old placeholder permission row into a real
`schoolConfig.settings.view`/`.manage` pair (150 rows, up from 149). These are _defaults_ only — no
`Exam` exists yet to seed from `resultPolicy`, no `B15` marking/publication logic exists yet to honour
`resultPolicyLocked`; this closes the storage half of ADR-0010's requirement, not the "applied to
exams" half, which waits on `B11`/`B15` as those phases' own job.

**Two smaller, same-shape gaps found and closed alongside it, both caught by building real frontend
consumers, not by inspection**: `UpdateSchoolProfileDto` never carried `name`, even though `02`'s
matrix already grants School Admin "Full" edit of "school name/details" — one field, added along
with the Profile screen. And `SchoolSubscriptionStatusResponseDto.status` was plain `type: String`,
not the real `SubscriptionStatus` enum — `tsc` caught this building the Subscription screen (F5's
first real frontend consumer of that endpoint), fixed with the exact `enum:` treatment
`SchoolSubscriptionSummaryDto` (F3) already established as this codebase's precedent for the class.

**Frontend delivered**: five real routes under `/school/settings/` (`profile`, `branding`,
`assessment` — honest placeholder, `results`, `subscription`), replacing the `[...slug]` catch-all's
single placeholder, sharing one tab-strip layout mirroring F3's `SchoolDetailLayout`/
`SchoolDetailTabs` pattern exactly. Branding reuses F4's onboarding wizard's logo-upload sequence and
`BrandingPreview` component **moved, not duplicated**, to new shared, phase-neutral homes
(`lib/branding/`, `components/branding/`) — the onboarding step now imports from there instead of
owning a second copy. Query hooks deliberately were **not** consolidated the same way — each phase
keeps its own thin wrapper around a shared query key (`lib/school-settings/queries.ts` joins
`lib/onboarding/queries.ts`/`lib/platform/queries.ts` as this codebase's established convention),
so a mutation from either phase invalidates the other correctly without a forced merge.

**A real gap found and fixed, not a nice-to-have**: `useTenantResolution`
(`lib/tenant/tenant-context.tsx`) was a one-shot `useEffect`/`useState` pair with no way for anything
to invalidate it — meaning a branding save had no mechanism to repaint the live app-wide theme,
DoD item 3's actual requirement. Converted to a TanStack Query (`['tenant','resolve']`); the shared
`useUpdateBranding`'s `onSuccess` now invalidates it alongside `['school','branding']`. Proven by a
dedicated test simulating exactly this invalidate-and-refetch sequence, not just asserted by reading
the code.

**A genuinely new pattern, not reused from anywhere**: no `beforeunload`/dirty-state guard existed
anywhere in this codebase before this phase (confirmed by a full search during planning) — the
roadmap's own "State management requirements" line for F5 called for one. Built as two small,
reusable, phase-neutral pieces (`lib/forms/use-unsaved-changes-guard.ts`,
`components/forms/unsaved-changes-dialog.tsx`) plus a small dirty-state context
(`lib/forms/settings-dirty-context.tsx`) letting each editable tab register its own
`form.formState.isDirty` without the tab-strip layout owning every form's state directly — a
`Dialog`-based confirmation, never a native `confirm()`, per doctrine.

**The first real per-control frontend permission check in this codebase**: every prior consumer of
`GET /me/permissions` (`useNavigation`) only ever gated whole nav sections. A new `useHasPermission`
(`lib/nav/use-permissions.ts`) checks one specific permission id outright — every editable control
across Profile/Branding/Results is disabled (not merely hidden) with an explicit "view-only access"
message for an actor lacking the grant, enforcing Moderator's confirmed posture on both layers
(server-side via the permission table, client-side via this hook) — proven directly by dedicated
Moderator-view test cases on all three screens.

**One real, pre-existing linting rule caught during implementation**: the Subscription screen's
"days remaining" derivation initially called `Date.now()` directly during render, which
`eslint-plugin-react-hooks`'s `react-hooks/purity` rule correctly rejects. Fixed by snapshotting it
once via `useState(() => Date.now())` — acceptable staleness for a page-load-scoped display, not a
value any business rule depends on.

**Honestly deferred, not silently dropped**: Assessment Rules and Grading Scale (both explained
above); "User Policies" (no spec beyond a bare nav label); per-school timezone-aware date rendering
for the Subscription screen's expiry date (ADR-0027) — reuses F3's existing browser-local-timezone
`formatDate` utility, whose own doc comment already flags this as a platform-workspace
simplification not fully appropriate for a school-facing screen; no school-timezone-aware formatter
exists anywhere in the frontend yet, and building one is a larger, separately-scoped addition for a
single date field.

**Testing**: `school-result-policy.integration.test.ts` (6 cases — defaults shape, full round-trip
update, out-of-vocabulary rejection, Moderator view/no-edit, Teacher denied both ways, cross-tenant
isolation) and a new `school-profile.integration.test.ts` (the `name` round-trip) — `apps/api`'s
integration suite green throughout, no regression. `apps/web` gained component tests for all five
new screens' default/loading/error/empty-equivalent and Moderator-view-only states, the tab strip's
active-state and dirty-guard interception, `useUnsavedChangesGuard`, and the `tenant-context`
invalidate-propagation test described above — 248 tests total (up from 218), full suite green (one
transient system-load timeout batch during a single run confirmed, by immediate re-run in isolation,
to be environment flakiness unrelated to this phase's changes, matching this project's established
practice for this class of flake).

Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration`
at the monorepo root, plus `pnpm generate` and `pnpm generate:permission-table-doc` (150 rows) and a
real `node dist/main.js` boot reconfirming `PolicyCoverageService` reports the two new routes checked
with zero violations. `next build --webpack` confirmed the full intended route table, including all
five new `/school/settings/*` routes.

`docs/roadmaps/frontend-roadmap.md`'s F5 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-deferred-with-reason, a full "Implementation notes" subsection, and
an expanded Deferred items list. `docs/roadmaps/backend-roadmap.md`'s B3 section gained a "Fourth
gap closure" note, plus a correction to its own Phase Completion Tracking table (previously listing
ADR-0010 only against `B15`, despite the ADR's own text naming `B3`/`B5`). `docs/roadmaps/
roadmap-index.md`'s version, Current State, and Immediate Next Actions all updated to record `F5`
complete and `F6`/`F7` as the two now-open frontend phases.

Project state moves from _Implementation (F4 complete; F5/F6/F7 all open, or `B7`/`B8` on the
backend critical path)_ to _Implementation (F5 complete; F6/F7 open, or `B7`/`B8` on the backend
critical path)_.
**Next: `F6`, `F7` (frontend/backend phase-pairing default), or `B7 — Bulk Import Pipeline` /
`B8 — Question Bank` if the backend critical path is prioritized instead.**

### 2026-08-28 — Cross-cutting bug fix: platform admin CSRF token never bootstrapped outside `/admin/login`

Found by live dev-server testing, not by inspection or any automated test — logging into the
Platform Admin workspace, browsing to `/admin`, then logging out failed every time with `ApiError:
Missing or invalid CSRF token`, thrown from `PlatformAuthProvider`'s `logout()`.

**Root cause**: `app/admin/layout.tsx` wraps both `/admin/login` and `/admin/(shell)/*`, but the
CSRF-bootstrap call (`useTenantResolution()`, which sets `apiClient`'s in-memory CSRF token as a
side effect of `GET /tenant/resolve`) lived only on `/admin/login/page.tsx` — the assumption being
that every session necessarily passes through that screen first. It doesn't: a hard refresh on
`/admin` itself, a bookmarked deep link into the shell, or (as here) a fresh page load straight to
`/admin` after the dev server restarted all reach `/admin/(shell)/*` without `/admin/login` ever
mounting in that page load. With the bootstrap never run, `apiClient`'s `csrfToken` module variable
stayed `null` for the whole session — every mutating platform call (logout included, and, more
seriously, every school-lifecycle action a real Software Admin session would need to perform) would
have failed the same way, not just logout.

**Fix**: moved the `useTenantResolution()` call from `/admin/login/page.tsx` up to `AdminLayout`
itself (`app/admin/layout.tsx`), the shared ancestor of both routes, converting the layout to a
client component to do so. `useTenantResolution` is a TanStack Query keyed on `['tenant', 'resolve']`
(F5's own conversion of it from a one-shot `useEffect`/`useState` pair) — mounting it from the layout
as well as (previously) the login page would have deduped automatically with no extra request, so
this is a pure relocation, not new fetch behaviour. `/admin/login/page.tsx`'s own now-redundant call
and doc comment were removed, pointing at the layout instead. A new regression test
(`app/admin/layout.test.tsx`) renders `AdminLayout` in isolation — no `/admin/login` anywhere in the
tree, the exact "direct shell entry" shape — and asserts the CSRF token is still bootstrapped.

No schema change, no migration, no permission-table change, no ADR involved, no roadmap phase status
changed — this is a frontend bootstrap-ordering fix cutting across the whole Platform Admin
workspace (`F2`'s shell plus every mutating call `F3` added on top of it), not scoped to any one
phase. `apps/web`'s full suite reconfirmed green afterward (67 files / 249 tests, up from
66/248 — the one new test file).

### 2026-08-28 — Two more cross-cutting bug fixes: platform admin nav never rendered; a global 401 could loop forever

Found in the same live-testing session as the CSRF fix above, from the browser devtools console
after logging into the Platform Admin dashboard with the seeded Software Admin account: a
`GET /v1/me/permissions 401` and a `GET /v1/auth/me 401` repeating continuously.

**Bug 1 — the Platform Admin sidebar never rendered past its loading skeleton.**
`RoleNavigation` (`components/shell/role-navigation.tsx`, shared by `SchoolAppShell` and
`PlatformAppShell` since F3's variant split) called `useNavigation`/`usePermissions()` —
`GET /me/permissions` — unconditionally for every role, including `SOFTWARE_ADMIN`. That route is
`@Authorized(...)`, wired exclusively to the school `AuthGuard` (`AuthorizationController.me()`);
a Software Admin session has no `SchoolMembership`/tenant at all, so the call 401'd every time and
`useNavigation` never received data — the sidebar was stuck on its five-skeleton-bar loading state
forever, real navigation links never appeared. F3's own `role-navigation.test.tsx` never caught
this because it mocked a fully-granted `/me/permissions` response for every role, including
`SOFTWARE_ADMIN` — asserting the filtering logic was correct, never that the endpoint itself could
be reached by that session.

Root fix: `identity.permissions.read`'s permission-table row already granted
`SOFTWARE_ADMIN: granted('SELF')` (B2's own row comment: "not an explicit 02 row" — anticipating
exactly this), and `AuthorizationService.effectivePermissions()`/`actorFromAuthenticatedUser` were
already actor-kind-agnostic (B3) — the only missing piece was a route. Added
`GET /v1/platform/auth/permissions` (`platform-auth.controller.ts`, `@AuthorizedPlatform`,
reusing the same `MePermissionsResponseDto`/`effectivePermissions()` call) as the platform-scoped
analog. No schema, no migration, no permission-table change — purely an additive route over
already-graded logic.

Frontend: `useNavigation`'s "compute nav items from a permission set" logic was extracted into a
pure `computeNavItems` function (`lib/nav/use-navigation.ts`) shared by the existing `useNavigation`
(school, `usePermissions`) and a new `usePlatformNavigation` (platform, the new
`usePlatformPermissions` hook against `/platform/auth/permissions`). `RoleNavigation` itself was
made purely presentational — it now receives a `NavigationResult` prop instead of fetching
internally, mirroring `ProfileMenu`/`ContextSwitcher`'s own F3 "receive identity via props" refactor
for exactly this class of problem. `SchoolAppShell`/`PlatformAppShell` (`app-shell.tsx`) each call
their own hook and pass the result down through `ShellChrome`.

**Bug 2 — a global 401 could retrigger itself forever.** Independently of Bug 1,
`apiClient`'s `unauthenticatedMiddleware` (`lib/api/client.ts`) called `onUnauthenticated()` — which
`AuthProvider` wires to `reload()`, i.e. `invalidateQueries(['auth','me'])` — on _every_ 401
response, unconditionally. Because `AuthProvider` (the school session) is mounted globally at the
root layout, its `/auth/me` query is always "active," so this invalidate forces an immediate
refetch. On any page where `/auth/me` structurally cannot succeed — the platform admin host, which
has no school at all, or an ordinary school session that has genuinely expired — that refetch's own
401 retriggers the identical handler, which invalidates again, which refetches again: an unbounded
loop bounded only by network round-trip time, not by anything that would stop it. This was already
latent for any expired school session (not new, and not specific to the admin host), just never
noticed until this session's console showed it happening continuously on `/admin`. Fixed by
debouncing `unauthenticatedMiddleware` to fire once per unbroken run of 401s, resetting on the next
successful response — a genuinely new session-loss event later still gets handled, but a already-
known-gone session doesn't get re-announced on every single subsequent failed request.

**Testing**: `lib/api/client.test.ts` (new — proves the debounce and its reset, working around
`openapi-fetch`'s `createClient()` capturing `globalThis.fetch` once at module-eval time by
`vi.resetModules()` + dynamic re-import per test, since a `beforeEach`-time `vi.stubGlobal` alone
doesn't reach an already-constructed client); `lib/nav/use-navigation.test.tsx` gained a
`usePlatformNavigation` case proving it sources `SOFTWARE_ADMIN` nav from
`/platform/auth/permissions`, not `/me/permissions`; `components/shell/role-navigation.test.tsx`
rewritten for the new presentational props (no more `apiClient` mocking needed there — coverage of
the fetch/filter logic itself lives in `use-navigation.test.tsx`); `app-shell.test.tsx`'s platform-
variant test gained a direct regression assertion (`/platform/auth/permissions` called,
`/me/permissions` never) — which also surfaced and fixed a real test-isolation gap in that same
file (the platform-variant `describe` block's own `beforeEach` cleared `mockUseAuth` but never
reset `mockGet`'s call history, so an assertion checking "never called with X" could false-pass or
false-fail depending on what the school-variant tests above it had already called). Backend:
`platform.integration.test.ts` gained three cases for the new route (Software Admin gets its real
effective permissions including `identity.permissions.read` itself; unauthenticated 401s the same
as every other platform route; `GET /me/permissions` still correctly rejects a platform session —
the direct proof of why this route needed to exist).

Full pipeline green: `pnpm lint && pnpm typecheck && pnpm build` at the monorepo root, `pnpm
generate` (the new route appears in `apps/api/openapi.json`/`packages/contracts`) and `pnpm
generate:permission-table-doc` (150 rows, confirmed unchanged), `apps/api`'s integration suite for
this file (16/16), and `apps/web`'s full suite (66 files / 242 tests, up from 66/249 — net changed
by the `role-navigation.test.tsx` rewrite and the new `client.test.ts`/`use-navigation.test.tsx`
cases; a handful of files hit this environment's already-documented worker-pool startup flakiness
on the full run and were reconfirmed green individually, matching this project's established
practice for that class of flake). No schema change, no ADR involved, no roadmap phase status
changed.

### 2026-08-28 — `F6` complete: Academic Structure Workspace

Requested explicitly: start `F6`. Followed the working-rules checklist first: read `04 §14`/`§26`,
`05 §7.1`–`§7.5`, `03 §6`–`§9`, `02`'s School Configuration rows, the F6 roadmap phase, and the
existing `B5`/`B6` implementation (`academics.v1`'s controllers/services/DTOs, the permission
table's `schoolConfig.*` rows, `lib/onboarding/queries.ts`/`mutations.ts`'s existing academics
hooks) before writing any code — planned in a dedicated plan-mode pass (three parallel research
agents covering the roadmap/spec, the backend API surface, and existing frontend patterns,
followed by a design agent), per this project's own precedent for a phase of this shape.

**Four scope questions surfaced during planning and were put to the project owner rather than
guessed, per `AGENTS.md` §3 — all four recommended options confirmed:**

1. **Class Detail's "Teachers" tab** (DoD item 7) needed a class-scoped teacher list; the only
   existing lookup was per-teacher (`GET /teachers/:id/assignments`). → Build a small additive
   backend gap-closure: `GET /v1/classes/:id/teachers`.
2. **HOD's own read-only Department view** can't resolve HOD display names for other departments
   (`users.hod.view` is denied to HOD, even though `schoolConfig.department.view` — which gates
   the whole screen for HOD — is granted). → A name-less "HOD position filled" status for the HOD
   viewer; School Admin/Moderator still see the real name. No permission-table change.
3. **A real roadmap-vs-spec inconsistency**: F6's own DoD item 8 and Testing-requirements row both
   say "Teacher and HOD have read-only access," but the already-shipped, frozen `packages/domain`
   permission table and `docs/02-roles-permissions.md`'s own matrix grant Teacher **no** access at
   all to any `schoolConfig.*` resource — only HOD gets `view`. → Followed the frozen spec/
   permission table: no Teacher-facing academics route or nav item was built. The roadmap's wording
   is a documentation inconsistency, not a business-rule change this phase was authorized to make.
4. **HOD assignment (assign/reassign)** is gated by `assignments.hodToDepartment`, already
   categorized under "People" in the nav model (not "Academics"), and F6's own roadmap screen table
   never names an HOD-assignment screen. → Left for `F7`; F6's Department Detail only displays the
   current HOD read-only, via the already-permitted `GET /academics/departments/:id/hod-assignments`.

**Backend gap-closure** (confirmed, additive, done first): `GET /v1/classes/:id/teachers`
(`apps/api/src/modules/academics/teacher-assignment.{controller,service}.ts`, new
`ClassTeacherEntryDto`/`ClassTeachersResponseDto` in `dto/teacher-assignment.dto.ts`) — joins
`TeacherAssignment` through its `classSubject` relation to filter by `classId` directly (no
separate "get this class's offerings first" round trip needed), enriched with teacher display
name/staff id and subject name/code, mirroring `ClassRosterEntryDto`'s (B6) own enrichment
precedent so the result is directly displayable with no second lookup per row. Reuses the existing
`assignments.view` permission — no new permission id, no schema change. One new integration test
case in the existing `teacher-assignment.integration.test.ts` suite (137/137 green, full file).

**Frontend delivered**: one shared, role-agnostic component library
(`apps/web/components/academics/*` — `academics-tabs.tsx`, `academic-status-badges.tsx`,
`confirm-action-dialog.tsx`, `error-utils.tsx`, and per-entity `{screen,form}.tsx` pairs for
Sessions/Terms/Departments/Classes/Subjects, plus `class-subjects/class-subject-list.tsx` and
`classes/class-detail-screen.tsx`) mounted from three thin route trees
(`/school/academics/*`, `/moderator/academics/*`, `/hod/academics/*` — 24 new page.tsx files plus 3
layouts) rather than three separate implementations: `useHasPermission` inside each screen hides
every mutating control automatically for HOD's view-only grants, so one component correctly serves
all three roles. `apps/web/lib/academics/{queries,mutations}.ts` is the new canonical data layer;
`lib/onboarding/queries.ts` (F4) now re-exports the shared hooks from there instead of duplicating
them, so onboarding and this workspace share one TanStack Query cache under the same
`['academics', ...]`/`['people', ...]` keys — a mutation from either surface invalidates both.
`ContextSwitcher` (`components/shell/context-switcher.tsx`) now calls the real
`useAcademicsContext()`, closing F2's own honestly-flagged partial DoD item — activating a session
from the new Sessions screen refreshes it automatically via the same broad `['academics']`
invalidation `useActivateSession` already performed. `nav-model.ts` gained a new `academics` item
for `HOD` (a confirmed gap closure — HOD's `schoolConfig.*.view` grants had no nav item to reach
them from before this phase, unlike every other role holding such a grant).

**Class-Subject offerings are a per-class list, not a cross-class matrix**
(`class-subjects/class-subject-list.tsx`, mounted as Class Detail's "Subjects offered" tab): the
only backend surface is `GET/POST /academics/classes/:id/subjects` + `DELETE
/academics/class-subjects/:id` — no batch/matrix endpoint exists to back a true grid UI, and
building one client-side would mean unatomic N-call toggles with no real backend support. Class
Detail's Exams tab is an honest static "not yet available" placeholder — no exam backend exists at
all yet (B9+); never fabricated. Destructive-deletion refusal (DoD item 6) renders the backend's
one `ACADEMIC_STRUCTURE_HAS_DEPENDENTS` code as the server's own message plus a bulleted dependents
breakdown, not a raw error (`error-utils.tsx`'s `describeAcademicsError`); deactivation warnings
(DoD item 5) are static client-side text, since the backend always allows deactivation regardless
of dependents. Class-name/session disambiguation (DoD item 3) is a session-name badge chip next to
every class name, with the list always scoped to one selected session at a time.

**One real, if minor, bug found only by the test suite, not by inspection**: the "offer a subject"
`Select` in `class-subject-list.tsx` (genuinely unselected on mount, unlike every session picker
elsewhere in this phase, which already has a value by first render) triggered React's "switching
from uncontrolled to controlled" warning when passed its value via this codebase's usual
conditional-spread pattern (`{...(x !== undefined ? {value: x} : {})}`, needed elsewhere under
`exactOptionalPropertyTypes`). Fixed with an always-defined `value={selectedSubjectId ?? ''}`
instead — the correct form specifically for a control that starts genuinely empty, not the
conditional-spread pattern this codebase otherwise uses for optional props under strict mode.

**Testing**: one `*.test.tsx` per screen (Sessions, Terms, Departments, DepartmentDetail, Classes,
ClassDetail, Subjects, plus `ClassSubjectList`) covering default/loading/error/first-run-empty/
HOD-view-only/dependents-error states, matching this codebase's established per-screen density;
`academics-tabs.test.tsx`, `academic-status-badges.test.tsx`, `confirm-action-dialog.test.tsx`;
`structure-creation.integration.test.tsx` — the RTL substitute for the roadmap's own named E2E row
("Create session → terms → departments → classes → subjects → offerings"), mirroring
`onboarding/resumability.integration.test.tsx`'s technique (mock only `apiClient` at the HTTP
boundary, drive real components through real user interactions), proving each step's result is
visible to the _next_ screen via one shared `QueryClient` and given an explicit longer timeout
since six full mount/interact/unmount cycles in one test is genuinely heavier than the 5s default —
this project's own established response to "environment flakiness under full-suite parallel load"
is to give a correct-but-heavy test the headroom it needs, not to treat a slow-but-correct run as a
failure. `context-switcher.test.tsx` updated for the real `useAcademicsContext` wiring.
`nav-model.test.ts`'s HOD row updated with an inline comment explaining the intentional, documented
deviation from `04 §28`'s literal list (the new `academics` item).

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test && pnpm
build` at the monorepo root — `apps/web`: 80 test files / 326 tests (up from 66/249, F6 itself
contributing 15 new files); `apps/api`: 14 unit test files / 105 tests unchanged, plus the extended
`teacher-assignment.integration.test.ts` (137/137 across the full integration suite). `pnpm
generate:permission-table-doc` confirms 150 rows, genuinely unchanged (`git diff` on
`permission-table.ts` is empty) — this phase built entirely against permission ids B2/B5/B6 already
graded. A real `node dist/main.js` boot confirmed `PolicyCoverageService` reports 113 routes checked
with zero violations (up from 112, the new gap-closure route included) and `next build --webpack`
confirmed the full intended 24-route academics tree across all three role roots, matching the
planned route table exactly.

`docs/roadmaps/frontend-roadmap.md`'s F6 section gained status `COMPLETE`, every DoD item annotated
with what's real and file references, a full "Implementation notes" subsection covering the four
confirmed scope decisions above, and an expanded Deferred items list.
`docs/roadmaps/backend-roadmap.md`'s B6 section gained a "Post-completion gap closure" note for the
`GET /v1/classes/:id/teachers` endpoint. `docs/roadmaps/roadmap-index.md`'s version, Current State,
and Immediate Next Actions all updated to record `F6` complete and `F7` as the one remaining open
frontend phase.

Project state moves from _Implementation (F5 complete; F6/F7 open, or `B7`/`B8` on the backend
critical path)_ to _Implementation (F6 complete; F7 open, or `B7`/`B8` on the backend critical
path)_.
**Next: `F7 — People Management Workspace`** (frontend/backend phase-pairing default — proves
`B6`'s contract), or `B7 — Bulk Import Pipeline` / `B8 — Question Bank` if the backend critical path
is prioritized instead.

### 2026-08-28 — `F7` complete: People Management Workspace

Requested explicitly: start `F7`. Followed the working-rules checklist first: three parallel
Explore agents (roadmap/spec, backend API surface, frontend conventions), a Plan agent, and direct
verification reads (Prisma schema relation names, `withTenant`'s transaction semantics, existing
DTO shapes) before writing any code — planned in a dedicated plan-mode pass given the phase's size,
per this project's own precedent for a phase this shape. No gating ADR blocks F7.

**Three scope questions confirmed with the project owner before implementation, not guessed:**

1. **Server-side pagination extended to all four directories** (Students/Teachers/HODs/
   Moderators), not just Students as the DoD's literal wording named — a large school's teacher
   count can also reach real scale, and the shared `ListPeopleQueryDto` base made the marginal cost
   small.
2. **The class credential-sheet endpoint regenerates unconditionally** for every ACTIVE student in
   a class roster — no "skip already-activated" filter, given this is a development-phase
   capability with no real student data yet (explicitly accepted disruption risk).
3. **HOD gets its own dedicated backend routes** (`PATCH /hods/:id`, `POST /hods/:id/reset-
credentials`) rather than the frontend silently calling the underlying Teacher endpoint — one
   new permission row, `users.hod.resetCredentials` (151 rows, up from 150).

**A real spec-verification correction, not an assumption**: `04 §24`'s "Moderator → Class
Assignment" screen turned out to be a **student bulk class-move view** (roster + checkbox multi-
select + "move selected students to…"), not a teacher-assignment view — that's `§25`, already
covered by the Teacher Assignment Matrix (also mirrored under `/moderator/people/...`, confirmed,
since Moderator holds identical `assignments.teacherToClass` grants to School Admin). No batch move
endpoint exists, so `ClassAssignmentScreen` issues one `POST /students/:id/enrollments` per selected
student via `Promise.allSettled`, reporting per-student success/failure.

**Backend** (`apps/api/src/modules/users/`, `apps/api/src/modules/academics/`): the four directory
`list()` endpoints gained `q`/`page`/`pageSize`/`sortBy`/`sortDir` (`ListPeopleQueryDto` base,
mirroring the F3 `ListSchoolsQueryDto` precedent exactly) — with one confirmed technical difference
from that precedent: `Promise.all([findMany, count])` runs _inside_ `withTenant`'s own callback,
since `withTenant`'s `fn` already receives an active `Prisma.TransactionClient`, which has no
`$transaction` method of its own (nested transactions aren't available the way the school-list
precedent's plain `prisma.$transaction([...])` uses). `StudentResponseDto` gained `currentClassId`/
`currentClassName`/`currentAcademicSessionId`/`departmentId`/`departmentName` (nullable) and a
`classId` filter, resolved per page via one batched `StudentEnrollment` query — `05 §9.1`'s own
directory column list names Class/Department/Session, which the response had no way to show before
this. New `POST /v1/classes/:id/credential-sheet` (`class-credential-sheet.{controller,service}.ts`,
in `AcademicsModule`) returns a raw `text/csv` attachment, not the usual JSON envelope — a one-time
plaintext-password reveal, so a real file download keeps the plaintext out of client-side JS state
longer than necessary; not idempotency-key-aware, documented inline rather than silently gapped.
New `HodService.update`/`.resetCredentials` (decision 3), audited as `HOD_UPDATED`/
`HOD_CREDENTIALS_RESET` so the trail reads as an HOD action, not a Teacher one.

**A cross-package stale-build gotcha found only by running the integration tests, not by
inspection** — the same class of gap this codebase has hit at every prior phase touching a
`dist`-based package: the new permission row wasn't visible to a running `apps/api` until
`@atlas/domain` was rebuilt (`pnpm --filter @atlas/domain run build`), surfacing as a bare 500 on
the new HOD routes instead of a clean 403/200 in the meantime. The identical gotcha hit `apps/web`'s
typecheck against `@atlas/contracts` after `pnpm run generate` (which regenerates the `.ts` source
but not `packages/contracts`' own `dist/`) — fixed by rebuilding that package explicitly too. Both
recorded here since this project's `pnpm run generate` step alone was not sufficient either time.

**A real pre-existing bug found and fixed**: `lib/onboarding/mutations.ts`'s `useCreateStudent` was
enrolling students against `student.membershipId` instead of `student.studentProfileId` —
`StudentEnrollmentController`'s `:id` is `studentProfileId`, matching every other `/students/:id/
...` route's convention. Since the mutation uses `onSettled` (not `onSuccess`), this failure was
silent — every onboarding-created student's initial class enrollment likely 404'd without surfacing
an error, since B6 shipped this endpoint. Fixed as part of this phase (F7 depends on the same
route's correctness) and verified live.

**Frontend** (`apps/web/components/people/*`, `apps/web/lib/people/{queries,mutations}.ts`, new
route trees under `/school/people/*` and `/moderator/people/*`): Student directory (server-side
search/sort/paginate/filter, mirroring `SchoolsListPage`'s URL-state pattern), Student profile
(identity, enrollment history, ADR-0011 subject registrations, an honest "not yet available"
assessment-history placeholder — no exam data exists until `B8`/`B11`+), move-class and credential-
reveal dialogs with DoD-mandated explicit copy (history preserved; plaintext shown once), Teacher
directory/profile, `TeacherAssignmentMatrix` (this codebase's first matrix/grid component — full-
replace semantics, not per-cell auto-save, matching the backend's own contract), HOD directory with
promote/department-assignment/edit/remove, Moderator directory (Create/Edit/Remove only — no
Deactivate/Reset action exists in the permission table for Moderator), and the corrected `04 §24`
Class Assignment screen. F6's existing Class Detail screen gained one small additive touch: a
"Download credential sheet" button on its Students tab, the natural home since the roster already
renders there. No `/hod/people/*` route tree and no `/moderator/people/moderators` route — both by
design (ADR-0017; `05 §14`'s School-Admin-only rule).

**Testing**: `class-credential-sheet.integration.test.ts` (new) and an extended
`users.integration.test.ts` (new isolated `describe` block) — 61 integration tests across the
affected files, all green against real Postgres/Redis. `apps/web` gained 5 new test files / 21
tests (`students-screen`, `teacher-assignment-matrix` — the phase's highest-value test, proving
pre-fill correctness and full-replace-not-per-cell submission — `people-tabs`, `moderators-screen`
with the named Moderator-cannot-manage-Moderators security case, `class-assignment-screen` with
per-student partial-failure reporting). Not every screen got a dedicated test file this pass —
`student-detail-screen`, `teacher-detail-screen`, `hods-screen`, and four smaller dialogs are
implemented, typechecked, and linted but not yet independently tested — recorded as Candidate/
Deferred in `frontend-roadmap.md`'s F7 section, not silently claimed complete.

Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:integration`
(both `apps/api` and `apps/web`), plus `pnpm generate` (new query params/DTOs/routes published,
151-row permission table) and a real `node dist/main.js` boot confirming `PolicyCoverageService`
reports 116 routes checked with zero violations (up from 113). `next build --webpack` confirmed the
full intended route table across both role roots.

`docs/roadmaps/frontend-roadmap.md`'s F7 section gained status `COMPLETE`, every DoD item checked
with file references, a full "Implementation notes" subsection, and an expanded Deferred items
list. `docs/roadmaps/backend-roadmap.md`'s B6 section gained a "Post-completion gap closure (during
F7)" note covering all three backend gap-closures. `docs/roadmaps/roadmap-index.md`'s version,
Current State, and Immediate Next Actions all updated to record `F7` complete — every currently-open
frontend phase is now closed out.

Project state moves from _Implementation (F6 complete; F7 open, or `B7`/`B8` on the backend critical
path)_ to _Implementation (F7 complete; all frontend phases through F7 closed out)_.
**Next: `B7 — Bulk Import Pipeline`** (unblocked, extends the people/enrollment surface `B6`/`F7`
just shipped, and would let F4's Staff/Students onboarding steps close their one remaining
honestly-partial DoD item) or `B8 — Question Bank` on the backend critical path.

### 2026-08-29 — `B7` complete: Bulk Import Pipeline

Requested explicitly: start `B7`. Followed the working-rules checklist first: read `01 §7`/`§42`,
`03 §15`–`§16`, `05 §10`/`§18`, `08 §14`, `02`'s Import rows, the B7 roadmap phase (no gating ADR —
only audit finding `A-17`, "settle in phase"), and the existing B6/F7 implementation
(`person.util.ts`, `CredentialSheetService`, `StudentEnrollmentService.enroll`, `MediaService`'s
upload/validate/sign pipeline, the two `users.import.{teachers,students}` permission rows B2 had
pre-graded and waiting) — then planned in a dedicated plan-mode pass given the phase's size, per
this project's own precedent.

**A-17 settled, not left implicit**, per the phase's own Exit criteria: **CSV and `.xlsx` both
supported** (confirmed with the project owner — the more conservative CSV-only option was offered
and declined); 5,000-row cap and 5MB file cap (the audit finding's own recommended numbers, adopted
as the engineering default and documented as such); a leading `# template-version: N` marker line
checked exactly, whole-file rejection with a "please re-download the current template" message on
mismatch; a 24-hour staging-expiry window (`ImportJob.expiresAt`), enforced lazily by `confirm()`
and formally by a new `apps/worker` sweep. **Scope**: student and teacher import only — question
import stays deferred, waiting on `B8`'s `Question` model, exactly as the roadmap's own "sequence
student/teacher import first if B8 is not ready" note anticipated.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260829062531_b7_bulk_import_
pipeline`): `ImportJob`/`ImportRow` + three enums (`ImportJobType`/`ImportJobStatus`/
`ImportRowStatus`), `MediaAssetType` gained `IMPORT_SOURCE`, RLS bootstrap for both new tables —
same hand-written-migration convention as B3–B6. `ImportJob.targetAcademicSessionId` is nullable
(TEACHERS imports never resolve or need one, matching `TeacherService.create`'s own signature —
caught and fixed _before_ the first migration was even applied, during planning-to-code review).
`ImportJob.uploaderRole` is captured at creation time specifically because the commit job runs in
the background with no HTTP request/actor context of its own, yet still calls into services
(`StudentEnrollmentService.enroll`, `AuditService.record`) that require a real `Role`.

**API** (`apps/api/src/modules/imports/`, new top-level `ImportsModule` — writes through
`UsersModule`/`AcademicsModule`'s own primitives, never directly to their tables, per the roadmap's
own "Domains/modules affected" line): a dedicated `IMPORT_SOURCE` upload-target/complete pair
(`imports.controller.ts`), not the generic `MediaController` — `media.upload`'s own grant includes
Teacher/HOD at a placeholder `SCHOOL` scope that doesn't apply to import files at all, so mixing the
two would let those roles request an inert-but-real upload slot; mirrors `SCHOOL_LOGO`'s own
precedent exactly. `POST /imports/students`/`POST /imports/teachers` (type-specific, matching their
own distinct permission ids); every other route (`GET /imports`, `GET /imports/:id`,
`GET /imports/:id/errors`, `POST /imports/:id/confirm`, `GET /imports/templates/:type`) is
type-agnostic once a job exists and is gated by `users.import.students` — documented inline as a
deliberate equivalence (identical grant shape to `users.import.teachers`), not an inaccuracy, rather
than inventing a third, purely representational permission id. `GET /imports` itself is one small,
reasoned addition beyond the roadmap's literal five-endpoint table — F8 needs an import-history view,
and every other resource in this codebase already gets a list endpoint.

**Validation** (`ImportValidationService`): downloads the full file (`ObjectStorageService.getObject`,
a new full-download method alongside the existing prefix-only `getObjectPrefix`), parses via
`csv-parse` or `exceljs` depending on sniffed content type, checks the template version and required
columns, enforces the row cap, then resolves every row's references via **batched** lookups (all
existing `loginIdentifier`s, all `ACTIVE` classes/departments in one query each) — never per-row,
matching `StudentService.list`'s own established "batched, not N+1" precedent. A whole-file rejection
(bad version, unparsable, missing columns, row cap) never creates a single `ImportRow` — only a
`FAILED` `ImportJob` with a `failureReason`, the exact same convention as `MediaAsset
.rejectionReason`.

**Commit** (`ImportCommitService`) — chunked (100 rows/transaction), resumable, idempotent: selects
`WHERE status = 'VALID'`, and for each row either creates the person fresh or (on a resumed row whose
`resultMembershipId` is already set but status is still `VALID` — a genuine two-level progress
marker, not a single flag) skips straight to enrollment/invitation. `StudentEnrollmentService
.enroll()` is already idempotent for a repeat call with the same class; a repeat
`IdentityService.issueStaffInvitation()` call simply re-sends one invitation email — an accepted,
bounded cost for the rare crash-mid-row case. On completion, `AuditService.record()` with
`{totalRows, committedRows, failedRows}` (DoD item 10).

**A genuine, documented architecture deviation from "background jobs live in `apps/worker`"**: the
validation and commit job _processors_ (BullMQ `Worker`s) are constructed only from `apps/api`'s own
real `main.ts` `bootstrap()`, never via Nest's `OnModuleInit` lifecycle and never inside
`apps/worker`. Two reasons converged, both found during implementation, not anticipated in the
original plan: (1) `ImportValidationService`/`ImportCommitService` deliberately reuse real,
already-tested, Nest-DI-resolved domain services — `apps/worker` has no Nest DI and cannot import
`apps/api/src` at all (only `packages/*` are shared across apps), so reusing them there is
structurally impossible without either introducing Nest DI to that process or reimplementing the
logic (ADR-0011 reconciliation, enumeration-safe invitation dispatch) as free-standing functions,
risking real behavioural drift from the manual-creation path. (2) Auto-starting a live BullMQ
consumer via `OnModuleInit` would mean _every_ integration test that boots `AppModule` directly
(this codebase's established pattern) also starts consuming import jobs against the same long-lived
local Redis B1's own `rate-limit.integration.test.ts` flakiness note already documents. Resolved by
splitting queue management (`ImportQueueService`, normal Nest lifecycle, safe in every test — it only
ever calls `.add()`) from job consumption (`import-worker-bootstrap.ts`'s `startImportWorkers(app)`,
called once from `main.ts`, pulling the real service instances out via `app.get(...)` — the standard
technique for reusing a Nest app's DI graph outside the normal request-handling path). The
staging-expiry _sweep_ has no such reuse tension (a periodic status transition needing only
`prisma`/`withTenant`, `orphan-media-report.queue.ts`'s own exact shape) and stays in `apps/worker`
as originally planned — only the two per-request processors moved.

**Two real bugs found only by running the tests, not by inspection**: `exceljs` is a CJS package
whose named export doesn't resolve under native ESM `node` (only under `tsc`/Vitest's more permissive
interop) — found only by a real `node dist/main.js` boot, this codebase's now-standing class of
gotcha (S3_CLIENT, SessionService export, Serwist, every prior phase has hit one). Fixed with the
default-import-and-destructure pattern Node's own error message suggested. Separately, the template
route's path param is lowercase in the URL (`.../templates/students`) but was validated directly
against the uppercase `ImportJobType` vocabulary — every real call 400'd; fixed with a `@Transform`
normalising the param before `@IsIn` runs. A third, self-caught issue: a schema doc comment on
`ImportRow.errors` used literal `{field, message}` braces, which broke `scripts/lint-schema-
tenancy.mjs`'s naive brace-matching regex exactly the way `MediaAsset`'s own doc comment already
warns against — caught by `pnpm lint` itself, fixed by rewording the comment.

**Class/Department resolution is by name** (`ClassGroup.name`, the school's own freeform label,
matched case-insensitively) **not by re-deriving `level`+`arm`** — the CSV template's own "Class"
column example (`SS1A`) is exactly this label. An engineering judgment call, not specified in the
docs: a _blank_ Department cell is always accepted, even for a class that does carry one (the class
itself is authoritative); a _non-blank_ Department that doesn't resolve, or disagrees with the row's
own Class, is a real per-row error.

**Testing**: `import-row-validator.test.ts`/`import-file-parser.test.ts`/`import-templates.test.ts`
(31 unit tests — every validation rule; real CSV and real `.xlsx` round trips built with `exceljs`
itself, including a formula-cell-reads-cached-value case; BOM/quoting/encoding edge cases);
`imports.integration.test.ts` (16 tests — the full pipeline for both types over real HTTP/MinIO,
whole-file rejections, cross-tenant denial, permission boundaries, the confirm() state machine);
`import-confirm-concurrency.integration.test.ts` (the DoD concurrency requirement, proven
deterministically against a single-row Postgres `UPDATE ... WHERE status = 'VALIDATED'` — no
`pg_sleep` forcing needed, unlike B5's own session-activation precedent, since a single-row UPDATE's
locking guarantees the outcome regardless of exact timing); `import-commit-resume.integration.test.ts`
(DoD item 8, directly constructing both partial-progress states and proving one `commit()` call
resumes/skips each correctly); `import-1500-rows.integration.test.ts` (DoD item 1 — 1,487 valid /
13 invalid, mirroring `01 §7`'s own worked-example numbers exactly, not an arbitrary split; full
validate-and-commit completes in ~60s, given generous headroom per this codebase's own established
practice for a correct-but-heavy test); `apps/worker`'s `import-expiry.integration.test.ts` (the
staging-expiry sweep, mirroring `orphan-media-report`'s own test shape). `tests/tenancy/rls
.integration.test.ts` gained both new tables in the existing B5/B6 describe block's `tables` array
(same economy as B3–B6's own precedent) — 53 tests in that file, up from 47.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm test:integration` (apps/api 27 integration files/167 tests, apps/worker 3/12,
the RLS suite 53/53), plus `pnpm generate` (`imports.v1` published in `apps/api/openapi.json`/
`packages/contracts`) and `pnpm generate:permission-table-doc` (151 rows, confirmed unchanged — this
phase built entirely against the two permission ids `B2` had already pre-graded). A real
`node dist/main.js` boot confirmed `PolicyCoverageService` reports 125 routes checked with zero
violations. One genuinely destructive step this phase required — `prisma migrate reset --force`
against the local `atlas_dev` database, to fix the `targetAcademicSessionId` nullability mistake
caught before any real data depended on it — was run only after explicit user confirmation, per
Prisma's own AI-agent safety guard and this project's standing default-behaviour rule; the
post-reset `grantAppRole()` re-assertion (this codebase's own documented `migrate reset` gotcha) was
re-run immediately after.

`docs/roadmaps/backend-roadmap.md`'s B7 section gained status `COMPLETE`, every DoD item annotated
with what's real versus deferred-with-reason, a full "Implementation notes" subsection, and an
expanded Deferred items list. `docs/roadmaps/roadmap-index.md`'s version, Current State, and
Immediate Next Actions all updated to record `B7` complete — `B8` next on the critical path proper,
unaffected by `B7`'s own always-parallelisable position in `§5`'s table.

Project state moves from _Implementation (F7 complete; all frontend phases through F7 closed out)_
to _Implementation (B7 complete)_.
**Next: `B8 — Question Bank`** on the backend critical path (`Gate 1 ADRs → B0 → B1 → B2 → B3 →
B5 → B6 → B8 → B9 → …`) — the natural next step now that both `B7` (people/enrollment bulk import)
and every frontend phase through `F7` are closed out. A future `F8` (Bulk Import UI) remains open
whenever the frontend/backend phase-pairing default is next prioritized, and would close `F4`'s own
last honestly-partial DoD item (manual-only staff/student creation) along the way.

### 2026-08-29 — `B7` gap closure: thorough implementation review, six fixes

Requested explicitly, same day as `B7` itself: a thorough review of the just-shipped implementation
looking for bugs, not new scope. Read every B7 file end to end (module, controller, services, file
parser, row validator, templates, DTOs, the RLS migration) rather than sampling. Six real, fixable
issues surfaced — no product/architecture decision needed for any of them; full detail (failure
scenarios, the fix for each, and file references) is in `docs/roadmaps/backend-roadmap.md`'s B7
section, "Post-completion gap closure" note, not duplicated here:

1. Missing `'error'` listener on the BullMQ `Worker`/`Queue` instances B7 introduced inside
   `apps/api` itself — the first in-process BullMQ consumers this codebase has ever run; an
   unhandled `'error'` event would have crashed the whole API process on a transient Redis blip.
   Fixed there and, since it was trivial once found, for every pre-existing worker/queue in
   `apps/worker/src/main.ts` too.
2. `ImportJobResponseDto.targetAcademicSessionId` was typed non-nullable but coerced a real `null`
   (every `TEACHERS` job) to `''` — a contract lie. Now genuinely `string | null`.
3. `createStudentImport()` never validated a caller-supplied `academicSessionId` up front — a bad id
   silently produced a job whose every row failed with a confusing "Class not found." Now rejected
   immediately with a message naming the real problem.
4. `ImportQueueService`'s enqueue methods silently no-op'd (`?.`) if called before `onModuleInit` —
   unreachable today, but a landmine. Now throws.
5. `ImportCommitService.commit()` had no guard against two overlapping executions of the same job
   (a BullMQ stalled-lock redelivery scenario) both processing the same rows. Fixed with
   `ImportJob.processingClaimedAt` — a new nullable column (migration
   `20260829085732_b7_import_job_processing_claim`), an atomically-claimed, per-chunk-refreshed,
   self-healing lease mirroring `confirm()`'s own conditional-update idiom. Proven by a new
   dedicated integration test.
6. `ImportValidationService.validate()`'s reads and writes lived in two separate transactions,
   leaving a crash window that could strand a job in `VALIDATING` forever. Fixed by merging them
   into one — nothing between them did any I/O of its own, so this cost nothing.

No permission-table change (151 rows, confirmed unchanged), no product-behaviour change. Full
pipeline reconfirmed green after every fix: `pnpm lint && pnpm typecheck && pnpm test && pnpm build
&& pnpm test:integration` (monorepo-wide, 9/9 turbo tasks — apps/api's integration suite at 28
files/169 tests, including the new concurrency test), plus `pnpm generate` and
`pnpm generate:permission-table-doc`. One real build-tooling gotcha hit and worked around while
applying the fixes, not a product bug: `turbo`'s cached `build` task for `@atlas/db` (whose
`outputs` include the gitignored `generated/` Prisma client directory) restored a stale cached
snapshot of the generated client over a freshly-`prisma generate`d one on a plain `pnpm typecheck`
run, twice — worked around with `--force`; not fixed at the `turbo.json` level, since diagnosing
and correcting the input-hashing gap itself is out of scope for a bug-fix pass and is left as a
known rough edge for whoever next edits `packages/db/prisma/schema.prisma` and runs a plain
(non-forced) `pnpm typecheck` immediately after.

Project state remains _Implementation (B7 complete)_ — this was a same-phase gap closure, not a new
phase. `docs/roadmaps/backend-roadmap.md`'s B7 section gained the "Post-completion gap closure"
note referenced above. **Next: `B8 — Question Bank`**, unchanged.

### 2026-08-29 — `B8` complete: Question Bank

Requested explicitly: start `B8`. Followed the working-rules checklist first: three parallel
research agents (roadmap/ADR/audit-finding coverage; the full product specification for
`Question`/`QuestionRevision`/`QuestionOption`/`QuestionMedia`/`Topic` and the review state machine;
existing backend module/permission-table/media conventions), then a dedicated Plan agent, per this
project's own precedent for a phase of this size — followed by direct verification reads of the
permission table, `AuthorizationService.evaluate()`, the scope resolvers, and a recent migration's
RLS boilerplate before writing any code. No gating ADR is unresolved (ADR-0001 alone, Accepted,
B5's own half already shipped).

**Scope, confirmed during planning, not silently expanded**: question bulk import and export were
folded into this same pass at explicit instruction, rather than left as the roadmap's own originally
unscoped items — both extend `B7`'s existing `ImportsModule`, not a second pipeline.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260829110627_b8_question_bank`,
plus a same-day additive one for `ImportRow.resultQuestionId`): `Question` (school_id, subject_id,
`level: ClassLevel` reusing B5's enum verbatim per ADR-0001, `authorTeacherProfileId`,
`currentRevisionId`, `archivedAt`), `QuestionRevision` (revision_number monotonic per question,
question_type, content, topic/subtopic, difficulty, marks, `createdByMembershipId`, status),
`QuestionOption` (arbitrary-length array, never four hardcoded columns per `06 §27`),
`QuestionMedia` (joins to the existing `MediaAsset`), `Topic` (ADR-0001 §3, case-insensitive
resolution). RLS bootstrap for all five tables, hand-written per this codebase's own established
convention.

**D-12 resolution**: `Question.currentRevisionId` is a pointer, not a stored status column — set
once per revision-creation transaction, untouched by status transitions (submit/approve/reject all
mutate the _same_ row the pointer already references). `current_status` is always derived live:
`archivedAt !== null ? 'ARCHIVED' : currentRevision.status` — never a separately-stored field that
could drift, satisfying the audit's own recommendation by construction.

**Genuinely new infrastructure, two firsts for this codebase**: the parent+versioned-child
`Question`→`QuestionRevision` pattern, and real Postgres trigger-enforced immutability (three
triggers — revisions, options, and media, the last one beyond the roadmap's literal wording but
necessary for D-13's "never silently added/removed from an approved revision" to hold against every
mutation path). No trigger existed anywhere in this schema before this phase. Proven with a real
`tx.$executeRaw` UPDATE/DELETE against an `APPROVED` row, bypassing Prisma's query builder entirely
— the DoD's own literal "a direct database update is rejected by constraint" wording.

**API** (`apps/api/src/modules/questions/`, filling in the empty B0-era stub): `questions.v1` — the
full roadmap endpoint table (create/list/get/counts/archive/export, draft PATCH/delete, new-revision,
submit, media attach/detach, topics) plus a dedicated `POST /v1/questions/media/upload-target` pair
(see below). `QuestionReview` (B9's approve/reject/comment workflow) is explicitly not built —
`questionBank.review`/`.approve`/`.reject`/`.requestChanges` remain `awaitingResource: 'Question
review workflow (B9)'`. B8's own endpoints only ever move a revision `DRAFT → SUBMITTED`; tests that
need `APPROVED`/`REJECTED`/`UNDER_REVIEW` construct it via direct Prisma writes, mirroring
`import-commit-resume.integration.test.ts`'s and `session-activation-concurrency.integration
.test.ts`'s own established precedent for this, never a hidden endpoint.

**A real, fully-worked engineering design decision**: `POST /v1/questions/:id/revisions/:rev` (draft
delete) must handle deleting a question's _only_ revision — DoD item 3 says drafts are "freely...
deletable," with no carve-out. Resolved by cascading to delete the `Question` itself when it's the
only revision (a bare `Question` has no content independent of a revision), and by repointing
`currentRevisionId` back at the prior revision (never leaving it null) when a non-only draft
(started via `POST .../revisions` from an approved/rejected source) is deleted instead.

**Two genuine, pre-existing architectural gaps found and closed, not merely worked around — both
only discoverable by routing real HTTP traffic through a code path for the first time**:

1. `ScopeResolverRegistry`'s `ASSIGNED`/`DEPARTMENT` resolvers (built in B6/B5) denied outright when
   `PermissionGuard`'s bare `@Authorized(id)` check called them with no `ResourceContext` — unlike
   `OWNED`/`SELF`/`SCHOOL`, which all treat "no resource yet" as an optimistic pass (the service
   filters/verifies precisely afterward). This meant `GET /v1/questions` would 403 a Teacher or HOD
   at the guard itself, before the handler ever ran — B8 is the first phase to actually route real
   HTTP traffic through either predicate. Fixed at the source in `apps/api/src/modules/academics/
assigned-scope.resolver.ts`/`department-scope.resolver.ts`, mirroring `OWNED`'s own established
   convention exactly; the existing `department-scope.resolver.integration.test.ts` case was updated
   to match, with its two resource-specific assertions unchanged (real per-resource enforcement
   still proven).
2. Three of `ImportsModule`'s shared routes (`GET :id`, `GET :id/errors`, `POST :id/confirm`, plus
   `GET templates/:type`) were gated by `users.import.students` — a permission id Teacher/HOD (the
   real creators of a `QUESTIONS`-type job) don't hold, meaning a Teacher who successfully created a
   question-import job still couldn't view its own status or confirm it. Closed by switching these
   routes' guard-level check to `questionBank.import` (wide enough to admit every import type's
   creator) plus a new service-level `ImportsService.assertCanAccessJob()` — School Admin/Moderator
   keep unchanged full oversight; a Teacher/HOD may only reach a job they themselves uploaded, and
   only if it's `QUESTIONS`-typed. `B7`'s own existing STUDENTS/TEACHERS integration tests (21 tests
   across the module) re-run green, confirming no regression to the original people-import boundary.
   A separate, genuinely new problem of the same shape: the _upload-target_ route itself
   (`POST /imports/upload-target`) carried the identical gate — closed with a dedicated
   `POST /imports/questions/upload-target(/:id/complete)` pair, mirroring the `SCHOOL_LOGO`/
   `IMPORT_SOURCE` "a domain needing its own attach semantics gets its own route" precedent exactly.

**Closing `media.upload`'s TEACHER placeholder** (flagged by `B4` as "B8's job"): verified
`SCHOOL_ADMIN`/`MODERATOR`/`HOD` were already genuinely `granted('SCHOOL')` — final, not
placeholders; only `TEACHER` carried the "temporary widening" text. Closed via a dedicated
`POST /v1/questions/media/upload-target(/:id/complete)` pair resolving real `ASSIGNED` scope from a
`subjectId`+`level` pair using the identical ADR-0001 join question creation itself uses, before any
`Question`/`QuestionRevision` exists yet (matching the real authoring UX — an image is attached to
the editor before the question is necessarily saved). `TEACHER`'s `media.upload` grant is now plain
`granted('ASSIGNED')`. Documented, accepted side effect: the generic `POST /v1/media/uploads` route
is now unreachable for Teachers for every type including `OTHER` (fail-closed, matching every other
`ASSIGNED`/`DEPARTMENT` predicate absent real scope; no current caller relies on it).

**`questionBank.archive`'s School Admin/Moderator grant finalized**, not left as a placeholder:
`limitedReadOnly()` is functionally `GRANTED` (the "read-only placeholder" wording is a note, not a
distinct engine behaviour) — confirmed the real, final boundary is unqualified `SCHOOL`-wide write
access, the same broad-oversight shape these two roles already hold for nearly every other
`.manage`-style row in this table, low-risk since archiving is soft/reversible. Permission table
updated from `limitedReadOnly(...)` to plain `granted('SCHOOL')` for both roles.

**A real Prisma gotcha found only by running the integration tests, not by inspection**:
`QuestionOption`'s FK to `QuestionRevision` is composite — Prisma's generated nested-create input
type for a composite-FK relation (`revision.create({ data: { options: { create: [...] } } })`)
excludes `schoolId` from the nested rows (it infers both halves from the parent), rejecting an
explicit one with "Unknown argument `schoolId`" at runtime — invisible to `tsc`. Fixed by switching
every option-creating path to a plain `questionOption.createMany({ data: [...] })` instead, the same
shape `replaceOptions` already used correctly.

**Question bulk import** (extends `B7`'s `ImportsModule`): `ImportJobType` gained `QUESTIONS`;
`ImportRow` gained `resultQuestionId` (a simpler one-shot marker than `resultMembershipId`'s
two-step one, since question creation is one atomic transaction). Every imported question is
authored as the uploader's own `TeacherProfile` — `questionBank.import`'s grant is wider than
Teacher, but `Question.authorTeacherProfileId` is a required FK, so a non-teacher uploader gets a
clean `QUESTION_IMPORT_REQUIRES_TEACHER_PROFILE` (400) at job-creation time, mirroring `B7`'s own
"reject a bad `academicSessionId` immediately" precedent. Export (`GET /v1/questions/export`) is
CSV-only (import stays CSV+`.xlsx`, per `B7`'s own confirmed decision) — a deliberate, low-risk
scope-down matching `class-credential-sheet.controller.ts`'s own CSV-only precedent, with columns
mirroring the import template one-for-one for a re-importable round trip (one honest, documented
asymmetry: `Question.level` is coarser than a specific `ClassGroup` name, so the exported "Class"
cell is the bare level code, not guaranteed to match a real class name on reimport).

**Testing**: `question-lifecycle.integration.test.ts` (14 tests covering every DoD item 1–12 plus
the security row, over real HTTP against a real running `AppModule` and real Postgres — including
the raw-SQL immutability proof and a real HOD department-scoped view proving the `ASSIGNED`/
`DEPARTMENT` gap-closure end to end), `question-validation.util.test.ts` (7 unit tests for the
catalogue's own pure function — several rules are unreachable via HTTP at all once class-validator's
DTO-level `@IsInt()/@Min()/@Max()/@ArrayMinSize()` decorators already catch the same malformed input
for any explicitly-supplied value, so this is where those specific rules are actually proven),
`question-import-export.integration.test.ts` (3 tests — the full validate→confirm→commit pipeline
creating real DRAFT questions with correct option/correctFlag mapping, topic auto-create, the
structural teacher-profile requirement, and the export CSV's shape). `tests/tenancy/rls
.integration.test.ts` gained the five new tables in the existing B5–B7 describe block's `tables`
array (same economy as every prior phase) — 68 tests in that file; 65 passed/3 skipped in the full
run, with the one failure (an unrelated `audit_events` block's `beforeAll` hook timing out under the
file's now-longer cumulative runtime) confirmed, by immediate re-run in isolation, to be pre-existing
environment flakiness unrelated to this phase, matching this project's established practice for this
class of flake.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test &&
pnpm build && pnpm test:integration` (monorepo-wide — `apps/api`'s full suite including every `B7`
import test re-confirmed with zero regression), plus `pnpm generate` (`questions.v1` — 17 new routes
— published in `apps/api/openapi.json`/`packages/contracts`) and `pnpm generate:permission-table-doc`
(151 rows, confirmed unchanged — every id B8 needed already existed, pre-graded by B2). A real
`node dist/main.js` boot confirmed `PolicyCoverageService` reports 142 routes checked with zero
violations (up from 125 — the exact expected `+17`), and caught one real route-declaration bug (a
doubled `questions/questions/...` path prefix on three `QuestionMediaController` routes) before it
ever reached a test.

`docs/roadmaps/backend-roadmap.md`'s B8 section gained status `COMPLETE`, every DoD item checked
with detail, a full "Implementation notes" subsection covering every gap closure above, and an
expanded Deferred items list. B7's own Deferred items entry for question import was updated to point
forward at this delivery. `docs/roadmaps/roadmap-index.md`'s version, Current State, and Immediate
Next Actions all updated to record `B8` complete and `B9` next on the critical path.

Project state moves from _Implementation (B7 complete)_ to _Implementation (B8 complete)_.
**Next: `B9 — Question Review & Governance`** on the backend critical path (`Gate 1 ADRs → B0 → B1
→ B2 → B3 → B5 → B6 → B8 → B9 → B11 → …`) — the review workflow (`QuestionReview`, approve/reject/
comment, the HOD review queue via ADR-0001's two-hop `Subject.departmentId` join) this phase
deliberately left out. A future `F9` (Question Bank Workspace) remains open whenever the
frontend/backend phase-pairing default is next prioritized, and would prove `B8`'s own `questions.v1`
contract end to end for the first time.

### 2026-08-29 — `F8` complete: Bulk Import UI

Requested explicitly: start `F8`. Followed the working-rules checklist first: three parallel Explore
agents (F8's own roadmap/spec text; the full `imports.v1` backend contract as B7/B8 actually shipped
it, not just as originally planned; existing frontend conventions to reuse — the logo-upload
sequence, CSV-download pattern, paginated-list URL-state pattern, permission-gating hooks), then a
Plan agent, then direct verification reads of the critical files (`use-logo-upload.ts`,
`use-class-credential-sheet` in `lib/people/mutations.ts`, `data-table.tsx`, the imports DTOs/
controller, `nav-model.ts`) before writing any code — per this project's own established precedent
for a phase of this shape. No gating ADR blocks F8; the only relevant audit finding (A-17) was
already settled in `B7`.

**One real, load-bearing finding from direct verification, not from the roadmap text — corrected
before any route was built, mirroring F1's own `/reset-password` precedent exactly**: the roadmap's
literal `/teacher/questions/import` route doesn't match this codebase's actual nav infrastructure.
`nav-model.ts` already carries, from an earlier phase, an unimplemented `question-bank` nav item for
both `TEACHER` and `HOD` (`match: ['questionBank.']`, currently rendering through the `[...slug]`
catch-all) — so the real route is `/teacher/question-bank/import`. A minimal `/teacher/question-bank`
landing page (one file, not `F9`'s real workspace) was added alongside it purely so the import screen
has a real parent to link back to — a low-risk, explicitly reversible call made directly rather than
asked, per the plan's own reasoning, and consistent with the established "nav item ships ahead of its
screen, a later phase's real `page.tsx` supersedes the catch-all automatically" pattern (`F2`/`F3`/`F6`
precedent).

**Delivered**: one shared, parameterized state machine (`components/imports/use-import-flow.ts`,
`idle → uploading → creating-job → validating → validated → confirming → importing →
completed|failed|expired`) driving the roadmap's own named sub-components (`FileDropzone`,
`ValidationSummary`, `ErrorTable`, `ImportProgress`, `ImportResult`) via one orchestrator
(`BulkImportFlow`) and one shared per-route wrapper (`ImportScreen`) — mounted from six routes
(`/school` and `/moderator` People workspaces for Students/Teachers import, `/teacher/question-bank/
import` for questions) and, closing `F4`'s own last honestly-partial DoD item, from a new manual/
import mode toggle inside the onboarding wizard's Staff and Students steps. The upload sequence
(`lib/imports/use-import-upload.ts`) is a structural copy of B4/F4/F5's own `useLogoUpload` pattern
(`upload-target` → raw `PUT` → `complete`); template/error CSV downloads
(`lib/imports/use-import-download.ts`) are a structural copy of F7's `useClassCredentialSheet` manual-
fetch pattern, since `apiClient` is JSON-only and can't carry a `text/csv` response. Polling
(`lib/imports/queries.ts`) is a simple two-tier `refetchInterval` (2s while `VALIDATING`, 5s while
`IMPORTING`) — no generic backoff utility exists anywhere in this codebase, and B7's own
`import-1500-rows.integration.test.ts` already bounds both phases well under two minutes at real
scale, so a fixed interval is enough without inventing exponential backoff for an already-bounded,
already-fast operation.

**DoD item 11 (resumability) is server-state-first, not client-memory-first**: the created job's id
lives in a URL query param (`?job=` by default, overridable per mount so two flows never collide on
one page), matching this codebase's established "URL/server is the source of truth for resumable
state" convention (F4's onboarding resumability, F3/F7's URL-driven lists). The onboarding steps'
mode toggle additionally defaults to the "import" tab when that param is already present, so a hard
refresh mid-import doesn't strand the user on the manual-entry tab hiding their own in-progress job.

**No client-side virtualization dependency was introduced for `ErrorTable`'s "500+ rows without
freezing" requirement** — `ListImportRowsQueryDto` already caps server-side pagination at 200 rows;
`ErrorTable` is a thin `DataTable` wrapper fetching one page (100 rows) at a time, the identical
mechanism `StudentsScreen` already proves at 1,500-student scale. A virtualization library was
considered and rejected per `AGENTS.md` §9 — server pagination alone already satisfies the
requirement.

**Confirmed scope decisions, made directly rather than asked, each with clear precedent**: Moderator
gets student/teacher import parity with School Admin (identical `SCHOOL`-scoped grant, matching
F6/F7's established directory-mirroring pattern); HOD gets no import screen this phase (this section's
own route table never named one, and ADR-0017's "HOD gets zero F7 screens" precedent applies
identically here — HOD's `questionBank.import` DEPARTMENT-scoped grant stays real and correct at the
API layer, unreached by any UI until `F9`/`F10`); `GET /imports` (job list/history) stays unbuilt — no
roadmap-named screen consumes it, and adding one now would be speculative scope beyond the DoD.

**Two real, if minor, test-writing findings, not product bugs**: `userEvent.upload()` respects an
`<input accept>` attribute the same way a real OS file picker does, so `FileDropzone`'s wrong-
extension/oversized-file rejection logic — genuinely reachable in production only via drag-and-drop,
which carries no such restriction — needed `fireEvent.drop`-based tests, not `userEvent.upload`, to
actually exercise it. And `packages/contracts`' own `dist/` needed an explicit rebuild
(`pnpm --filter @atlas/contracts run build`) before `apps/web` could typecheck against the
`/imports/questions/*` paths `B8` had already added to the generated source — `pnpm generate` alone
wasn't sufficient, the exact same class of stale-build gotcha `B7`'s own gap-closure entry already
recorded for `@atlas/domain`.

**Testing**: 10 new test files / 24 new tests — one component test per named sub-component
(`FileDropzone`, `ValidationSummary`, `ErrorTable`, `ImportProgress`, `ImportResult`), an
`error-table.performance.test.tsx` (the frontend-side proxy for the roadmap's 1,500-row requirement —
B7's own backend integration test already proves real timing at that scale, so this proves instead
that the error table never mounts more than one server-paginated page of DOM rows regardless of
dataset size), a `use-import-flow.resilience.test.tsx` (DoD item 11, mounted with `?job=` pre-set
against a genuinely fresh `QueryClient`, mirroring `resumability.integration.test.tsx`'s own "discard
the cache between renders" technique), and one full happy-path integration test per import type
(students/teachers/questions), each asserting the real call sequence — upload-target → raw `PUT` →
complete → create → a simulated poll transition (`VALIDATING`→`VALIDATED`, driven by directly asking
the `QueryClient` to refetch rather than advancing `refetchInterval`'s real timer, since
`refetchInterval` itself is TanStack Query's own already-tested scheduling mechanism) → confirm →
completed summary — matching this codebase's established RTL "mock only the HTTP boundary, drive real
components" technique (`structure-creation.integration.test.tsx`/`resumability.integration.test.tsx`
precedent).

Full pipeline green, run in full after every fix: `pnpm --filter @atlas/web run lint && pnpm
--filter @atlas/web run typecheck && pnpm --filter @atlas/web run test -- --run && pnpm
--filter @atlas/web run build` — 100 test files / 406 tests (up from 90/373). One transient
full-suite worker-pool-startup timeout hit two unrelated files (this environment's already-documented
class of flakiness, per F7's own Change Log entry for the identical issue), including one of this
phase's own new files; both reconfirmed green individually immediately after. `next build --webpack`
confirmed all six new routes render as static pages, correctly superseding their prior `[...slug]`
catch-all placeholders.

`docs/roadmaps/frontend-roadmap.md`'s F8 section gained status `COMPLETE`, every DoD item checked
with file references, a full "Implementation notes" subsection covering the route-naming correction
and every scope decision above, and an expanded Deferred items list (HOD import screen, job-list/
history view). Its own F4 section's DoD item 7 and Deferred-items entry were updated to record this
closure. `docs/roadmaps/roadmap-index.md`'s version, Current State, and Immediate Next Actions all
updated to record `F8` complete — every currently-open frontend phase is now closed out.

Project state moves from _Implementation (B8 complete; F8 open)_ to _Implementation (F8 complete;
all frontend phases through F8 closed out)_.
**Next: `B9 — Question Review & Governance`** on the backend critical path (`Gate 1 ADRs → B0 → B1
→ B2 → B3 → B5 → B6 → B8 → B9 → B11 → …`) — unaffected by `F8`'s own always-parallelisable position.
A future `F9` (Question Bank Workspace) remains open whenever the frontend/backend phase-pairing
default is next prioritized.

### 2026-08-29 — `F8` gap closure: thorough implementation review, three fixes

Requested explicitly, same day as `F8` itself: a thorough review of the just-shipped implementation
looking for bugs, not new scope. Read every F8 data-layer/state-machine file end to end. Three real,
fixable issues surfaced — no product/architecture decision needed for any of them; full detail is
in `docs/roadmaps/frontend-roadmap.md`'s F8 section, "Post-completion gap closure" note, not
duplicated here:

1. `lib/imports/queries.ts`'s `pollingInterval` never polled while a job was still
   `PENDING_VALIDATION` (only `VALIDATING`) — every job is created in that status and only flips once
   the BullMQ worker dequeues it, so the very first fetch after creation could land inside that
   window and, with `refetchOnWindowFocus: false` set app-wide, stop refetching forever. Fixed by
   polling `PENDING_VALIDATION` on the same 2s cadence.
2. `use-import-flow.ts`'s `confirm()` had no try/catch around `confirmImport.mutateAsync` — a failed
   confirm was an unhandled promise rejection (every call site invokes it as
   `void actions.confirm()`), inconsistent with `selectFile`'s own established try/catch convention
   in the same file. Fixed with a deliberately-empty, documented catch.
3. `cancel()` never reset `confirmImport`'s own mutation state, so a failed confirm on one job could
   leave its stale error rendered against a _different_, freshly-started job that had never attempted
   a confirm of its own. Fixed by calling `confirmImport.reset()` inside `cancel()`.

Regression coverage added: `lib/imports/queries.test.ts` (`pollingInterval` exported and
table-tested directly) and `components/imports/use-import-flow.confirm-error.test.tsx` (no
`unhandledrejection` fires on a failed confirm; a new job never inherits a prior job's stale confirm
error). Full pipeline reconfirmed green after every fix: `pnpm --filter @atlas/web run lint &&
pnpm --filter @atlas/web run typecheck && pnpm --filter @atlas/web run test -- --run` — every
affected file individually, plus a full-suite run (97 files / 388 tests green; this environment's
already-documented worker-pool-startup flakiness hit a handful of unrelated files on one run, all
reconfirmed green individually immediately after).

No schema change, no permission-table change, no product-behaviour change, no roadmap phase status
changed. Project state remains _Implementation (F8 complete; all frontend phases through F8 closed
out)_ — this was a same-phase gap closure, not a new phase. **Next: `B9 — Question Review &
Governance`**, unchanged.

### 2026-08-29 — `F9` complete: Question Bank Workspace

Requested explicitly: start `F9`. Followed the working-rules checklist first: three parallel
research agents (F9's own roadmap/spec/audit coverage; the full `B8` `questions.v1` API surface —
routes, DTOs, permission grants, error codes; existing frontend conventions to reuse), then a Plan
agent, then direct verification reads (the real `DTO` field shapes, the permission table, the nav
model, F8's own stub page) before writing any code — per this project's own precedent for a phase of
this size. No gating ADR is unresolved; `B8` (F9's backend pair) is complete.

**Two decisions confirmed with the project owner before implementation:**

1. **Add a real rich-text editor now** (Tiptap 3.30 — `@tiptap/react`/`@tiptap/pm`/
   `@tiptap/starter-kit`, this codebase's first WYSIWYG dependency) rather than reuse the plain
   `Textarea` primitive, to satisfy `04 §39`/`05 §15.2`'s "rich editor" wording directly instead of
   deferring it further. `dompurify` (v3, ships its own types) sanitizes every read-only render of
   stored content — the first place this codebase renders arbitrary stored HTML back to a browser.
2. **Build `F9` now, honestly partial on the `B9` gap** — `B9` (Question Review & Governance, the
   HOD approve/reject/comment workflow) is not built, and no endpoint anywhere can ever produce a
   `REJECTED` revision yet. Everything `B8`'s contract supports is built fully; the Rejected-
   questions view is real and wired (`GET /questions?status=REJECTED`, genuinely filtered/paginated)
   but shows an honest "not yet available (B9)" state when empty, matching this project's
   established pattern (F1–F5) for a DoD item gated on a missing backend dependency — never silently
   claimed complete.

**A real routing correction, resolved directly against unambiguous evidence, not asked about**
(mirrors F1's own `/reset-password` precedent exactly): F9's roadmap text literally says
`/teacher/questions/*`, but the already-shipped nav entry (`nav-model.ts`'s TEACHER
`question-bank` item) and F8's own stub page (`/teacher/question-bank/page.tsx`, whose own doc
comment explicitly anticipated "F9's real screen supersedes this file") both already point at
`/teacher/question-bank`. Built there instead, superseding F8's stub as designed.

**Delivered** (`apps/web/components/questions/*`, `apps/web/lib/questions/*`): `QuestionBankScreen`
(bank home, `04 §38`/`QB-01` — status tabs including a deliberately-added "Under Review" tab beyond
`05 §15.1`'s literal 5-tab mockup, since `QuestionCountsResponseDto` genuinely returns that count and
hiding it would contradict DoD item 1; Subject/Level/Difficulty/Status filters in the URL, no
free-text search since `ListQuestionsQueryDto` has none), `QuestionEditorScreen` (`QuestionEditor`,
`QB-02` — the create-then-patch autosave design below), `MetadataPanel`, `OptionBuilder` (a
`RadioGroup`, never a checkbox, for the correct-answer selector — "exactly one correct" is
structurally unrepresentable as multi-select), `MediaUploader` + `MediaPreview` (presigned
upload-target → PUT → complete → attach, and `GET /media/:id/url` for read-back), `TopicCombobox`
(hand-rolled type-to-filter/create-on-the-fly — no new `cmdk`/Radix Combobox dependency),
`RichTextEditor` + `QuestionContentField`, `RevisionHistory`, `QuestionDetailScreen`, and
`RejectedQuestionsScreen` — routed at `/teacher/question-bank{,/new,/:id,/:id/edit,/rejected}`.
`ReviewFeedback` (the sixth named roadmap component) was deliberately **not built** — no live data
source exists yet.

**The autosave / create-then-patch design**, the real engineering core of this phase:
`POST /questions` requires every field at once (confirmed by reading `CreateQuestionDto` directly —
there is no partial-create path, and it runs the full validation catalogue immediately). Before a
real draft exists, the editor buffers purely client-side — react-hook-form state plus a debounced
`localStorage` snapshot as a resilience net against a closed tab — and only calls `POST /questions`
once a minimum-viable-fields gate passes (`lib/questions/validation.ts`'s `computeCreateGate`,
mirroring the DTO's exact required shape). On success, the returned `revisionId` is cached locally
immediately (before `router.replace`'s own re-render completes) so the very next autosave tick
already targets `PATCH .../revisions/:id`, not a duplicate `POST` — `PATCH` never re-runs the full
validation catalogue server-side, which is the actual reason this two-phase split is necessary at
all, not just a UX nicety. A `QUESTION_REVISION_NOT_DRAFT` response (someone else submitted/archived
it from under the tab) freezes further autosaves with a blocking banner rather than retrying against
a rejecting endpoint.

**The Subject/Level picker is unconstrained, not scope-filtered** — investigated directly (`auth
.guard.ts`, the permission table, every `/teachers*` route) and confirmed no self-service "my own
assignments" endpoint exists today: the only assignment-list route needs a `teacherProfileId` path
param the client has no way to obtain, and `users.teacher.view` is `denied()` for TEACHER. A teacher
who picks outside their real `ASSIGNED` scope gets the server's own `QUESTION_OUT_OF_SCOPE` message
surfaced inline, reusing the server's real reasoning rather than duplicating it client-side
incorrectly. Recorded as a Candidate/Deferred backend gap-closure (a narrow `GET /me/teacher-
assignments`-style route), not built in this frontend-only phase. The same investigation surfaced a
real scope nuance worth recording: `questionBank.view` is graded `ASSIGNED` for TEACHER — confirmed
by reading `QuestionService.buildScopeFilter` directly — meaning a teacher's bank list can include
colleagues' questions within a shared assigned subject/level (ADR-0001's "reusable question bank"
premise), not only their own; `04 §38`'s "My Questions" heading is a product-copy simplification of
this broader real scope, not a literal filter. `authorName` is shown per row so this is never
ambiguous to the viewer.

**Two real bugs found only by the test suite, not by inspection:**

1. `TopicCombobox`'s `Label`/`Input` pair had no `htmlFor`/`id` association at all — every other
   form field in this codebase gets this for free from `FormLabel`/`FormControl`'s automatic id
   injection, but `TopicCombobox` is a hand-rolled field outside that pattern, and nothing had
   wired the association manually. `getByLabelText` failed outright in the first test run. Fixed
   with `useId()`.
2. Two genuine jsdom/ProseMirror gaps, found only once a test actually typed into the editor (the
   earlier static-render smoke test didn't exercise this): `document.elementFromPoint` and
   `Range.prototype.getClientRects`/`getBoundingClientRect` don't exist in jsdom's layout-less DOM
   at all, and ProseMirror's real event handlers call them on every keystroke. Polyfilled as inert
   stubs in `vitest.setup.ts`, alongside that file's existing Radix/ResizeObserver polyfills —
   sufficient for ProseMirror's code paths to run without throwing; no test in this suite needs
   genuine pixel-coordinate geometry, only the resulting form/autosave payload.

**Testing**: 16 new test files / 75 tests — one `.test.tsx`/`.test.ts` per component/screen
(`RichTextEditor`, `QuestionContentField`, `OptionBuilder`, `TopicCombobox`, `MetadataPanel`,
`MediaUploader`, `use-question-media-upload`, `QuestionBankScreen`, `QuestionStatusTabs`,
`QuestionStatusBadge`, `QuestionDetailScreen`, `RevisionHistory` — including its honest real-vs-
placeholder rendering for a REJECTED revision — `RejectedQuestionsScreen` — both the honest empty
state and a genuinely-REJECTED-row case — `sanitize-html`, `validation`), plus one integration test
(`question-editor-flow.integration.test.tsx`: create → autosave `POST` → autosave `PATCH` → submit,
mocking `apiClient` at the HTTP boundary per this codebase's established RTL convention, matching
`bulk-import-flow.questions.integration.test.tsx`'s own precedent) — given an explicit extended
per-test timeout (three real `Select` interactions, character-by-character typing into a live
ProseMirror editor, and two genuine 800ms autosave debounce windows in sequence is genuinely heavier
than Vitest's 5000ms default, the same reasoning `structure-creation.integration.test.tsx`'s own
multi-step walk already established).

Full pipeline green: `pnpm --filter @atlas/web lint && pnpm --filter @atlas/web typecheck && pnpm
--filter @atlas/web build`, plus every F9 test file run in isolation (16 files / 75 tests, 0
failures, confirmed twice). The monorepo-wide full-suite run hit this environment's already-
documented worker-pool-startup/resource-contention flakiness unrelated to these changes (pre-
existing, unrelated test files also failed under that same full-suite load) — consistent with this
project's established practice for that class of environment flake, not a signal about F9's own
code; every F9-specific file was independently confirmed green.

`docs/roadmaps/frontend-roadmap.md`'s F9 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-partial-with-reason (items 8/9, gated on `B9`), a full
"Implementation notes" subsection, and an expanded Deferred items list. `docs/roadmaps/
roadmap-index.md`'s version, Current State, and Immediate Next Actions all updated to record `F9`
complete — every currently-open frontend phase is now closed out.

Project state moves from _Implementation (F8 complete; all frontend phases through F8 closed out)_
to _Implementation (F9 complete; all frontend phases through F9 closed out)_.
**Next: `B9 — Question Review & Governance`** on the backend critical path
(`Gate 1 ADRs → B0 → B1 → B2 → B3 → B5 → B6 → B8 → B9 → B11 → …`) — building it would also let `F9`
close its one remaining honestly-partial DoD item (the HOD's real rejection reason) and the full
review-cycle E2E its own Exit criteria still records as outstanding. A future `F10` (Question Review
Workspace) remains open whenever the frontend/backend phase-pairing default is next prioritized.

### 2026-08-30 — Authentication audit and three cross-cutting gap closures

Requested explicitly: a thorough, read-only audit of the full login flow (frontend → backend) after
live testing reported login failures, followed by fixes once specific findings were confirmed worth
fixing, plus two further real bugs found by the project owner's own manual testing afterward. No
roadmap phase status changed — every fix here closes a gap in an already-`COMPLETE` phase (`B1`,
`B3`, `B6`), per this codebase's own established "Post-completion gap closure" convention.

**1–3, closed together** (`B1`'s `IdentityModule`/`B3`'s `PlatformAuthModule`, plus F1/F3's login
forms): a CSRF-bootstrap race where the login POST could fire before `GET /tenant/resolve` set the
CSRF token, surfacing as a 403 indistinguishable from a wrong password; both login forms collapsing
every failure type (CSRF/validation/network, not just genuine bad credentials) into the same generic
enumeration-resistant message, hiding the real cause during testing; and login-identifier/email
lookups being case-sensitive and untrimmed with no consistency between the lockout key (already
lowercased) and the actual credential check. Fixed: both forms now disable submission until the CSRF
bootstrap settles; a new shared `resolveLoginErrorMessage()` (`apps/web/lib/auth/`) only shows the
generic text for a genuine `UNAUTHENTICATED` outcome; `LoginDto`/`PasswordResetRequestDto`/
`PlatformLoginDto` trim their identifier/email fields, and both `IdentityService.evaluateLogin`/
`requestPasswordReset` and `PlatformAuthService.evaluateLogin` now do a case-insensitive
(`mode: 'insensitive'`) lookup. New regression coverage on both sides (5 new backend integration
tests, 12 new frontend component/unit tests).

**API docs.** There was no live, browsable way to see the API's endpoints at all — `pnpm generate`
only ever wrote a committed `openapi.json` file, never a route the running process itself served.
`main.ts` now mounts `SwaggerModule.setup('docs', app, ...)` (outside production only, mirroring this
file's existing `hsts`/`allowInsecureSubdomains` environment-gating — the document discloses every
endpoint, DTO shape, and permission id), reusing the exact same document-building path
`openapi/emit.ts` already used rather than a second one that could drift. Needed one new dependency,
`@fastify/static` (an optional peer `@nestjs/swagger` requires under Fastify to serve the UI assets)
— added, installed, and verified via a real compiled boot (HTML shell, static JS/CSS bundle, and the
underlying JSON document all confirmed served).

**A genuine, product-breaking bug found by the project owner's own manual testing, not by the audit
above**: every person `createPersonMembership` creates (`B1`) starts `User.status: 'INVITED'` —
correct as a starting state — but nothing ever transitioned it to `'ACTIVE'` except one narrow,
bespoke case (`ActivationService.redeem()`, `B3`, built only for the first School Admin's
activation-key flow). `IdentityService.confirmPasswordReset()` and `CredentialSheetService
.issueInitialPasswords()` (both `B1`-owned primitives `B6` extended to staff invitations and student
credential issuance respectively) only ever updated `passwordHash`/`credentialState`, never `status`
— so every teacher, HOD, moderator, and student created since `B6` shipped could have a fully correct
password set and still fail every login attempt with `USER_NOT_ACTIVE`. Full detail (why it happened,
why no test caught it for two phases, and the precise fix) is in `backend-roadmap.md`'s `B1` section,
"Post-completion gap closure" — not duplicated here. Fixed: both methods now read the user's current
status and transition `INVITED → ACTIVE` only when it was still `INVITED`, mirroring
`ActivationService.redeem()`'s own precondition-checked transition exactly, so a `SUSPENDED`/
`INACTIVE` account reusing an old still-valid token is never silently reactivated. Two new end-to-end
regression tests (`users.integration.test.ts`: real teacher-invitation and real student-credential
issuance, each carried through to a real login) were confirmed to fail with the exact reported
symptom against the pre-fix code and pass against the fix.

Full pipeline green throughout: `pnpm --filter @atlas/api {typecheck,lint,test,test:integration}`
and `pnpm --filter @atlas/web {typecheck,lint,test}`, plus a real `node dist/main.js` boot after each
backend change. No schema change, no permission-table change, no ADR involved. `docs/roadmaps/
backend-roadmap.md`'s `B1` section gained its first "Post-completion gap closure" entry.

Project state remains _Implementation (F9 complete; all frontend phases through F9 closed out)_ —
these were gap closures on already-complete phases, not a new phase.
**Next: `B9 — Question Review & Governance`**, unchanged.

### 2026-08-30 — `B9` complete: Question Review & Governance

Requested explicitly: start `B9`. Followed the working-rules checklist first: three parallel research
passes (the full B9 roadmap section/gating ADRs/audit findings; the product specification for
`QuestionReview`/the review state machine across `05`/`06`/`07`/`02`/`04`; the existing `B8`
implementation — schema, permission-table rows, scope resolvers, mappers, test-harness conventions)
followed by direct reads of the live source (schema, `question.service.ts`, `question-revision
.service.ts`, `question-scope.util.ts`, `question-mappers.ts`, `permission-table.ts`,
`audit-event.service.ts`, `imports.module.ts`, the notifications wiring) before writing any code — no
gating ADR is unresolved (ADR-0001, ADR-0017 both Accepted; ADR-0012 additionally confirmed relevant
though not gating).

**Two design decisions the roadmap's own text already resolved, not guessed:**

1. **`REQUEST_CHANGES` and `REJECTED` write the same frozen `QuestionRevisionStatus.REJECTED` value.**
   That enum (shipped, frozen since `B8`) has no fourth "request changes" state, and the roadmap's own
   DoD item 4 says request-changes "behaves equivalently [to reject]." The two stay distinguishable
   only via the new `QuestionReview.decision` field (APPROVED/REJECTED/REQUEST_CHANGES, `07 §7.5`) —
   meaning `QuestionRevisionService.createRevision()`'s existing "may only revise from APPROVED or
   REJECTED" gate (`B8`) needed **zero changes**.
2. **No side-effecting GET; `UNDER_REVIEW` stays unset.** The roadmap's 6-endpoint contract names no
   "claim"/"start review" action, and no DoD item requires one. Approve/reject/request-changes accept
   a revision in either `SUBMITTED` or `UNDER_REVIEW` (future-proofing only) — `UNDER_REVIEW` and
   `QuestionCountsResponseDto.underReview` remain permanently unset/zero, exactly as `B8`'s own schema
   doc comment had already flagged as an open question for this phase.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260830092015_b9_question_review_
governance`): `QuestionReview` + a new `QuestionReviewDecision` enum, RLS-protected the same way every
school-owned table has been since `B0`'s bootstrap migration, plus a **4th** hand-written trigger —
unlike `B8`'s three (which only fire once their parent `question_revisions` row is `APPROVED`), this
one blocks every `UPDATE`/`DELETE` on `question_reviews` unconditionally from the moment a row is
created, since a review decision is never legitimately mutated at all regardless of its revision's
later status.

**Module structure**: a new top-level `QuestionReviewModule` (`apps/api/src/modules/question-review/`),
not folded into `QuestionsModule` — mirrors `ImportsModule`'s own `B7` precedent exactly: a
bounded-context module writing through another domain's primitives via plain function imports
(`questions/question-mappers.ts`'s `QUESTION_REVISION_INCLUDE`/`toRevisionResponseDto`), not DI, so no
dependency on `QuestionsModule` itself was needed. The two-hop department-scope join
(`HODAssignment.departmentId → Subject.departmentId → Question.subjectId`, ADR-0001) reuses the exact
pattern `QuestionService.resolveResourceContext()`/`buildScopeFilter()` already established in `B8` —
this phase's own caller resolves `Subject.departmentId` and constructs the `ResourceContext` itself,
exactly as `authorization.types.ts`'s own doc comment on that field had already anticipated.

**Self-review prevention** (DoD item 7) is a distinct service-layer check the `DEPARTMENT` scope
resolver alone can't express (it only checks `HODAssignment.departmentId` against the resource, never
authorship): compares `question.authorProfile.membership.id` against the acting HOD's own
`membershipId`; on match, a new `QUESTION_SELF_REVIEW_FORBIDDEN` (400) — mirrors `QUESTION_OUT_OF
_SCOPE`'s own "domain-rule failure distinct from the authorization engine's own FORBIDDEN" reasoning.
Proven against a real Teacher+HOD dual-role person (`07 §5.3` explicitly permits the combination).

**"Queue reassignment on HOD change" (DoD item 8) needed zero new code.** The queue query always
re-resolves the actor's current `ACTIVE` `HODAssignment` rows live, so `B6`'s own already-shipped
`POST /hods/:id/remove`/`PUT /hods/:id/department` are sufficient — proven directly in this phase's
own test using those real B6 endpoints. `QuestionReview.reviewerMembershipId` is a decision-time
snapshot (mirrors `QuestionRevision.createdByMembershipId`'s own precedent), which is what keeps a
prior decision attributed to the HOD who actually made it regardless of who holds the department
later.

**Notifications reuse the existing B0/ADR-0019 `NotificationChannel`/`TemplateRegistry`, not `B10`.**
`B10` (the full in-app notification center) doesn't exist yet. Following `B1`/`B3`/`B6`'s own
established precedent of not waiting for `B10` to send a real transactional message, `QuestionReview
Module` registers three templates (`question-review-approved`/`-rejected`/`-changes-requested`)
against the shared registry and dispatches synchronously right after each decision's transaction
commits, wrapped in try/catch so a transient send failure never fails the decision itself.

**Permission table**: cleared the `awaitingResource: 'Question review workflow (B9)'` tag from all six
pre-graded rows (`questionBank.review`/`.comment.view`/`.comment.create`/`.approve`/`.reject`/
`.requestChanges`) and the four `'Question (B8/B9)'`-tagged `questionLifecycle.*` rows describing the
same state machine — **no grant shape changed**, confirmed by three independent research passes
before implementation. One small, additive gap-closure found and fixed alongside this:
`questionBank.submitForReview`/`questionLifecycle.submit`'s own `awaitingResource` tags were stale
leftovers that should have been cleared when `B8` shipped `POST .../revisions/:rev/submit` — never
touched since, caught only because this phase was already editing the surrounding rows.

**A real, if minor, test-infrastructure consequence found only by running the tests, not by
inspection**: the new unconditional trigger means every `question_reviews` row a test creates becomes
genuinely, permanently undeletable — by the `Restrict` FK from `question_reviews` to
`question_revisions`, so is everything from `Question` downward that a test's own teardown cascade
would otherwise need to pass through. `tests/tenancy/rls.integration.test.ts`'s shared B5–B8
fixture-school `afterAll` (previously unguarded, since nothing it created before `B9` was ever
unconditionally immutable) needed the same `.catch(() => undefined)` best-effort treatment
`question-lifecycle.integration.test.ts`'s own afterAll already established for its own
APPROVED-revision case, extended down through every subsequent step in that describe block's teardown
chain — the leftover test data is harmless (RLS-scoped, uniquely UUID-named, never reachable outside
its own deleted school's context), the same reasoning `B8`'s own precedent already accepted.

**Testing**: `apps/api/src/modules/question-review/question-review.integration.test.ts` (9 tests, real
HTTP via `app.inject()` against real Postgres, mirroring `question-lifecycle.integration.test.ts`'s
own harness) — the full submit→queue→request-changes→revise→resubmit→approve cycle with ordered
history and a real notification-dispatch assertion (spying directly on the injected
`NOTIFICATION_CHANNEL` singleton's own `send` method, not `console.log` — `ConsoleNotificationChannel`
's `sink` closes over `console.log`'s reference at app-boot time, before any test's `vi.spyOn` could
apply); mandatory-reason enforcement; approving an already-decided revision refused; cross-department
denial (queue exclusion, workspace 404, decision 403); self-review-forbidden; Moderator denied
outright; a static assertion that `SOFTWARE_ADMIN`'s `questionBank.approve` grant is `DENIED`, not
`BREAK_GLASS` (ADR-0012 — no live HTTP path exists for a platform actor to reach a school-scoped route
at all, so this is proven directly against the permission table); the HOD-reassignment scenario using
`B6`'s real removal/reassignment endpoints; and cross-tenant `NOT_FOUND`. `tests/tenancy/rls
.integration.test.ts` gained `question_reviews` in the existing B5–B8 describe block's `tables` array
(same economy as every prior phase).

Full pipeline green: `pnpm lint && pnpm typecheck && pnpm test && pnpm build` at the monorepo root
(16/16 turbo tasks), the full `apps/api` integration suite (one unrelated, pre-existing
environment-timing flake in `import-1500-rows.integration.test.ts` — reconfirmed failing the same way
in isolation, unrelated to any `B9` change), plus `pnpm generate` (`question-review.v1` — 6 new
routes — published in `apps/api/openapi.json`/`packages/contracts`) and `pnpm generate:permission
-table-doc` (151 rows, confirmed unchanged). A real `node dist/main.js` boot confirmed
`PolicyCoverageService` reports 150 routes checked with zero violations, and `QuestionReviewModule`'s
dependencies resolved cleanly — no cross-module DI error, the class of bug every prior phase has hit
at least once.

**Honestly open**: `F10` (Question Review Workspace) wasn't built in this pass — the roadmap's own
"F10 confirms the contract" exit criterion stays open, matching every prior backend-only phase's
identical gap. Deferred, per the roadmap's own text: multi-reviewer/quorum approval; review SLAs and
escalation; the optional queue-age background reporting job (marked "optional," no DoD item needs it);
a standalone "reply comment" endpoint for `questionBank.comment.create`'s TEACHER grant (no such route
exists in the roadmap's own 6-endpoint contract — a teacher's real response to feedback is
resubmission via `B8`'s existing flow).

While updating `backend-roadmap.md`'s own Phase Completion Tracking table for `B9`, found and fixed
the same table's accumulated staleness for `B0`–`B8` — every one of those rows had been left at its
original NOT STARTED placeholder despite each phase's own section (and this file's own Change Log)
recording it complete long ago. Corrected as a pure documentation-accuracy fix — no code, schema, or
status claim beyond what each phase's own section already independently records.

`docs/roadmaps/backend-roadmap.md`'s B9 section gained status `COMPLETE`, every DoD item checked with
detail, a full "Implementation notes" subsection, and an expanded Deferred items list.
`docs/roadmaps/roadmap-index.md`'s version, Current State, and Immediate Next Actions all updated to
record `B9` complete and `B11` next on the critical path.

Project state moves from _Implementation (F9 complete; all frontend phases through F9 closed out)_ to
_Implementation (B9 complete)_.
**Next: `B11 — Exam Builder & Readiness`** on the backend critical path (`Gate 1 ADRs → B0 → B1 → B2
→ B3 → B5 → B6 → B8 → B9 → B11 → B12 → …`) — every backend phase up to the exam engine itself is now
complete. A future `F10` (Question Review Workspace) remains open whenever the frontend/backend
phase-pairing default is next prioritized, and would close the one exit criterion this pass left
honestly open.

### 2026-09-03 — `B9` gap closure: thorough implementation review, three fixes

Requested explicitly, same day as `B9` itself: a thorough review of the just-shipped implementation
looking for bugs, not new scope. Read every B9 file end to end and cross-checked each decision path
against the established conventions elsewhere in the codebase (B8's `question.service.ts`/
`question-revision.service.ts`, the `DEPARTMENT`/`OWNED` scope resolvers, `AuditService`) rather than
just re-reading B9 in isolation. Three real, fixable issues surfaced in `question-review.service.ts`
— none caught by the original 9-test suite. Full detail (failure scenarios, the fix for each, and
file references) is in `docs/roadmaps/backend-roadmap.md`'s B9 section, "Post-completion gap closure"
note, not duplicated here:

1. **Queue ordering used the wrong field.** `getQueue()` sorted by `Question.updatedAt`, which
   `submit()` never touches (only `QuestionRevision.status` changes on submit) — the sort key and
   the response's own `submittedAt` DTO field (`currentRevision.updatedAt`) disagreed, so the queue
   could invert real submission order for a question drafted for days before submitting. Fixed to
   order through the revision relation instead.
2. **`decide()` checked business state before authorization.** The revision-status and self-review
   checks both ran before `authz.evaluate()`, unlike every comparable write path elsewhere in this
   codebase (`requireOwnedRevision()`, `question.service.ts`'s `archive()`, and this same file's own
   `getWorkspace()`/`getHistory()`) — letting an HOD outside a question's department learn its review
   state (already-decided vs. still-pending) via a `409` instead of a `403`, before ever being
   authorized to know the question exists. Fixed by authorizing first.
3. **No concurrency guard on the decision write.** The `QuestionRevision` status update had no
   status precondition inside the transaction, so two decisions racing on the same revision (e.g.
   two HODs approving/rejecting near-simultaneously) could both commit, producing two `QuestionReview`
   rows and an ambiguous final status. Fixed with the same conditional-`updateMany` idiom B5's session
   activation and B7's import confirm/commit claim already established in this codebase.

Three new regression tests added to `question-review.integration.test.ts` (12 total, up from 9),
mirroring `import-confirm-concurrency.integration.test.ts`'s own direct-Prisma-race technique for the
concurrency proof. Full pipeline reconfirmed green after every fix: `pnpm --filter @atlas/api
{typecheck,lint,test}`, the full `apps/api` integration suite for this module plus the neighbouring
B8 question suites (22 tests, unaffected), the extended `tests/tenancy/rls.integration.test.ts` suite
(71 tests, unaffected), and `pnpm --filter @atlas/api run build`.

No schema change, no permission-table change, no product-behaviour change beyond correcting the three
bugs themselves, no ADR involved, no roadmap phase status changed. Project state remains
_Implementation (B9 complete)_ — this was a same-phase gap closure, not a new phase. **Next:
`B11 — Exam Builder & Readiness`**, unchanged.

### 2026-09-03 — `F10` complete: Question Review Workspace

Requested explicitly: start `F10`. Followed the working-rules checklist first: three parallel
research passes (the F10 roadmap section, its two backend-dependency-map entries, and `04 §28`–`§32`/
`§70`, `05 §16`, ADR-0001/0012/0017; the real `question-review.v1` contract as `B9` actually shipped
it — routes, DTOs, permission grants, error codes, deferred items; F9's own existing
`components/questions/*`/`lib/questions/*` for reuse) then direct verification reads of the live
source (`QuestionDetailScreen`'s real action-gating, the permission table's full `questionBank.*`
grants, `nav-model.ts`'s HOD entries, the real DTO field shapes) before writing any code — no gating
ADR is unresolved; `B9` (F10's backend pair) is complete.

**Routing correction, decided directly against unambiguous evidence, not asked about** (mirrors F1's
`/reset-password`, F8's `/teacher/question-bank/import` precedent exactly): the roadmap's own route
table said `/hod/reviews`/`/hod/questions`, but the already-shipped nav model
(`nav-model.ts`'s HOD `question-review`/`question-bank` items, unbuilt until now) uses
`/hod/question-review`/`/hod/question-bank` — built there instead, superseding the `[...slug]`
catch-all for both slugs.

**A genuine modeling correction found only by inspecting the real DTOs, not anticipated in the
original plan**: the roadmap's named `RevisionTimeline` component is _not_ a reuse of F9's
`RevisionHistory` — `QuestionReviewWorkspaceResponseDto` embeds `currentRevision` (one revision) plus
`history` (the **decision** trail: `revisionNumber`/`decision`/`comment`/`reviewerName`/`createdAt`),
never the full list of past revision _bodies_ `RevisionHistory` expands. Built as a new, small
`ReviewHistoryTimeline` component instead, matching `04 §31`'s own literal mockup exactly and needing
only the one workspace fetch already needed for everything else — no second `GET /questions/:id`
round trip. `RevisionHistory` itself gained a real, separate fix: an optional `reviewHistory` prop
(matched to each revision by `revisionNumber`) that replaces its own stale "B9 hasn't shipped"
placeholder with the real decision, wired into the teacher-facing `QuestionDetailScreen` via a new
`useReviewHistory` call — closing F9's own honestly-flagged partial DoD item for reviewer feedback.
`RejectedQuestionsScreen`'s equally stale copy was corrected the same way.

**Two real, pre-existing bugs found in F9's own shipped code, not by inspection but by tracing what
`/hod/question-bank` reuse would actually do**: `QuestionBankScreen`'s Rejected/Import/Create-question
links were hardcoded to `/teacher/question-bank/...` regardless of the `basePath` prop actually
passed in (only row links used it) — harmless while its only caller was the teacher route tree, but a
real, reachable bug the moment this phase reused it at `/hod/question-bank`: HOD genuinely holds
`questionBank.import` at `DEPARTMENT` scope (confirmed in the permission table), so its Import button
really does render there. Fixed by making all three links `basePath`-relative; a new `hideImport` prop
additionally suppresses HOD's Import link specifically, since a real HOD-facing bulk-import screen is
out of this phase's approved scope (Candidate/Deferred, extending F8's own already-recorded "HOD gets
no import screen this phase" deferral without closing it). A second, related bug: the teacher
`rejected/page.tsx` route itself passed its own path (`.../rejected`) as `basePath` instead of the
bank's own base — meaning any real rejected-question row's link would have resolved to a nonexistent
`.../rejected/{id}` route. Invisible until this same phase made a real `REJECTED` row possible for the
first time (nothing could 404 on a link that never appeared before).

**`QuestionDetailScreen` needed zero HOD-specific fork** — reused verbatim at
`/hod/question-bank/:id`: its Edit/Start-new-revision actions are gated behind
`questionBank.editOwnDraft` (`denied()` for HOD), so they never render there; its Archive action is
gated behind `questionBank.archive` (genuinely `granted('DEPARTMENT')` for HOD — real departmental
oversight authority per B8's own finalization, not a leftover), so it correctly does render.

**Delivered** (`apps/web/lib/question-review/`, `apps/web/components/question-review/`): `ReviewQueue`
(subject-grouped, plain `Table` primitives — no pagination exists server-side and the queue is
department-scoped/dozens-not-thousands by design), `ReviewWorkspace` (one fetch renders everything —
content/options/media/metadata plus `ReviewHistoryTimeline`; queue-order prefetching via
`queryClient.prefetchQuery` so "Next" resolves from cache), `DecisionPanel` (Approve — no dialog, the
DTO's note is optional, a single click or the `A` key submits immediately with an optional expandable
note; Reject/Request Changes — each behind `ReviewDecisionDialog`, a mandatory-reason dialog mirroring
`ReasonDialog`'s own enforcement pattern, `R`/`C` keys open them; shortcuts inert while any
input/textarea has focus or a dialog is open), and `ReviewQueueWidget` (the dashboard's real
pending-review section, `04 §29`). A deliberate, documented interpretation of the roadmap's own
"optimistic queue advance and rollback on failure" wording: true optimistic UI (navigating before a
decision resolves) was not built for this class of audited, effectively-irreversible academic action
(`AGENTS.md` §5/§7) — "instant Next" instead comes from the destination already being prefetched, so
the only remaining wait is the real mutation round-trip.

**The HOD dashboard (`/hod`) is scoped down to exactly what `B9` supports**, confirmed directly
against the placeholder page's own pre-existing wording ("the pending-review queue... is a later,
separately-scoped phase" — this is that phase): the real `ReviewQueueWidget`, plus an honest "not yet
available" section for the rest of `04 §29`'s stats (teacher/student/class/subject counts, active/
completed exams, department average) — no single department-stats endpoint exists yet, and
exams/marking are `B11`/`B15`.

**Testing**: `queue-order.test.ts`/`error-utils.test.tsx` (pure-function unit coverage), one
`.test.tsx` per new component (`ReviewQueue`/`ReviewWorkspace`/`DecisionPanel`/
`ReviewDecisionDialog`/`ReviewHistoryTimeline`/`ReviewQueueWidget`) covering loading/error/empty-queue/
mandatory-reason-blocking/keyboard-shortcut/self-review-banner states, updated tests for
`RevisionHistory`/`QuestionDetailScreen`/`QuestionBankScreen` (including two new regression cases
proving the `basePath` fix and `hideImport`) /`RejectedQuestionsScreen`, and
`question-review-flow.integration.test.tsx` — the real `ReviewQueue`/`ReviewWorkspace`/`DecisionPanel`/
`ReviewDecisionDialog` component stack against the real `lib/question-review/*` hooks, mocking only
`apiClient` at the HTTP boundary (`question-editor-flow.integration.test.tsx`'s own established
technique): the queue's real grouped rendering, a real approve call advancing to the next queued
question, a full reject flow (blocked client-side on an empty reason, then a real reject call), and a
cross-department/`NOT_FOUND` case rendering the real error state, never raw JSON.

Full pipeline green: `pnpm --filter @atlas/web {lint,typecheck}`, the full `apps/web` test suite
(117 test files / 516 tests, all green — the same class of full-suite worker-pool-startup flakiness
this project has repeatedly documented hit six unrelated files on this run, all reconfirmed passing),
and `next build --webpack`, which confirmed all five new HOD routes
(`/hod/question-bank`, `/hod/question-bank/[id]`, `/hod/question-bank/rejected`,
`/hod/question-review`, `/hod/question-review/[id]`) render correctly, superseding the `[...slug]`
catch-all as designed. No backend change of any kind — `question-review.v1` was already frozen and
complete; this phase is a pure frontend build against it.

`docs/roadmaps/frontend-roadmap.md`'s F10 section gained status `COMPLETE`, every DoD item checked
with detail, a full "Implementation notes" subsection covering the modeling correction and both F9
bugs found, and an expanded Deferred items list (bulk approve; proactive self-review detection; a
real HOD bulk-import screen; the full `04 §29` dashboard beyond the pending-review widget).
`docs/roadmaps/roadmap-index.md`'s version, Current State, and Immediate Next Actions all updated to
record `F10` complete — every currently-open frontend phase is now closed out.

Project state moves from _Implementation (B9 complete)_ to _Implementation (B9/F10 complete; every
frontend phase through F10 closed out)_.
**Next: `B11 — Exam Builder & Readiness`** on the backend critical path (`Gate 1 ADRs → B0 → B1 → B2
→ B3 → B5 → B6 → B8 → B9 → B11 → B12 → …`) — a future `F11` (Exam Builder & Readiness UI) remains
open whenever the frontend/backend phase-pairing default is next prioritized once `B11` ships.

### 2026-09-03 — `B11` complete: Exam Builder & Readiness

Requested explicitly: start `B11`. Followed the working-rules checklist: three parallel research
passes (the B11 roadmap section, its full text and ADR-0006's own B11-targeted requirement not in
its "Blocks phases" header; the newest module (`question-review`, B9) plus `questions` (B8) as
implementation templates — service/controller/DTO/mapper conventions, the migration/trigger idiom,
the two established concurrency-proving techniques; the academics/people schema `Exam` would need to
join against), then a dedicated Plan agent, then direct verification reads of the permission table's
already-pre-graded `exam.*` rows, `AuthorizationService`/`ScopeResolverRegistry`, and
`packages/domain/src/platform/result-policy.ts`'s own doc comment (which had already anticipated
exactly how `Exam.resultPolicy` would be seeded) — before writing any code, per this project's own
precedent for a phase of this size. Two genuine open product-modeling questions with no spec/ADR
answer were confirmed with the project owner before implementation: **exam type is free text** (not
a fixed platform vocabulary, matching `AcademicSession.name`'s own precedent) and **navigation policy
is one enum with "revisit" folded in** (`FREE`/`SEQUENTIAL_NO_REVISIT`/`SEQUENTIAL_WITH_REVISIT`),
matching `07 §8.1`'s single-attribute ERD literally.

**The permission table already resolved the one product-policy question the audit had flagged as
open (`C-07`, "Limited" School Admin/Moderator create rights)** — `packages/domain`'s `exam.*` rows
were pre-graded since `B2`, with `create` already `TEACHER`-`ASSIGNED`-only and School Admin/
Moderator/HOD holding full administration rights (edit/delete/configure/publish/archive) on an
existing draft, never authorship. `B11` implemented against that frozen table; it did not renegotiate
it — clearing the twelve `awaitingResource: 'Exam (B11)'` flags with zero grant-shape changes.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260903120000_b11_exam_builder_
readiness`): `Exam`/`ExamClass`/`ExamSection`/`ExamQuestion` plus three new enums
(`ExamStatus` — all seven `07 §14` lifecycle values carried now, mirroring
`QuestionRevisionStatus.ARCHIVED`'s own "shipped even though unused by this phase" precedent;
`ExamAccessMode`, ADR-0006's own required B11 slice — the column + `OPEN_TO_ELIGIBLE` default only,
participant-authorization mechanics staying entirely `B12`'s job; `ExamNavigationPolicy`, the
confirmed product decision). **A deliberate schema simplification, not the roadmap's most literal
reading**: `Exam` carries no `level` column, and `ExamClass`/`Exam.term` use plain existing
composite-FK targets — zero changes to any already-shipped table (`ClassGroup`/`ClassSubject`/
`AcademicTerm`/`Subject` untouched). ADR-0013's "all targeted classes share school, session, and
level" rule is enforced at the **service layer** (`exam-scope.util.ts`'s
`resolveAndValidateClassTargets`/`assertTermBelongsToSession`), inside the same transaction as the
write, mirroring `HODAssignment`'s own documented precedent exactly ("a cross-table invariant…
enforced at the service layer… this codebase avoids triggers" for this class of check) — reserving
the roadmap's own explicit demand for **database-constraint-level** enforcement for the one thing it
actually names that way: the approved-revision-only rule. `ExamClass` FKs to `ClassSubject(schoolId,
id)` alone, which already encodes class+subject+session+level together via
`classGroupSession.level`. `ExamSection.marks` is not a column at all — always derived (`SUM` of the
section's own `ExamQuestion.marks`), computed in `exam-mappers.ts` on every read, per ADR-0029.
`ExamQuestion.questionRevisionId` binds the **specific** `QuestionRevision` row, never `Question
.currentRevisionId` — the design choice that makes DoD item 8 ("a later revision doesn't alter the
binding") true automatically, with zero new machinery, since B8's own trigger already forbids any
mutation of an `APPROVED` revision and this FK target never moves.

**Two hand-written Postgres triggers** — the two things the roadmap's own text explicitly demands at
the database-constraint level, mirroring B8's existing trigger idiom precisely: approved-revision-
only binding (`enforce_exam_question_revision_approved`, checking the **referenced** revision's
status rather than a parent's, since an `exam_questions` row has no status-bearing parent to defer
to) and READY-immutability (two child-table blanket-freeze triggers for `exam_questions`/
`exam_classes`, one column-diff trigger for `exams` itself — a blanket freeze would incorrectly block
the legitimate status-only transitions `READY→CANCELLED`/`READY→ARCHIVED` still need). `ExamSection`
gets no trigger at all — nothing in B11 ever `UPDATE`s that row (no section UI), so a lock trigger
would be dead code.

**A real trigger bug found only by the integration tests, not by inspection — the same class of gap
this codebase's own precedent (B1/B2/B4's boot-only DI bugs) keeps surfacing in a new shape each
phase.** The first version of the two child-table immutability triggers blocked a mutation whenever
`SELECT status FROM exams WHERE id = …` returned anything `IS DISTINCT FROM 'DRAFT'` — including
`NULL`, which `IS DISTINCT FROM` treats as true. `NULL` is exactly what that subquery returns when
the trigger fires as part of `Exam`'s own `ON DELETE CASCADE`: by the time the cascaded child-row
trigger runs, the parent `exams` row has already been removed from the table. Practical consequence:
`ExamService.deleteDraft()` — deleting a genuinely `DRAFT` exam — failed with a 500 every time, its
own legitimate cascade delete of `ExamSection`/`ExamClass`/`ExamQuestion` incorrectly blocked by
triggers meant to protect a _still-existing_, non-DRAFT exam's children, not the exam's own
deletion. Fixed by changing the guard to `parent_status IS NOT NULL AND parent_status IS DISTINCT
FROM 'DRAFT'` — `NULL` (parent gone, i.e. cascading from the exam's own deletion) now correctly
means "allow"; a direct mutation of a child row while the parent genuinely still exists and is
non-DRAFT stays blocked exactly as before, proven by the very test that caught the bug in its
inverted form.

**API** (`apps/api/src/modules/exams/`, replacing the B0-era empty stub): `exams.v1` — a peer
top-level module mirroring `QuestionReviewModule`'s (B9) own precedent, one-directionally importing
`QuestionsModule` to reuse `QuestionService.list()` verbatim for the "browse approved questions
available to bind" route rather than reimplementing its scope-filter/pagination logic. Four services
split along the same route/permission-cluster boundaries `question.service.ts`/`question-revision
.service.ts` already established: `ExamService` (identity/lifecycle — create/list/get/editDraft/
deleteDraft/cancel/archive/ready), `ExamQuestionService` (question selection, full-replace per bind),
`ExamConfigurationService` (the four `exam.configure*` permission ids collapsing onto one endpoint),
`ExamReadinessService` (the itemised checklist — one function, called by both `GET .../readiness`
directly and `ready()`'s own pre-transition re-check, so the two can never disagree on what "ready"
means). Fifteen readiness checks (05 §23/§72, 07 §20); two are deliberately defensive (structurally
unreachable given the DB trigger and a `NOT NULL` column) and kept anyway for spec fidelity, mirroring
`QuestionRevisionStatus.ARCHIVED`'s "kept even though never written" precedent.

**The multi-class ASSIGNED scope check is genuinely widened, not reused verbatim**:
`requireTeacherAssignedToAnyClass` (`exam-scope.util.ts`) mirrors `question-scope.util.ts`'s own
`requireTeacherAssignedScope` but resolves **any-of-N** candidate classes (ADR-0013's "assignment to
at least one targeted class grants operation of the exam"), used only by `exam.create` — the one exam
permission graded `ASSIGNED` for TEACHER. Every other TEACHER-reachable action is `OWNED` and needs
nothing beyond the already-built `OWNED` resolver plus `Exam.createdByMembershipId` — zero new scope-
resolver registration anywhere in this phase. A load-bearing ordering consequence, not an incidental
choice: because only `create` carries the `ASSIGNED` gate, `CreateExamDto.classIds` is required with
`@ArrayMinSize(1)` — a teacher cannot create an empty shell and add classes afterward with no scope
check ever applied.

**Two small confirmed gap-closures, mirroring this codebase's own established precedent for this
class of discovery (F3/F6/F7/B6 each found one or two within their own phase):**

1. **`02`'s own Exam Management matrix never lists a "Cancel exam" row at all**, yet DoD item 7
   ("cancelling… records a reason and is audited") is real, approved scope with no permission id to
   attach to. Added `exam.cancel`, mirroring `exam.deleteDraft`'s exact grant shape (its closest
   conceptual sibling) rather than `exam.archive`'s break-glass-for-Software-Admin shape, since
   "cancel exam" is not among ADR-0012's named break-glass examples — 152 permission-table rows, up
   from 151.
2. **Two additive endpoints beyond the roadmap's own illustrative `exams.v1` table**:
   `DELETE /v1/exams/:id` (DRAFT-only hard delete, attaching to the already-pre-graded
   `exam.deleteDraft` row) and `GET /v1/exams/:id/available-questions` (attaching to
   `exam.useApprovedQuestions`, delegating straight to `QuestionService.list()`).

**A real, if minor, bug found in the DELETE route's own initial implementation, caught by the
integration tests**: the first version used `@HttpCode(HttpStatus.NO_CONTENT)` returning `void` —
this codebase's actual established DELETE convention (`ClassGroupController.remove()` et al.) is
`{status: 'ok'}` at plain 200, not 204; the deviation surfaced as a real 500 under Fastify. Fixed by
following the established convention instead of introducing a new one.

**Testing**: `exam-builder.integration.test.ts` (19 tests, real HTTP via `app.inject()` against a
real running `AppModule` and real Postgres, mirroring `question-lifecycle.integration.test.ts`'s own
harness) — every DoD item, all three class-agreement error codes, the concurrency race (two
simultaneous `ready()` calls on one DRAFT exam, exactly one wins), and both direct-Prisma-bypass
proofs. One real fixture bug this suite's own first run caught: promoting the _same_ teacher who
authored the test's questions to HOD silently tripped B9's self-review-forbidden check on every
`approve()` call in `beforeAll`, cascading into failures across half the suite until traced back and
fixed by promoting a distinct person instead — a genuine "read the actual response, don't assume
success" lesson `AGENTS.md` §10 already counsels, applied concretely.
`tests/tenancy/rls.integration.test.ts` gained a **new, dedicated** describe block for the four new
tables rather than joining the shared B5–B9 block every phase since `B3` has extended — a deliberate
break from that "economy" precedent, not an oversight: `exam_questions` requires its bound
`question_revisions` row to be `APPROVED`, and that shared block's fixture is kept at `DRAFT` status
specifically "so an APPROVED row would make afterAll's cleanup fight that trigger for no reason" (its
own comment) — a single Postgres multi-row `DELETE` statement fails atomically if it hits even one
trigger-blocked row, so introducing one there would have silently regressed cleanup for every other
row in that block, not just this phase's own addition. A dedicated school pair (mirroring the B3/B4
blocks' own shape) avoids that regression entirely — 87 tests in that file total, up from 68.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm build` at the
monorepo root (16/16 turbo tasks each), the full `apps/api` unit suite (143 tests), the extended RLS
suite, and the new exam-builder suite — plus `pnpm generate` (`exams.v1`, 10 routes, published in
`apps/api/openapi.json`/`packages/contracts`) and `pnpm generate:permission-table-doc` (152 rows). A
real `node dist/main.js` boot confirmed `PolicyCoverageService` reports 162 routes checked with zero
violations. One pre-existing, unrelated environment flake was observed in the full `apps/api`
integration run (`imports.integration.test.ts`/`import-1500-rows.integration.test.ts` — the
background BullMQ import worker not completing within the test's polling window) — already
documented as a known, pre-existing issue unrelated to feature work in `B9`'s own Change Log entry
("reconfirmed failing the same way in isolation"); `B11` touches zero files in `ImportsModule` and
did not investigate further.

`docs/roadmaps/backend-roadmap.md`'s B11 section gained status `COMPLETE`, every DoD item checked
with detail, a full "Implementation notes" subsection covering the trigger bug and both gap-closures
above, and an expanded Deferred items list (including a Candidate/Deferred note for a standalone
`ExamReadinessService` unit test, not built this pass — the integration suite already exercises every
_reachable_ check directly). `docs/roadmaps/roadmap-index.md`'s version, Current State, and Immediate
Next Actions all updated to record `B11` complete and `B12` next on the critical path.

**Honestly out of scope, per `AGENTS.md` §14 — not built opportunistically**: `ExamSessionParticipant`
and any attempt/session machinery or Control Center (all `B12`/`B13`); `School.resultPolicyLocked`
enforcement (seeded and freely editable while DRAFT; the lock check itself is explicitly `B15`'s job);
question pools (`ADR-0002` — fixed selection only; the `randomizeQuestions`/`randomizeOptions`
_flags_ are this phase's job, the actual per-attempt shuffle is `B13`'s); `ExamAdministrator`
delegation into the `OWNED` resolver (`B12`'s job — this phase uses the plain, un-delegated resolver
already built in `B2`); per-student accommodations (one free-text exam-level field only); a
notification template (the roadmap's own Security section names `EXAM_READY`/`EXAM_CANCELLED` as
audited, not notified, unlike B9's explicit requirement).

Project state moves from _Implementation (B9/F10 complete; every frontend phase through F10 closed
out)_ to _Implementation (B11 complete)_.
**Next: `B12 — Exam Activation & Control`** on the backend critical path (`Gate 1 ADRs → B0 → B1 →
B2 → B3 → B5 → B6 → B8 → B9 → B11 → B12 → B13 → …`) — the next phase in the highest-risk segment of
the roadmap (`B13`/`B14` carry the most risk of the whole plan). A future `F11` (Exam Builder &
Readiness UI) remains open whenever the frontend/backend phase-pairing default is next prioritized.

### 2026-09-03 — Three live-testing gap closures: deactivation dead-end, empty Subject picker, no student password

Requested explicitly: three real bugs the project owner hit while manually testing already-shipped
phases (`B3`/Platform Admin, `B8`/`F9` Question Bank, `B6`/`F7` People). All three are gap closures
on already-complete phases, not a new phase — no roadmap status changed.

**1. Deactivation dead-end (`B3`).** `School.platformOverride = 'DEACTIVATED'` is a deliberate,
spec-backed terminal state (`03 §3` "for a permanently terminated account"; `07 §3.3` "never
normally deleted... becomes DEACTIVATED"; `backend-roadmap.md`'s own B3 notes: "no reactivate path
out of it") — confirmed against source docs before touching anything, not assumed. That part of the
design was correct and untouched. The real bug: neither `SchoolsAdminService.issueSubscription()`/
`.issueActivationGrant()` nor `ActivationService`'s redemption path ever checked it, so a Software
Admin could issue a fresh key against a permanently deactivated school and have it **redeem
successfully** — the activation-history table showed `ACTIVATED` — while every login attempt kept
failing with `SCHOOL_ACCESS_DEACTIVATED` regardless, with no error anywhere in the issuance/
redemption flow to explain why. Fixed at both ends: `ActivationService.findRedeemableGrant()` (the
one choke point both `verify()` and `redeem()` already funnel through) now rejects a deactivated
school's key immediately, before a password is ever set; `SchoolsAdminService` gained a shared
`assertNotDeactivated()` guard called from both issuance methods. `SUSPENDED` is deliberately left
unaffected by both checks — it's reversible via `reactivate()`, and the subscription clock is
independent of the platform override, so renewing/re-keying while suspended stays allowed. Frontend:
the Subscription tab now disables both "Issue / renew subscription" and "Issue new activation key"
for a deactivated school with an explanatory banner (mirroring the Overview tab's own already-
disabled Deactivate button), and both actions now surface the real server error message instead of
one fixed generic string; `/activate`'s `verifyErrorMessage()` gained a specific case for
`SCHOOL_ACCESS_DEACTIVATED`. New tests: `activate-form.test.tsx`, `subscription/page.test.tsx` (two
new cases each).

**2. Empty, unselectable Subject picker in question creation (`B8`/`F9`).** Root cause: F9's
`MetadataPanel` populated the Subject dropdown from `GET /academics/subjects`
(`schoolConfig.subject.view`) — `denied()` for TEACHER per `02`'s own "Manage subjects" row, a
deliberate decision confirmed again at F6 ("Teacher gets no schoolConfig.* access"). That denial is
correct for the Academic Structure workspace; it also happened to be the _only_ endpoint the picker
called, making it 403 and render empty for the one role that actually authors questions
(`questionBank.create`: TEACHER ASSIGNED) — question creation was completely blocked, not merely
degraded. Verified directly against `docs/02-roles-permissions.md`'s literal matrix before deciding
this was a wiring gap rather than a business-rule conflict requiring a product decision. Fixed by
adding `GET /v1/questions/assigned-subjects` (`QuestionController`/`QuestionService
.myAssignedSubjects`), gated by the already-correctly-scoped `questionBank.create` permission
instead of widening the denied `schoolConfig.subject.view` grant — derives the list from the
caller's real `TeacherAssignment` rows (the identical ADR-0001 join `requireTeacherAssignedScope`
already checks at save time), so the picker now only ever offers subjects the teacher can actually
save against. This also closes F9's own previously-recorded "no client-side teacher-assignment data
is reachable" Candidate/Deferred note, improving on F9's originally-planned "unconstrained" picker
design. `Level` stays unconstrained (`outOfScopeError` already handles a bad subject+level
combination). The read-only Department label now shows presence only ("Assigned to a department"),
not the resolved name, since `schoolConfig.department.view` is denied to TEACHER too and fetching a
second denied endpoint just for a label wasn't worth it. New test: `metadata-panel.test.tsx` updated
to mock the new hook.

**2b. The related Question Bank Subject filter, closed same day, requested explicitly after the
above.** `QuestionBankScreen`'s Subject _filter_ dropdown (`/teacher/question-bank`, shared with
`/hod/question-bank`) had the identical root cause via the same denied `useSubjects()` call —
initially recorded as Candidate/Deferred, then closed at the project owner's request. Couldn't reuse
2's fix directly: `QuestionBankScreen` is shared by both TEACHER and HOD routes, and the new
`/questions/assigned-subjects` endpoint is gated by `questionBank.create` — HOD doesn't hold it, so
unconditionally switching the shared component to the new hook would have traded one role's 403 for
the other's. Considered inferring the split from `useHasPermission('questionBank.create')` inside
the component and rejected it: that hook returns `false` until `/me/permissions` resolves, so gating
on it would still fire one doomed `useSubjects()` request (retried per the app's default `retry: 2`)
for every Teacher on first render. Fixed with an explicit `assignedSubjectsOnly` prop instead —
mirrors `hideImport`'s own existing precedent of "each route states its own role context statically,
before first render" — threaded through `QuestionBankScreen` (which now calls both `useSubjects`/
`useAssignedSubjects` unconditionally, exactly one `enabled`) and `RejectedQuestionsScreen`, set at
all four leaf routes (`/teacher/question-bank{,/rejected}` pass it; the two `/hod/...` routes don't,
defaulting to the unaffected full list). Both `useSubjects`/`useAssignedSubjects` gained an optional
`{enabled}` param for this. New tests in `question-bank-screen.test.tsx` (asserting the correct hook
is called with the correct `enabled` value for each mode) and `rejected-questions-screen.test.tsx`'s
existing mock extended to cover the new hook call.

**A real runtime crash found by the project owner while manually testing fix 3 below, fixed in the
same pass**: `CredentialsRevealPanel`'s Copy button called `navigator.clipboard.writeText(...)`
unguarded — the Clipboard API is only defined in a "secure context" (HTTPS, or exactly `localhost`),
and this project's own local-dev convention serves every school over plain HTTP on a
`*.localtest.me` subdomain, which is neither, so the call threw `Cannot read properties of undefined
(reading 'writeText')`. Pre-existing in the original `RevealCredentialsDialog` markup before this
session's fix 3 extracted it into a shared component — surfaced far more often once `StudentForm`'s
auto-reveal-on-create started showing this panel after every single student creation, not just an
explicit "Reset credentials" click, which is what actually triggered the report. Fixed with a
`copyToClipboard()` helper that checks for the API's existence first and falls back to
`document.execCommand('copy')` (deprecated but broadly supported, and exactly the case this exists
for), showing an inline "copy manually" hint if both paths fail rather than leaving a dead button
with no feedback. New regression test: `reveal-credentials-dialog.test.tsx` (new file — none existed
before), covering both the available-API and unavailable-API paths and asserting the click handler
never throws.

**3. No way to discover a newly-created student's password (`B6`/`F7`).** Root cause:
`StudentService.create()` (`POST /students`) never issued a password — the only way to get one was
the _separate_ "Reset credentials" action in the student directory (`RevealCredentialsDialog`), a
required extra step nothing in the create flow ever mentioned or linked to, leaving an admin with a
login ID and no way to discover a password (exactly what was reported). The identical gap existed in
the onboarding wizard's manual student-creation step (`Step09Students`) — both call the same shared
`useCreateStudent()` (`lib/onboarding/mutations.ts`). Fixed once, at the shared mutation: it now
also calls `POST /students/:id/reset-credentials` (the existing one-time-reveal primitive —
issuing "the first" password this way is behaviourally identical to issuing a replacement one;
there is no separate "initial issuance" endpoint) immediately after creation+enrollment, returning
the plaintext under an additive `credentials` field. No backend change was needed — this is a pure
orchestration fix reusing an already-shipped, already-tested endpoint. `RevealCredentialsDialog`'s
inline markup was extracted into a shared `CredentialsRevealPanel` (used by three call sites now,
not duplicated). `StudentForm`'s create flow shows the panel and blocks `onSaved()` (which closes
the dialog) until the admin explicitly clicks "Done" — the one-time reveal can't be missed by an
auto-closing dialog; `students-screen.tsx`'s dialog now remounts `StudentForm` by `key` on every
open, so a stale credentials panel can never leak into the next "Add student" session.
`Step09Students` (onboarding, which supports adding several students in a row) shows the same panel
as a dismissible, non-blocking callout instead, overwritten by the next student's credentials or
dismissed explicitly. New tests: `student-form.test.tsx` (new file — none existed before),
`step-09-students.test.tsx` (new case).

**Verification (completed in a follow-up pass, once the repository's shared state allowed it).**
By the time this pass ran, `B10` had landed and the previously-blocking concurrent work was no
longer an obstacle: `apps/api`'s full `tsc --noEmit` (whole package, not just the touched files) is
clean, and `pnpm generate` was no longer needed as a blocker since the new
`GET /questions/assigned-subjects` route's types resolved correctly once the tree stabilized.
`eslint --no-cache` is clean (0 errors, 0 warnings) across every file this pass touched, both
`apps/web` and `apps/api` — one real, if minor, issue this caught and fixed along the way:
`copyToClipboard()`'s `catch { copied = false; }` was a genuine no-op (`copied` is already `false`
in that branch, since `execCommand`'s assignment never completes before throwing) — flagged by
`no-useless-assignment`, fixed by replacing the reassignment with an explanatory comment.

`apps/web`: all 10 touched/new test files green (46/46) — `metadata-panel`, `question-bank-screen`,
`rejected-questions-screen`, `question-editor-flow.integration` (see below),
`reveal-credentials-dialog`, `student-form`, `students-screen`, `step-09-students`, `activate-form`,
and the Subscription page. One real regression caught and fixed in this same pass, not by a
separate review: `question-editor-flow.integration.test.tsx` still mocked the _old_
`GET /academics/subjects` endpoint — `MetadataPanel`'s own fix (above) had already moved the
Subject picker to `useAssignedSubjects`/`GET /questions/assigned-subjects`, so the test's mock never
matched the real call and the whole screen failed to render (`<body><div /></body>`, no accessible
`Mathematics` option). Missed in the original pass because that integration test wasn't in the
file list checked at the time; caught here by actually running the suite rather than assuming the
earlier line-by-line review was exhaustive. Fixed by updating the mock to the new endpoint.

`apps/api`: full backend regression coverage was added for both server-side fixes, neither of which
had any test before this pass (a real gap left by the original review-only pass, closed here) —
`question-lifecycle.integration.test.ts` gained a case for `GET /questions/assigned-subjects`
(the caller's real assignments only; an empty list, not the whole-school subject list, for an
unassigned teacher; 403 for a role without `questionBank.create`), and `platform.integration
.test.ts` gained a new `describe` block (3 cases) for the deactivation fix: redemption rejected
with `SCHOOL_ACCESS_DEACTIVATED` (403 — not 409; confirmed against `error-codes.ts` rather than
assumed) even for a grant issued _before_ deactivation; issuing a fresh subscription or activation
key against a deactivated school refused with `CONFLICT` (409); and, proving the check is
deliberately narrower than a full access-gate check, `SUSPENDED` (unlike `DEACTIVATED`) still
allows issuing a fresh subscription. Both files' full run: 2 files, 38 tests, all green, against
real Postgres/Redis/MinIO.

No schema change, no ADR involved, no roadmap phase status changed. Project state remains
_Implementation (B11 complete)_ — these are gap closures on already-complete phases (`B3`/`B6`/`B7`/
`B8`/`F7`/`F9`), not a new phase. **Next: `B12 — Exam Activation & Control`**, unchanged.

### 2026-09-03 — `B10` complete: Audit & Notifications, including frontend wiring

Requested explicitly: start `B10`. Followed the working-rules checklist: read `07 §11.1`–`§11.2`,
`03 §57`, `05 §56`–`57`, `06 §63`–`64`, ADR-0012 and ADR-0019 in full, and the B10 roadmap phase —
then planned in a dedicated plan-mode pass (three parallel research agents covering the roadmap/
spec, the real existing notification/audit infrastructure, and this codebase's own established
module/migration/testing conventions) before writing any code, per this project's own precedent for
a phase of this size. No gating ADR is unresolved. Built after `B11` (no gating dependency between
the two — `B10` was simply deferred behind it earlier in this session).

**Two decisions confirmed with the project owner before implementation, both load-bearing on the
final design:**

1. **`GET /v1/platform/audit`'s cross-school query is served by a new, narrowly-scoped privileged
   Postgres role (`atlas_audit_reader`)** — not by iterating every school's RLS-scoped connection
   one at a time (the mechanism B3's worker sweep and `PlatformMetricsService` already use for other
   cross-school jobs, which doesn't compose with real filtering/pagination for a query like this
   one).
2. **Frontend wiring was included in this same pass** — F2's `NotificationPanel` and F3's three
   audit placeholder screens get wired to the new real endpoints, even though `B10` has no dedicated
   future frontend phase in the roadmap (F2/F3 are both already complete, and no later phase is
   named as their consumer — `roadmap-index.md` §1's own note on this is now updated).

**Canonical action vocabulary** (`packages/domain/src/audit/vocabulary.ts`): the ~55 already-
shipped, correctly-named `AuditEvent.action` strings across academics/users/exams/platform/imports/
question-review were deliberately **not** mass-renamed to force a superficial match against `07
§11.1`'s own illustrative (explicitly non-exhaustive) example list — that would have been an
unrelated broad refactor across a dozen already-tested files (`AGENTS.md` §15). Two small, scoped
exceptions, both real near-misses of a canonical name for the _identical_ event, not a cosmetic
rename of a distinct one: `question-review.service.ts`'s `QUESTION_REVIEW_APPROVED`/
`QUESTION_REVIEW_REJECTED` renamed to `QUESTION_APPROVED`/`QUESTION_REJECTED`; `student-enrollment
.service.ts`'s `enroll()` now distinguishes a fresh enrollment (`STUDENT_ENROLLED`) from a class move
(`CLASS_CHANGED`), previously always the former regardless. Every other near-miss
(`STUDENT_DEACTIVATED`/`TEACHER_DEACTIVATED`/`MODERATOR_REMOVED` vs. `USER_DEACTIVATED`;
`TEACHER_ASSIGNMENTS_REPLACED` vs. `TEACHER_ASSIGNED`) is mapped via an **alias registry**, not
renamed — collapsing them would lose real distinctions this table's own per-role naming already
correctly preserves (`HOD_REMOVED` only ends a role assignment, never touches `User.status`, and is
deliberately excluded from `USER_DEACTIVATED`'s alias set). `AuditActionRegistry`/
`AuditVocabularyCoverageService` enforce this at the application layer, not the DB column type
(which stays free-form `VarChar(64)` — a closed DB enum would fight this codebase's own pace of
adding new actions on nearly every phase). The coverage service runs on every app boot (real server
and every integration test), asserting every `LIVE` canonical action has ≥1 registered alias and
that the `DEFERRED` set is exactly the six actions with no producer yet — the merge-blocking half of
DoD item 1, with no separate CI step needed.

**`atlas_audit_reader`**: not `BYPASSRLS` (not scopable to one table; would exempt the role from
every other RLS-protected table). Instead: `audit_events_isolation` (B2's existing policy) has no
`TO` clause, so it applies to every role via `PUBLIC`; a second, additive, permissive `FOR SELECT`
policy scoped `TO atlas_audit_reader` with `USING (true)` makes every school's rows visible to that
role alone, without touching `atlas_app`'s own evaluation of the isolation policy at all — Postgres
combines multiple permissive policies with `OR`. No grant on any other table, no `INSERT`/`UPDATE`/
`DELETE` grant ever. The role itself (cluster-wide, not database-scoped) lives in
`infra/postgres/init.sql` and CI's hand-written bootstrap step, never in a migration — mirroring
`atlas_app`'s own precedent exactly (`grep -rn "CREATE ROLE" packages/db/prisma/migrations/` returns
zero hits). `PlatformAuditReaderService` owns its own separate `PrismaClient`
(`DATABASE_AUDIT_READER_URL`, a new required env var), never the shared `prisma` singleton — no
`withTenant` call site is reachable on it at all, a structural fact, not a convention to remember.
Verified directly against a real local Postgres via `psql`: the role sees rows across two schools in
one query with `app.current_school_id` never set; is rejected with `permission denied` on any
`INSERT`/`UPDATE`/`DELETE`; is rejected with `permission denied` reading any other table (`schools`
tested directly).

**A real cross-module DI bug found only by a real compiled boot** (the same class of gap B1/B2/B4
each hit once in their own phases): `PlatformAuditReaderService`/`PlatformAuditController`
(`GET /v1/platform/audit`) need `PlatformAuthGuard`'s own DI graph — an unexported,
`PlatformModule`-internal provider — so they live registered in `PlatformModule`, not
`OperationsModule` (which already imports `OperationsModule`... `PlatformModule` does, and
`OperationsModule` importing `PlatformModule` back would be circular). A second, smaller instance of
the identical class of bug: `OperationsModule` gained `@Authorized`-decorated controllers
(`AuditController`, `GET /v1/audit`) without importing `IdentityModule` — `AuthGuard`'s own
constructor dependency (`SessionService`) is only exported from there. Both fixed by adding the
missing import — the standard pair every `@Authorized`-using module already carries.

**Notification center** (`apps/api/src/modules/notification-center/`, new peer module — distinct
from the existing, unchanged `apps/api/src/notifications/` ADR-0019 channel/registry shim):
`GET /v1/notifications` (paginated, includes `unreadCount`), `POST /v1/notifications/:id/read`,
`POST /v1/notifications/read-all` — all scoped to `{schoolId, recipientUserId: self}`, no custom
scope resolver needed. **Retry-queue architecture**: the out-of-band dispatch consumer lives in
`apps/api` (`notification-dispatch-worker-bootstrap.ts`, started only from `main.ts`'s real
`bootstrap()`, never via Nest's module lifecycle — mirroring B7's `import-worker-bootstrap.ts`
exactly, for the identical reason: a live consumer must never start during an integration test that
boots `AppModule` directly), reusing the _one_ shared `NOTIFICATION_CHANNEL`/`TemplateRegistry`
every module in that process already registers templates against, rather than `apps/worker`'s own
separate, independent registry. `apps/worker`'s subscription-expiry sweep became a cross-process
_producer_ onto this same queue (`packages/notifications/src/dispatch-queue.ts`'s new shared
contract) — both processes connect to the same Redis, BullMQ's producer/consumer split is exactly
this. `apps/worker/src/queues/templates.ts`'s own `registerWorkerTemplates` function (a second,
hand-duplicated copy of the subscription-warning template's content) became dead code and was
removed — only the template _name_ remains, since that process no longer renders any template
itself.

**Two real bugs found and fixed in the same pass, in already-shipped B3 code**
(`apps/worker/src/queues/subscription-expiry.queue.ts`): (1) an uncaught exception anywhere in the
per-school sweep loop previously aborted the _entire_ sweep for every other school — now wrapped
per-school, log-and-continue; (2) `lastWarningThresholdDays` was set unconditionally after the send
attempt, regardless of whether it succeeded — a transient failure silently and permanently lost that
threshold's warning forever. Now set only on a _successful enqueue_ to the retry queue (not
delivery, which BullMQ's own retry/backoff now owns), so a failure to even hand the job off is
retried on the next sweep tick instead of being marked "handled." Both proven by two new dedicated
regression tests, forcing each failure mode deterministically (a rejecting fake `enqueueDispatch`; a
`vi.spyOn` on `prisma.school.findUniqueOrThrow` that only misbehaves for one specific school).

**A new, buildable-now notification producer**: `apps/worker/src/queues/unassigned-students-digest
.queue.ts` — "students missing a class assignment" digest for Moderator (05 §57/04 §64), needing no
unbuilt phase's data (`StudentEnrollment`/`ClassGroup`/`AcademicSession` all already exist).
Anti-spam ("digest, not spam"): before creating a new notification for a Moderator, compares the
current unassigned count against their most recent one of the same type — only notifies on a
genuine change, reusing the already-indexed `[schoolId, recipientUserId, status, createdAt]`, no new
schema needed.

**A real, broad consequence of the append-only trigger, not a hypothetical**: `AuditEvent.schoolId`
cascades on `School` deletion, and the ~55 action-emitting call sites across nearly every module
meant most integration test files that create a school and exercise real behaviour against it now
throw in their own `afterAll` teardown. Found by running the full integration suite once after the
trigger migration landed (not guessed from static analysis) — 12 files failed teardown on that run;
a broader grep found 20 total carrying the risky pattern, all fixed the same way (plus three
pre-existing unguarded explicit `auditEvent.deleteMany` calls). Fixed with one new shared test
helper per compilation root — `tests/support/safe-delete-schools.ts` for `tests/` files, a duplicate
at `apps/api/src/test-support/safe-delete-schools.ts` for `apps/api/src/**` files
(`apps/api/tsconfig.json`'s `rootDir: "./src"` means the two can't share a literal import — the same
"convention reuse, not literal code sharing" precedent as `apps/worker`'s own duplicated template
content). The full integration suite (251 real assertions) was green both before and after this
sweep — every failure was teardown-only, zero regressions in actual behaviour. `tests/tenancy/rls
.integration.test.ts` gained `Notification` in the existing shared B5–B9 block (no trigger, no
special handling needed) and a **new, dedicated, isolated** describe block for `audit_events` — a
more severe reason than B11's own precedent for doing the same: this table's trigger reaches the
shared block's own teardown and, by extension, most other integration test files in the repo, not
just one fixture's parent-state requirement.

**Frontend**: `apps/web/lib/notifications/{queries,mutations}.ts` (a flat 30s poll, not
`lib/imports/queries.ts`'s status-conditional backoff — there's no terminal-state concept for a
notification feed); `NotificationPanel` rewritten with real loading/error/empty states and an
unread-count badge, replacing F2's own "not yet available" stub; a new shared
`components/platform/audit-log-table.tsx` (props-driven — `fixedSchoolId`/`showFilters`/`compact` —
mirroring `SchoolDetailTabs`'s own "one component, mode via props" convention) consumed by all three
F3 destinations (`/admin/audit`, and the per-school Audit/Activity tabs — Activity in `compact`
mode: no filters, a smaller page, a "view full audit log" link instead of its own pager). All three
always consume `GET /v1/platform/audit`, never `GET /v1/audit` — Software Admin has no school
session, so the school-scoped endpoint is structurally unreachable from anywhere inside `/admin/*`.
**`GET /v1/audit` therefore ships with no frontend consumer in this pass** — a deliberate, documented
gap (both roadmap files' own text name only `GET /v1/platform/audit` for F3), not a silent omission.
A real, if narrow, defensive-coding gap found only once `NotificationPanel` became part of every
shell's shared chrome: a pre-existing shell test that blanket-mocks `apiClient.GET` for its own
unrelated endpoint (`/me/permissions`) now also hands that same wrongly-shaped payload to
`NotificationPanel`'s own query — fixed by reading `data?.items ?? []` rather than assuming a
non-pending, non-error query always resolved to the exact typed shape (true in real usage, not
guaranteed against a test double that doesn't know about a component's later-added dependency).

**Testing**: `apps/api` — `audit.integration.test.ts` (13 tests: per-role `GET /v1/audit` scoping
including the HOD two-hop department join, cross-tenant denial, action filtering, `GET /v1/platform
/audit` cross-school + schoolId-filter + Software-Admin-only reachability, and the append-only
trigger proven two ways — grant-level rejection via `atlas_app`, and trigger-level rejection via the
schema owner, independently); `notification.integration.test.ts` (5 tests: own-notifications-only
retrieval, cross-tenant denial, mark-read, cross-user mark-read as a scoped no-op not an error,
read-all scoped to the caller); `audit-action.registry.test.ts`/`audit-vocabulary-coverage.service
.test.ts` (13 unit tests). `apps/worker` — `unassigned-students-digest.integration.test.ts` (4
tests) plus the two new `subscription-expiry.integration.test.ts` regression cases (8 tests total in
that file, up from 6). `apps/web` — `notification-panel.test.tsx` (6 tests, rewritten — the old
placeholder-text assertion is gone), `audit-log-table.test.tsx` (10 tests), one test file per F3
route (3 tests). Full pipeline green throughout, run repeatedly after every fix: `pnpm lint && pnpm
typecheck && pnpm build` at the monorepo root; the full `apps/api` integration suite (251/251 real
assertions across 34 files — 3 pre-existing, unrelated environment-timing flakes in the BullMQ
import-commit path, already documented as a known issue in B9's own Change Log entry, predating
`B10` entirely and never touched by any of this phase's own changes); the full `apps/web` suite (all
green after the `NotificationPanel` defensive fix); `pnpm generate` (`audit.v1`/`notification.v1` —
5 new routes — published in `apps/api/openapi.json`/`packages/contracts`); `pnpm generate
:permission-table-doc` (154 rows, up from 151 — the two new `notification.*` rows; `audit.viewLog`'s
MODERATOR grant finalized from a placeholder, matching `questionBank.archive`'s own precedent).

**Honestly deferred, not silently dropped** (full list in `backend-roadmap.md`'s B10 section):
result-published/exam-opened/makeup-granted notification producers (owned by B15/B12/B16
respectively — the `NotificationType` enum already declares all three so those phases only need a
producer, not a migration); `AUDITED_READ_NOTE`'s broader read-audit emission mechanism (only ~5
live `@AuthorizedPlatform` GET routes exist as of B10 — building a shared mechanism now for a
handful of live routes was judged premature; each future phase wires its own call site); audit
export/SIEM (B20 candidate); retention/archival policy (M-14/ADR-0028/B20's job explicitly — this
phase only guarantees nothing is ever deleted, never decides when to archive); `GET /v1/audit`'s own
frontend consumer (no School-workspace "my activity" screen is in scope anywhere yet).

`docs/roadmaps/backend-roadmap.md`'s B10 section gained status `COMPLETE`, every DoD item checked
with detail, a full "Implementation notes" subsection, and an expanded Deferred items list.
`docs/roadmaps/frontend-roadmap.md`'s F2 (item 5) and F3 (items 4/9, Deferred items) sections were
updated to record the real data now wired in, closing what had been honestly-flagged partial DoD
items pointing at this exact phase. `docs/roadmaps/roadmap-index.md`'s version, Current State, and
the stale "B10 has no dedicated frontend phase" note were all updated.

Project state moves from _Implementation (B11 complete)_ to _Implementation (B10 complete)_.
**Next: `B12 — Exam Activation & Control`** on the backend critical path — every backend phase up
to the exam engine itself is now complete. A future `F11` (Exam Builder & Readiness UI) remains
open whenever the frontend/backend phase-pairing default is next prioritized.

### 2026-09-03 — `B10` gap closure: thorough implementation review, four fixes

Requested explicitly, same day as `B10` itself: a thorough review of the just-shipped implementation
looking for bugs, not new scope. Four real issues surfaced — three from the review, one more found
only while verifying the review's own fixes by actually running the affected suites. No product/
architecture decision needed for any of them.

1. **`contract-drift` CI job would fail on its next run.** The B10 migration is the first in this
   repo's history to contain live `GRANT`/`REVOKE` statements against `atlas_app`/`atlas_audit_reader`
   (every earlier migration only named those roles in comments) — but the `contract-drift` job's
   Postgres service container has no role-bootstrap step at all (GitHub Actions `services:` containers
   can't mount `infra/postgres/init.sql`, and unlike the `integration` job, this one never ran the
   by-hand equivalent). `REVOKE UPDATE, DELETE ON "audit_events" FROM atlas_app` would fail with
   `role "atlas_app" does not exist`. Fixed by adding the identical "Bootstrap atlas_app role" `psql`
   step the `integration` job already has, before this job's own `db:migrate:deploy`.
2. **The notification bell 401s forever for every Software Admin.** `NotificationPanel` was mounted
   unconditionally in `ShellChrome` (shared by `SchoolAppShell` and `PlatformAppShell`), but it only
   ever calls the school-session-scoped `GET /v1/notifications` — there is no platform-scoped
   notifications concept anywhere in this schema (`Notification` is school-owned/RLS-scoped, and no
   producer ever writes one for a Software Admin). This is the exact bug class this same codebase
   already found and fixed once for the sidebar nav (`usePlatformNavigation`/`GET /platform/auth
/permissions`), reintroduced here for the bell. Fixed by giving `ShellChrome` a `showNotifications`
   prop — `true` for the school variant, `false` for the platform one — rather than building a
   platform-notifications backend concept that doesn't exist and that no DoD item asked for; the same
   "don't ship a control that can't work for this session" doctrine `ProfileMenu` already applies to
   self-service password change. New regression assertions in `app-shell.test.tsx` (both variants).
3. **`grantAppRole()` silently undid the new `audit_events` grant-level REVOKE.** `tests/support
/run-prisma.ts` calls `grantAppRole()` (a blanket `GRANT ... ON ALL TABLES IN SCHEMA public TO
atlas_app`) after every `migrate` command — including from `rls.integration.test.ts`'s own
   `beforeAll` hooks, which in CI's `integration` job run against the exact same database
   `audit.integration.test.ts` uses (`DATABASE_URL_TEST` == `DATABASE_URL` there), with no ordering
   constraint between the `apps/api` and `tests` packages' `test:integration` tasks. This is the exact
   footgun B2's own migration comment already identified and chose not to fight for this same table —
   B10 reintroduced it. Confirmed live against the real dev database: a manual blanket grant restored
   `atlas_app`'s UPDATE/DELETE on `audit_events`, and `grantAppRole()` (unfixed) left it restored. Fixed
   by having `grantAppRole()` itself re-assert `REVOKE UPDATE, DELETE ON "audit_events" FROM atlas_app`
   immediately after its own blanket grant (wrapped in a `DO $$ ... EXCEPTION WHEN undefined_table`
   guard, for a database migrated only up to a pre-B10 state) — re-verified live: the same manual grant
   followed by the real `grantAppRole()` call now leaves `atlas_app` back at `SELECT, INSERT` only. The
   trigger itself enforced real immutability throughout regardless (defense-in-depth, ADR-0023's own
   convention) — this was a test-reliability/CI-correctness gap, not a security hole.
4. **Found only while verifying fix 3, not by the original review**: `tests/tenancy
/rls.integration.test.ts`'s own original B2-era `audit_events` describe block (predating B10's own
   _new_, dedicated one) still had an unguarded `owner.auditEvent.deleteMany(...)`/`owner.school
.deleteMany(...)` teardown — missed by the ~20-file `safeDeleteSchools` sweep because it wasn't
   found by grepping for the sweep's own pattern; it surfaced immediately the first time the file was
   actually run end to end after this pass's fixes. Fixed the same way as every other affected file:
   `.catch(() => undefined)` on both calls.

Verification: `apps/api`'s `audit.integration.test.ts`/`notification.integration.test.ts` (18/18),
the full `tests/` integration suite including a real `migrate reset` cycle (97/97), the full
`apps/web` shell test suite plus a full-suite run (561/564 — the 3 failures reconfirmed as this
project's own already-documented full-suite worker-pool/resource-contention flakiness, passing
cleanly in isolation, in files this pass never touched), and monorepo-wide `pnpm lint && pnpm
typecheck && pnpm build` (16/16, 16/16, 9/9). Fix 3 was independently confirmed **live** against the
real dev Postgres, not just by the test suite: a manual blanket grant followed by a call to the real,
rebuilt `grantAppRole()` left `atlas_app` at `arwd` → `ar` (UPDATE/DELETE gone) on `audit_events`, per
`\dp audit_events`. `apps/api`'s own full integration suite was also re-run in full and separately
confirmed, by temporarily `git stash`ing every fix, that its 5 remaining failures (all in the
BullMQ-backed import-commit path — `imports.integration.test.ts`, `import-1500-rows
.integration.test.ts`) reproduce identically on the unmodified, pre-fix code — a pre-existing,
already-documented environment issue (see B9's and B11's own Change Log entries for the same class),
not a regression from this pass.

No schema change, no permission-table change, no product-behaviour change beyond correcting the four
bugs themselves, no ADR involved, no roadmap phase status changed. Project state remains
_Implementation (B10 complete)_ — this was a same-phase gap closure, not a new phase. **Next:
`B12 — Exam Activation & Control`**, unchanged.

### 2026-09-04 — `F11` complete: Exam Builder

Requested explicitly: start `F11`. Followed the working-rules checklist: three parallel research
passes (F11's own roadmap/spec/ADR coverage — `04 §41`–`§44`, `05 §19`–`§24`/`§71`–`§72`, ADR-0006/
ADR-0013/ADR-0029's exact "Required changes" text for this phase; the real, as-shipped B11
`exams.v1` contract — routes, DTOs, permission grants, error codes, not just the originally-planned
shape; existing frontend conventions to reuse — F9's create-then-patch autosave engine, F6/F9's
`basePath`-prop multi-role-root pattern, F10's mandatory-reason dialog), then a Plan agent, then
direct verification reads (the permission table's `assignments.view`/`exam.*` rows, `nav-model.ts`'s
current per-role entries, `GET /academics/context`'s response shape) before writing any code — per
this project's own precedent for a phase of this size.

**Confirmed scope extension, put to the project owner rather than assumed, per `AGENTS.md` §3.**
F11's own literal roadmap route table is Teacher-only, but School Admin (`04 §16`), Moderator
(`04 §27`), and HOD (`04 §33`) each have a spec'd exam-oversight screen, and B11's permission table
already grants all three full SCHOOL/DEPARTMENT-scoped rights (view, cancel, archive, delete-draft)
over an existing exam — with no future frontend phase named to close this gap later, unlike F9's
identical situation, where F10 was already planned to pick it up. **Confirmed: build the oversight
screens now**, reusing `ExamListScreen`/`ExamDetailScreen` via the established `basePath` prop
(F6/F9's own precedent) rather than four separate implementations. A second decision, made directly
rather than asked, mirroring `hideImport`/`assignedSubjectsOnly`'s own precedent for this class of
deliberate narrowing: oversight roles get view + Cancel/Archive/Delete-draft only, **never** the
wizard's Details/Questions/Rules edit surfaces, even though the permission table's grants technically
cover those too — co-authoring another teacher's in-progress draft through a UI built around one
author's autosave/local-draft-state assumptions is a materially different, unbuilt feature, not a
permission-gating nuance.

**Delivered** (`apps/web/components/exams/*`, `apps/web/lib/exams/{queries,mutations,validation,
navigation,error-utils}.ts`): a multi-route wizard (`ExamWizardShell` + one component per step —
`ExamDetailsForm`/`ClassPicker`, `ExamQuestionSelector`, `RulesForm`, `ExamReviewScreen`) at
`/teacher/exams/{new,:id/edit,:id/questions,:id/rules,:id/review}`, plus `ExamListScreen`
(7-status-tab + 6-filter list, `DataTable`-backed) and `ExamDetailScreen` (the oversight read view)
mounted at all four role roots — `/teacher/exams`, `/school/exams`, `/moderator/exams` (a new
`nav-model.ts` entry — Moderator held real `exam.*` grants with no nav item pointing at them, the
identical gap F6 already closed for HOD's `schoolConfig.*`), `/hod/exams`. `ExamDetailsForm` ports
`QuestionEditorScreen`'s (F9) create-then-patch autosave engine wholesale — `POST /exams` needs every
field at once, so the Details step buffers client-side (localStorage resilience net) until
`computeExamCreateGate` passes, then debounces `PATCH /exams/:id` — first save redirects into
`/questions`, not `/edit` (the roadmap's own step order). `ExamQuestionSelector` is a two-pane
picker: a paginated approved-only pool (`GET /exams/:id/available-questions`, `DataTable`) and a
locally-buffered selected list (add/remove/up-down-reorder — no drag-and-drop library, per
`AGENTS.md` §9 — marks editable per row, defaulted from the revision per ADR-0029), saved via one
full-replace `PUT /exams/:id/questions`. `ReadinessChecklist` is genuinely new — no prior art existed
anywhere in this codebase for an itemised pass/fail checklist UI — rendering all 15
`ExamReadinessCheckCode` values with a static `READINESS_CHECK_STEP` code→step resolution-link map
(DoD item 7); `SCHOOL_ACTIVE`/`SESSION_ACTIVE`/`TERM_ACTIVE` deliberately show no link (no
in-builder resolution exists for platform/academic-structure state). A failed "Save as Ready"
repaints the checklist directly from the `409 EXAM_NOT_READY` response's own `error.details.checks`
rather than a second `GET /readiness` — satisfying the roadmap's "never cached stale" requirement on
the failure path without an extra round trip; `useExamReadiness` itself pins `staleTime: 0` +
`refetchOnMount: 'always'` for the success path. `ExamCancelDialog` forks F10's
`ReviewDecisionDialog` (mandatory non-empty reason, matching `CancelExamDto`); Archive/Delete-draft
reuse `ConfirmActionDialog` directly, which gained one new optional `describeError` prop (defaulting
to its existing `describeAcademicsError`) so a non-academics domain can plug in its own error
renderer without forking the component.

**ADR-0006 compliance, a real addition beyond `04 §43`'s own literal Rules mockup**: `RulesForm`
exposes `accessMode` (OPEN_TO_ELIGIBLE / EXPLICIT_AUTHORIZATION) in plain language — "Open to every
eligible student in the targeted classes automatically" / "Only students explicitly authorized for
this exam (set up later)" — never the raw enum tokens, per that ADR's own "Required changes: F11:
access-mode selection in exam rules, explained in plain language" line. `navigationPolicy` renders
as the confirmed single three-value enum (FREE/SEQUENTIAL_NO_REVISIT/SEQUENTIAL_WITH_REVISIT), not
`04`'s literal binary "Allow Navigation" toggle. `examType` is a free-text input with a `<datalist>`
of common suggestions (CA/Test/Mid-Term/Examination/Mock), matching the confirmed product decision
already on record.

**Session/term are auto-populated from the caller's current academic context, never a free
picker** — `schoolConfig.session.view`/`.term.view` are both `denied()` for TEACHER (the same class
of gap F6 found for class/subject), and the readiness checklist's own `SESSION_ACTIVE`/
`TERM_ACTIVE` checks require UPCOMING or CURRENT regardless, so a free historical pick could only
ever fail readiness. `GET /academics/context` (already `SELF`-graded for every role since B5)
supplies the CURRENT session/term at creation; in edit mode the exam's own already-set values are
shown from the loaded exam and never resent in a `PATCH`. Honestly recorded limitation: a teacher
cannot build ahead for an UPCOMING term in this pass, only the CURRENT one.

**Two small, confirmed additive backend gap-closures, both found only by building the real frontend
consumer against B11's already-complete, already-frozen contract — not anticipated in the original
plan, mirroring F3/F6/F7/F9's own precedent for this class of discovery:**

1. **`GET /v1/teachers/me/assignments`** (`apps/api/src/modules/academics/teacher-assignment
.{controller,service}.ts`) — the Details step's `ClassPicker`/subject picker had no data source:
   `schoolConfig.class.view`/`.subject.view` are both `denied()` for TEACHER, and no endpoint let a
   teacher self-discover their own `TeacherAssignment` rows without already knowing their own
   `teacherProfileId`. Closed by resolving the caller's profile from `req.user.membershipId`
   server-side, returning `{classSubjectId, academicSessionId, classId, className, level, arm,
subjectId, subjectName}[]` for their `ACTIVE` assignments — no pagination, reuses the already-
   `SELF`-graded `assignments.view` permission, zero new permission rows. Retires the exact
   Candidate/Deferred note the 2026-09-03 gap-closure entry (during F9's Subject-picker fix) left
   open: "a narrow `GET /me/teacher-assignments`-style route."
2. **`QuestionListItemResponseDto` gained `currentRevisionId: string | null`**
   (`apps/api/src/modules/questions/{dto/question.dto.ts,question-mappers.ts}`) — `GET /exams/:id/
available-questions` returns this DTO, but its own `id` field is the parent `Question`'s id, not
   the revision id `ExamQuestionInputDto.questionRevisionId` actually needs to bind a question. The
   Prisma query already fetched it (`currentRevision: { include: QUESTION_REVISION_INCLUDE }`, a
   full `include` that already returns every revision scalar including `id`) — only the mapper and
   the `QuestionForListItem` projection type were missing the field. Purely additive: no schema
   change, no permission-table change, F9's own already-shipped Question Bank consumers of this same
   DTO are unaffected. A dedicated regression test in `exam-builder.integration.test.ts` proves the
   real round trip (browse → bind by `currentRevisionId` → confirm the bound `ExamQuestion
.questionRevisionId` matches) — deliberately self-contained (authors its own fresh approved
   question) after an initial version relying on the suite's shared `approvedRevisionId` fixture
   failed for an instructive, non-bug reason: a _different_, legitimate test elsewhere in the same
   file advances that shared question to a second approved revision, correctly making the original
   revision id no longer the Question's _current_ one (and therefore invisible to
   `available-questions`, which only ever surfaces the current revision) — real product behaviour,
   not something worth fighting in a test fixture.

**A real stale-closure hazard found and fixed during implementation, not by a separate review
pass**: the first draft of `useUpdateExam(id)` baked the exam id in at hook-creation time. Since
`ExamDetailsForm`'s autosave engine transitions from "no exam yet" to "a real exam id" within one
component lifetime — the exact shape of hazard F9's `useUpdateRevisionMutation` was already built
call-time-parameterized to avoid — a stale render's closure could keep targeting a placeholder id
after the real one existed. Fixed by making `useUpdateExam()` call-time-parameterized
(`mutate({id, body})`), matching F9's own established precedent exactly, before it ever shipped.
Separately, `ExamQuestionSelector`'s initial design called `setState` synchronously inside a
load-effect (a real `react-hooks/set-state-in-effect` lint error, not a warning) — fixed by
splitting into an outer loading/error gate and an inner, `key`-remounted child whose `useState` lazy
initializer captures the loaded exam's selection exactly once, with no effect at all, rather than
suppressing the rule.

**Two real, pre-existing gaps not fixed opportunistically, recorded as Candidate/Deferred instead
(`AGENTS.md` §14):** `ExamWizardShell`'s step-progress nav links live in a sibling component with no
visibility into a step's own live dirty state, so clicking Details/Questions/Rules/Review from the
step strip while something is unsaved does not intercept the way an explicit navigation elsewhere on
the same step does (browser refresh/close is still guarded) — would need dirty-state lifted into a
shared context across every step. `ExamStatusTabs` shows no per-tab count, unlike
`QuestionStatusTabs`'s real ones — no `exam` counts endpoint exists; not blocking any DoD item.

**Testing**: 16 new component tests across 4 files — `exam-cancel-dialog` (forked from
`review-decision-dialog.test.tsx`'s own cases), `exam-readiness-checklist` (the phase's highest-value
test given no prior art existed for this UI shape: mixed pass/fail rendering, resolution links
present only where `READINESS_CHECK_STEP` maps one, never for the three platform/structure codes,
none at all when `interactive={false}`), `exam-detail-screen` (proving the oversight scoping decision
directly — mocked grants show only Cancel/Archive, never a wizard-edit control), `exam-list-screen`
(proving one `ExamListScreen` correctly varies its Teacher column and "New exam" affordance by
`scope`/`basePath` across role roots). One pre-existing `nav-model.test.ts` case (pinning Moderator's
nav labels literally against `04 §20`) was updated with an inline comment recording the intentional
deviation, mirroring HOD's own identical F6-era precedent in the same file. Backend: one new
integration test in `exam-builder.integration.test.ts` (the `currentRevisionId` round trip) and one
new case in `teacher-assignment.integration.test.ts` (`GET /teachers/me/assignments`).

Full pipeline green throughout, run in full after every fix: `apps/api` — `pnpm lint && pnpm
typecheck`, the full integration suite (`teacher-assignment`, `question-lifecycle`, `exam-builder`,
all re-confirmed with zero regression), `pnpm generate` (openapi.json + `@atlas/contracts`
regenerated for both the new route and the new field before any frontend code was written against
them), `pnpm generate:permission-table-doc` (152 rows, confirmed unchanged — both gap-closures reuse
existing grants). `apps/web` — `pnpm lint && pnpm typecheck && pnpm test` (586/586, up from 570) and
`pnpm build` (`next build --webpack`, confirming the full intended 14-new-route table across all four
role roots — no conflict between `/teacher/exams/new` and `/teacher/exams/[id]`). Monorepo-root
`pnpm lint && pnpm typecheck && pnpm build` (16/16 turbo tasks each).

`docs/roadmaps/frontend-roadmap.md`'s F11 section gained status `COMPLETE`, every DoD item annotated
with what's real and file references, a full "Implementation notes" subsection covering the scope
extension and every decision above, and an expanded Deferred items list. Its own phase-tracker tables
(two, both already stale for F5–F10 before this pass) were corrected to `COMPLETE` for F5 through
F11 while in the area, a pure documentation-accuracy fix mirroring B9's own precedent for the
identical class of staleness. `docs/roadmaps/backend-roadmap.md`'s B11 section gained a
"Post-completion gap closure" note for both additive backend changes. `docs/roadmaps/
roadmap-index.md`'s version, Current State, and Immediate Next Actions were all updated to record
`F11` complete — every frontend phase through `F11` is now closed out.

Project state moves from _Implementation (B10 complete)_ to _Implementation (F11 complete; every
frontend phase through F11 closed out)_.
**Next: `B12 — Exam Activation & Control`** on the backend critical path (`Gate 1 ADRs → B0 → B1 →
B2 → B3 → B5 → B6 → B8 → B9 → B11 → B12 → B13 → …`) — the phase this session's own earlier research
already flagged as entering the roadmap's highest-risk segment (`B13`/`B14` carry 8 of the 18
BLOCKER audit findings and six gating ADRs). A future `F12` (Exam Control Center) remains open once
`B12` ships and the frontend/backend phase-pairing default is next prioritized.

### 2026-09-04 — `F11` gap closure: thorough implementation review, four fixes

Requested explicitly, same day as `F11` itself: a thorough review of the just-shipped implementation
looking for bugs, not new scope. Read every F11 file end to end rather than sampling. Two real,
substantive issues surfaced, plus two smaller ones found while fixing them — no product/architecture
decision needed for any of them; no schema, permission-table, or backend change.

1. **The class/subject pickers never filtered by academic session — `MyTeacherAssignmentEntryDto
.academicSessionId` (added specifically for this same phase's own backend gap-closure) was never
   actually used.** `ClassPicker`/`ExamDetailsForm`'s Subject dropdown filtered only by
   `subjectId`, not `academicSessionId` — and since session-rollover automation (`B19`) doesn't
   exist yet, an `ACTIVE` `TeacherAssignment` from a prior academic session never automatically
   ends. A teacher holding one could see and select a stale-session subject/class, discovering the
   problem only via a dead-end `EXAM_CLASS_SESSION_MISMATCH`/`EXAM_TERM_SESSION_MISMATCH` rejection
   at save time — precisely the class of bug this gap-closure's own doc comment said it existed to
   prevent, just not fully closed. Fixed: `ClassPicker` gained a required `academicSessionId` prop,
   filtering its options (and the Subject dropdown's `dedupeSubjects` input, sourced from
   `values.academicSessionId` — correct in both create mode, populated from `GET /academics
/context`, and edit mode, loaded from the exam itself) to assignments in that session only. A new
   `class-picker.test.tsx` (6 tests) proves the filter directly, including the "only a stale-session
   assignment exists" empty-state case and the "session not yet known" loading case.
2. **A successful save's own cache invalidation could silently discard in-progress edits.**
   `ExamDetailsForm` (edit mode) and `RulesForm` both hydrated their form via `useEffect(() => {...
form.reset(loaded)}, [exam.data])` — but every mutation in `lib/exams/mutations.ts` invalidates
   the whole `['exams']` query key, including the same `useExam(examId)` query these forms read
   from, and TanStack Query v5's default `refetchType: 'active'` immediately refetches it. The
   resulting reference change re-fired the effect, unconditionally calling `form.reset()` again —
   discarding whatever the user had typed in the interim. In `ExamDetailsForm` this was a live risk
   on every 800ms autosave cycle while editing an existing draft; in `RulesForm`, a narrower window
   between clicking "Save rules" and the refetch resolving. This pattern was not invented here — F9's
   `QuestionEditorScreen` has the structurally identical `useEffect([isEditMode, question.data])` +
   broad `invalidateQuestions()` shape, so it's a pre-existing latent defect this phase's own
   "ported wholesale" autosave design carried forward, now also freshly present in the F11-original
   `RulesForm`. Fixed in both: a `loadedExamIdRef` guards the reset to run exactly once per exam id,
   not on every `exam.data` reference change — a genuinely different exam id (or, in
   `ExamDetailsForm`, a transition to non-DRAFT) still hydrates/freezes correctly; a background
   refetch of the same id no longer does. (`ExamQuestionSelector` already used the correct pattern —
   a `key`-remounted child with a lazy `useState` initializer — and was not affected.) **Not
   back-ported to F9 in this pass** — recorded as a Candidate for whoever next touches
   `QuestionEditorScreen`, out of scope for an F11-scoped review.
3. **A secondary instance of the same class of bug, found while fixing #2**: `ExamDetailsForm`'s
   create-mode "restore the local resilience buffer" effect ran on every `context.data` reference
   change, including the ordinary undefined-then-resolved transition every mount goes through as
   `GET /academics/context` settles — a second, unguarded `form.reset()` on that second pass could
   discard whatever the user typed in the (narrow but real) window between the two passes. Fixed
   with a second guard (`bufferRestoreAttemptedRef`) scoped to just the buffer-restore call itself,
   not the session/term auto-population above it in the same effect (which stays intentionally
   unguarded — idempotent, and correctly keeps the session/term fields in sync if the effect ever
   re-runs for an unrelated reason).
4. **A minor, redundant double-navigation**: `ExamDetailsForm.handleContinue`, on a first-ever save
   via the "Continue to Questions" button, called `router.push()` to the same destination
   `performAutosave`'s own create-success path had just `router.replace()`'d to. Fixed by only
   navigating from `handleContinue` when the exam already existed _before_ the flush it triggered
   (edit mode, or an earlier autosave already created it) — the one case `performAutosave` itself
   doesn't handle.

Verification: the new `class-picker.test.tsx` (6/6), the full `apps/web` test suite (136 files / 592
tests, up from 586 — all green), `tsc --noEmit` clean, `eslint --no-cache` clean (0 errors) on every
touched file, and `next build --webpack` green with the full route table unchanged. No schema
change, no permission-table change, no backend change, no ADR involved, no roadmap phase status
changed. Project state remains _Implementation (F11 complete; every frontend phase through F11
closed out)_ — this was a same-phase gap closure, not a new phase. **Next: `B12 — Exam Activation &
Control`**, unchanged.

### 2026-09-04 — `B12` complete: Exam Activation & Control

Requested explicitly: start `B12`. Followed the working-rules checklist: three parallel research
passes (the full B12 roadmap section, its three gating ADRs — ADR-0006, ADR-0009, ADR-0020 — in
full, and every B12-assigned audit finding; the product specification for `ExamSession`/
`ExamSessionParticipant`/the exam and session state machines/Control Center UX across `01`/`03`/
`05`/`06`/`07`/`02`/`04`; the existing `B11` implementation — schema, permission-table rows, scope
resolvers, mappers, test-harness conventions) followed by a dedicated Plan agent, per this project's
own precedent for a phase of this size — then direct verification reads (the permission table,
`ScopeResolverRegistry`, `auth.guard.ts`'s cookie-based session model) before writing any code, per
`AGENTS.md`'s working-rules checklist.

**The single most consequential finding, made during planning, not assumed**: the permission
table's own `awaitingResource: 'ExamParticipation (B12)'` annotations on
`examAdmin.viewRegisteredStudents`/`.allowStudent`/`.markAbsence` name a table distinct from
`ExamSessionParticipant` — confirmed by direct read of `permission-table.ts`, not named in the
roadmap's own original text. This resolves the roadmap's own DB-work bullet
("`ExamSessionParticipant.status` restricted to authorization semantics only... `COMPLETED` moves
to participation") concretely: `ExamSessionParticipant` is authorization bookkeeping only
(AUTHORIZED/REVOKED, never mutated in place); `ExamParticipation` is the final per-student outcome,
written once, only at End Examination.

**Five decisions confirmed directly with the project owner during planning, not guessed:**

1. **Concurrent sessions are allowed** — multiple `ExamSession` rows may be `OPEN` simultaneously
   for one exam (parallel labs), matching `04 §27`'s Moderator multi-lab note and the domain
   model's own batch example.
2. **`ExamSession.sessionType`** (`STANDARD`/`BATCH`/`MAKEUP`/`SPECIAL`) included now, purely for
   reporting fidelity — no B12 logic branches on it.
3. **A genuine exam-level close/reopen**, distinct from session-level close/reopen — two additional
   endpoints beyond the roadmap's own literal 9-endpoint contract. Exam-level close cascades every
   currently-`OPEN` session to `CLOSED` in one transaction and blocks any new session from opening;
   exam-level reopen only lifts that block, deliberately never auto-reopening the sessions the
   cascade closed, preserving fine-grained operator control over which specific batch resumes.
4. **`ExamAdministrator` delegate management endpoints built now** (ADR-0012/M-15) — a minimal
   `POST`/`DELETE` pair and a new `exam.manageAdministrators` permission row, since the table and
   its `OWNED`-resolver wiring would otherwise have no way to ever be populated.
5. **A credential-sharing/remote-impersonation integrity risk**, raised by the project owner
   mid-planning: a student physically present in the exam hall shares login credentials with a
   remote person who answers on their behalf. Checked against the full spec set (all nine docs, all
   33 ADRs, the audit, both roadmaps) and found genuinely uncovered anywhere — the closest existing
   coverage (`03 §78`, ADR-0020) assumes the _same_ physically-present person, just possibly
   distracted, not identity substitution. Two sub-cases resolved differently: remote screen-share/
   remote-control of the _same_ device is undetectable by any software measure and is out of scope
   by design, matching this product's deliberate anti-biometric-proctoring stance (a physical-
   invigilation responsibility, not a platform gap); a genuinely separate remote device/session is a
   real candidate for a future mechanism. Resolved to **defer the concrete mechanism to `B13`**
   (Attempt Engine, which owns `ExamAttempt`/"who is answering right now") rather than address it in
   `B12` — the full analysis is recorded in `backend-roadmap.md`'s B12 section so B13's planning
   starts from it rather than re-deriving it.

**`08 §5`'s own bounded-domain map gets `ExecutionModule` populated for the first time here** — its
original B0-era stub comment named only B13/B14/B16 as populators, an omission found and corrected
during planning: `ExamSession`/`ExamSessionParticipant` are literally "exam sessions, participants,"
squarely inside this module's own documented scope. All B12 code lives in
`apps/api/src/modules/execution/`, replacing the empty stub `AppModule` already imported — no new
module registration needed. Deliberately not split into a separate `RealtimeModule` as the
roadmap's own "Domains/modules affected" line suggests: the Control Center aggregate computation
and the SSE stream service share one aggregate-shape contract and are too tightly coupled to gain
anything from a cross-module split.

**Schema** (`packages/db/prisma/schema.prisma`, one migration
`20260904120000_b12_exam_activation_control`): four new tables — `ExamSession`,
`ExamSessionParticipant`, `ExamParticipation`, `ExamAdministrator` — all RLS-protected the same way
every school-owned table has been since B0's bootstrap migration, extending B11's own dedicated
exam-tables RLS describe block (none of the four carry a delete-blocking trigger, unlike B10's
`audit_events`, so the "separate block to avoid fighting immutability during cleanup" reason
doesn't apply). One new hand-written trigger (`exam_sessions_status_transition_guard`, `BEFORE
UPDATE OF status` only, never on `DELETE`) enforces the session's own state machine even against a
direct write, mirroring B11's own trigger idiom; B11's existing `Exam` immutability trigger already
only guards configuration/identity columns, not `status`, so B12's OPEN/CLOSED/COMPLETED
transitions pass it cleanly with no schema change needed there. `ExamAdministrator` gets a
hand-written partial unique index (`WHERE status = 'ACTIVE'`) allowing re-delegation after
revocation, mirroring `HODAssignment`'s own precedent.

**Every "who performed this action" column** (openedByMembershipId, closedByMembershipId,
authorizedByMembershipId, revokedByMembershipId, markedByMembershipId, assignedByMembershipId) is a
bare UUID with no Prisma relation — mirrors `Exam.cancelledByMembershipId`'s own B11 precedent
(a denormalized actor+timestamp pair for cheap display, not a referential-integrity-bearing FK; the
audit trail of record is `AuditEvent`). Only each row's actual _subject_ gets a real relation:
`ExamSessionParticipant`/`ExamParticipation.studentProfileId` (matching `StudentEnrollment`'s own
convention — a student is referenced via `StudentProfile`, never `SchoolMembership`, throughout this
schema) and `ExamAdministrator.membershipId` (the delegate being granted authority, mirroring
`HODAssignment`'s own real-relation precedent).

**`ScopeResolverRegistry` has no `registerOverride` method**, despite its own B2-era doc comment
promising one for this exact phase. Resolved without adding one: `register('OWNED', ...)` already
is a full replace, which is all "override" needs. `exam-administrator-scope.resolver.ts`'s
`createExamAdministratorAwareOwnedResolver()` reimplements the plain `OWNED` check inline (four
lines, already fully visible in `scope-resolvers.ts`) and falls through to an
`ExamAdministrator{examId, membershipId, status:'ACTIVE'}` lookup only when plain ownership fails
and a new optional `ResourceContext.examId` field is present, set by every `exam.*`/`examAdmin.*`
call site in this module.

**A real, if minor, bug found only by the integration tests, not by inspection**:
`ExamSessionParticipantService.listEligible()` originally built its `ResourceContext` without
`classSubjectId` — but `examAdmin.viewRegisteredStudents` is graded `ASSIGNED` for `TEACHER` (not
`OWNED`, unlike every other `examAdmin.*`/`exam.*` action in this module), and the `ASSIGNED`
resolver denies outright when `resource` is present but `classSubjectId` is missing (it only
optimistically passes when `resource` is undefined entirely) — meaning the exam's own creating
teacher was denied `GET /eligible-students` on their own exam. Fixed by resolving the caller's own
`TeacherAssignment` against any of the exam's targeted classes first, mirroring `ExamService
.resolveViewResourceContext()`'s own established B11 pattern for the identical shape of problem —
duplicated locally rather than extracted into a shared cross-module utility, to avoid touching
already-shipped, already-tested B11 code for a single call site (`AGENTS.md` §15).

**SSE is entirely new to this codebase** — no prior art anywhere. Hand-rolled raw Fastify streaming
(`reply.raw.writeHead`/`.write`), not a library (`AGENTS.md` §9): the amount of custom
per-connection logic (per-exam scoping, `Last-Event-ID` replay, heartbeat, disconnect cleanup) is
the same regardless of framing mechanism. Session-cookie auth (confirmed by reading `auth.guard.ts`
directly — sessions resolve from a cookie on every request, never a header) means a browser
`EventSource` with `withCredentials: true` works through the ordinary `@Authorized(...)` +
`AuthGuard` pipeline with no special-casing. One shared Redis subscriber connection per API process
(`REDIS_SUBSCRIBER_CLIENT`, a new `.duplicate()` provider in `redis.module.ts` — a client in
subscribe mode cannot issue ordinary commands) serves every active exam-control channel. Events are
snapshot-shaped (the full current aggregate, never a delta) specifically so a duplicate delivery in
the narrow replay-then-subscribe handoff window is harmless to apply twice — an accepted,
documented small race, not solved with distributed locking.

**The Control Center snapshot-computation logic is deliberately duplicated once, not shared**:
`apps/api`'s `exam-control-snapshot.util.ts` (the `GET /control` live-compute fallback and every
mutation's post-commit SSE publish) and `apps/worker`'s new `exam-control-refresh.queue.ts` (a
5-second default sweep merging the roadmap's two named Background-jobs bullets — aggregate refresh
and stale-exam detection — into one per-tenant pass, mirroring `subscription-expiry.queue.ts`'s own
precedent) compute structurally identical snapshots independently, because `apps/worker` cannot
import from `apps/api` (only `packages/*` are shared across apps — the same constraint B7's own
`import-worker-bootstrap.ts` doc comment already records). Kept from drifting by both reading the
same shared `ExamControlCenterSnapshot` type from `packages/domain`, mirroring `platform/
metrics-cache.ts`'s own B3 precedent. **A real bug found only by the worker's own integration
tests**: the sweep's "publish/append only on a material change" check originally compared the raw
JSON snapshot strings directly — but `computedAt` changes every tick regardless of anything else,
so the comparison always reported a change and defeated the entire point of the check. Fixed by
comparing both snapshots with `computedAt` stripped first.

**A process-management lesson, not a product bug, worth recording for future sessions**: verifying
the compiled `apps/api`/`apps/worker` boots via `node dist/main.js &` followed by a bash `kill $!`
left a real zombie process behind twice during this phase's own verification — Git Bash's reported
`$!` PID does not reliably map to the actual Windows `node.exe` process id in this environment, so
`kill` silently no-ops. The zombie API process's own live import-worker consumer then raced against
— and intermittently defeated — five unrelated `B7`/`B8` integration tests' own direct
`commit.commit()` calls, at first misread as this codebase's own already-documented pre-existing
environment flakiness for that exact test file, before being traced to the actual cause and fixed
by killing the correct PID via PowerShell's `Get-Process`/`Stop-Process` directly.

**Testing**: `apps/api/src/modules/execution/exam-control.integration.test.ts` (9 tests, real HTTP
via `app.inject()` against a real running `AppModule` and real Postgres) — DoD items 1-8, 12, 14,
the exam-level cascade-close/reopen behaviour, and `ExamAdministrator` delegation proven end to end
with a genuinely unauthorized third teacher (not the fixture's own department-privileged HOD, whose
real `DEPARTMENT`-scoped `examAdmin.controlCenter` grant would have made a "denied" assertion
against it factually wrong — a real premise error this test's own first run caught, not a product
bug). `apps/worker/src/queues/exam-control-refresh.integration.test.ts` (4 tests, a small in-memory
fake Redis rather than a real one — proves the sweep's own aggregate computation, the
material-change publish/append gate, and staleness flagging directly). `tests/tenancy/rls
.integration.test.ts` extended B11's own dedicated exam-tables describe block with all four new
tables (103 tests in that file, up from 87) rather than a fifth describe block.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm build` at the
monorepo root (16/16 turbo tasks each), the full `apps/api` integration suite (266 tests across 35
files, zero regressions once the zombie-process interference above was found and eliminated), the
full `apps/worker` integration suite (22 tests across 5 files), and the extended RLS suite (103
tests). `pnpm generate` (`exam-control.v1` — 13 routes — published in `apps/api/openapi.json`/
`packages/contracts`) and `pnpm generate:permission-table-doc` (155 rows — the one new
`exam.manageAdministrators` row, confirmed via a clean `git diff`, not a miscount). A real `node
dist/main.js` boot confirmed `PolicyCoverageService` reports 182 routes checked with zero
violations, and a real `apps/worker` boot confirmed the new `atlas-exam-control-refresh-sweep`
queue registers at its configured 5-second interval alongside every pre-existing sweep.

**Honestly partial by construction, not a gap**: DoD items 9 (live attempt table), 10 (submit/
disconnect SSE events specifically — the open/close/authorize/revoke/complete events this phase
itself produces are real), and 11 (the `last_seen_at`-derived liveness indicator) all need
`ExamAttempt`, which doesn't exist until `B13`. The Control Center response DTO is additive-only for
B13 to fill in later: `inProgressCount`/`submittedCount` are always `0`, `liveAttempts` is always
`[]`, and `attemptDataAvailable: false` lets the frontend distinguish a real zero from "not yet
real," matching this project's own repeated "build what's real now, flag the rest honestly, next
phase supersedes" convention. `examAdmin.viewLiveAttempts`/`.seeStarted`/`.seeCompleted`/
`.endAttempt` stay `awaitingResource` (B13); `.grantMakeup`/`.invalidateAttempt` stay
`awaitingResource` (B14/B16, ADR-0014). The eligibility predicate's attempt-limit/authorization-
override clause (ADR-0006's final clause) is an explicit `true` pass-through stub, code-commented
as B16's job. A real automated SSE reconnect-under-load test (simulating a mid-stream API node
restart) was not built — the replay mechanism is built and manually verifiable via the design's own
`Last-Event-ID`/Redis Stream approach, but no automated test forces an actual process restart
mid-connection; recorded as a Candidate for F12 or a dedicated hardening pass, not silently skipped.

`docs/roadmaps/backend-roadmap.md`'s B12 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-partial-with-reason, a full "Implementation notes" subsection, and
an expanded Deferred items list. `docs/roadmaps/roadmap-index.md`'s version, Current State, and
Immediate Next Actions all updated to record `B12` complete and `B13` next on the critical path,
and the `F12`-readiness gating note updated now that `exam-control.v1` is frozen and published.

Project state moves from _Implementation (F11 complete; every frontend phase through F11 closed
out)_ to _Implementation (B12 complete)_.
**Next: `B13 — Attempt Engine`** on the backend critical path (`Gate 1 ADRs → B0 → B1 → B2 → B3 →
B5 → B6 → B8 → B9 → B11 → B12 → B13 → …`) — the highest-integrity phase in the entire roadmap
(`AGENTS.md` §5), gated by six ADRs and concentrating 8 of the 18 BLOCKER audit findings alongside
`B14`. A future `F12` (Exam Control Center) remains open once the frontend/backend phase-pairing
default is next prioritized — `exam-control.v1` including the SSE stream is now frozen and ready
for it to consume.

### 2026-09-04 — `B12` gap closure: thorough implementation review, six fixes

Requested explicitly, same day as `B12` itself: a thorough review of the just-shipped implementation
looking for bugs, not new scope. Read every execution-module file end to end (schema/migration, all
services/controllers, the worker sweep, shared cache helpers, permission table, and tests) rather
than sampling. Six real issues surfaced — a confirmed cross-actor authorization bypass, a cache-
staleness correctness bug, a privilege-escalation gap, a duplicate-notification/audit-mislabeling
bug, an unimplemented fault-tolerance contract, and a genuine concurrency race — all fixed and each
proven by a new regression test:

1. **The Control Center SSE stream skipped resource-scoped authorization** — the controller wrote
   response headers and attached the stream before any per-exam check beyond the coarse
   `@Authorized('examAdmin.controlCenter')` guard, so any actor holding that permission id at all
   (not just one scoped to the specific exam) could stream another exam's live data. Fixed with a
   new `ExamControlStreamService.assertAccess()`, called before any header is written.
2. **The Control Center cache could serve a stale snapshot indefinitely** — `publishUpdate()` never
   set a TTL, and the read path never cross-checked the cached payload's own `examStatus` against
   the exam's real current status. Fixed three ways: a bounded TTL
   (`EXAM_CONTROL_CACHE_TTL_SECONDS`, shared via `packages/domain` between `apps/api` and
   `apps/worker`), write-through caching on every mutation (not just publish/`XADD`), and a
   defensive `examStatus` mismatch check in `ExamControlCenterService.get()` that falls through to
   a live recompute rather than trusting a corrupt or stale cache entry.
3. **An `ExamAdministrator` delegate could manage other delegates** — `exam.manageAdministrators`'s
   resource context included `examId`, so the delegate-aware `OWNED` override let a delegate pass
   as if they were the true creator. Fixed by deliberately omitting `examId` from that one specific
   `evaluate()` call, forcing plain-ownership-only semantics for delegate management specifically
   (a minimal, considered fix — a `matchedScope`-based check was considered and rejected as fragile
   against a dual-role actor who is both a delegate-teacher and a department HOD).
4. **Re-authorizing an already-`AUTHORIZED` participant was double-counted** — every call to
   `authorize()` credited every id in the request as "newly authorized" regardless of prior status,
   inflating notification counts and mislabeling audit metadata on a repeat call. Fixed by reading
   each participant's existing status before crediting it.
5. **`NotificationService.record()`'s own doc comment promised fault-tolerance it didn't have** —
   a DB-level failure (e.g., a title exceeding the `VarChar(200)` column) propagated as an unhandled
   exception instead of being logged and swallowed. Fixed with a try/catch matching the doc
   comment's original contract.
6. **A real concurrency race between opening a new session and ending the examination** — both
   `ExamSessionService.open()` and `ExamCompletionService.complete()` read `Exam.status` and later
   wrote based on that read, with no lock between the read and the write; two concurrent calls
   could leave an `OPEN` session under a `COMPLETED` exam. Fixed with a `SELECT ... FOR UPDATE` row
   lock on the exam row as the first statement in both transactions (ADR-0031's own reserved
   pattern, precedented in `apps/api/src/spike/run-spike.ts`), fully serializing the two paths.

Six new regression tests added to `exam-control.integration.test.ts` (findings 1, 2, 3, 4, 6 — the
concurrency test for finding 6 fires both calls via a bare `Promise.all` with no artificial delay
and asserts an XOR outcome, needing no `pg_sleep`-forced interleave since the row lock itself
makes the outcome deterministic regardless of scheduling order), one to
`notification.integration.test.ts` (finding 5), and one TTL assertion added to the worker's
`exam-control-refresh.integration.test.ts` (finding 2's worker-side write).

Full pipeline reconfirmed green after every fix: `@atlas/domain`/`@atlas/api`/`@atlas/worker`
build/typecheck/lint all clean; monorepo-wide `pnpm lint` (16/16 turbo tasks) and the schema-tenancy
lint; `apps/api`'s full integration suite (35 files / 272 tests, including all six new/updated
regression tests) green on its first full run; `apps/worker`'s full integration suite (5 files / 22
tests) green in isolation. Two failures surfaced only when multiple heavy integration suites were
run concurrently against the same local Postgres/Redis (self-inflicted contention, not a product
regression) — `subscription-expiry.integration.test.ts`'s Redis-outage case and
`import-1500-rows.integration.test.ts`'s BullMQ commit-timing budget — neither touches any file this
gap closure changed; the former was reconfirmed passing cleanly in isolation, and the latter is this
codebase's own long-documented pre-existing flake in this exact file (already recorded in the B9/
B10/B11 Change Log entries above as background-BullMQ-worker timing sensitivity under system load).

No schema change, no permission-table change beyond the resource-context fix in finding 3 (no row
added or removed), no ADR involved, no roadmap phase status changed. Project state remains
_Implementation (B12 complete)_ — this was a same-phase gap closure, not a new phase.

### 2026-09-04 — Documentation: `B13`'s own roadmap section now carries the remote-impersonation integrity-risk analysis directly, not only `B12`'s

Requested explicitly: make sure the credential-sharing/remote-impersonation concern `B12`'s planning
raised and deferred to `B13` (see `B12`'s own Change Log entry and `backend-roadmap.md`'s B12
"Implementation notes," decision 5) is documented properly enough that a **new session starting
`B13` picks it up together with `B13`'s original scope** — not left to be found only by first
reading `B12`'s notes. Per `AGENTS.md`'s own working-rules checklist ("read the relevant roadmap
phase"), a session starting `B13` reads `B13`'s own section first; the analysis needed to live
there directly, not only in `B12`'s.

`docs/roadmaps/backend-roadmap.md`'s `B13` section gained: a new Scope bullet flagging the open
decision; a full standalone "Carried forward from `B12`" subsection (placed directly after Scope,
before Specification references) restating the complete analysis — the two sub-cases, which one is
settled out-of-scope-by-design (remote screen-share/control of the _same_ device — undetectable by
any software measure, matching this product's standing anti-biometric-proctoring stance) and which
one is the actual open decision (a genuinely separate remote device/session — candidate mechanism:
bind an attempt to the device/session/IP that started it at attempt-creation time, flag a mid-
attempt change as an `AttemptEvent`-shaped signal per `ADR-0020`'s existing "counts, not judgments"
philosophy, likely an extension of that already-decided ADR rather than a new one — plus a lower-
priority secondary candidate, a per-school allowed-IP-range check); a matching note under Security/
authorization work pointing at attempt-creation time as where the binding would be established; and
a Deferred-items entry explicit that this is an **open decision to resolve**, not an ordinary
pre-existing deferral — `B13`'s own Change Log entry must record which way it went (built now,
built as a signal-only MVP, or re-deferred again with a named reason and owner) rather than letting
it drop silently a second time. `docs/roadmaps/roadmap-index.md`'s Immediate Next Actions entry was
extended with one clause pointing at `B13`'s own new subsection directly.

No schema, code, ADR, or permission-table change — this is a planning-documentation fidelity fix
ahead of a new session starting `B13`, per the user's explicit request. No roadmap phase status
changed; `B13` remains NOT STARTED.

### 2026-09-04 — `F12` complete: Exam Control Center, built the same day as `B12`

Requested explicitly: start `F12`. This is a deliberate deviation from the documented
frontend/backend phase-pairing default — `roadmap-index.md`'s own text named `B13 — Attempt Engine`
as "next" at the time, with F12 recorded as "remaining open... once B13 is far enough along, or
sooner if the project owner prioritizes it." The project owner prioritized it. The same shape of
stated deviation as B5-before-F5 earlier in this project, not an oversight.

Followed the working-rules checklist: three parallel research passes (F12's own roadmap/spec/ADR
text across `04 §45`–`§47`/`§69`, `05 §28`–`§30`/`§42`/`§73`, ADR-0006/0009/0012/0020; the complete,
already-frozen `exam-control.v1` backend contract — every route, DTO field, and permission grant
read directly from source, not inferred; existing frontend conventions to reuse from F11/F9/F2),
then a dedicated Plan agent, then direct verification reads of the live source
(`exam-control.controller.ts`, `nav-model.ts`, `exam-list-screen.tsx`, `offline-indicator.tsx`,
`resolve-origin.ts`) before writing any code — per this project's own precedent for a phase of this
size and novelty (this is the frontend's first-ever SSE consumer).

**Two scope questions confirmed with the project owner before design**, mirroring F11's own
precedent of asking rather than guessing when the permission table already grants more than a
roadmap's literal text:

1. **Build real Control Center access for all four school-side roles** (Teacher, School Admin,
   Moderator, HOD), not just Teacher+Moderator per the roadmap's literal route table — the
   permission table already granted School Admin (SCHOOL) and HOD (DEPARTMENT) live, non-deferred
   access to every Control Center action, with no future phase named to close the gap, the identical
   shape of decision F11 made for exam oversight screens.
2. **Build a minimal `ExamAdministrator` delegate-management panel** now, even though it isn't
   among F12's five named components — B12 shipped assign/revoke with no other consumer, and
   ADR-0012/M-15's spec basis calls for exactly this.

**A routing correction, resolved directly against unambiguous evidence, not asked about** (mirrors
F1's `/reset-password`, F8's `/teacher/question-bank/import` precedent exactly): the roadmap's own
literal route table said `/teacher/exams/:id/control`, but the already-shipped nav model carries
distinct `exam-control` (Teacher)/`exam-operations` (Moderator) destinations, unbuilt until now.
Built there instead — `/teacher/exam-control/:id`, `/moderator/exam-operations/:id`, and two new
mirrors, `/hod/exam-control/:id`/`/school/exam-operations/:id` (closing decision 1 above), each with
`/students` and `/history` sub-routes, plus one new `ActiveExamsScreen` landing page per role
superseding the dangling nav placeholder (collapses `04 §27`'s separate "Active Exams"/
"Scheduled-Ready Exams" into one status-filtered view — no new endpoint needed, `useExamsPaginated`
already supports the filter). `nav-model.ts` gained two new entries (HOD `exam-control`, School
Admin `exam-operations`) — `nav-model.test.ts`'s own per-role literal-label assertions were updated
with inline comments recording both as confirmed extensions, mirroring this file's own established
convention for this class of gap closure (F6/F11's identical precedent).

**Two small, additive backend gap-closures**, found only by building the real frontend consumer
against the already-frozen contract (the same discovery pattern every prior paired phase has hit):

1. **`GET /v1/exams/:id/administrators`** — only `POST`/`DELETE` existed; without a list route the
   delegate panel would be write-only. Added `ExamAdministratorService.list()` (same
   `exam.manageAdministrators` gate as assign/revoke, including its deliberate exclusion of an
   active delegate's own session) and the matching route/DTO. Returns every status, including
   `REVOKED`, so a revoked delegation stays visible rather than disappearing.
2. **`ExamSessionResponseDto` had no `openedByName`/`closedByName`** — every sibling DTO in this
   module already resolves a display name; a session-history screen showing raw UUIDs would have
   regressed against that convention. Added both fields via a new batched
   `resolveMembershipDisplayNames()` helper (no schema change — these columns stay bare UUIDs by
   design, mirroring `Exam.cancelledByMembershipId`'s own B11 precedent), duplicated once more into
   `apps/worker`'s own independent `exam-control-refresh.queue.ts` snapshot computation for the
   identical cross-app-import-boundary reason that function's own doc comment already records for
   the rest of its logic. Two new integration tests (`exam-control.integration.test.ts`, now 15,
   up from 9). See `backend-roadmap.md`'s B12 "Post-completion gap closure" note for full detail.

**The core frontend design decision — how SSE and the R-04 polling fallback cooperate rather than
race**: `useExamControlStream` (new `lib/exam-control/sse-client.ts`) writes every real SSE frame
directly into the exact same `['exam-control', examId]` TanStack Query cache entry
`useExamControl`'s own poll reads (`queryClient.setQueryData` — safe because every frame is a full
snapshot, never a delta, per the backend's own design). `useExamControl`'s `refetchInterval` is
`false` whenever the stream reports `'live'` and only becomes the 5s R-04 fallback once it isn't —
the two mechanisms are never both active at once. An injectable `EventSourceLike` interface (jsdom
has no native `EventSource`) lets `ExamControlStreamConnection`'s `readyState`-to-status mapping
(`'connecting'|'live'|'reconnecting'|'closed-permanent'`) be tested deterministically against a fake
in `sse-client.test.ts`; production wraps the real browser `EventSource`. Native `Last-Event-ID`
reconnection needed no custom protocol on the frontend at all — the browser already sends it
automatically on reconnect, and the backend already replays from its Redis Stream. `'closed-
permanent'` (the case where a 403/404 was returned before SSE headers were ever written — the exact
security fix B12's own gap-closure pass made) is the one state that disables every mutating control
(doctrine: never show stale data as live); a merely `'reconnecting'` stream leaves controls enabled,
since a REST call can still succeed mid-reconnect.

**The multi-concurrent-open-sessions UX** (a confirmed B12 product decision this phase had to
represent): no global session picker gates every action. Each session is its own `SessionsTable` row
with its own inline Close/Reopen/Manage-students actions — disambiguation is structural. A
`SessionPicker` appears only on the roster route when reached with no `sessionId` already resolved
(a deep link/bookmark; a session row's own link always arrives with the id already in the URL) —
defaults to the most-recently-opened OPEN session.

**Honest partial surfaces, built as a real reserved layout slot rather than fabricated or omitted**
(the established "build what's real now, name what supersedes it" pattern): `AggregateSummaryCards`
renders `—` (never a fabricated `0`) for In Progress/Submitted whenever `attemptDataAvailable` is
`false` (always true in B12); the live-attempts table slot renders `FeatureNotYetAvailable`
(explicit "B13" reference) rather than an empty or fake table; invalidate-attempt has no UI
anywhere, not even a disabled button (`examAdmin.invalidateAttempt` has no live route — B14/B16);
operational alerts (not-started/disconnected/low-time-remaining) were omitted entirely, since no
underlying signal exists yet and no spec section names a standing nav destination for them the way
the live-attempts slot is implied; Makeup Access is a `FeatureNotYetAvailable` placeholder at the
one nav destination that names it (`04 §27`/`§47`, Moderator/School Admin only — F16's job).

**`EndExaminationDialog`'s pending-absentee computation was verified directly against the server's
own logic before being built**, not assumed: read `ExamCompletionService.complete()`'s source
directly and confirmed the client-computable set (`GET /eligible-students` rows where
`participantStatus === 'AUTHORIZED'`) exactly matches the server's own pending-set query, so the
dialog's list and the server's acceptance criteria can never legitimately disagree except through
the one real race `STALE_ABSENTEE_LIST` exists to catch (handled: stays open, refetches, requires an
explicit re-confirm, never silently resubmits). `EXAM_SESSIONS_STILL_OPEN` is handled as a second,
distinct recovery — blocks confirming, lists the open sessions by name, and delegates the actual
close action back to the parent screen's own `SessionsTable`/`CloseSessionDialog` rather than
duplicating a second close-session mutation wiring inside the dialog.

**ADR-0009's own named requirement** — that "Close new attempts" must state unmistakably, at the
point of action, that already-running attempts are unaffected — is carried by `CloseExamDialog`'s
copy specifically, verified by a literal text-content assertion in its own test file, matching this
project's established practice for a named Definition-of-Done copy requirement.

**Testing**: 16 new test files / 72 tests in `apps/web` — `sse-client.test.ts` and
`use-exam-control-stream.test.tsx` (every `readyState` transition against an injected fake, plus the
query-cache-write behavior), `navigation.test.ts` (`defaultOpenSession`'s tie-breaking), component
tests per new component/dialog (`session-picker`, `aggregate-summary-cards`,
`connection-status-banner`, `sessions-table`, `active-exams-screen`, `batch-authorizer`,
`delegates-section`, `exam-roster-screen`, `session-history-screen`, `close-exam-dialog`,
`revoke-participant-dialog`, `end-examination-dialog`), and one composite
`exam-control-center-screen.test.tsx` mocking every hook module directly (mirroring
`exam-detail-screen.test.tsx`'s own established convention for a screen this size) with
`SessionsTable`/`DelegatesSection` themselves mocked out to isolate the parent screen's own
orchestration logic, already covered independently by their own dedicated test files. One real
component bug the tests caught before shipping: the lifecycle-action-button gating originally read
`useExam`'s own `status` field, but the test fixture (and, on reflection, the live data too) makes
`snapshot.examStatus` — the Control Center's own field, kept fresh by SSE/polling — the more
correct single source of truth for this screen's own already-displayed status badge; fixed to read
consistently from `snapshot.examStatus` throughout.

Full pipeline green, run in full after every fix: `apps/api` — `pnpm lint && pnpm typecheck`, the
extended `exam-control.integration.test.ts` (15/15). `apps/web` — `pnpm lint && pnpm typecheck &&
pnpm test -- --run` (664 tests, 663 passed; the one failure,
`components/imports/error-table.performance.test.tsx`, is a pre-existing, unrelated F8-era
performance-timing assertion this session never touched, reconfirmed passing cleanly in isolation —
this environment's own long-documented full-suite-parallel-load timing flakiness, not a regression)
and `pnpm build` (`next build --webpack`), confirming all 18 new routes across all four role roots
render correctly, superseding the `[...slug]` catch-alls as designed. `pnpm generate` and `pnpm
generate:permission-table-doc` (155 rows, confirmed unchanged — both gap-closures reuse
`exam.manageAdministrators`). Live-verified beyond the automated suite: two browser tabs against a
real running API — one opens a session, the other's Control Center updates with no manual refresh;
a brief API-process restart showed the `'reconnecting'` banner, then recovered via native
`Last-Event-ID` replay with no data loss.

**Honestly deferred, not silently dropped** (full list in `frontend-roadmap.md`'s F12 section): live
attempt table, operational alerts, invalidate-attempt (all `B13`/`ExamAttempt`); grant-makeup
(`B14`/`B16`, `AttemptAuthorization`); a real automated SSE reconnect-under-load test (a scripted
mid-stream API-process restart) — B12's own Change Log entry already recorded this as a Candidate
for F12 or a dedicated hardening pass; the unit-level `readyState`-transition coverage plus the one
manual live verification above stand in for it, not a literal browser E2E (this codebase has never
had that infrastructure, for any phase).

`docs/roadmaps/frontend-roadmap.md`'s F12 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-partial-with-reason, a corrected routes/components table, a full
"Implementation notes" subsection, and an expanded Deferred items list.
`docs/roadmaps/backend-roadmap.md`'s B12 section gained a "Post-completion gap closure" note for
both additive backend changes. `docs/roadmaps/roadmap-index.md`'s version (1.23), Current State, and
Immediate Next Actions all updated to record `F12` complete.

Project state moves from _Implementation (B12 complete)_ to _Implementation (B12/F12 complete)_.
**Next: `B13 — Attempt Engine`** on the backend critical path (`Gate 1 ADRs → B0 → B1 → B2 → B3 →
B5 → B6 → B8 → B9 → B11 → B12 → B13 → B14 → B15 → …`) — the highest-integrity phase in the entire
roadmap, gated by six ADRs and concentrating 8 of the 18 BLOCKER audit findings alongside `B14`, and
carrying forward the credential-sharing/remote-impersonation integrity-risk analysis `B12`'s own
planning raised (already forwarded into `B13`'s own roadmap section directly, per this file's
immediately preceding Change Log entry).

### 2026-09-05 — `B13` complete: Attempt Engine

Requested explicitly: start `B13`. Followed the working-rules checklist via three parallel research
passes (the full B13 roadmap section, its six gating ADRs in full, and every B13-assigned audit
finding; the complete domain-model/ERD/functional-requirements/technical-architecture text for the
attempt entity, snapshot, and answer persistence; the existing B11/B12 implementation conventions —
schema/migration idioms, module structure, concurrency patterns, SSE wiring, permission-table shape,
testing harness), then a dedicated Plan agent, then direct verification reads of the live source
(the permission table's `studentCbt.*`/`examAdmin.*` rows, `AuthorizationService`'s `SELF` resolver,
the exam-eligibility utility, the B12 migration's exact trigger/RLS SQL, `QUESTION_REVISION_INCLUDE`)
before writing any code — per this project's own precedent for a phase of this size and risk.

**Two genuine open decisions, confirmed with the project owner during planning before any code was
written (`AGENTS.md` §3), not guessed:**

1. **The remote-impersonation signal carried forward from `B12`'s own planning** (a student sharing
   credentials with a remote person completing the exam from a separate device) — build the primary
   candidate now, as a signal-only MVP extending `ADR-0020`'s existing "counts, not judgements"
   scope (no new ADR needed), rather than defer it again or build an automated block.
2. **The `StudentAssessmentAccommodation` gap** (`07 §9.7` — a genuine spec gap with no phase ever
   scoped to build the full approval-workflow entity B11 had flagged it as needing) — resolve by
   extending the already-shipped `ExamSessionParticipant` (B12) with a nullable `extraTimeSeconds`
   column plus one small grant endpoint, rather than inventing a new entity.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260904210945_b13_attempt_engine`):
five new tables — `ExamAttempt` (the core row: timing columns, `state`/`attemptType`/
`participationStatus`, and decision 1's `startIpAddress`/`startUserAgent`/`startDeviceId`/
`startSessionId`/`lastSeenAt`), `AttemptQuestionSnapshot` (ADR-0008's one-JSONB-document shape, its
own dedicated 1:1 table rather than a column on `ExamAttempt` — every named ERD entity in this
schema gets its own table even at 1:1 cardinality, and collapsing it would force the row read on
every answer save/heartbeat to carry a large JSONB blob unnecessarily), `AttemptAnswer` (ADR-0007's
mutable half — the `(schoolId, attemptId, examQuestionId)` unique index IS the single indexed
upsert), `AttemptAnswerEvent` (ADR-0007's append-only half, written in the same transaction),
`AttemptEvent` (ADR-0020, extended with a sixth type, `BINDING_MISMATCH`, for decision 1) — plus a
purely additive `ExamSessionParticipant.extraTimeSeconds` (+ grantor/timestamp) extension for
decision 2. Six hand-written migration additions mirroring established precedent exactly: RLS
bootstrap for all five new tables; the `exam_attempts_active_unique` partial index (at most one
`IN_PROGRESS` attempt per **(school, exam, student)** — scoped per-exam, not per-session, since
`Exam.attemptLimit` is exam-scoped and B12's confirmed "multiple concurrent OPEN sessions per exam"
design would otherwise let a student bypass it via a second session); a state-transition-guard
trigger mirroring `exam_sessions_status_transition_guard`'s own B12 shape; an unconditional
immutability trigger for `attempt_question_snapshots` (mirroring B9's `question_reviews` shape, not
B10's `audit_events` grant-REVOKE treatment — no second Postgres role reads this table, so the
simpler trigger is sufficient); a parent-status-gated trigger for `attempt_answers` (mirroring B8's
`question_options` shape — this is the actual DB-level enforcement of "answers become immutable
after submission," with the service-layer check as the fast-fail UX layer in front of it); and an
unconditional trigger for `attempt_answer_events` (B9 shape again).

**API** (`apps/api/src/modules/execution/`, the same module B12 lives in — no new module, per that
module's own doc comment anticipating this): `attempt.v1`, 11 routes (the 8 originally planned, plus
3 confirmed additive ones — `submit`, staff-initiated `end`, and decision 2's accommodation grant).
`AttemptLifecycleService.start()` is the highest-integrity transaction in the product: a
`pg_advisory_xact_lock` keyed on (school, exam, student) serializes every concurrent first-time
start for that exact tuple (a row lock has nothing to attach to when no row exists yet — the actual
answer to "20 simultaneous starts create exactly one attempt"), re-validates eligibility under that
lock via a new `evaluateAttemptStartEligibility()` (layering attempt-limit headroom on top of the
already-shared `evaluateExamEligibility`/`canStudentAccessSession` predicate from B12), and creates
the attempt + its one JSONB snapshot in the same transaction — an existing `IN_PROGRESS` attempt is
returned idempotently (200, not an error) rather than treated as a conflict. `submit()`/`end()` own
only the state transition and answer freeze — explicitly, by the method's own doc comment, never
invoking marking (`AttemptQuestionResult`/`Result` don't exist until B14). The snapshot-builder
(`attempt-snapshot-builder.ts`) is a pure, zero-DB-dependency function using a small seeded PRNG
(mulberry32, FNV-1a-hashed seed) — Node's `Math.random()` can't be seeded, and ADR-0008 requires the
materialised order to be reproducible from the stored seed alone.

**X-05 (BLOCKER, release-blocking) resolved structurally, not just by convention**:
`StudentAttemptOptionDto` has no `correctFlag` field declared anywhere in its type at all, and
`attempt-snapshot-projection.mapper.ts`'s `toStudentAttemptQuestions()` — the one function anywhere
in the codebase permitted to build a student-facing payload from the stored snapshot — constructs
every option by an explicit allow-list object literal, never a spread of the internal document
shape (which does carry `correctFlag`). No `toMarkingAttemptPackage()` was written in this phase at
all — nothing in B13 needs to read `correctFlag` outside the snapshot builder's own write path; that
extension point is B14's to add when it has a real caller. Proven at both the unit level
(`attempt-snapshot-projection.mapper.test.ts`, asserting the serialized output never contains the
substring `correctFlag`) and the integration level (a dedicated `'security regression'` test doing
the identical raw-JSON-string assertion against a real HTTP response).

**Answer persistence (ADR-0007) — a real design refinement found during implementation, improving
on the phase's own plan**: out-of-order replay protection was originally planned as a `SELECT
sequenceNumber ... FOR UPDATE` read followed by a conditional upsert — correct once a row already
exists (the lock serializes concurrent writers), but leaves a real race on a question's very first
write, where two concurrent writers could both read "no existing row," both decide "not stale," and
then race on the upsert itself with the actual stored outcome decided by commit order, not sequence
order. Replaced with one atomic `INSERT ... ON CONFLICT (school_id, attempt_id, exam_question_id) DO
UPDATE ... WHERE attempt_answers.sequence_number <= EXCLUDED.sequence_number` — Postgres's own atomic
"keep only the highest-or-equal-sequence write" idiom (`<=`, not `<`, so a genuine retry of the same
sequence number is accepted as an idempotent no-op-equivalent success, DoD item 9, rather than
rejected as stale), correct under concurrency with no additional lock needed, and a direct instance
of audit finding R-07's own "confine raw SQL to a small, explicitly-named set of exam-engine
repository methods" guidance. `AttemptAnswerService.writeAnswer()` never touches the parent
`exam_attempts` row (R-03) — `last_seen_at` updates via a separate, best-effort, error-swallowed call
to `AttemptEventService.touchLastSeen()`, matching ADR-0020's own explicit requirement.

**ADR-0003's grace window** (`ATTEMPT_GRACE_WINDOW_SECONDS`, default 60s, env-configurable, never
per-school): `evaluateWriteAdmissibility()` compares server receipt time (never a client-supplied
timestamp) against `expiresAt`; a write inside the window is accepted and flagged
(`gradeWindowFlag`), a write beyond it is rejected with a new, non-retryable `ATTEMPT_WRITE_WINDOW_
CLOSED` — and still recorded as a rejected `AttemptAnswerEvent`, since "final submitted state must
remain reconstructable" (ADR-0007) extends to what a client attempted and was refused, not only what
succeeded.

**Decision 1, built**: `AttemptEventService.detectBindingMismatch()`, called from the heartbeat
endpoint (the natural off-critical-path carrier — already periodic, already outside the answer-save
transaction) — compares the current request's IP/device id against the attempt's own stored starting
values and, on a material difference, records a neutral `BINDING_MISMATCH` `AttemptEvent`. Never
blocks: the heartbeat still succeeds, and the attempt remains fully writable, regardless of a
detected mismatch, matching every other ADR-0020 signal's "counts, not judgements" treatment exactly.
A missing client field (no `X-Device-Id` header sent) degrades to whatever comparison is still
possible rather than firing a false positive.

**Decision 2, built**: `ExamSessionParticipantService.grantExtraTime()` (`POST /v1/exam-sessions/:id/
participants/:studentId/extra-time`), gated by a new permission row (`examAdmin.grantExtraTime`,
graded identically to `examAdmin.allowStudent`'s own shape — 156 rows, up from 155). Applies
regardless of the participant's current AUTHORIZED/REVOKED status, since the grant only takes effect
at a future attempt-creation time, never at grant time. `AttemptLifecycleService.start()` resolves
`durationGrantedSeconds = exam.durationSeconds + (participant.extraTimeSeconds ?? 0)` inside the same
locked transaction and never re-reads it afterward — frozen for the attempt's life, per DoD item 14.

**Control Center un-stubbing**: both of B12's own honest placeholders
(`inProgressCount`/`submittedCount`/`liveAttempts`/`attemptDataAvailable`) now compute real values —
independent `count()`/`findMany()` queries, never derived by subtraction — in both of the two
independent implementations that cannot share code across the app/worker process boundary
(`apps/api/src/modules/execution/exam-control-snapshot.util.ts` and `apps/worker/src/queues/exam-
control-refresh.queue.ts`). Also un-stubbed two real, previously-dead B12 functions whose own doc
comments named B13 as the phase that would supersede them:
`ExamCompletionService`'s `countInProgressAttempts()` (End Examination's own zero-in-progress-
attempts precondition, A-14) and `ExamSessionParticipantService`'s `hasStartedAttempt()`
(`REVOKE_AFTER_START_REFUSED`'s own precondition, X-13) — both previously hardcoded to always return
"no attempts exist," now real queries.

**Two real bugs found only by running the integration tests, not by inspection:**

1. `pg_advisory_xact_lock()` returns `void`, which Prisma's `$queryRaw` cannot deserialize ("Failed
   to deserialize column of type 'void'") — invisible until the very first concurrency test actually
   ran. Fixed by switching to `$executeRaw`, which only needs a row count and never attempts to
   deserialize a typed result — the correct, more idiomatic choice regardless, for a statement whose
   return value is never consumed.
2. A doc comment on `AttemptEvent.metadata` originally illustrated its shape with literal `{ fromIp,
toIp }` braces, which broke `scripts/lint-schema-tenancy.mjs`'s own naive brace-matching regex —
   a verbatim recurrence of the identical false positive B7's own Change Log entry already
   documented once. Reworded to avoid literal braces, the same fix.

**One real cross-cutting fixture gap found only by writing the tests, not a product bug**: this is
the first phase in the codebase's history needing a STUDENT actor to complete a real login and then
call further routes (every prior phase's tests either never logged in as a student or only checked
the login response itself) — `POST /students/:id/reset-credentials` issues a real password but
leaves `credentialState: 'MUST_CHANGE_PASSWORD'`, which `AuthGuard`'s forced-password-change gate
blocks every other route behind. Fixed by setting `passwordHash`/`credentialState: 'OK'` directly via
Prisma in the test fixture, the exact same convention every prior phase's teacher/HOD/admin fixtures
already use to bypass this identical gate.

**Testing**: `attempt.integration.test.ts` (25 tests, real HTTP via `app.inject()` against a real
running `AppModule` and real Postgres, mirroring `exam-control.integration.test.ts`'s own harness) —
every DoD item, both immutability triggers proven directly via raw SQL bypassing the service layer
entirely, a 20-way concurrent-start race, out-of-order replay, the grace window's exact boundary,
cross-student and cross-tenant denial, and the release-blocking X-05 contract test. Three pure-unit
test files with zero DB dependency: `attempt-snapshot-builder.test.ts` (seeded-determinism and
randomization proofs), `attempt-snapshot-projection.mapper.test.ts` (the X-05 allow-list guarantee
at the unit level too), `attempt-admissibility.util.test.ts` (the grace-window boundary arithmetic).
`tests/tenancy/rls.integration.test.ts` gained a **new, dedicated** describe block for all five new
tables (not an extension of the shared B5-B9 or B11/B12 blocks) — required, not optional:
`attempt_question_snapshots`/`attempt_answer_events` both carry unconditional immutability triggers,
which would abort a shared multi-row `deleteMany` cleanup on the first blocked row, exactly the
reasoning that already forced the B11/B12 block to stay separate from the shared one. One
pre-existing B12 test (`exam-control.integration.test.ts`'s own "DoD 8" case) asserted the old
`attemptDataAvailable: false` placeholder and was updated to assert the new, real `true` — the one
required, narrowly-scoped consequence of un-stubbing, not a silent behavior change.

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm test && pnpm
build` at the monorepo root (16/16 turbo tasks, including the schema-tenancy lint), the full
`apps/api` integration suite (298/298, every pre-existing B0–B12 test re-confirmed with zero
regression beyond the one intentional B12 assertion update), the full `apps/worker` integration
suite (22/22), and the full RLS suite (118/118, up from 103). `pnpm generate` (`attempt.v1` published
in `apps/api/openapi.json`/`packages/contracts`) and `pnpm generate:permission-table-doc` (156 rows).
A real `node dist/main.js` boot confirmed `PolicyCoverageService` reports 194 routes checked (up from 182) with zero violations. One genuinely destructive step this phase required — `prisma migrate
reset --force` against the local `atlas_dev` database, to resolve two out-of-sync migrations blocking
the new one — was run only after explicit user confirmation, per Prisma's own AI-agent safety guard
and this project's standing default-behaviour rule; the post-reset `grantAppRole()`/
`grantAuditReaderRole()` re-assertion (this codebase's own documented `migrate reset` gotcha) was
re-run immediately after.

**Honestly out of scope, per `AGENTS.md` §14 — not built opportunistically**: marking and
`AttemptQuestionResult`/`Result` (B14's entire scope); the `ADR-0004` auto-submission sweeper (B14;
this phase ships the writable window and terminal states the sweeper will transition into, not the
sweeper itself); `examAdmin.invalidateAttempt`/`.grantMakeup` (`AttemptAuthorization`, `ADR-0014` —
both stay `awaitingResource`, tagged B14, unchanged); mid-attempt time extension by an administrator
(distinct from decision 2's freeze-at-creation grant — not trivially cheap, named as a B14/follow-up
candidate); the secondary remote-impersonation candidate (an optional per-school allowed-network-
range check — named, not built, no owner assigned); question pools (`ADR-0002`, confirmed deferred);
the full 500/1,000-concurrent-client load test against a real latency budget (`B21`'s job — this
phase proves correctness at 20-way concurrency and proves the write path has no lock contention on
the parent row, but no latency budget exists yet to test against).

`docs/roadmaps/backend-roadmap.md`'s B13 section gained status `COMPLETE`, every DoD item checked
with detail, a full "Implementation notes" subsection, a corrected 11-route API table, and an
expanded Deferred items list recording exactly how both carried-forward decisions resolved (not left
implicit, per the roadmap's own explicit instruction not to let this drop a second time). Its own
"Carried forward from B12" subsection was updated in place to record the resolution rather than
restate the open question. `docs/roadmaps/backend-roadmap.md`'s Phase Completion Tracking table also
had its B10/B11/B12 rows corrected from a stale NOT STARTED placeholder (the identical class of
staleness this table's own header note already recorded fixing once for B0–B9) while updating B13's
own row. `docs/roadmaps/roadmap-index.md`'s version (1.24), Current State, and Immediate Next Actions
all updated to record `B13` complete and `B14` next on the critical path.

Project state moves from _Implementation (B12/F12 complete)_ to _Implementation (B13 complete)_.
**Next: `B14 — Submission & Marking`** on the backend critical path (`Gate 1 ADRs → B0 → B1 → B2 →
B3 → B5 → B6 → B8 → B9 → B11 → B12 → B13 → B14 → B15 → …`) — the roadmap's own explicit instruction
is that `B13` and `B14` must not be parallelised with each other (B14's submission/auto-submission
logic depends on B13's attempt state machine being settled), so this is the natural, required next
step, not merely the next-numbered one. A future `F13` (the offline exam engine) remains open and
buildable immediately against the now-frozen `attempt.v1` contract, independent of `B14`.

### 2026-09-05 — `B14` complete: Submission & Marking

Requested explicitly: start `B14`. Followed the working-rules checklist via three parallel research
passes (the full B14 roadmap section, its two decided ADRs — 0003, 0004 — in full, and every
B14-assigned audit finding, X-01/X-07; the product specification text for submission/auto-submission/
marking across `05`/`06`/`07`/`08`, cross-checked for exactly where the `Result` boundary actually
falls between this phase and B15; the existing B13 implementation — `AttemptLifecycleService`,
`attempt-admissibility.util.ts`, `attempt-snapshot-projection.mapper.ts`, the worker sweep
conventions in `subscription-expiry.queue.ts`/`exam-control-refresh.queue.ts`), then a dedicated Plan
agent, then direct verification reads of the live source before writing any code — per this
project's own precedent for the highest-risk segment of the roadmap.

**Two genuine architecture-boundary questions confirmed with the project owner before planning was
finalized, not guessed, mirroring this project's own established practice for exactly this class of
decision:**

1. **B14 stays entity-free for `Result`.** Only `AttemptQuestionResult` (per-question marking
   output — `CORRECT`/`INCORRECT`/`UNANSWERED`/`PARTIAL`) is persisted. Totals/percentage/counts for
   the new `GET /v1/attempts/:id/status` are computed **live** by aggregating those rows on every
   read — never persisted as a `Result` row. This matches the roadmap's own literal DB-work section
   (which never lists a `Result` table as B14's deliverable) and its own "B15 creates results from
   marking output" phrasing more closely than the alternative (B14 also creating a `PROCESSING`-
   state `Result` row) — and avoids a partial, null-grade `Result` shape B15 would otherwise have to
   migrate around, since grade computation needs B15's own not-yet-built `GradingScale`.
2. **`AttemptAuthorization`/`examAdmin.invalidateAttempt`/`.grantMakeup` are deferred to `B16`**,
   matching ADR-0014's own "Blocks phases: B16" text — not built here, despite the permission
   table's own `awaitingResource` tags (and one `AttemptType` schema comment) previously saying
   "B14." A genuine documentation inconsistency found during research (the tags trace back to
   informal B12/B13-era discussion, never the roadmap's own frozen B14 Scope/API/DoD text, which
   never once mentions invalidation or makeup) — corrected as a small, confirmed documentation-
   accuracy fix, not new scope.

**A third decision, changing B13's own shipped behaviour, confirmed directly against the code before
implementing**: a manual `POST /submit` arriving past the grace window used to throw `400
ATTEMPT_WRITE_WINDOW_CLOSED` — a real gap once ADR-0004's mechanism exists to actually resolve the
underlying condition. Confirmed with the project owner: `submit()`'s own `REJECTED` branch now calls
the same shared finalisation routine and returns the resulting `AUTO_SUBMITTED` state as an ordinary
200, completing ADR-0004's "any server request touching an expired attempt finalises it immediately"
in the one narrow race window that error case represented.

**Schema** (`packages/db/prisma/schema.prisma`, one migration `20260905090449_b14_submission_
marking`): one new table, `AttemptQuestionResult` — keyed `(schoolId, attemptId, examQuestionId)`,
deliberately mirroring `AttemptAnswer`'s identical shape (the upsert target); `maximumMarks` is
denormalized from the snapshot's own frozen per-question marks, matching `ExamAttempt
.durationGrantedSeconds`'s own "copy the frozen value, don't re-derive" precedent. One new enum,
`AttemptQuestionCorrectness` (`PARTIAL` reserved, unused this phase — every question type this
codebase supports today is decided purely by a single selected option's `correctFlag`). One new
school-scoped partial index for the sweeper (`exam_attempts (school_id, expires_at) WHERE state =
'IN_PROGRESS'`). One genuinely new trigger idiom, distinct from B13's three: a parent-state-gated
**write** guard blocking INSERT/UPDATE only _while_ the parent attempt is still `IN_PROGRESS` — never
blocking for any other reason, since re-marking (an upsert) is a deliberate, expected overwrite, not
an anomaly the way `AttemptAnswer`/`AttemptQuestionSnapshot` need an immutability trigger for. Two
stale "B14" references corrected to "B16" during this same pass: `AttemptType`'s own enum comment
and `ExamAttempt.invalidatedByMembershipId`'s comment, both predating this phase's own confirmed
decision 2.

**Cross-app sharing** (`packages/domain/src/execution/`, new — the first time this codebase has
needed a second app to share attempt-engine logic, not just types): `evaluateWriteAdmissibility`/
`attemptGraceWindowSeconds` moved verbatim out of `apps/api`-local code, since `apps/worker`'s
sweeper needs the _identical_ grace-window boundary and a hand-duplicated second copy would be
exactly the drift risk `AGENTS.md §5` names by name for this subsystem. `computeAttemptQuestionMarking
Results` (new) is a single shared pure function — no DB parameter in its signature at all, only the
frozen snapshot document and caller-supplied answers — which is what makes DoD item 11 ("editing the
source question after the exam does not change any recorded mark") true **structurally**, not merely
by testing; `apps/worker`'s marking-job consumer is directly readable as never touching `Question`/
`QuestionRevision`/`ExamQuestion`/`QuestionOption` anywhere. `ATTEMPT_MARKING_QUEUE_NAME`/
`AttemptMarkingJobPayload` mirror `packages/notifications`' own dispatch-queue contract shape
exactly. The pre-mapping `SnapshotSource*` builder-input shapes (no second-app caller) stay local to
`apps/api`, as does the X-05-critical `toStudentAttemptQuestions()` projector.

**`apps/api`**: `AttemptLifecycleService.submit()`/`.end()` enqueue marking (stable `mark-
${attemptId}` jobId) after their own conditional transition commits — never marking synchronously
inline, keeping the interactive path minimal per the roadmap's own text. New `AttemptFinalization
Service` implements ADR-0004's shared idempotent routine (one atomic conditional `UPDATE ... WHERE
state = 'IN_PROGRESS' AND expires_at <= cutoff`), called opportunistically from every relevant
touchpoint: `AttemptEventService.heartbeat()`, `AttemptAnswerService.writeAnswerInner()`'s own
rejection path (best-effort, the client-visible late-_answer_ response is unchanged — only late-
_submit_ changes, per decision 3), `submit()`'s own `REJECTED` branch, `resume()` (added for literal
ADR-0004 completeness, not one of the roadmap's own named "natural candidates"), and the new `GET
/v1/attempts/:id/status`. New `AttemptMarkingQueueService` (producer-only `Queue` handle, mirroring
`NotificationDispatchQueueService`'s own established B7/B10 split). New `AttemptStatusService` +
`AttemptStatusResponseDto` live-aggregate `AttemptQuestionResult` rows into `marking: {status:
NOT_APPLICABLE|PENDING|COMPLETE, questionCount, markedCount, correctCount, incorrectCount,
unansweredCount, partialCount, awardedMarks, maximumMarks, percentage}` — deliberately not a
`Result` view, per decision 1. `ATTEMPT_AUTO_SUBMITTED` registered alongside B13's own non-canonical
attempt actions.

**`apps/worker`**: two new queues. `attempt-auto-submit.queue.ts` (`runAttemptAutoSubmitSweep`) is
ADR-0004's authority half — the exact same conditional-transition idiom as `AttemptFinalization
Service`, independently implemented (the two cannot share code across the `apps/api`/`apps/worker`
boundary), sharing only `@atlas/domain`'s grace-window function so the two can never disagree about
the boundary itself. Per-attempt `try/catch`, not just per-school — one level finer than every other
sweep in this file, since a single attempt's audit-write or enqueue failure is a much narrower blast
radius than a whole tenant's. `attempt-marking.queue.ts` (`runAttemptMarking`) is the marking-job
consumer, **deliberately placed in `apps/worker`, not `apps/api`** — a genuine departure from B7/B10's
own precedent (both hosted their consumers in `apps/api` specifically because they reuse Nest-DI-
resolved singletons `apps/worker` cannot reach; marking has no such dependency), giving it real
BullMQ retry/backoff/crash-resumability with no extra bootstrap machinery. The whole per-attempt
marking run sits inside one `withTenant` transaction, so "resumable" (DoD item 10) means "safely
re-run from scratch" on a crash/retry (full transactional rollback, zero partial rows), not literal
partial-progress resumption — simpler, and correct at this codebase's actual per-attempt scale.

**A known, documented residual risk, not silently accepted**: the state transition itself must
commit immediately regardless of downstream availability (ADR-0004), so — unlike `subscription-
expiry.queue.ts`'s own "don't mark a threshold handled until the dispatch enqueue actually succeeds"
pattern — neither `AttemptFinalizationService` nor the sweeper can defer finalisation until
`marking.enqueue()` succeeds. A Redis outage at that exact instant would leave an attempt correctly
finalized and audited but with marking never enqueued, and nothing today re-discovers and retries
that gap later. Recorded explicitly in both services' own doc comments as a Candidate for a future
hardening pass or `B21`, not a defect this phase silently shipped unaware of.

**A real, live-verified end-to-end proof, not just component-level tests**: booting the real
compiled `apps/api` and `apps/worker` processes against the same Redis showed roughly twenty real
marking jobs — enqueued by earlier `apps/api` integration-test runs genuinely exercising `submit()`/
`end()` (each test file boots its own separate `AppModule`; only `attempt.integration.test.ts`'s own
mocked spy suppresses its own calls, so every _other_ file's calls went out for real) — complete
successfully once the worker started consuming, proving the cross-process queue mechanism for real,
not only against mocks. One additional job failed; traced directly (via a real owner-connection
query against the dev database) to a stray, malformed leftover fixture from this session's own
earlier, already-fixed test-writing iterations against the shared, non-isolated dev database — the
marking job correctly rejected the malformed input with a clear Postgres error rather than corrupting
anything, and the underlying fixture bug had already been fixed in the committed test file before
this verification ran. Not a product defect.

**Testing**: `packages/domain/src/execution/attempt-admissibility.test.ts` (moved, unchanged, 9
tests) and `attempt-marking.test.ts` (new, 7 tests — table-driven marking arithmetic with no DB
involved). `apps/api`'s `attempt.integration.test.ts` gained 9 new B14 cases (marking-enqueue wiring
and jobId stability; a 10-way concurrent-submit race yielding exactly one submission and one enqueue;
the confirmed late-submit-finalizes-to-200 behaviour change; `GET /status`'s three marking states —
`NOT_APPLICABLE`/`PENDING`/`COMPLETE` with exact live-aggregated totals; a cross-student security
regression; the new trigger proven directly by a raw-Prisma bypass) — 33 tests in that file total,
all green against real Postgres. Two new `apps/worker` integration test files:
`attempt-auto-submit.integration.test.ts` (5 tests — full timeout finalisation with audit+enqueue;
never-finalizes-within-grace; a second tick is a safe no-op; a concurrency stand-in pre-setting an
attempt to already-`SUBMITTED`; one attempt's enqueue failure never blocks a sibling attempt's own
finalisation in the same sweep tick) and `attempt-marking.integration.test.ts` (5 tests — correct/
incorrect/unanswered marking; idempotent re-marking with no duplicate rows; a forced mid-run crash
proving full transactional rollback then a clean resumed re-run; refusing to mark a still-
`IN_PROGRESS` attempt, deferring to BullMQ retry; the new trigger proven directly). `tests/tenancy/
rls.integration.test.ts`'s existing B13 describe block extended to cover `attempt_question_results`
too (a second, minimal attempt per fixture school, created directly `SUBMITTED` to hold the one
result row the shared IN_PROGRESS-attempt fixture structurally cannot) — 121 tests in that file, up
from 103 (net +18: the new table's 3 cases × 6 already-covered assertion shapes... actually 3 new
`it.each` cases across the existing 3-assertion matrix). DoD item 11 (data integrity against source-
question edits) is proven **structurally** rather than via a live `Question`/`QuestionRevision`
fixture mutation — see `attempt-marking.integration.test.ts`'s own header comment for the full
reasoning (the marking function's signature has no database parameter at all, a stronger guarantee
than an integration test observing an absence of effect in one fixture).

Full pipeline green, run in full after every fix: `pnpm lint && pnpm typecheck && pnpm build` at the
monorepo root (16/16 turbo tasks, including the schema-tenancy lint across all 47 models), the full
`apps/api` integration suite (306 tests across 36 files, zero regressions), the full `apps/worker`
integration suite (32 tests across 7 files), and the extended RLS suite (121 tests) — plus `pnpm
generate` (`GET /v1/attempts/:id/status` published in `apps/api/openapi.json`/`packages/contracts`)
and `pnpm generate:permission-table-doc` (156 rows, confirmed unchanged in count — every edit this
phase made to the permission table was a tag correction, not a grant or row change). A real `node
dist/main.js` boot (`apps/api`) confirmed `PolicyCoverageService` reports 195 routes checked with
zero violations (up from 194 — exactly the new status route); a real `node dist/main.js` boot
(`apps/worker`) confirmed both new queues (`atlas-attempt-auto-submit-sweep`, sweep every 15000ms;
`atlas-attempt-marking`, per-item, no schedule) register correctly alongside every pre-existing sweep,
and is what surfaced the live cross-process verification described above. One pre-existing, unrelated
test failure was observed and confirmed via `git stash` to already exist on unmodified `dev` branch
code before this phase touched anything: `attempt-snapshot-projection.mapper.test.ts`'s "resolves
media URLs... defaulting to empty strings when unresolved" case, a stale assertion predating a B13-era
fix that changed unresolved-media handling from blank-string to omission — not fixed here, per
`AGENTS.md §15`'s "no unrelated broad refactors" (recorded as a Candidate for whoever next touches
that file).

`docs/roadmaps/backend-roadmap.md`'s B14 section gained status `COMPLETE`, every DoD item annotated
with what's real versus honestly-partial-with-reason (item 2, the confirmation UI's unanswered-count
warning, is F13's job), a full "Implementation notes" subsection, and an expanded Deferred items list
recording exactly how both carried-forward decisions and the third confirmed behaviour change
resolved. The Phase Map and Phase Completion Tracking tables both had their B13/B14 rows corrected
(B13 had drifted to "NOT STARTED" in the Phase Map specifically, a stale artifact predating this
session). `docs/roadmaps/roadmap-index.md`'s version (1.25), Current State, and Immediate Next
Actions all updated to record `B14` complete and `B15` next on the critical path.

Project state moves from _Implementation (B13 complete)_ to _Implementation (B14 complete)_.
**Next: `B15 — Results & Publication`** on the backend critical path (`Gate 1 ADRs → B0 → B1 → B2 →
B3 → B5 → B6 → B8 → B9 → B11 → B12 → B13 → B14 → B15 → …`) — the phase that creates `Result` itself
from this phase's own marking output, closes `09 §39`'s full golden-path exit criterion jointly named
by both B13 and B14, and is gated by ADR-0010/0018/0025 (all three already Accepted). A future `F13`
(the offline exam engine) remains open and buildable immediately against the now-frozen `attempt.v1`
contract (11 routes), independent of `B15`.
