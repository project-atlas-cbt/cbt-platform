# Audit BLOCKER/HIGH closure (B23)

**Date:** 2026-10-04 · **Source:** [`specification-audit.md`](./specification-audit.md) ·
**Gate:** B23 exit criterion "No unresolved BLOCKER or HIGH audit findings remain open."

This table records the current status of every BLOCKER and HIGH finding in the specification audit,
judged from repository evidence: the ADR that settled it, plus the phase, file, test or
`CHANGE-LOG.md` entry that implements it. The audit's own count was re-verified from the finding
headers: **18 BLOCKER and 40 HIGH (58 total)**, matching its executive summary. A finding is marked
Closed only where both the decision and its implementation are evidenced; everything else is Open
with what closes it. This file is the evidence for B23's exit criterion.

| Status                 | BLOCKER |   HIGH |  Total |
| ---------------------- | ------: | -----: | -----: |
| Closed                 |      17 |     36 |     53 |
| Closed (decision)      |       1 |      0 |      1 |
| Open — B23 launch item |       0 |      2 |      2 |
| Open                   |       0 |      2 |      2 |
| **Total**              |  **18** | **40** | **58** |

Phase dates refer to the dated `CHANGE-LOG.md` entry for that phase. Paths are relative to the
repository root; `schema` means `packages/db/prisma/schema.prisma`.

## BLOCKER findings (18)

| ID   | Finding (short)                              | Status            | Evidence / what closes it                                                                                                                                           |
| ---- | -------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-04 | Subject has no department; Question no level | Closed            | ADR-0001; schema `Subject.departmentId`, `Question.level`, `model Topic`; B5 (2026-08-28), B8 (2026-08-29)                                                          |
| C-08 | Per-student session authorization mandatory? | Closed            | ADR-0006; schema `Exam.accessMode`, `ExamSessionParticipant`; `apps/api/src/modules/execution/exam-eligibility.util.ts`; B12 (2026-09-04)                           |
| C-09 | Question pools in `05`, absent from model    | Closed            | ADR-0002 (pools deferred); fixed `ExamQuestion` binding (B11, 2026-09-03); per-attempt randomisation `attempt-snapshot-builder.test.ts` (B13)                       |
| A-01 | Login does not resolve a tenant              | Closed            | ADR-0005; `SchoolMembership @@unique([schoolId, loginIdentifier])`; `apps/api/src/common/subdomain.ts`, `tenancy.middleware.integration.test.ts`; B1 (2026-08-25)   |
| A-03 | Permission-matrix vocabulary undefined       | Closed            | ADR-0012; `packages/domain/src/authorization/permission-table.ts`, `docs/architecture/permission-table.md`; `authorization-matrix.security.integration.test.ts`; B2 |
| A-04 | What makes an exam visible to a student      | Closed            | ADR-0006 (one eligibility predicate); `exam-eligibility.util.ts`, `attempt-eligibility.util.ts`; B12 (2026-09-04), B16 (2026-09-17)                                 |
| A-06 | No post-expiry cutoff policy                 | Closed            | ADR-0003; `packages/domain/src/execution/attempt-admissibility.ts` + `.test.ts`; B13 (2026-09-05)                                                                   |
| M-01 | Nothing resolves HOD review scope            | Closed            | ADR-0001; `HODAssignment` + `Subject.departmentId`; `apps/api/src/modules/authorization/scope-resolvers.test.ts`; B5, B9 (2026-08-30)                               |
| M-02 | Student subject registration not modelled    | Closed            | ADR-0011; schema `model StudentSubjectRegistration`; B6 (2026-08-28), eligibility in B12                                                                            |
| M-07 | No transactional messaging channel           | Closed            | ADR-0019; `apps/api/src/notifications/ses-channel.ts` + `.test.ts`; B0 gap closure / B1 (2026-08-25), B10 (2026-09-03)                                              |
| R-02 | Cross-origin session strategy unresolved     | Closed            | ADR-0022; `apps/api/src/security/csrf.guard.ts`, `cors.ts`, `csrf.integration.test.ts`; B0 gap closure (2026-08-25)                                                 |
| D-01 | `school_id` needed on deep tables            | Closed            | ADR-0023; composite FKs + `scripts/lint-schema-tenancy.mjs`; `tests/tenancy/rls.integration.test.ts`; B0, every phase                                               |
| D-02 | Academic scope not expressible               | Closed            | ADR-0001; as C-04/M-01; B5 (2026-08-28)                                                                                                                             |
| D-09 | Concurrent attempt creation unconstrained    | Closed            | Migration `20260904210945_b13_attempt_engine` index `exam_attempts_active_unique`; B21 DoD 2 (500 double-fired starts, 0 duplicates)                                |
| X-01 | Auto-submission has no owner                 | Closed            | ADR-0004; `apps/worker/src/queues/attempt-auto-submit.queue.ts` + `.integration.test.ts`; B14 (2026-09-05)                                                          |
| X-02 | Post-expiry cutoff policy does not exist     | Closed            | ADR-0003; as A-06; `apps/api/src/modules/execution/attempt-answer.service.ts`; B13 (2026-09-05)                                                                     |
| X-05 | Answer key travels toward the client         | Closed            | No ADR by design; `attempt-snapshot-projection.mapper.ts` + `.test.ts` (release-blocking), `attempt.integration.test.ts`, `apps/web/lib/attempt/db.test.ts`; B13    |
| X-06 | Pool draw would change the start transaction | Closed (decision) | ADR-0002 defers pools; no pool draw exists, so the start transaction is unchanged                                                                                   |

