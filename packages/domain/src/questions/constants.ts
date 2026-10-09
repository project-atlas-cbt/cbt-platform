/// B8 (Question Bank) — mirrors `packages/db/prisma/schema.prisma`'s
/// QuestionType/QuestionDifficulty/QuestionRevisionStatus enums, the same
/// const-array-plus-derived-type pattern every other domain module in this
/// package already uses (academics/constants.ts, imports/constants.ts) so
/// DTOs never redefine or drift from the schema's own vocabulary.

/// 05 §15.2 core scope only — multiple-select/short-answer/essay/matching/
/// ordering are deferred (model allows them without redesign; not enabled).
export const QUESTION_TYPES = ['SINGLE_CHOICE', 'TRUE_FALSE'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/// No spec document gives this vocabulary verbatim — an engineering default,
/// not load-bearing for authorization or immutability (see schema.prisma's
/// own doc comment on this enum).
export const QUESTION_DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;
export type QuestionDifficulty = (typeof QUESTION_DIFFICULTIES)[number];

/// 07 §7.2's lifecycle. ARCHIVED is never written by any B8 code path (see
/// Question.archivedAt's own schema doc comment) but stays in the
/// vocabulary for spec fidelity and forward compatibility.
export const QUESTION_REVISION_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
] as const;
export type QuestionRevisionStatus = (typeof QUESTION_REVISION_STATUSES)[number];

/// B9 (Question Review & Governance) — 07 §7.5's three decisions.
/// REQUEST_CHANGES writes the same QuestionRevisionStatus.REJECTED value as
/// REJECTED does (see QuestionReview's own schema doc comment); this
/// vocabulary is what keeps the two distinguishable in review history.
export const QUESTION_REVIEW_DECISIONS = ['APPROVED', 'REJECTED', 'REQUEST_CHANGES'] as const;
export type QuestionReviewDecision = (typeof QUESTION_REVIEW_DECISIONS)[number];

/// ADR-0038: why the School Admin may decide a question because no HOD can.
/// NO_DEPARTMENT: the subject has no department. NO_HOD: its department has
/// no active HOD. AUTHOR_IS_ONLY_HOD: every active HOD of it wrote the
/// question, and nobody reviews their own.
export const QUESTION_REVIEW_FALLBACK_REASONS = [
  'NO_DEPARTMENT',
  'NO_HOD',
  'AUTHOR_IS_ONLY_HOD',
] as const;
export type QuestionReviewFallbackReason = (typeof QUESTION_REVIEW_FALLBACK_REASONS)[number];
