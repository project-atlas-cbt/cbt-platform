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
