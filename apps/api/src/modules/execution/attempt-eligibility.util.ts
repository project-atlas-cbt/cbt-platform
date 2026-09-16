import type { Prisma } from '@atlas/db';
import type { ExamWithDetailRelations } from '../exams/exam-mappers.js';
import { canStudentAccessSession, evaluateExamEligibility } from './exam-eligibility.util.js';

export interface AttemptEligibilityResult {
  eligible: boolean;
  failedChecks: string[];
}

const SESSION_NOT_ACCESSIBLE = 'SESSION_NOT_ACCESSIBLE';
const ATTEMPT_LIMIT_EXCEEDED = 'ATTEMPT_LIMIT_EXCEEDED';

type ExamForAttemptEligibility = Pick<
  ExamWithDetailRelations,
  'id' | 'academicSessionId' | 'classes' | 'attemptLimit'
>;

/**
 * Layers attempt-specific eligibility on the shared exam/session checks.
 * ADR-0014 permits one unexpired authorization to override only the
 * configured attempt-limit failure; it never bypasses enrollment, exam
 * availability, or session authorization.
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

  if (!(await canStudentAccessSession(tx, { schoolId, examSessionId, studentProfileId }))) {
    failedChecks.push(SESSION_NOT_ACCESSIBLE);
  }

  const completedCount = await tx.examAttempt.count({
    where: {
      schoolId,
      examId: exam.id,
      studentProfileId,
      state: { in: ['SUBMITTED', 'AUTO_SUBMITTED'] },
    },
  });

  if (completedCount >= exam.attemptLimit) {
    const activeAuthorizations = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT EXISTS(
        SELECT 1
        FROM attempt_authorizations
        WHERE school_id = ${schoolId}::uuid
          AND exam_id = ${exam.id}::uuid
          AND student_profile_id = ${studentProfileId}::uuid
          AND status = 'AUTHORIZED'
          AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
      ) AS present
    `;
    if (!activeAuthorizations[0]?.present) {
      failedChecks.push(ATTEMPT_LIMIT_EXCEEDED);
    }
  }

  return { eligible: failedChecks.length === 0, failedChecks };
}
