# CLAUDE.md

## Project

**Project Atlas**
Commercial multi-tenant Computer-Based Testing (CBT) platform for secondary schools, initially targeting Nigeria.

> The internal codename "Project Atlas" is temporary unless/until a final commercial product name is established.

Agent working rules (imported so they load every session): @AGENTS.md

---

## Project Status

**Current Stage:** Implementation, in progress. Specification audit, roadmaps, and all 33
architecture decisions were completed first (see below); backend phases `B0`–`B22` and every
frontend phase through `F21` are now implemented. `CHANGE-LOG.md` holds the dated record of what
shipped; "Current Phase" below is a short summary that points to it.

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

**Pilot hosting (2026-10-04):** the AWS/Vercel rows above are the target design. The pilot runs on
a single VPS (Docker Compose: Caddy, `next start`, API, worker, PostgreSQL, Redis, MinIO) with SMTP
email — ADR-0032 and ADR-0019 amendments, `docs/operations/vps-pilot.md`.

Technology choices must still be validated during implementation where specific versions, infrastructure capabilities, or constraints have changed.

---

## Frontend Design Governance

Authoritative for all frontend visual/UX decisions:

- [`docs/design/ui-ux-principles.md`](docs/design/ui-ux-principles.md) — the design specification
  and rationale.
- [`.claude/skills/project-atlas-ui/SKILL.md`](.claude/skills/project-atlas-ui/SKILL.md) — the
  project-specific operational doctrine.

These specialize two vendored skills in `.claude/skills/` rather than replacing them:
`frontend-design` (Anthropic — aesthetic direction for deliberate, non-templated visual design) and
`web-design-guidelines` (Vercel — fetches the live Web Interface Guidelines and reviews implemented
screens against them). Why these two, and which skills were considered and rejected, is recorded in
`CHANGE-LOG.md` (2026-08-25, "Frontend design governance established").

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
- [x] Security hardening & compliance (`B20`)
- [ ] Product implementation

### Current Phase

Backend `B0`–`B22` and frontend `F0`–`F21` are implemented (B19's own roadmap section is still
open). **B23** (production readiness) is **IN PROGRESS** (2026-10-04). Its repository work is done:
CDK infrastructure in `af-south-1`, the deploy and rollback pipeline, migration safety, the golden
path and smoke checks, SES email, invigilator signals, and the operations docs. Provisioning,
staging measurements, the legal review and the pilot remain, all tracked in
`docs/operations/launch-checklist.md`. **The pilot runs on a single VPS** (owner decision
2026-10-04, ADR-0032 amendment; `docs/operations/vps-pilot.md`, `infra/vps`), with SMTP email; the
AWS design waits until the platform outgrows one server. **F21** (its frontend pair) is
**IMPLEMENTED — PILOT PENDING** (2026-10-05): every PR runs the pilot's Compose stack in CI in
place of previews and staging (owner decision), service-worker updates wait for open exams, and
user guides are in `docs/user-guides/`. B23 and F21 both close with the pilot exam. Each phase's DoD outcome,
partial items and design reasoning are in its dated `CHANGE-LOG.md` entry and its roadmap section;
read those before resuming related work.

Open items carried forward:

- F21's pilot findings (the export dialog asks for raw IDs, staff invitations last one hour, print
  gaps) are Candidate/Deferred in its roadmap Implementation notes.
- `F12` operational alerts (DoD item 10) stay deferred; the disconnected flag and signal counts now
  show in the live table (B23).
- Excused absence is intentionally deferred (`F16`).
- B23 launch items for the VPS pilot (launch checklist section 0): server, domain and DNS, SMTP
  provider, off-site backups, first deploy and restore rehearsal; legal review of retention, the
  DPA and the pilot's cross-border transfer; the pilot itself. The AWS items (staging level 1,000,
  proxy pinning, failover and PITR timing) wait for the AWS design. Full list:
  `docs/operations/launch-checklist.md`. Audit BLOCKER/HIGH: 57/58 closed, R-03 waits on staging
  (`docs/audit/blocker-high-closure.md`).
- Product name decided: **ExamKeep** (still read from `PRODUCT_NAME`). Its public marketing site is
  `apps/marketing` on the root domain (ADR-0034); real screenshots wait on a visual-only polish of
  the showcase screens, and site claims must stay true of the product (`lib/content.ts`).
- Local and CI object storage is Chainguard's MinIO build pinned by digest (MinIO withdrew its
  public images, 2026-10-02 CI repair entry).

