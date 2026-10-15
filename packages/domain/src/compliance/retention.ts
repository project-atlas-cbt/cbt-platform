/**
 * B20 retention schedule (ADR-0028 as amended 2026-10-02; resolves audit
 * finding M-14). The single machine-readable statement of what the
 * platform keeps and for how long — `docs/compliance/retention-schedule.md`
 * is its human-readable twin, and `apps/worker`'s retention sweep executes
 * exactly the database `PURGE`/`REDACT_FIELD` rows below, nothing else.
 * B22 added two object-storage rows: `import-source-files` (run by
 * apps/api, which owns object storage) and `object-noncurrent-versions`
 * (the bucket's lifecycle rule).
 *
 * Two hard rules, both enforced outside this file as well:
 * 1. Academic evidence and audit records are retained indefinitely (07 §42
 *    invariants 14 and 15; ADR-0028 "academic evidence is never
 *    destroyed"). The database role cannot delete them at all
 *    (packages/db/src/privileges.ts), so no schedule row could, even by
 *    mistake.
 * 2. Only operational data with no academic meaning is ever purged, and
 *    only after it has stopped doing its job (expired, revoked, used, read).
 *
 * Periods are engineering defaults chosen to keep forensic usefulness
 * (session/IP history for incident response, 30–90 days) while not
 * holding minors' operational data indefinitely. They are provisional
 * until the legal review recorded as a B23 launch-readiness item.
 */
export type RetentionAction =
  | 'RETAIN_INDEFINITELY'
  | 'PURGE'
  | 'REDACT_FIELD'
  /** B22: deletes objects from object storage (not database rows). */
  | 'DELETE_OBJECT';

export interface RetentionRule {
  id: string;
  /** Postgres table the rule applies to — or, for `DELETE_OBJECT` and
   * the bucket lifecycle rule, the object-storage data it covers. */
  table: string;
  category: 'ACADEMIC_EVIDENCE' | 'AUDIT' | 'IDENTITY' | 'OPERATIONAL';
  action: RetentionAction;
  /** Days after `trigger` before the action runs (purge/redact rows only). */
  afterDays?: number;
  /** When the clock starts — human-readable, mirrored in the worker query. */
  trigger: string;
  rationale: string;
}

export const RETENTION_SCHEDULE: readonly RetentionRule[] = [
  // ---- retained indefinitely --------------------------------------------
  {
    id: 'academic-evidence',
    table:
      'exam_attempts, attempt_question_snapshots, attempt_answers, attempt_answer_events, attempt_events, attempt_question_results, attempt_authorizations, exam_participations, results, result_publications, result_adjustment_operations, result_adjustments, question_reviews',
    category: 'ACADEMIC_EVIDENCE',
    action: 'RETAIN_INDEFINITELY',
    trigger: 'n/a',
    rationale:
      "The school's academic record (invariant 14; ADR-0028). Personal identifiers on the person may be redacted on a data-subject request; the evidence itself is never destroyed.",
  },
  {
    id: 'audit',
    table: 'audit_events',
    category: 'AUDIT',
    action: 'RETAIN_INDEFINITELY',
    trigger: 'n/a',
    rationale: 'Append-only (invariant 15); the evidence that every other control was exercised.',
  },
  {
    id: 'people',
    table: 'users, school_memberships, student_profiles, teacher_profiles',
    category: 'IDENTITY',
    action: 'RETAIN_INDEFINITELY',
    trigger: 'n/a',
    rationale:
      'Needed to attribute academic records. Redactable per person on a verified subject request (ops:redact-subject), never deleted — attempts and results must keep a referent.',
  },
  // ---- purged / redacted after use ----------------------------------------
  {
    id: 'school-sessions',
    table: 'sessions',
    category: 'OPERATIONAL',
    action: 'PURGE',
    afterDays: 30,
    trigger: 'revoked_at, or expires_at if never revoked',
    rationale:
      'A dead session is only useful for incident response (IP/user-agent history); 30 days covers the investigation window.',
  },
  {
    id: 'platform-sessions',
    table: 'platform_sessions',
    category: 'OPERATIONAL',
    action: 'PURGE',
    afterDays: 90,
    trigger: 'revoked_at, or expires_at if never revoked',
    rationale:
      'Software Admin access history is kept longer than a school session: it is the privileged path.',
  },
  {
    id: 'password-reset-tokens',
    table: 'password_reset_tokens',
    category: 'OPERATIONAL',
    action: 'PURGE',
    afterDays: 30,
    trigger: 'used_at, or expires_at if never used',
    rationale: 'A spent or expired single-use token has no further function.',
  },
  {
    id: 'import-raw-rows',
    table: 'import_rows',
    category: 'OPERATIONAL',
    action: 'REDACT_FIELD',
    afterDays: 90,
    trigger: "the parent import job's updated_at, once COMPLETED / FAILED / EXPIRED",
    rationale:
      "raw_data is a verbatim copy of an uploaded spreadsheet row (names, admission numbers). The people it created live on in their own tables; the row's status and errors are kept, the copy of the source cells is not.",
  },
  {
    id: 'import-source-files',
    table: 'object storage: import source files (import_jobs.source_media_asset_id)',
    category: 'OPERATIONAL',
    action: 'DELETE_OBJECT',
    afterDays: 90,
    trigger:
      "the import job's updated_at, once COMPLETED / FAILED / EXPIRED — or at once when any person the file created is redacted",
    rationale:
      'B22 (decision 6A): the uploaded spreadsheet is the same personal data as import_rows.raw_data, so it goes on the same clock. Redacting one person deletes the whole file, since it also holds other people. Executed by apps/api ImportSourcePurgeService (it owns object storage); import_jobs.source_purged_at records it.',
  },
  {
    id: 'object-noncurrent-versions',
    table: 'object storage: noncurrent object versions (bucket versioning)',
    category: 'OPERATIONAL',
    action: 'PURGE',
    afterDays: 35,
    trigger: 'the version became noncurrent (overwritten or deleted)',
    rationale:
      'B22: versioning is the object-storage backup (recover an overwritten or deleted object). 35 days covers PITR (RDS backups are kept 35 days at most), so a restored database never points at an object version already gone. It also bounds how long a deleted or redacted file survives. Executed by the bucket lifecycle rule (B23 infrastructure), not application code.',
  },
  {
    id: 'read-notifications',
    table: 'notifications',
    category: 'OPERATIONAL',
    action: 'PURGE',
    afterDays: 365,
    trigger: 'read_at',
    rationale:
      'In-app operational notices (07 §11.2), not records; a year after being read they are noise.',
  },
  {
    id: 'marketing-page-views',
    table: 'marketing_page_views',
    category: 'OPERATIONAL',
    action: 'PURGE',
    afterDays: 400,
    trigger: 'occurred_at',
    rationale:
      'ADR-0034 amendment: anonymous marketing site visit counts. A little over a year lets this month be compared with the same month last year; nothing older is needed.',
  },
  {
    id: 'marketing-leads',
    table: 'marketing_leads',
    category: 'OPERATIONAL',
    action: 'PURGE',
    afterDays: 365,
    trigger: 'created_at',
    rationale:
      'ADR-0034 amendment: contact details a prospective school left on the marketing site. The privacy notice promises deletion within 12 months if the school does not become a customer; a customer is a school in the platform by then. Software Admin can delete one sooner on request. Pending the legal review (ADR-0028).',
  },
];

export function retentionRule(id: string): RetentionRule {
  const rule = RETENTION_SCHEDULE.find((r) => r.id === id);
  if (!rule) throw new Error(`Unknown retention rule "${id}".`);
  return rule;
}