## HIGH findings (40)

| ID   | Finding (short)                                 | Status                 | Evidence / what closes it                                                                                                                                                                            |
| ---- | ----------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C-03 | `PAUSED` a permission but not a state           | Closed                 | ADR-0009; schema `enum ExamStatus` has no `PAUSED` (Pause = `OPEN → CLOSED`); B12 (2026-09-04)                                                                                                       |
| C-05 | Publication modelled twice                      | Closed                 | ADR-0010; schema `ResultPublication`, `enum ResultState`; `result-publication.service.ts`, `results.integration.test.ts`; B15 (2026-09-10)                                                           |
| C-06 | Software Admin: full authority or break-glass   | Closed                 | ADR-0012; `apps/api/src/modules/authorization/break-glass.service.test.ts`, `break-glass.integration.test.ts`; B2 (2026-08-26)                                                                       |
| C-11 | Exceptional reattempt authorized by nothing     | Closed                 | ADR-0014; schema `AttemptAuthorization`; `attempt-authorization.controller.ts`, `attempt.integration.test.ts`; B16 (2026-09-17)                                                                      |
| C-12 | School or teacher owns result visibility        | Closed                 | ADR-0010; `apps/api/src/modules/platform/school-result-policy.service.ts` + integration test; `packages/domain/src/results/result-visibility.test.ts`; F5, B15                                       |
| C-13 | Two status fields govern access                 | Closed                 | ADR-0016, ADR-0015; `packages/domain/src/platform/access-gate.ts` + `.test.ts`; B3 (2026-08-27)                                                                                                      |
| A-05 | Participation roll-up across sessions undefined | Closed                 | ADR-0024; `packages/domain/src/execution/participation.ts` + `.test.ts`; schema `ExamParticipation`; B16 (2026-09-17)                                                                                |
| A-07 | Answer persistence granularity and history      | Closed                 | ADR-0007; schema `AttemptAnswer` + `AttemptAnswerEvent`; `attempt-answer.service.ts`, `attempt.integration.test.ts`; B13                                                                             |
| A-08 | Randomisation determinism and seed storage      | Closed                 | ADR-0008; schema `AttemptQuestionSnapshot.seed`; `attempt-snapshot-builder.test.ts`; B13                                                                                                             |
| A-09 | Publication granularity                         | Closed                 | ADR-0010 (per exam); `result-publication.service.ts`, `results.integration.test.ts`; B15 (2026-09-10)                                                                                                |
| A-10 | Subscription expiry runtime semantics           | Closed                 | ADR-0015; `access-gate.ts`; `apps/worker/src/queues/subscription-expiry.integration.test.ts`; B3 (2026-08-27)                                                                                        |
| A-11 | Result after attempt invalidation               | Closed                 | ADR-0025; `ResultState.VOIDED`; `results.integration.test.ts`; B15, B16 invalidation voiding (2026-09-17)                                                                                            |
| A-15 | Which `marks` value is authoritative            | Closed                 | No ADR; `ExamQuestion.marks` authoritative, locked at `READY` (backend-roadmap B11); B11 (2026-09-03)                                                                                                |
| M-03 | An exam belongs to exactly one class            | Closed                 | ADR-0013; schema `model ExamClass`; `exam-builder.integration.test.ts`; B11 (2026-09-03)                                                                                                             |
| M-04 | No authorization entity for reattempts          | Closed                 | ADR-0014; as C-11; B16 (2026-09-17)                                                                                                                                                                  |
| M-06 | Grading scale has no entity or versioning       | Closed                 | ADR-0018; schema `GradingScale`/`Version`/`Band`; `packages/domain/src/results/grading-scale.test.ts`; B15 (2026-09-10)                                                                              |
| M-08 | Integrity signals have no model                 | **Open**               | ADR-0020: `AttemptEvent` + `POST /v1/attempts/:id/events` built (B13). Missing: Control Center counts (`05 §73`); nothing reads `AttemptEvent` for staff                                             |
| M-09 | No liveness, "disconnected" undetectable        | **Open**               | ADR-0020: `last_seen_at` + heartbeat written (B13, B21). Missing: derived "disconnected" status/alert in Control Center (F12 DoD 10 deferred; its note is stale)                                     |
| M-12 | No timezone policy                              | Closed                 | ADR-0027; `packages/validation/src/timezone.ts`, `apps/web/lib/format/date.ts`, `timestamptz` throughout; B0 (2026-08-25)                                                                            |
| M-16 | No idempotency key or API error contract        | Closed                 | ADR-0033; `packages/validation/src/idempotency-key.test.ts`, `error-envelope.test.ts`; `apps/api/src/common/idempotency.interceptor.test.ts`; B0                                                     |
| R-01 | Tenant isolation is application-layer only      | Closed                 | ADR-0023; migration `20260825001443_rls_bootstrap`; `tests/tenancy/rls.integration.test.ts`, `pooler-tenant-isolation.integration.test.ts`, `tenant-isolation.security.integration.test.ts`; B0, B20 |
| R-03 | Answer-write pressure on one Postgres primary   | Open — B23 launch item | B21 DoD 1/4 partial at 1,000 attempts. Closes on: staging re-run of level 1,000 on production topology + RDS Proxy pinning check (`docs/performance/capacity-plan.md`)                               |
| R-05 | Snapshot storage volume                         | Closed                 | ADR-0008; B21 DoD 6 measured ≈ 57 KB per 40-question attempt; `docs/performance/capacity-plan.md`; B21 (2026-10-03)                                                                                  |
| R-06 | Private media conflicts with offline execution  | Closed                 | ADR-0021; `apps/api/src/modules/execution/media-precache/media-precache.integration.test.ts`, `apps/web/lib/attempt/media-precache.test.ts`; B4, B13, F20                                            |
| R-08 | Region unspecified; latency to Nigeria          | Open — B23 launch item | ADR-0032 2026-10-03 amendment: RTT measured (`af-south-1` p50 115 ms vs `eu-west-1` 186 ms). Closes on: project owner's region decision before provisioning                                          |
| R-11 | Technology baseline needs re-validation         | Closed                 | ADR-0031 (with appendix); versions pinned in B0 (2026-08-25); re-checked in B20 (2026-10-02)                                                                                                         |
| D-03 | `Exam.class_id` is single-valued                | Closed                 | ADR-0013; as M-03; B11 (2026-09-03)                                                                                                                                                                  |
| D-04 | Duplicated School/Subscription status semantics | Closed                 | ADR-0016; `packages/domain/src/platform/access-gate.ts` + `.test.ts`; B3 (2026-08-27)                                                                                                                |
| D-06 | Answer history requirement undecided            | Closed                 | ADR-0007; `AttemptAnswerEvent` written in the same transaction; `attempt.integration.test.ts`; B13                                                                                                   |
| D-07 | Participation recorded in three places          | Closed                 | ADR-0024; as A-05; B16 (2026-09-17)                                                                                                                                                                  |
| D-08 | `Result` 1:1 `Attempt` under invalidation       | Closed                 | ADR-0025; `ResultState.VOIDED`, `ResultAdjustment`; `results.integration.test.ts`; B15, B16                                                                                                          |
| D-11 | `HODAssignment` references subject ambiguously  | Closed                 | No ADR; `HODAssignment.membershipId` (schema); `apps/api/src/modules/academics/hod-assignment.service.ts`; B5 (2026-08-28)                                                                           |
| D-12 | `Question.current_status` derived and stored    | Closed                 | No ADR; `Question.currentRevisionId` pointer, no stored status; B8 (2026-08-29 "D-12 resolution")                                                                                                    |
| X-03 | Concurrent start produces duplicate attempts    | Closed                 | As D-09: `exam_attempts_active_unique`; B21 DoD 2; `tools/load/src/scenarios.ts`                                                                                                                     |
| X-04 | Offline replay ordering and late arrival        | Closed                 | ADR-0007 per-question sequence numbers; `attempt-answer.service.ts`, `attempt.integration.test.ts`; B13, F13 (2026-09-05)                                                                            |
| X-07 | Duplicate submission                            | Closed                 | `apps/worker/src/queues/attempt-auto-submit.integration.test.ts` (ADR-0004/X-07 race); B14 (2026-09-05); B21 DoD 3                                                                                   |
| X-10 | Media unavailable offline                       | Closed                 | ADR-0021; as R-06; Start blocked until cached; B13, F20 (2026-10-04)                                                                                                                                 |
| X-11 | Accommodations have no application point        | Closed                 | `ExamSessionParticipant.extraTimeSeconds`; `apps/api/src/modules/execution/accommodations.integration.test.ts`; B13, F20                                                                             |
| X-12 | Makeup vs `attempt_limit` unstated              | Closed                 | ADR-0014; `attempt-eligibility.util.ts` (limit bypass only with authorization); `attempt.integration.test.ts`; B16 (2026-09-17)                                                                      |
| X-14 | Result recalculation after adjustment           | Closed                 | ADR-0025; `result-adjustment.service.ts`; `apps/worker/src/queues/result-adjustment.integration.test.ts`; B15 (2026-09-10)                                                                           |

