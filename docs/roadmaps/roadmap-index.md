# Roadmap Index — Project Atlas CBT Platform

**Version:** 1.1 · **Created:** 2026-08-24 · **Last updated:** 2026-08-25 · **Status:** In implementation (`B0` complete)

| Document                                                             | Purpose                                                       |
| -------------------------------------------------------------------- | ------------------------------------------------------------- |
| [`backend-roadmap.md`](./backend-roadmap.md)                         | 24 backend phases, `B0`–`B23`                                 |
| [`frontend-roadmap.md`](./frontend-roadmap.md)                       | 22 frontend phases, `F0`–`F21`                                |
| [`../audit/specification-audit.md`](../audit/specification-audit.md) | 88 findings across nine specifications                        |
| [`../decisions/`](../decisions/)                                     | Architecture Decision Records — 33 of 33 decided and accepted |

---

## 1. Current State

`B0` is complete — see `backend-roadmap.md`'s B0 section and `CLAUDE.md`'s 2026-08-25 change-log entry for what shipped. `B1` is next.

| Item                | State                                                                                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Specifications      | 9 documents, 18,271 lines, read and audited                                                                                                                              |
| Specification audit | Complete — 88 findings, 18 BLOCKER, 40 HIGH                                                                                                                              |
| Backend roadmap     | Complete — 24 phases                                                                                                                                                     |
| Frontend roadmap    | Complete — 22 phases                                                                                                                                                     |
| ADRs                | **33 of 33 decided and accepted (2026-08-24)**                                                                                                                           |
| Application code    | `B0` complete (2026-08-25) — monorepo, NestJS+Fastify skeleton, Prisma/PostgreSQL 18.6, tenancy/RLS, error envelope + idempotency contract, BullMQ, CI. See §2's P0 row. |

**All decision gates are resolved; `B0` is done.** See §7 for what each gate settled.

Two decisions carry conditions: [ADR-0028](../decisions/ADR-0028-data-protection-and-retention.md)'s retention schedule is provisional pending legal review at B20, and [ADR-0032](../decisions/ADR-0032-aws-region.md)'s region must be validated by measurement at B21.

---

## 2. Phase Pairing Map

Each row is an integration pair. A pair is complete only when the backend phase, the frontend phase, **and** the integration test expectation are all satisfied.

