import type { Prisma } from '@atlas/db';
import { STUDENT_VISIBLE_RESULT_STATES, type ResultState } from '@atlas/domain';

/**
 * ADR-0010/ADR-0025's rules expressed as Prisma `where` fragments, so the
 * database query itself is constrained rather than a post-fetch filter doing
 * the work. `@atlas/domain`'s `resolveStudentResultVisibility` remains the
 * single authority for the RULE; this file is the one place that translates
 * it into a query, which is what ADR-0025 means by "a shared query layer."
 *
 * Anything that reads results for a student, or aggregates them, goes
 * through here. A direct `prisma.result.findMany` with a hand-written state
 * filter elsewhere is a defect — that is ADR-0025's own wording, and the
 * reason both fragments live here rather than being inlined per call site.
 */

/**
 * A student may see a result only when it is finalised, its exam is
 * published, it is not individually withheld, and no bulk adjustment is
 * mid-flight over the cohort.
 *
 * The publication and adjustment conditions are expressed through the exam
 * relation rather than duplicated onto every result row: `ResultPublication`
 * is one row per exam (ADR-0010), so a release is a single-row write and
 * this join is what keeps it that way. Note the `is: null` arm is absent by
 * design — an exam with no publication row at all is unpublished, and the
 * `status: 'PUBLISHED'` requirement already excludes it.
 */
export function studentVisibleResultWhere(
  schoolId: string,
  studentProfileId: string,
): Prisma.ResultWhereInput {
  return {
    schoolId,
    studentProfileId,
    state: { in: [...STUDENT_VISIBLE_RESULT_STATES] as ResultState[] },
    withheld: false,
    exam: {
      resultPublication: {
        is: { status: 'PUBLISHED', adjustmentInProgress: false },
      },
    },
  };
}

/**
 * ADR-0025: "VOIDED results are excluded from EVERY aggregate." Used by this
 * phase's own exam summary statistics, and exported for B17 to consume
 * rather than re-derive — the exclusion is written once here.
 *
 * `PROCESSING` is excluded too: a result whose marking has not finished has
 * no complete score, and averaging a partial one would understate the
 * cohort.
 */
export function aggregatableResultWhere(schoolId: string, examId: string): Prisma.ResultWhereInput {
  return {
    schoolId,
    examId,
    state: { in: ['FINAL', 'ADJUSTED'] },
  };
}
