# Architecture Decision Records

This directory holds the project's ADRs.

**Status: 33 of 33 decided and accepted (2026-08-24).** All gates are resolved. Implementation may begin at `B0`.

Two carry conditions: [ADR-0028](./ADR-0028-data-protection-and-retention.md)'s retention schedule is provisional pending legal review at B20, and [ADR-0032](./ADR-0032-aws-region.md)'s region is to be validated by measurement at B21.

---

## Convention

One file per decision: `ADR-NNNN-short-kebab-title.md`.

IDs are permanent and never reused — the audit, both roadmaps, and `CLAUDE.md` reference them. A superseded decision keeps its ID and gains a `Superseded by: ADR-NNNN` header rather than being edited into a new decision.

When amending an accepted ADR: update it in place if the change is clarifying, or supersede it with a new ID if the decision itself changes. Then update the affected roadmap phases and note it in `CLAUDE.md`.

---

## Gate 1 — Foundation

Unblocks `B0`, `B1`, `F0`, `F1`.

| ADR                                                   | Decision                   | Outcome                                                                                      |
| ----------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------- |
| [0005](./ADR-0005-tenant-resolution-at-login.md)      | Tenant resolution at login | Per-school subdomain; `login_identifier` unique per school                                   |
| [0019](./ADR-0019-transactional-messaging-channel.md) | Messaging channel          | Email now behind a `NotificationChannel` abstraction; students get printed credential sheets |
| [0022](./ADR-0022-cross-origin-session-strategy.md)   | Cross-origin sessions      | Shared parent domain, API on a sibling subdomain, same-site `HttpOnly` cookies               |
| [0023](./ADR-0023-row-level-security.md)              | Tenant isolation           | Denormalised `school_id` + composite FKs + RLS + generated isolation suite                   |
| [0027](./ADR-0027-timezone-policy.md)                 | Timezone                   | UTC `timestamptz` storage; per-school IANA zone, default `Africa/Lagos`                      |
| [0031](./ADR-0031-technology-version-baseline.md)     | Version baseline           | `09`'s stack retained; majors pinned; validated by a B0 spike                                |
| [0033](./ADR-0033-idempotency-and-error-contract.md)  | Idempotency and errors     | UUIDv7 `Idempotency-Key`; structured envelope with a `retryable` flag                        |

## Gate 2 — Academic model

Unblocks `B5` onward. One coherent scope model.

| ADR                                                | Decision                                   | Outcome                                                                                    |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [0001](./ADR-0001-academic-scope-model.md)         | Subject–department link and question level | `Subject.department_id` (one, nullable); `Question.level`; `Topic` as a first-class entity |
| [0011](./ADR-0011-student-subject-registration.md) | Electives                                  | `StudentSubjectRegistration`, auto-registered, deregisterable                              |
| [0013](./ADR-0013-multi-class-exams.md)            | Exam targeting                             | `ExamClass` join — one exam may serve several arms                                         |

## Gate 3 — Exam engine

Unblocks `B11`–`B14`. The highest-integrity subsystem.

| ADR                                                  | Decision              | Outcome                                                                          |
| ---------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------- |
| [0002](./ADR-0002-question-pools.md)                 | Question pools        | **Deferred.** Fixed selection only; order and option randomisation retained      |
| [0003](./ADR-0003-post-expiry-cutoff-policy.md)      | Post-expiry cutoff    | 60s grace against server receipt time; flagged; non-retryable beyond             |
| [0004](./ADR-0004-auto-submission-ownership.md)      | Auto-submission       | BullMQ sweeper + opportunistic finalisation, one idempotent routine              |
| [0006](./ADR-0006-session-authorization-mode.md)     | Session authorization | Exam-level `access_mode`; participants always written; one eligibility predicate |
| [0007](./ADR-0007-answer-persistence-model.md)       | Answer persistence    | Mutable row + append-only event log; per-question sequence ordering              |
| [0008](./ADR-0008-snapshot-storage-shape.md)         | Snapshot shape        | One JSONB document per attempt; orders materialised; seed stored                 |
| [0020](./ADR-0020-integrity-signals-and-liveness.md) | Signals and liveness  | `AttemptEvent` off the critical path; `last_seen_at` heartbeat                   |
| [0021](./ADR-0021-offline-media-delivery.md)         | Offline media         | Cached into the client at attempt start; Start blocked until cached              |