| Pair    | Backend                                        | Frontend                                   | Integration objective                                                                                                                     |
| ------- | ---------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **P0**  | B0 Engineering Foundation & Contracts          | F0 Frontend Foundation & Design System     | Shared contracts, error envelope, and theming exist and compile end to end                                                                |
| **P1**  | B1 Identity & Authentication                   | F1 Authentication & Tenant Entry           | A user of any role authenticates into the correct tenant and stays authenticated across a refresh                                         |
| **P2**  | B2 Authorization & Tenancy Engine              | F2 App Shell, Navigation & Notifications   | Each role sees exactly its own workspace, and the server independently enforces it                                                        |
| **P3**  | B3 Platform, Schools & Subscriptions           | F3 Platform Admin Workspace                | Software Admin runs the full school and subscription lifecycle                                                                            |
| **P4**  | B3 + B4 + B5 + B6                              | F4 School Onboarding Wizard                | A school goes from activation key to operational in one resumable flow                                                                    |
| **P5**  | B4 Media, Storage & Branding                   | F5 School Settings & Branding              | One primary colour and a logo brand the entire platform for that school                                                                   |
| **P6**  | B5 Academic Structure                          | F6 Academic Structure Workspace            | A school's sessions, classes, and subjects exist and are session-scoped                                                                   |
| **P7**  | B6 People, Profiles & Enrollment               | F7 People Management Workspace             | People exist, are assigned, and those assignments drive real access                                                                       |
| **P8**  | B7 Bulk Import Pipeline                        | F8 Bulk Import UI                          | 1,500 students import with no silent partial commits                                                                                      |
| **P9**  | B8 Question Bank                               | F9 Question Bank Workspace                 | A teacher authors questions within scope, and approved revisions are immutable                                                            |
| **P10** | B9 Question Review & Governance                | F10 Question Review Workspace              | An HOD processes a review queue efficiently, and history is preserved                                                                     |
| **P11** | B11 Exam Builder & Readiness                   | F11 Exam Builder                           | An exam is built from approved revisions and passes an itemised readiness check                                                           |
| **P12** | B12 Exam Activation & Control                  | F12 Exam Control Center                    | A teacher administers batches live, in a lab, with confidence                                                                             |
| **P13** | B13 + B14 Attempt Engine, Submission & Marking | F13 Student CBT Client                     | **A student completes an examination through network loss, refresh, and crash without losing a single answer or gaining a single second** |
| **P14** | B15 Results & Publication                      | F14 Student Results & Profile              | A student sees only published results                                                                                                     |
| **P15** | B15 Results & Publication                      | F15 Staff Results & Publication            | Staff publish and adjust results with no path to silently edit a score                                                                    |
| **P16** | B16 Participation, Absence & Makeup            | F16 Participation, Absence & Makeup        | Absence is separate from score, and makeup preserves the original absence                                                                 |
| **P17** | B17 Analytics                                  | F17 Dashboards & Analytics                 | Each role's dashboard answers its defining question immediately                                                                           |
| **P18** | B18 Reporting & Export                         | F18 Reporting, Export & Search             | Exports preserve academic statuses, and search never crosses a scope boundary                                                             |
| **P19** | B19 Academic Session Rollover                  | F19 Session Rollover UI                    | A school moves into a new session without losing or rewriting history                                                                     |
| **P20** | B20 + B21 Security, Performance & Load         | F20 Accessibility, Performance & Hardening | The platform withstands production load, hostile input, and real lab conditions                                                           |
| **P21** | B22 + B23 Recovery & Production Readiness      | F21 Production Readiness                   | The platform is deployed, recoverable, and proven by a pilot examination                                                                  |

`B10 Audit & Notifications` has no dedicated frontend phase — it surfaces through F2 (notifications) and F3 (platform audit), and is consumed as a cross-cutting requirement by every other phase.

**P0 status:** B0's half is complete (2026-08-25) — contracts, error envelope, and idempotency are published and `apps/web` builds against `packages/contracts`. F0 hasn't started; P0 isn't closed until it does and confirms the contract package is sufficient to build its API client (B0's Definition of Done item 9).

---

## 3. Integration Contracts & Test Expectations

The contract column names the capability the frontend consumes, satisfying the contract-first requirement: a frontend phase states _what capability_ it uses, never merely "connects to backend."