## Related, outside BLOCKER/HIGH

`R-09` (CDN/bandwidth for school labs, MEDIUM) and `R-10` (old lab hardware and browser baseline,
LOW) are assigned to B23 by audit §10 but are not BLOCKER or HIGH, so they do not bear on this exit
criterion. Both are **Closed by B23 docs (pending this PR)**: `docs/operations/school-onboarding.md`
and `docs/operations/lab-preparation.md`, alongside the existing
`docs/operations/browser-and-hardware-baseline.md`.

## Open at launch gate

- **R-03** — Open, B23 launch item. Owner: re-run level 1,000 (one hour, off-host load generator)
  on staging with the production topology, and do the RDS Proxy pinning check; accept the capacity
  plan.
- **R-08** — Open, B23 launch item. Owner: the project owner decides the region (`af-south-1` vs
  `eu-west-1`) per the ADR-0032 2026-10-03 amendment before production is provisioned.
- **M-08** — Open. Owner: engineering. Surface `AttemptEvent` counts per student in the Control
  Center (neutral counts, not judgements), or record an explicit project-owner deferral of that
  surface.
- **M-09** — Open. Owner: engineering. Derive "disconnected" from `last_seen_at` against a threshold
  and show it in the Control Center live table; or record an explicit deferral. Correct F12 DoD 10's
  stale claim that no `last_seen_at` exists.
