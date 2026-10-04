# Retention schedule

**Status:** Formalised in B20 (2026-10-02), resolving audit finding **M-14**. Project-owner decision:
academic records and audit are retained indefinitely; only operational data is purged; the legal
review ADR-0028 requires is recorded as a launch-readiness item before general availability (B23).
The machine-readable source of truth is `RETENTION_SCHEDULE` in
`packages/domain/src/compliance/retention.ts`; the worker sweep (`apps/worker/src/queues/
retention.queue.ts`) executes exactly its database purge/redact rows, daily. B22 (2026-10-04) added
object storage: uploaded import files (executed by the API, which owns object storage) and
noncurrent object versions (the bucket's lifecycle rule).

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

| Data                             | Table                                               | Action                                                             | After                                | Clock starts                                                                                                                                                              |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| School sessions                  | `sessions`                                          | Delete                                                             | 30 days                              | revoked, or expiry if never revoked                                                                                                                                       |
| Software Admin sessions          | `platform_sessions`                                 | Delete                                                             | 90 days                              | revoked, or expiry if never revoked                                                                                                                                       |
| Password reset tokens            | `password_reset_tokens`                             | Delete                                                             | 30 days                              | used, or expiry if never used                                                                                                                                             |
| Raw import cells                 | `import_rows.raw_data`                              | Replace with a redaction marker (row kept)                         | 90 days                              | the import job finished (COMPLETED / FAILED / EXPIRED)                                                                                                                    |
| Read in-app notifications        | `notifications`                                     | Delete                                                             | 365 days                             | read                                                                                                                                                                      |
| Uploaded import files (B22)      | object storage, `import_jobs.source_media_asset_id` | Delete the file (job row kept; `import_jobs.source_purged_at` set) | 90 days, **or at once on redaction** | the import job finished (COMPLETED / FAILED / EXPIRED); redaction of anyone the file created deletes the **whole** file (decision 6A — it also holds other people's rows) |
| Noncurrent object versions (B22) | object storage (bucket versioning)                  | Delete the version                                                 | 35 days                              | the version became noncurrent (overwritten or deleted)                                                                                                                    |

Periods are engineering defaults: long enough for incident response (session and IP history) and
support, short enough not to hold minors' operational data longer than it serves a purpose.

**Why the import file rule exists (B22, project-owner decision 6A, 2026-10-04):** before B22 the
uploaded spreadsheet stayed in object storage for ever after its cells were redacted from
`import_rows` — a defect against this schedule, which B22's bucket versioning would have made worse
(a deleted file survives as a noncurrent version). The file now follows the cells' 90-day clock, and
a redaction deletes it at once. Noncurrent versions expire at 35 days, so a deleted or redacted file
is gone from storage within 35 days of its deletion; 35 days also matches the database PITR window,
so a restored database never references a version that has already expired.

## Not yet scheduled

- **Orphaned media** (D-13) — still report-only (`GET /v1/platform/metrics/media/orphan-report`).
  A media object may be referenced by an immutable snapshot; deletion needs its own rule once B21's
  storage measurements exist.
- **Expired export files** — already removed from object storage by B18's own expiry; the job rows
  (metadata only) are kept.
- **Backups** — B22 defines them ([../operations/recovery-objectives.md](../operations/recovery-objectives.md)):
  RDS point-in-time backups for **35 days**; the long-term policy for academic records (term-close
  snapshots kept 3 years, the year's last one 7 years in a second region) is a **proposal awaiting
  the B23 legal review**. A backup still holds a redacted person's data until it expires; every
  redaction is re-applied after any restore (`ops:redact-subject --replay`), so a restored running
  system never re-exposes them.
- **A departing school** (`DEACTIVATED`) — data is kept (ADR-0015: expiry never deletes); an
  export-and-purge path for a customer that leaves is a contractual question for the DPA review.