| Pair    | API contract dependency                                                                   | Integration test expectation                                                                                                              | Pair complete when                                                                                  |
| ------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **P0**  | OpenAPI document, `packages/contracts` types, error envelope, `Idempotency-Key`           | Generated client compiles and calls `/v1/health`                                                                                          | Both build from a clean clone; the contract package is consumed by the web app                      |
| **P1**  | `auth.v1` — login, logout, refresh, `me`, password change/reset; `GET /v1/tenant/resolve` | All six roles log in and land correctly; **refresh preserves the session**; cross-tenant identifier collision refused                     | Login works for every role; suspended and inactive refused; refresh persistence proven              |
| **P2**  | `GET /v1/me/permissions`; `GET /v1/academics/context`                                     | Each role sees exactly its `04 §68` navigation; direct navigation to an unauthorized route is refused server-side and handled client-side | Navigation matches the matrix; the generated cross-tenant suite is green                            |
| **P3**  | `platform.v1`, `subscriptions.v1`; `GET /v1/platform/audit`                               | Create school → issue key → view status → suspend → reactivate                                                                            | The full lifecycle runs from the UI; **a row-count assertion proves no academic data is destroyed** |
| **P4**  | Activation endpoints, `schools.v1`, branding, `academics.v1`, `people.v1`                 | Activation key → 10-step wizard → operational school; **close the browser mid-wizard and resume**                                         | A school completes onboarding end to end and the wizard resumes after interruption                  |
| **P5**  | `GET/PUT /v1/school/branding`                                                             | Change primary colour → verify propagation to login, dashboard, and exam interface                                                        | Branding applies platform-wide and does not alter historical reports                                |
| **P6**  | `academics.v1`                                                                            | Create session → terms → departments → classes → subjects → offerings                                                                     | Structure exists; the single-`CURRENT`-session invariant holds under concurrency                    |
| **P7**  | `people.v1`                                                                               | Create teacher → assign Mathematics/SS2A → confirm scope reflects it; move a student and confirm history is unchanged                     | Assignments drive real access; class movement preserves historical context                          |
| **P8**  | Import upload, status, validation report, errors, confirm                                 | 1,500-row import: validate, review errors, confirm valid rows only                                                                        | Import completes within budget; invalid rows are never silently imported                            |
| **P9**  | `questions.v1`                                                                            | Create → submit → reject → revise → resubmit → approve                                                                                    | Approved revisions are immutable against a direct database update; teacher scope is enforced        |
| **P10** | `question-review.v1`                                                                      | Process 5 questions consecutively through the queue flow                                                                                  | 27 questions can be reviewed without leaving the flow; self-approval is blocked                     |
| **P11** | `exams.v1` including itemised `GET /v1/exams/:id/readiness`                               | Build a 40-question exam → each readiness failure blocks and links to its resolution → mark ready                                         | Only approved revisions are selectable; a `READY` exam is immutable                                 |
| **P12** | `exam-control.v1` including the SSE stream                                                | **40 students / 20 computers**: open → authorize 20 → complete → authorize remaining 20; teacher disconnect and reconnect                 | Batch administration works on one exam record; SSE reconnects and reconciles                        |
| **P13** | `attempt.v1` + submission contract                                                        | **The full CBT test matrix** — see §4                                                                                                     | Every test in §4 passes; the `09 §39` golden path passes end to end                                 |
| **P14** | `student-results.v1`                                                                      | Submit → teacher publishes → student sees; unpublish → student no longer sees                                                             | Only published, non-voided, own results are reachable, including by URL manipulation                |
| **P15** | `results.v1`                                                                              | Void a question → every affected result recalculates → adjustment is auditable                                                            | **No UI path modifies a score outside the adjustment workflow**                                     |
| **P16** | Participation and makeup contracts                                                        | Absent → makeup granted → completes → **both the original absence and the makeup result remain visible**                                  | Absence never becomes a zero; makeup never overwrites history                                       |
| **P17** | `analytics.v1`                                                                            | Each role's dashboard answers its `04 §67` question; a failing panel degrades in place                                                    | Statistics match hand-computed fixtures; voided results are excluded                                |
| **P18** | Export and search contracts                                                               | Export exam results and verify CSV content; search per role                                                                               | `ABSENT` exports as a status, never `0`; search never crosses a scope boundary                      |
| **P19** | Rollover contract                                                                         | Generate plan → override exceptions → commit → verify history unchanged                                                                   | A full before/after comparison proves no historical record changed                                  |
| **P20** | No new contracts                                                                          | 1,000 concurrent attempts; accessibility and browser matrix; constrained-network lab burst                                                | Load, security, accessibility, and hardware suites all pass                                         |
| **P21** | Production configuration                                                                  | Golden path against staging; **a pilot examination with a real school**                                                                   | Pilot succeeds; go/no-go review passes                                                              |

---

## 4. The P13 Test Matrix

P13 is the pair the product exists for. It is called out separately because `AGENTS.md` §5 designates the exam engine as the subsystem that must never be compromised, and because a defect here is discovered by a student mid-examination rather than by a developer.

Every row must pass before P13 is complete. All are release blockers.

