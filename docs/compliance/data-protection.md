# Data protection posture

**Status:** B20 (2026-10-02). Resolves audit finding **M-13**; implements
[ADR-0028](../decisions/ADR-0028-data-protection-and-retention.md). **Not legal advice.** This
document records the engineering and operational posture; the Nigeria Data Protection Act 2023
(NDPA) and NDPR review by counsel is a launch-readiness item before general availability (B23).

---

## 1. Roles

| Party                   | Role (NDPA)         | Why                                                                                                                                      |
| ----------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| The school              | **Data controller** | Decides whose data exists (students, staff), why (assessment), and for how long its academic record must be kept.                        |
| The platform operator   | **Data processor**  | Processes that data on the school's documented instruction: running examinations, marking, results, reports. Never for its own purposes. |
| Sub-processors (see §6) | Sub-processors      | Infrastructure the processor uses; bound by the processor's own contracts.                                                               |

The processor never sells, profiles, advertises to, or trains models on school data. Students are
minors; the school, as controller, holds the lawful basis (typically performance of its educational
function / legal obligation for assessment records) and handles parental consent where required.

## 2. Data inventory

Derived from `packages/db/prisma/schema.prisma`.

| Category             | Where                                                                                                                                                                                                                                                                       | Retention                                                                                                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity (PII)       | `users` (names, email — staff only, never students), `school_memberships.login_identifier`, `student_profiles` (student id, admission number), `teacher_profiles`                                                                                                           | Indefinite; redactable per person on request (§4)                                                                                                 |
| Academic evidence    | `exam_attempts`, `attempt_question_snapshots`, `attempt_answers`, `attempt_answer_events`, `attempt_events`, `attempt_question_results`, `results`, …                                                                                                                       | **Indefinite — never destroyed** (invariant 14; ADR-0028)                                                                                         |
| Audit                | `audit_events`                                                                                                                                                                                                                                                              | **Indefinite — append-only** (invariant 15)                                                                                                       |
| Operational          | `sessions`, `platform_sessions`, `password_reset_tokens`, `import_rows.raw_data`, read `notifications`                                                                                                                                                                      | Purged/redacted on schedule — [retention-schedule.md](retention-schedule.md)                                                                      |
| Integrity signals    | `exam_attempts.start_ip_address/user_agent/device_id`, `attempt_events.metadata`                                                                                                                                                                                            | Kept with the attempt (they are evidence of how it was taken)                                                                                     |
| Object storage (B22) | School logos, question media (school content); **uploaded import files** (personal data: the spreadsheet of students/staff); report exports (personal data, expire with the export); encrypted exam-media copies (content); the redaction register (UUIDs only). Versioned. | Import files: 90 days or at once on redaction; exports: B18 expiry; noncurrent versions: 35 days — [retention-schedule.md](retention-schedule.md) |
| Backups (B22)        | Database snapshots and transaction logs (everything above, encrypted)                                                                                                                                                                                                       | 35-day PITR window; long-term policy proposed for B23 legal review                                                                                |

What is **not** collected: biometrics, photographs, location, guardians' data, health data, free-text
answers outside the exam itself.

## 3. Security of processing (summary)

Tenant isolation in three layers (ADR-0023) proven by the endpoint-wide B20 suites; least-privilege
database role that cannot delete academic evidence or alter audit; Argon2id credentials; revocable
sessions; TOTP for Software Admin; encryption in transit enforced at boot in production; structured
logs that redact credentials, PII and answer content. Full evidence:
[../security/controls-evidence.md](../security/controls-evidence.md).

## 4. Data-subject requests (access, correction, deletion)

All requests are made **to the school** (the controller). The platform acts only on a school's
written instruction, received by the operator from the school's verified School Admin.

1. **Verify** the instruction comes from the school (School Admin email on file, or a signed letter),
   and that the school has verified the requester's identity (a parent, a student, a staff member).
   Record a reference (`DSR-YYYY-NNN`).
2. **Access**: the school can already export everything it holds about a person through the product
   (B18 reports/exports); the operator assists only if the school cannot.
