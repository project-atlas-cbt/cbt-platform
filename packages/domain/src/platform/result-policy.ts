/**
 * F5/B3 gap-closure (05 §47, ADR-0010) — School-level result-publication
 * defaults and the lock flag ADR-0010's own "Required changes" list assigned
 * to B3/B5 but which never actually shipped there. Hand-kept in sync with
 * the corresponding Prisma enums in packages/db/prisma/schema.prisma,
 * mirroring SCHOOL_STATUSES/CLASS_LEVELS's own precedent — this package has
 * no dependency on @atlas/db, so DTO validation (`@IsIn`) and OpenAPI
 * `enum:` metadata need their own string-literal source here.
 */

/// Who releases a result: the exam's own teacher, School Admin, or the
/// system immediately upon finalisation. Seeds Exam.result_policy at exam
/// creation once B11 exists; `School.resultPolicyLocked` governs whether a
/// teacher may override the seeded value (enforced by B15).
export const RESULT_POLICIES = ['TEACHER', 'SCHOOL_ADMIN', 'AUTOMATIC'] as const;
export type ResultPolicy = (typeof RESULT_POLICIES)[number];

/// ADR-0010's second, independent policy axis — what a student sees once a
/// result is released. Vocabulary is this gap-closure's own naming choice:
/// no prior enum identifiers existed anywhere in the docs/code for this
/// axis (ADR-0010 only describes it in prose as "score only / score +
/// counts / full question review").
export const RESULT_DETAIL_VISIBILITIES = [
  'SCORE_ONLY',
  'SCORE_AND_COUNTS',
  'FULL_REVIEW',
] as const;
export type ResultDetailVisibility = (typeof RESULT_DETAIL_VISIBILITIES)[number];

export interface SchoolResultSettings {
  resultPolicy: ResultPolicy;
  resultDetailVisibility: ResultDetailVisibility;
  resultPolicyLocked: boolean;
}

export interface ExamResultSettings {
  resultPolicy: ResultPolicy;
  resultDetailVisibility: ResultDetailVisibility;
}

/// ADR-0010 (2026-10-06 amendment): the values that actually govern an
/// exam. While the school's lock is on, BOTH axes come from the school —
/// who releases and what students see — whatever an exam row says (an exam
/// created before the lock was switched on keeps its own stored values, so
/// every reader must go through this rather than the exam row). With the
/// lock off, the exam's own values apply.
export function effectiveResultSettings(
  school: SchoolResultSettings,
  exam: ExamResultSettings,
): ExamResultSettings {
  return school.resultPolicyLocked
    ? { resultPolicy: school.resultPolicy, resultDetailVisibility: school.resultDetailVisibility }
    : { resultPolicy: exam.resultPolicy, resultDetailVisibility: exam.resultDetailVisibility };
}