| Concern                  | Test                                                                                          |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| **Timer**                | Starts on start, not on session open; two students 15 minutes apart expire 15 minutes apart   |
| **Refresh**              | Mid-exam refresh restores identical question order, identical option order, and every answer  |
| **Network loss**         | Disconnect, keep answering, reconnect — no answer lost                                        |
| **Prolonged offline**    | 10 minutes offline, 15 answers, reconnect — all 15 sync                                       |
| **Answer persistence**   | Every answer durably committed before acknowledgement                                         |
| **Reconnect ordering**   | Replayed offline answers never overwrite a newer online answer                                |
| **Duplicate submission** | Double-click submit produces exactly one submission and one result                            |
| **Timeout**              | Expiry auto-submits with no confirmation prompt                                               |
| **Abandoned attempt**    | Browser closed, machine powered off — the sweeper still finalises and marks it                |
| **Concurrent attempts**  | Simultaneous duplicate start creates exactly one attempt; 1,000 concurrent attempts sustained |
| **Invalidation**         | Invalidated mid-attempt — writes stop, timer stops, terminal screen shown                     |
| **Makeup attempts**      | A makeup creates a new attempt without touching the original record                           |
| **Clock manipulation**   | Device clock moved backward does not extend the attempt                                       |
| **Media offline**        | Question images render while offline                                                          |
| **Answer-key exposure**  | **Browser storage contains no correct answers** — verified by inspecting IndexedDB            |
| **Golden path**          | `09 §39`'s full journey: create school → … → student views result                             |

---

## 5. Parallel Development Guidance

### Work that can start immediately, before any backend phase completes

| Work                                                                         | Phase | Why it is safe                                                                               |
| ---------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------- |
| Design system and component library                                          | F0    | No API surface                                                                               |
| Theming engine                                                               | F0    | Pure client computation                                                                      |
| Application shell layout                                                     | F2    | Permissions wire in later                                                                    |
| **The offline exam engine** — Dexie schema, sync queue, state machine, timer | F13   | Buildable and unit-testable against a mock conforming to the published `attempt.v1` contract |
| Wizard step layout                                                           | F4    | Data binds later                                                                             |
| Dashboard layout                                                             | F17   | Data binds later                                                                             |
| Question editor shell                                                        | F9    | Validation binds later                                                                       |

**F13's offline engine is the longest-lead frontend item and should start as early as the `attempt.v1` contract is published** — not when B13 finishes. This is the single most valuable parallelisation available.

### Work that must wait for a stable contract

Everything else. In particular:

- F1 cannot start before `ADR-0005` and `ADR-0022` — they determine how the client holds a session.
- F12 cannot start before B12's SSE contract exists.
- F13's **integration** (as opposed to its engine) cannot start before `attempt.v1` is frozen. Contract churn here means rewriting the sync engine, which is the most expensive rework in the plan.

### Backend phases that can proceed in parallel with each other

| Group | Phases   | Condition                                          |
| ----- | -------- | -------------------------------------------------- |
| A     | B4, B5   | Both need only B0–B3                               |
| B     | B7, B8   | After B5 and B6; B7's question import waits for B8 |
| C     | B17, B18 | Both after B15 and B16                             |
| D     | B10      | After B3; runs alongside B5–B9                     |

**B13 and B14 must not be parallelised with each other.** B14's submission and auto-submission logic depends on B13's attempt state machine being settled; splitting them across teams invites a race in exactly the place races are least acceptable.

---

## 6. Critical Path

```text
ADRs (foundation six)
   │
   ▼
 B0 ──► B1 ──► B2 ──► B3 ──► B5 ──► B6 ──► B8 ──► B9 ──► B11 ──► B12 ──► B13 ──► B14 ──► B15
                                                                                        │
                                                                              ┌─────────┴─────────┐
                                                                              ▼                   ▼
                                                                        B16, B17, B18         B19
                                                                              │                   │
                                                                              └─────────┬─────────┘
                                                                                        ▼
                                                                              B20 ──► B21 ──► B22 ──► B23
```

