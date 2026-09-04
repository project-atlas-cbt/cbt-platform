/// B10 (Audit & Notifications) — the canonical action vocabulary from
/// `07 §11.1`, resolving audit finding C-02 ("a stray EXAM_APPROVED action
/// no state machine models" — 07 §11.1's own list already correctly omits
/// it, using EXAM_READY/EXAM_OPENED instead; this file is what makes that
/// list load-bearing rather than merely illustrative documentation).
///
/// `07 §11.1`'s list is explicitly labeled "Examples," not an exhaustive
/// vocabulary — by the time B10 started, ~55 other, correctly-named,
/// already-shipped `AuditEvent.action` strings existed across
/// academics/users/exams/platform/imports/question-review
/// (CLASS_GROUP_CREATED, STUDENT_DEACTIVATED, TEACHER_ASSIGNMENTS_REPLACED,
/// ...) that are legitimately outside this list and were **not** renamed to
/// force a superficial match (AGENTS.md §15 — no unrelated broad refactor
/// across a dozen already-tested files for a cosmetic vocabulary alignment).
///
/// This file exists only to prove **07 §11.1's own twelve named moments**
/// are each covered by something real — either a shipped alias (a call
/// site whose actual string means the same event) or an honestly-flagged
/// DEFERRED entry naming the phase that will add one. See
/// `AuditActionRegistry`/`AuditVocabularyCoverageService`
/// (apps/api/src/modules/operations/) for how this is enforced at runtime.
export interface CanonicalAuditAction {
  /** The literal 07 §11.1 name. */
  id: string;
  label: string;
  status: 'LIVE' | 'DEFERRED';
  /**
   * Concrete `AuditEvent.action` strings already shipped that satisfy this
   * canonical action — the coverage check's source of truth. Never a
   * hand-maintained call-site list: each module's own
   * `*AuditActionRegistrationProvider` registers these same literal
   * strings at boot time; this array is the *expected* set, the registry
   * is the *actual* set, and `AuditVocabularyCoverageService` diffs them.
   */
  aliases: string[];
  /** Set when `status === 'DEFERRED'` — the phase expected to add a real producer. */
  owningPhase?: string;
}

export const CANONICAL_AUDIT_ACTIONS: readonly CanonicalAuditAction[] = [
  {
    id: 'QUESTION_APPROVED',
    label: 'Question approved',
    status: 'LIVE',
    // Renamed from QUESTION_REVIEW_APPROVED (question-review.service.ts) as
    // part of this same phase — a real near-miss of this canonical name
    // for the identical event, not a cosmetic rename of a distinct one.
    aliases: ['QUESTION_APPROVED'],
  },
  {
    id: 'QUESTION_REJECTED',
    label: 'Question rejected',
    status: 'LIVE',
    // Renamed from QUESTION_REVIEW_REJECTED, same reasoning as above.
    aliases: ['QUESTION_REJECTED'],
  },
  {
    id: 'EXAM_READY',
    label: 'Exam ready for activation',
    status: 'LIVE',
    aliases: ['EXAM_READY'],
  },
  {
    id: 'EXAM_OPENED',
    label: 'Exam opened',
    status: 'LIVE',
    // B12: fired once per exam (first session open, READY→OPEN) — a
    // distinct EXAM_SESSION_OPENED (non-canonical, not in 07 §11.1's list)
    // fires for every individual session, including the first.
    aliases: ['EXAM_OPENED'],
  },
  {
    id: 'EXAM_CLOSED',
    label: 'Exam closed',
    status: 'LIVE',
    // B12: the exam-level close (POST /exams/:id/close), which cascades
    // every OPEN session to CLOSED in one transaction — distinct from the
    // non-canonical EXAM_SESSION_CLOSED, fired for a single session's own
    // close.
    aliases: ['EXAM_CLOSED'],
  },
  {
    id: 'MAKEUP_GRANTED',
    label: 'Makeup access granted',
    status: 'DEFERRED',
    aliases: [],
    owningPhase: 'B16',
  },
  {
    id: 'ATTEMPT_INVALIDATED',
    label: 'Attempt invalidated',
    status: 'DEFERRED',
    aliases: [],
    owningPhase: 'B13/B14',
  },
  {
    id: 'RESULT_PUBLISHED',
    label: 'Result published',
    status: 'DEFERRED',
    aliases: [],
    owningPhase: 'B15',
  },
  {
    id: 'RESULT_ADJUSTED',
    label: 'Result adjusted',
    status: 'DEFERRED',
    aliases: [],
    owningPhase: 'B15',
  },
  {
    id: 'USER_DEACTIVATED',
    label: 'User account deactivated',
    status: 'LIVE',
    // Not renamed — each alias is a genuinely distinct role-lifecycle event
    // this table's own per-role naming already correctly distinguishes.
    // HOD_REMOVED is deliberately excluded: it only ends a RoleAssignment/
    // HODAssignment, never touches User.status, so it isn't this event.
    aliases: ['STUDENT_DEACTIVATED', 'TEACHER_DEACTIVATED', 'MODERATOR_REMOVED'],
  },
  {
    id: 'CLASS_CHANGED',
    label: 'Student moved to a different class',
    status: 'LIVE',
    // student-enrollment.service.ts's enroll() now distinguishes a fresh
    // enrollment (STUDENT_ENROLLED) from a class move (CLASS_CHANGED) —
    // a real, scoped B10 fix (they were previously indistinguishable in
    // the audit trail, both always emitting STUDENT_ENROLLED).
    aliases: ['CLASS_CHANGED'],
  },
  {
    id: 'TEACHER_ASSIGNED',
    label: 'Teacher assigned to class/subject',
    status: 'LIVE',
    // Not renamed — TEACHER_ASSIGNMENTS_REPLACED is a bulk full-replace of
    // a class-subject's whole teacher roster (B6's own PUT .../assignments
    // design), with no narrower "assign one teacher" call site to rename
    // to. The alias mapping represents this honestly rather than inventing
    // a distinction the code doesn't make.
    aliases: ['TEACHER_ASSIGNMENTS_REPLACED'],
  },
];

/** The exact set of 07 §11.1 actions with no real producer yet — asserted
 *  by a dedicated test so a future phase can't ship one without flipping
 *  its entry to LIVE here first. */
export const DEFERRED_AUDIT_ACTION_IDS: readonly string[] = CANONICAL_AUDIT_ACTIONS.filter(
  (a) => a.status === 'DEFERRED',
).map((a) => a.id);