Engineering facts every session needs:

- The application connects to Postgres as the non-superuser `atlas_app` role
  (`infra/postgres/init.sql`, `DATABASE_APP_URL`), never as the migration owner — a superuser
  bypasses RLS even under `FORCE ROW LEVEL SECURITY`. Unscoped queries therefore cannot see rows
  across schools; cross-school work iterates schools via `withTenant`.
- The migration deploy wrapper reasserts `atlas_app`'s grants after every deployment, so new
  RLS-protected tables stay reachable only through their tenant policy.
- `login_identifier` lives on `SchoolMembership`, not `User` (ADR-0005 per-school uniqueness).
- Long-running worker sweeps use an explicit 120-second renewable BullMQ lock.
- Redis is never authoritative and is not backed up: the worker's schedule guard re-registers job
  schedulers a Redis wipe deletes, and its reconciliation re-queues owed marking/adjustments. A
  Redis outage must degrade, never hang or block sign-in (B22).
- Restores: `ops:restore-verify`, `ops:attempts-affected`, `ops:redact-subject --replay`,
  `ops:anonymise-copy` (any non-production copy); drill `infra/dr/pitr-drill.sh`. The redaction
  register stores UUIDs only, never the redacted PII.
- B20 least privilege: `atlas_app` cannot DELETE academic evidence, audit or schools, nor write
  `platform_role_assignments` (`packages/db/src/privileges.ts`). Tests needing those use the owner
  connection (`test-support/owner-prisma.ts`); never widen the grants to make a test pass.
- Every route is in the security suites automatically (`pnpm test:security`, route inventory from
  Nest metadata) — a new route must pass tenant isolation and privilege escalation on its first run.
- B21 load shedding: the in-flight middleware must read `req.originalUrl` — under Fastify's
  middleware layer `req.url` is rewritten to `/`. Reporting routes are shed/bulkheaded while exams
  run (`apps/api/src/load/`); the web client must honour `Retry-After`.
- Logging goes through `@atlas/observability` (redacting pino); never log request bodies, answers,
  tokens or PII. Route params named `id`/`…Id` must be UUIDs (global pipe).
- B23 deploys: the pilot deploys with `infra/vps/bin/deploy.sh` on the VPS (`vps-pilot.md`). The
  AWS design is `infra/cdk` (asserted by `infra/cdk/test`): staging on merge to `dev`, production on
  a `v*` tag after Haneef approves — those triggers are paused until AWS is provisioned, so
  `deploy.yml` runs only by hand. Never run the golden path (which writes test data) against
  production. Migrations must be expand-only (`pnpm lint:migrations`,
  `docs/operations/migrations.md`). Schools reach the API at `<school>.api.<root>`.
- Help (ADR-0035): staff task guides live in `apps/web/lib/help/guides/` and in
  `docs/user-guides/`; a change to a screen a guide names updates both. No AI assistant for staff
  without a new owner decision, and never one for students.
- F20 web: every page carries a per-request nonce CSP (`apps/web/proxy.ts`) — no inline script, and
  new external origins must be added in `lib/security/csp.ts`. API requests must never be cached by
  the service worker (`app/sw.ts` bypasses them). Build the web app with `NEXT_PUBLIC_MEDIA_ORIGIN`
  set; browser suites need production builds (`apps/web/e2e/README.md`).
- F21 web: the service worker never activates itself. Pages ask it to, and it refuses while any tab
  holds an open-attempt heartbeat mark in Cache Storage (`lib/pwa/update-policy.ts`; `Client.url`
  does not follow client-side navigation, so never gate on URLs). `e2e/deployment.spec.ts` proves
  a mid-exam deploy. No browser source maps ship; the post-deploy smoke checks it.

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
11. Record meaningful project-state changes as a dated entry in `CHANGE-LOG.md`; update this
    file's "Current Phase" summary only when the phase or an open item changes, keeping it short.

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
dependency and may proceed independently at any time. See `AGENTS.md` §19 for the full rule.

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
- AWS backend infrastructure + Vercel Next.js frontend (target design; the pilot runs on a single
  VPS with SMTP email, 2026-10-04 amendments to ADR-0032 and ADR-0019)

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

- **ADR-0028** — retention schedule formalised in `B20` (2026-10-02 amendment); legal review carried to `B23` as a launch-readiness item.
- **ADR-0032** — `af-south-1` for the AWS design (B23 amendment); the pilot runs on a single VPS (2026-10-04 amendment). Revisit before a second school or when a sitting nears the server's limit.

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