## Gate 4 — Results, operations, production

| ADR                                                  | Decision                | Outcome                                                                             |
| ---------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------- |
| [0009](./ADR-0009-paused-exam-state.md)              | `PAUSED` state          | Not a state — UI label for `OPEN → CLOSED`                                          |
| [0010](./ADR-0010-result-publication-model.md)       | Publication model       | `ResultPublication` per exam; `Result.state` is marking-only; `withheld` flag       |
| [0012](./ADR-0012-software-admin-authority.md)       | Operator authority      | Read + audited break-glass; authoring denied; `ExamAdministrator` delegation        |
| [0014](./ADR-0014-attempt-authorization.md)          | Reattempt authorization | `AttemptAuthorization` (`MAKEUP`/`RETRY`), single-use, atomic consume               |
| [0015](./ADR-0015-subscription-expiry-behaviour.md)  | Expiry behaviour        | 14-day grace; running attempts finish and mark; new activity blocked                |
| [0016](./ADR-0016-access-gate-precedence.md)         | Access gate             | Subscription is truth; `School.status` derived; `DEACTIVATED > SUSPENDED > derived` |
| [0017](./ADR-0017-hod-request-workflow.md)           | HOD requests            | **Withdrawn** for this release; candidate for later                                 |
| [0018](./ADR-0018-grading-scale.md)                  | Grading                 | Versioned school-owned scale; grade + version frozen at finalisation                |
| [0024](./ADR-0024-participation-rollup.md)           | Participation           | Per (exam, session, student); documented roll-up; single authority                  |
| [0025](./ADR-0025-invalidation-effect-on-results.md) | Invalidation            | `VOIDED` result state; resumable bulk adjustment                                    |
| [0026](./ADR-0026-session-rollover-mechanics.md)     | Rollover                | Clone forward as reviewable drafts; assignments proposed, not auto-applied          |
| [0028](./ADR-0028-data-protection-and-retention.md)  | Data protection         | School is controller; retain academic data indefinitely; legal review at B20        |
| [0029](./ADR-0029-exam-sections.md)                  | Sections and marks      | Default section always created, no UI; `ExamQuestion.marks` authoritative           |
| [0030](./ADR-0030-printable-reporting.md)            | Printable reports       | Browser print stylesheets; PDF deferred                                             |
| [0032](./ADR-0032-aws-region.md)                     | Region                  | `eu-west-1`; client batches and debounces; validate at B21                          |

---

## Approved deferrals

Deferred by explicit decision, not silently dropped. Per `AGENTS.md §14` these must not be implemented opportunistically.

| Item                           | ADR                                        | Re-entry cost                                                           |
| ------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------- |
| Question pools                 | [0002](./ADR-0002-question-pools.md)       | Respecify snapshot construction, marks equality, and question analytics |
| Multi-section authoring UI     | [0029](./ADR-0029-exam-sections.md)        | UI only — schema already supports it                                    |
| Server-rendered PDF            | [0030](./ADR-0030-printable-reporting.md)  | Rendering pipeline, worker, artefact storage                            |
| HOD request/approval subsystem | [0017](./ADR-0017-hod-request-workflow.md) | A new phase — model, screens, notifications, state machine              |

---

## Not an ADR

Audit finding `X-05` — the attempt snapshot's `correct_answer_snapshot` reaching client storage — is **a defect to prevent, not a decision to make**. It is a release-blocking contract test in `B13`, addressed by the client projection in [ADR-0008](./ADR-0008-snapshot-storage-shape.md). No ADR exists for it by design.
