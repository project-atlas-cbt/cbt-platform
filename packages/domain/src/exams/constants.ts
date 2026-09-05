/// B11 (Exam Builder & Readiness) — mirrors
/// `packages/db/prisma/schema.prisma`'s ExamStatus/ExamAccessMode/
/// ExamNavigationPolicy enums, the same const-array-plus-derived-type
/// pattern every other domain module in this package already uses
/// (academics/constants.ts, questions/constants.ts) so DTOs never redefine
/// or drift from the schema's own vocabulary.

/// 07 §14's full seven-state lifecycle, carried in full even though this
/// phase's own code only ever writes DRAFT/READY/CANCELLED/ARCHIVED —
/// mirrors QUESTION_REVISION_STATUSES's own "ARCHIVED never written by B8,
/// kept for spec fidelity" precedent. OPEN/CLOSED/COMPLETED are B12/B13's
/// to write.
export const EXAM_STATUSES = [
  'DRAFT',
  'READY',
  'OPEN',
  'CLOSED',
  'COMPLETED',
  'ARCHIVED',
  'CANCELLED',
] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

/// ADR-0006's own required B11 slice — the column + default only.
/// Participant-authorization mechanics are entirely B12's job.
export const EXAM_ACCESS_MODES = ['OPEN_TO_ELIGIBLE', 'EXPLICIT_AUTHORIZATION'] as const;
export type ExamAccessMode = (typeof EXAM_ACCESS_MODES)[number];

/// Confirmed product decision (2026-09-03) — one enum, "revisit" folded in,
/// matching 07 §8.1's single navigation_policy attribute literally rather
/// than a second allow_revisit column.
export const EXAM_NAVIGATION_POLICIES = [
  'FREE',
  'SEQUENTIAL_NO_REVISIT',
  'SEQUENTIAL_WITH_REVISIT',
] as const;
export type ExamNavigationPolicy = (typeof EXAM_NAVIGATION_POLICIES)[number];

/// The itemized readiness checklist's own code vocabulary (05 §23/§72,
/// 07 §20) — shared between `exam-readiness.service.ts` and its DTO so the
/// two can never drift on what a "check code" is allowed to be.
export const EXAM_READINESS_CHECK_CODES = [
  'SCHOOL_ACTIVE',
  'SESSION_ACTIVE',
  'TERM_ACTIVE',
  'CLASSES_TARGETED',
  'CLASSES_ACTIVE',
  'SUBJECT_ACTIVE',
  'QUESTIONS_SELECTED',
  'QUESTIONS_APPROVED',
  'QUESTIONS_IN_SCOPE',
  'MARKS_VALID',
  'DURATION_CONFIGURED',
  'INSTRUCTIONS_CONFIGURED',
  'ELIGIBLE_STUDENTS_EXIST',
  'RESULT_POLICY_CONFIGURED',
  'DETAILS_COMPLETE',
] as const;
export type ExamReadinessCheckCode = (typeof EXAM_READINESS_CHECK_CODES)[number];

/// B12 (Exam Activation & Control) — mirrors schema.prisma's
/// ExamSessionType/ExamSessionStatus/ExamSessionParticipantStatus/
/// ExamParticipationStatus/ExamAdministratorStatus enums, same
/// const-array-plus-derived-type pattern as above.

/// 06 §41's own small, closed reporting taxonomy — confirmed product
/// decision (2026-09-04) to include even though no B12 logic branches on it.
export const EXAM_SESSION_TYPES = ['STANDARD', 'BATCH', 'MAKEUP', 'SPECIAL'] as const;
export type ExamSessionType = (typeof EXAM_SESSION_TYPES)[number];

/// No READY — a session is born OPEN. CANCELLED shipped for 07 §15
/// vocabulary fidelity though no B12 endpoint reaches it.
export const EXAM_SESSION_STATUSES = ['OPEN', 'CLOSED', 'COMPLETED', 'CANCELLED'] as const;
export type ExamSessionStatus = (typeof EXAM_SESSION_STATUSES)[number];

