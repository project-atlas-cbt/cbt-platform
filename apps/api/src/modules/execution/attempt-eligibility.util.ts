import type { Prisma } from '@atlas/db';
import type { ExamWithDetailRelations } from '../exams/exam-mappers.js';
import { canStudentAccessSession, evaluateExamEligibility } from './exam-eligibility.util.js';

export interface AttemptEligibilityResult {
  eligible: boolean;
  /** Machine-readable failed-check codes, matching `evaluateExamEligibility`
   * 's own itemised philosophy — every check runs independently (no early
   * return), so a caller gets the full set of reasons, not just the first. */
  failedChecks: string[];
}

const SESSION_NOT_ACCESSIBLE = 'SESSION_NOT_ACCESSIBLE';
const ATTEMPT_LIMIT_EXCEEDED = 'ATTEMPT_LIMIT_EXCEEDED';

type ExamForAttemptEligibility = Pick<
  ExamWithDetailRelations,
  'id' | 'academicSessionId' | 'classes' | 'attemptLimit'
>;

/**
 * `AttemptLifecycleService.start()`'s own eligibility gate — layers B13's
 * two attempt-specific clauses on top of the already-shared `evaluateExam
 * Eligibility`/`canStudentAccessSession` predicate (ADR-0006/A-04), closing
 * that function's own explicitly-deferred "final clause" ("under attempt
 * limit or holding an authorization") now that `ExamAttempt` exists.
 *
 * Deliberately does NOT check "does an IN_PROGRESS attempt already exist
 * for this (student, exam)" — that is not an eligibility failure, it's the
 * service's own idempotent-return case (DoD item 2: a duplicate start
 * yields the SAME attempt, not an error), handled by `start()` itself
 * before this function is ever called.
 *
 * `AttemptAuthorization` (ADR-0014, "holding an authorization") stays
 * B14's job — this only checks the attempt-limit half of that clause.
 */
export async function evaluateAttemptStartEligibility(
  tx: Prisma.TransactionClient,
  params: {
    schoolId: string;
    exam: ExamForAttemptEligibility;
    examSessionId: string;
    studentProfileId: string;
  },
): Promise<AttemptEligibilityResult> {
  const { schoolId, exam, examSessionId, studentProfileId } = params;
  const failedChecks: string[] = [];

  const base = await evaluateExamEligibility(tx, { schoolId, exam, studentProfileId });
  failedChecks.push(...base.failedChecks);

  const canAccessSession = await canStudentAccessSession(tx, {
    schoolId,
    examSessionId,
    studentProfileId,
  });
  if (!canAccessSession) {
    failedChecks.push(SESSION_NOT_ACCESSIBLE);
  }

  // Every terminal-but-completed attempt state counts against the limit
  // (07 §9.1 invariant 1: "a student cannot have more completed attempts
  // than the exam's configured attempt policy permits") — INVALIDATED/
  // CANCELLED attempts do not consume headroom, matching this codebase's
  // "an administratively voided attempt shouldn't cost the student their
  // legitimate retry" reading, consistent with makeup/retry (B14) always
  // needing an explicit new authorization regardless of raw count anyway.
  const completedCount = await tx.examAttempt.count({
    where: {
      schoolId,
      examId: exam.id,
      studentProfileId,
      state: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
    },
  });
  if (completedCount >= exam.attemptLimit) {
    failedChecks.push(ATTEMPT_LIMIT_EXCEEDED);
  }

  return { eligible: failedChecks.length === 0, failedChecks };
}