3. **Correction**: the school corrects names and identifiers itself through People management.
4. **Deletion/anonymisation**: run the audited operator command — dry run first, then apply:

   ```bash
   pnpm --filter @atlas/api ops:redact-subject -- --school <subdomain> --membership <uuid> \
     --actor <softwareAdminUserId> --reason "<instruction>" --request-ref DSR-YYYY-NNN
   ```

   It removes the person's sign-in identifier, student/staff number, admission number and the raw
   import cells that created them; ends their sessions; and — **only if they belong to no other
   school** — replaces their name and email and deactivates the account. It **never** touches
   attempts, answers, snapshots, results, adjustments, participation or audit: those are the school's
   academic record (invariant 14). The DPA states this explicitly so it is agreed, not discovered.
   Every run writes a `DATA_SUBJECT_REDACTED` audit event (field names and counts, never values).
   The reason is kept in the audit trail, so it must never contain the person's name; the request
   reference must be the `DSR-YYYY-NNN` number (the command rejects anything else).

   B22 (decisions 2b and 6A, 2026-10-04): the command also deletes, whole, every uploaded import
   file that created the person (the file holds other people's rows too and cannot be edited), and
   records the redaction in the **redaction register** — object storage, outside the database,
   holding only the DSR number, the school, membership, user and operator UUIDs and the time. After
   any database restore the operator re-applies every redaction made since the restore point
   (`ops:redact-subject --replay --since <restore point> --apply`; [../operations/backup-and-restore.md](../operations/backup-and-restore.md) §3).

5. **Respond** to the school within the period the school must meet (NDPA: without undue delay; the
   school sets the clock). Target: 5 working days from a verified instruction.

## 5. Personal data breach procedure

Severity is judged by what was exposed and to whom; when in doubt, treat it as notifiable.

1. **Contain** (operator on call): revoke credentials/sessions involved, rotate affected secrets
   (`SESSION_COOKIE_SECRET`, `CSRF_SECRET`, `MFA_ENCRYPTION_KEY`, database passwords), block the
   vector. Sentry, the Exam Health Monitor and the audit trail are the primary detection sources.
2. **Preserve evidence**: never delete logs or audit rows; snapshot the database; record a timeline.
3. **Assess** within 24 hours: which schools, which data categories (§2), how many people, minors
   involved (always, for student data), likely consequences.
4. **Notify each affected school (controller) without undue delay — target within 24 hours of
   confirmation**, with what is known, so the school can meet its own NDPA duty to notify the
   **Nigeria Data Protection Commission within 72 hours** of becoming aware, and data subjects where
   the risk is high. The processor supports the school's notification with facts and remediation.
5. **Remediate and review**: root cause, fix, regression test in the security suites, threat-model
   update, written post-incident report to affected schools.

Owner: the operator's designated security lead (named in the DPA before GA).

## 6. Sub-processors and location

**Pilot (2026-10-04, ADR-0032 amendment):** the pilot runs on a single rented server, so its
sub-processors are:

| Sub-processor                         | Purpose                                               | Location                                                   |
| ------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------- |
| VPS provider (to be named)            | All compute and storage: web, API, database, files    | The provider's data centre (shortlist: Frankfurt, Germany) |
| Off-site backup storage (to be named) | Encrypted-in-transit copies of the database and files | The provider's region; 30-day retention                    |
| SMTP provider (Brevo or Resend)       | Transactional email (staff only)                      | The provider's region (ADR-0019 amendment)                 |
| Sentry (when configured)              | Error tracking                                        | Events are scrubbed: no bodies, cookies, headers, PII      |

The AWS design (used once the platform outgrows one server):

| Sub-processor            | Purpose                           | Location                                                   |
| ------------------------ | --------------------------------- | ---------------------------------------------------------- |
| Amazon Web Services      | Database, cache, storage, compute | `af-south-1` (ADR-0032 amendment)                          |
| Vercel                   | Web application hosting           | Global edge; serves the UI, holds no academic data at rest |
| Amazon SES               | Transactional email (staff only)  | Same region (ADR-0019 amendment)                           |
| Sentry (when configured) | Error tracking                    | Events are scrubbed: no bodies, cookies, headers, PII      |

## 7. Open items before general availability (B23)

- Legal review of this posture, the DPA ([dpa-template.md](dpa-template.md)) and the retention
  schedule — ADR-0028's recorded condition.
- Name the security lead and breach contact in the DPA.
- Data residency confirmation per customer (ADR-0032), including the pilot's transfer of school
  data to a server outside Nigeria (the legal review covers NDPA cross-border transfer).
- Name the pilot's VPS, backup and SMTP providers in the DPA's sub-processor list.
- Third-party penetration test (B20 deferred item).
