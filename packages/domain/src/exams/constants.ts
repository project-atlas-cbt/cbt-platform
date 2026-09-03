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
