# Retention schedule

**Status:** Formalised in B20 (2026-10-02), resolving audit finding **M-14**. Project-owner decision:
academic records and audit are retained indefinitely; only operational data is purged; the legal
review ADR-0028 requires is recorded as a launch-readiness item before general availability (B23).
The machine-readable source of truth is `RETENTION_SCHEDULE` in
`packages/domain/src/compliance/retention.ts`; the worker sweep (`apps/worker/src/queues/
retention.queue.ts`) executes exactly its purge/redact rows, daily.

## Retained indefinitely

| Data              | Tables                                                                                                                                                                                                                                                                                               | Why                                                                      |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Academic evidence | `exam_attempts`, `attempt_question_snapshots`, `attempt_answers`, `attempt_answer_events`, `attempt_events`, `attempt_question_results`, `attempt_authorizations`, `exam_participations`, `results`, `result_publications`, `result_adjustment_operations`, `result_adjustments`, `question_reviews` | The school's academic record (07 §42 invariant 14; ADR-0028)             |
| Audit             | `audit_events`                                                                                                                                                                                                                                                                                       | Append-only evidence (invariant 15)                                      |
| People            | `users`, `school_memberships`, `student_profiles`, `teacher_profiles`                                                                                                                                                                                                                                | Attribution of the academic record; redactable per person, never deleted |

**Enforced twice:** no schedule rule may name these tables (checked when the worker loads), and the
runtime database role has no `DELETE` on any of them (`packages/db/src/privileges.ts`, asserted by
`tests/tenancy/db-privileges.integration.test.ts`).

## Purged or redacted after use

| Data                      | Table                   | Action                                     | After    | Clock starts                                           |
| ------------------------- | ----------------------- | ------------------------------------------ | -------- | ------------------------------------------------------ |
| School sessions           | `sessions`              | Delete                                     | 30 days  | revoked, or expiry if never revoked                    |
| Software Admin sessions   | `platform_sessions`     | Delete                                     | 90 days  | revoked, or expiry if never revoked                    |
| Password reset tokens     | `password_reset_tokens` | Delete                                     | 30 days  | used, or expiry if never used                          |
| Raw import cells          | `import_rows.raw_data`  | Replace with a redaction marker (row kept) | 90 days  | the import job finished (COMPLETED / FAILED / EXPIRED) |
| Read in-app notifications | `notifications`         | Delete                                     | 365 days | read                                                   |

Periods are engineering defaults: long enough for incident response (session and IP history) and
support, short enough not to hold minors' operational data longer than it serves a purpose.

## Not yet scheduled

- **Orphaned media** (D-13) — still report-only (`GET /v1/platform/metrics/media/orphan-report`).
  A media object may be referenced by an immutable snapshot; deletion needs its own rule once B21's
  storage measurements exist.
- **Expired export files** — already removed from object storage by B18's own expiry; the job rows
  (metadata only) are kept.
- **Backups** — retention of database snapshots is a B22/B23 infrastructure setting (08 §21).
- **A departing school** (`DEACTIVATED`) — data is kept (ADR-0015: expiry never deletes); an
  export-and-purge path for a customer that leaves is a contractual question for the DPA review.