/// D-07: deliberately restricted to authorization semantics only.
export const EXAM_SESSION_PARTICIPANT_STATUSES = ['AUTHORIZED', 'REVOKED'] as const;
export type ExamSessionParticipantStatus = (typeof EXAM_SESSION_PARTICIPANT_STATUSES)[number];

/// COMPLETED never written by B12 — no ExamAttempt exists yet to complete;
/// kept for spec-vocabulary fidelity, mirroring this file's own precedent.
export const EXAM_PARTICIPATION_STATUSES = ['ABSENT', 'COMPLETED'] as const;
export type ExamParticipationStatus = (typeof EXAM_PARTICIPATION_STATUSES)[number];

export const EXAM_ADMINISTRATOR_STATUSES = ['ACTIVE', 'REVOKED'] as const;
export type ExamAdministratorStatus = (typeof EXAM_ADMINISTRATOR_STATUSES)[number];

/// B13 (Attempt Engine) — mirrors schema.prisma's AttemptState/AttemptType/
/// AttemptParticipationStatus/AttemptAnswerState/AttemptEventType enums,
/// same const-array-plus-derived-type pattern as above.

/// 07 §9.1's full six-state vocabulary carried in full. NOT_STARTED is
/// never written — a row is created already IN_PROGRESS (07 §23) — kept
/// for spec-vocabulary fidelity, mirroring EXAM_STATUSES' own precedent.
export const ATTEMPT_STATES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'SUBMITTED',
  'AUTO_SUBMITTED',
  'INVALIDATED',
  'CANCELLED',
] as const;
export type AttemptState = (typeof ATTEMPT_STATES)[number];

/// MAKEUP/RETRY/SPECIAL are unreachable in B13 — AttemptAuthorization
/// (ADR-0014) is B14's job — shipped in full for spec fidelity.
export const ATTEMPT_TYPES = ['STANDARD', 'MAKEUP', 'RETRY', 'SPECIAL'] as const;
export type AttemptType = (typeof ATTEMPT_TYPES)[number];

/// Reporting-only (06 §47) — distinct from AttemptState, and distinct from
/// EXAM_PARTICIPATION_STATUSES (which lives on ExamParticipation, not
/// ExamAttempt, and only has ABSENT/COMPLETED). Do not conflate the two.
export const ATTEMPT_PARTICIPATION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'ABSENT',
  'EXCUSED',
] as const;
export type AttemptParticipationStatus = (typeof ATTEMPT_PARTICIPATION_STATUSES)[number];

export const ATTEMPT_ANSWER_STATES = ['UNANSWERED', 'ANSWERED'] as const;
export type AttemptAnswerState = (typeof ATTEMPT_ANSWER_STATES)[number];

/// ADR-0020's five decided types plus BINDING_MISMATCH — the device/
/// session-binding extension confirmed during B13's planning session (no
/// new ADR; extends ADR-0020's already-decided "counts, not judgements"
/// scope).
export const ATTEMPT_EVENT_TYPES = [
  'WINDOW_BLUR',
  'FULLSCREEN_EXIT',
  'TAB_HIDDEN',
  'RECONNECTED',
  'RESUMED',
  'BINDING_MISMATCH',
] as const;
export type AttemptEventType = (typeof ATTEMPT_EVENT_TYPES)[number];

/// B14 (Submission & Marking) — mirrors schema.prisma's
/// AttemptQuestionCorrectness enum. PARTIAL is reserved/unused this phase
/// (every question type this codebase supports today is decided purely by
/// the selected option's correctFlag) — kept for spec fidelity (07 §9.4)
/// against a future non-objective question type, same precedent as
/// ATTEMPT_TYPES' own MAKEUP/RETRY/SPECIAL above.
export const ATTEMPT_QUESTION_CORRECTNESS_VALUES = [
  'CORRECT',
  'INCORRECT',
  'UNANSWERED',
  'PARTIAL',
] as const;
export type AttemptQuestionCorrectness = (typeof ATTEMPT_QUESTION_CORRECTNESS_VALUES)[number];