The path runs through the exam engine. Everything before B13 exists to make B13 possible; everything after exists to make it trustworthy in production.

**B13 and B14 carry the most risk in the entire plan.** They are gated by six ADRs between them, they concentrate 8 of the audit's 18 BLOCKER findings, and they are the phases where a defect is discovered by a student in an examination hall.

---

## 7. Decision Gates

**All 33 ADRs are decided and accepted (2026-08-24).** No gate is blocking. Full outcomes: [`../decisions/README.md`](../decisions/README.md).

The gates are retained below because they record **which decisions govern which phases** — read a phase's gate before implementing it, per `AGENTS.md` §2. If a decision is later superseded, its phases return to BLOCKED.

### Gate 1 — Foundation (blocks all work)

| ADR      | Decision                                                        |
| -------- | --------------------------------------------------------------- |
| ADR-0005 | Tenant resolution at login; `login_identifier` uniqueness scope |
| ADR-0022 | Cross-origin session strategy (Vercel ↔ AWS)                    |
| ADR-0023 | PostgreSQL Row-Level Security as defence in depth               |
| ADR-0027 | Timezone policy                                                 |
| ADR-0031 | Technology version baseline re-validation                       |
| ADR-0033 | Idempotency key format and canonical API error contract         |

Decided. ADR-0005 and ADR-0022 were taken together as one DNS decision: per-school subdomains under a shared parent domain, giving same-site `HttpOnly` cookies.

### Gate 2 — Academic model (blocks B5 onward)

| ADR      | Decision                                 |
| -------- | ---------------------------------------- |
| ADR-0001 | `Subject.department_id`; question level  |
| ADR-0011 | Student subject registration / electives |
| ADR-0013 | Exam targeting multiple classes          |

Decided together as one scope model: `Subject.department_id` (one department, nullable), `Question.level` rather than class, `Topic` as a first-class entity, `StudentSubjectRegistration` for electives, and an `ExamClass` join so one exam serves several arms.

### Gate 3 — Exam engine (blocks B11–B14)

| ADR      | Decision                                   |
| -------- | ------------------------------------------ |
| ADR-0002 | Question pools in the initial release      |
| ADR-0003 | Post-expiry cutoff policy and grace window |
| ADR-0004 | Auto-submission mechanism and ownership    |
| ADR-0006 | Session authorization mode                 |
| ADR-0007 | Answer persistence model                   |
| ADR-0008 | Snapshot storage shape                     |
| ADR-0020 | Integrity signals and attempt liveness     |
| ADR-0021 | Offline media delivery                     |

### Gate 4 — Results and operations

ADR-0009, 0010, 0012, 0014, 0015, 0016, 0017, 0018, 0024, 0025, 0026, 0028, 0029, 0030, 0032 — all decided.

ADR-0019 (messaging channel) was moved into Gate 1, since credential delivery and activation keys both block B1 and B3.

Scope-affecting outcomes worth noting here: question pools, multi-section authoring UI, server-rendered PDF, and the HOD request subsystem are all **approved deferrals** — deferred by explicit decision, not dropped. They must not be implemented opportunistically (`AGENTS.md` §14).

---

## 8. Checkpoint Definitions

### Backend-complete

A backend phase is ready for frontend consumption when:

1. The API contract is stable and published in the versioned OpenAPI document.
2. Authentication and authorization behaviour is defined, implemented, and tested for every endpoint.
3. All endpoints the paired frontend phase consumes exist and return real data.
4. Database migrations are written, reversible where possible, and applied in dev, test, and staging.
5. Integration tests pass, including authorization and tenant-isolation cases.
6. Seed and demo data exist sufficient for the frontend to build without hand-crafted fixtures.
7. Error responses conform to the canonical envelope.

### Frontend-complete

A frontend phase is complete when:

