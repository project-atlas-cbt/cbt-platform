# CLAUDE.md

## Project

**Project Atlas**
Commercial multi-tenant Computer-Based Testing (CBT) platform for secondary schools, initially targeting Nigeria.

> The internal codename "Project Atlas" is temporary unless/until a final commercial product name is established.

---

## Project Status

**Current Stage:** Implementation, in progress. Specification audit, roadmaps, and all 33
architecture decisions were completed first (see below); backend phases `B0`–`B16` and every
frontend phase through `F16` are now complete (this line itself had drifted stale — kept at
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
decision; `Result`/`GradingScale`/publication are all `B15`'s job). **`F13 — Student CBT Client`**
(the offline exam engine) is complete too (2026-09-05): Dexie-backed local-write-first answer
persistence, a server-skew-derived countdown timer, Web Locks API two-tab leader election, and
Cache-Storage-backed offline media, proving `B13`+`B14`'s `attempt.v1` contract end to end with no
backend gap-closure needed. **`B15 — Results & Publication`** is complete too (2026-09-10):
`results.v1`/`student-results.v1` — the staff results list with summary statistics and ADR-0013's
per-class breakdown, per-exam publication with ADR-0010's per-result `withheld` axis, ADR-0018's
versioned grading scales with the grade frozen at finalisation, and ADR-0025's resumable parent/child
bulk adjustment as the only path by which a score changes after marking. Four decisions were confirmed
with the project owner first, each a place where an ADR demands something B15's own roadmap text never
named. Closes `B14`'s last open exit criterion. DoD item 4 is honestly partial by phase boundary (B15
owns the `VOIDED` state and the exclusion from every aggregate; the invalidation endpoint is `B16`'s
per ADR-0014), and the phase surfaced **a real cross-phase conflict `B16` must settle**: `B13`'s
attempt state-transition trigger makes `SUBMITTED` terminal, so a submitted attempt cannot be
invalidated at all — precisely the case ADR-0025 assumes. **`F14 — Student Results & Profile`** is
complete too (2026-09-10): the results list, result detail gated by the exam's `detailVisibility`
policy, and the Profile screen (`04 §60`–`§62`) — proving `student-results.v1` end to end and closing
a genuinely long-open gap, self-service password change, that every phase since F2's own Change Log
entry had left unbuilt. One confirmed small additive backend gap-closure (`GET /v1/students/me`, a new
`users.student.viewOwnProfile` permission row, 160 rows) closed the Profile screen's Class/Department
fields; one DoD item stays honestly partial by phase boundary, not fabricated (`ABSENT` exams — no
participation data exists until `B16`). **`B16 — Participation, Absence & Makeup`**,
**`F15 — Staff Results & Publication`** are complete. **`F16 — Participation, Absence & Makeup`**
is implemented, with browser E2E/manual visual validation still pending because this repository has
no configured browser harness. F16 delivers the shared staff participation/makeup workspace,
preserving original absence alongside makeup outcomes and using server-confirmed reason-bearing
actions only; excused absence remains intentionally deferred. See this file's Change Log entries below
(dated 2026-09-04, 2026-09-05 and 2026-09-10) for the preceding implementation detail.

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