1. All screens and routes in scope exist and are reachable by the intended roles.
2. Real API integration works — no mocks in the shipped path.
3. Loading, error, and empty states are implemented for every data-bearing view.
4. Authorization is respected: unavailable actions are not offered, and server denials are handled gracefully.
5. Relevant user flows are tested.
6. Browser and E2E tests pass where the phase warrants them.
7. Responsive behaviour is verified on the target lab hardware profile.

### Integration-complete

A pair is complete only when:

1. Backend and frontend work together against a real API.
2. The integration test expectation in §3 passes.
3. Relevant permissions are verified from the UI, not only at the API.
4. Error cases are tested — network failure, server error, authorization denial, validation failure.
5. The end-to-end workflow passes.
6. No BLOCKER or HIGH audit finding assigned to either phase remains open.

**A pair is not complete because both halves individually work.** Integration is its own gate.

---

## 9. Audit Findings by Pair

From [`../audit/specification-audit.md`](../audit/specification-audit.md). Each pair must resolve or mitigate its findings before it is complete.

| Pair    | BLOCKER |  HIGH | Key items                                                                                 |
| ------- | ------: | ----: | ----------------------------------------------------------------------------------------- |
| P0      |       4 |     3 | R-02 session strategy, D-01 tenant denormalisation, M-16 idempotency, M-12 timezone       |
| P1      |       2 |     2 | A-01 tenant resolution, M-07 messaging channel                                            |
| P2      |       1 |     2 | A-03 permission vocabulary, C-06 Software Admin authority                                 |
| P3      |       1 |     4 | M-07, C-13 status precedence, A-10 expiry semantics                                       |
| P5      |       0 |     3 | R-06 offline media, D-13 media immutability                                               |
| P6      |       2 |     3 | C-04 academic scope, M-02 subject registration                                            |
| P7      |       1 |     2 | M-02, C-10 HOD request workflow                                                           |
| P9      |       1 |     3 | C-04 question level, D-12 derived status                                                  |
| P10     |       1 |     1 | M-01 HOD scope resolution                                                                 |
| P11     |       1 |     4 | C-09 question pools, M-03 multi-class, A-15 marks precedence                              |
| P12     |       1 |     4 | C-08 authorization mode, C-03 PAUSED, M-09 liveness                                       |
| **P13** |   **4** | **7** | **X-01 auto-submission, X-02 cutoff, X-05 answer key, X-06 pools, D-09 duplicate starts** |
| P15     |       0 |     5 | C-05 publication model, A-11 invalidation, M-06 grading                                   |
| P16     |       0 |     3 | C-11 reattempt, A-05 participation roll-up                                                |
| P17     |       0 |     2 | A-11 voided exclusion                                                                     |
| P19     |       0 |     2 | M-10 rollover mechanics                                                                   |
| P20     |       0 |     5 | R-03 write pressure, R-08 region, M-13 data protection                                    |

P13 concentrates the risk: 4 blockers and 7 high findings in one pair.

---

## 10. Scope Confirmation

The roadmap implements the **full approved product scope**. It is divided into phases for delivery sequencing, not reduced. Per the takeover brief and `AGENTS.md` §14, nothing approved has been silently removed.

Items **deferred by the specifications themselves** (`01 §53`, `CLAUDE.md`) and carried forward unchanged: AI proctoring, facial recognition, LMS functionality, parent portal, advanced remote monitoring, essay marking, AI question generation, payment gateway, native mobile apps, report cards and transcripts, learning materials, homework, attendance, messaging.

Items **deferred by explicit decision** on 2026-08-24. Each was decided, not dropped, and must not be implemented opportunistically (`AGENTS.md` §14):

| Item                            | Finding | ADR                                                       | Re-entry cost if later approved                                                           |
| ------------------------------- | ------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Question pools                  | C-09    | [ADR-0002](../decisions/ADR-0002-question-pools.md)       | Respecify snapshot construction, marks equality, and question analytics; B11 and B13 grow |
| Server-rendered PDF             | A-13    | [ADR-0030](../decisions/ADR-0030-printable-reporting.md)  | B18 gains a rendering pipeline, worker, and artefact storage                              |
| Multi-section exam authoring UI | A-12    | [ADR-0029](../decisions/ADR-0029-exam-sections.md)        | UI only — the schema already supports it                                                  |
| HOD request/approval subsystem  | C-10    | [ADR-0017](../decisions/ADR-0017-hod-request-workflow.md) | A new phase — model, screens, notifications, state machine                                |

Per-attempt randomisation of question **order** and option **order** remains fully in scope; only pooled selection is deferred.

### Scope added by the decisions

Three decisions **added** to the approved scope rather than reducing it:

- `StudentSubjectRegistration` for electives ([ADR-0011](../decisions/ADR-0011-student-subject-registration.md)) — B6, B11, B12, B19, F7.
- `ExamClass` multi-class targeting ([ADR-0013](../decisions/ADR-0013-multi-class-exams.md)) — B11, B12, B15, B17, F11, F12.
- `Topic` as a first-class entity ([ADR-0001](../decisions/ADR-0001-academic-scope-model.md)) — B5, B8, F6, F9.

---

## 11. Maintaining This Roadmap

Per `AGENTS.md` §13:

1. Update the phase's status in its roadmap's tracking table.
2. Record implementation notes and tests completed.
3. Update the pair's status here.
4. Update `CLAUDE.md` with the project-state change.
5. **Do not mark a phase complete because part of it works.** The Definition of Done is the standard.
6. When an ADR is decided, write it to `docs/decisions/`, update the audit finding's status, and unblock the dependent phases.

### Phase ID stability

`B0`–`B23` and `F0`–`F21` are permanent. New work takes the next unused number; phases are never renumbered, because the audit, the index, and future ADRs all reference these IDs.

---

## 12. Immediate Next Actions

`B0` is complete, including its 2026-08-25 gap closure (tenant resolution mechanism, cookie/CORS/CSRF primitives, the `NotificationChannel` abstraction, and rate-limit scaffolding — see `backend-roadmap.md`'s B0 section). The next actions are build actions.

1. **Start `B1` — Identity & Authentication.** Tenant resolution at login (ADR-0005), the `auth.v1` contract, Argon2id, session lifecycle. B0's contracts, tenancy primitives, CSRF/CORS primitives, and `NotificationChannel` abstraction are the foundation it builds on — B1 needs none of them re-invented, and can prove login resolution and password-reset dispatch end to end against B0's local-dev conventions (`localtest.me` subdomains, the console notification provider) without waiting on real production infrastructure.
2. **In parallel, continue `F0`'s design system and theming engine** — no API surface, so no dependency on B1.
3. **In parallel, continue `F13`'s offline exam engine** — Dexie schema, sync queue, state machine, and timer, built against the published `attempt.v1` contract. This is the longest-lead frontend item and the most valuable parallelisation available.
4. **F0 should confirm `packages/contracts` and the error envelope are sufficient to build its API client** — the one open item in B0's Definition of Done (item 9), closing P0 out fully.
5. **Provision `eu-west-1`** per [ADR-0032](../decisions/ADR-0032-aws-region.md), with real wildcard DNS and TLS for the per-school subdomains required by [ADR-0005](../decisions/ADR-0005-tenant-resolution-at-login.md) — this is `B23` scope, not a B1 blocker: B0 already delivers the resolution mechanism and a working local-dev subdomain convention, so B1 doesn't need real production DNS to prove login resolution.
6. **Select the transactional email provider** per [ADR-0019](../decisions/ADR-0019-transactional-messaging-channel.md) and configure SPF, DKIM and DMARC — also `B23` scope, not a B1 blocker: B0 ships the `NotificationChannel` abstraction with a console/dev provider, so B1's password-reset dispatch and B3's activation-key delivery can be built and tested against it now, with the real provider swapped in later behind the same interface.
7. **Carry the two conditional decisions forward**: schedule ADR-0028's legal review into B20 and ADR-0032's RTT measurement into B21, so neither is forgotten.
