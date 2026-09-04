import type { Prisma } from '@atlas/db';
import type { ExamWithDetailRelations } from '../exams/exam-mappers.js';

export interface ExamEligibilityResult {
  eligible: boolean;
  /** Machine-readable failed-check codes — never a single boolean, matching
   * `ExamReadinessService`'s own itemised-checklist philosophy. Empty when
   * `eligible === true`. */
  failedChecks: string[];
}

const NOT_ACTIVE_STUDENT = 'NOT_ACTIVE_STUDENT';
const NOT_ENROLLED_IN_TARGETED_CLASS = 'NOT_ENROLLED_IN_TARGETED_CLASS';
const NOT_SUBJECT_REGISTERED = 'NOT_SUBJECT_REGISTERED';

type ExamForEligibility = Pick<ExamWithDetailRelations, 'academicSessionId' | 'classes'>;

/**
 * ADR-0006/A-04: the ONE predicate used by `GET /eligible-students`, the
 * bulk `OPEN_TO_ELIGIBLE` authorize-on-open sweep (`ExamSessionService
 * .open()`), and the batch-authorize endpoint (`ExamSessionParticipantService
 * .authorize()`) — B13's own start-attempt transaction re-evaluates this
 * same function under lock rather than re-implementing it, closing A-04.
 *
 * Deliberately does NOT check attempt-limit/authorization headroom (ADR-0006's
 * predicate's final clause, "under attempt limit or holding an
 * authorization") — that clause needs `ExamAttempt`/`AttemptAuthorization`,
 * neither of which exists until B13/B16 (ADR-0014). Every check this
 * function DOES perform runs independently (no early return) so a caller
 * gets the full set of reasons a student isn't eligible, not just the
 * first one found — useful for `GET /eligible-students`'s own roster
 * display.
 */
export async function evaluateExamEligibility(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; exam: ExamForEligibility; studentProfileId: string },
): Promise<ExamEligibilityResult> {
  const { schoolId, exam, studentProfileId } = params;
  const failedChecks: string[] = [];

  const classIds = exam.classes.map((c) => c.classSubject.classId);
  const classSubjectIds = exam.classes.map((c) => c.classSubjectId);

  const profile = await tx.studentProfile.findFirst({
    where: { schoolId, id: studentProfileId },
    select: {
      status: true,
      membership: {
        select: {
          id: true,
          status: true,
          roleAssignments: { where: { role: 'STUDENT', status: 'ACTIVE' }, select: { id: true } },
        },
      },
    },
  });
  const isActiveStudent =
    profile !== null &&
    profile.status === 'ACTIVE' &&
    profile.membership.status === 'ACTIVE' &&
    profile.membership.roleAssignments.length > 0;
  if (!isActiveStudent) {
    failedChecks.push(NOT_ACTIVE_STUDENT);
  }

  const enrollment =
    classIds.length === 0
      ? null
      : await tx.studentEnrollment.findFirst({
          where: {
            schoolId,
            studentProfileId,
            academicSessionId: exam.academicSessionId,
            status: 'ACTIVE',
            classId: { in: classIds },
          },
          select: { id: true },
        });
  if (!enrollment) {
    failedChecks.push(NOT_ENROLLED_IN_TARGETED_CLASS);
  }

  const registration =
    enrollment === null || classSubjectIds.length === 0
      ? null
      : await tx.studentSubjectRegistration.findFirst({
          where: {
            schoolId,
            studentEnrollmentId: enrollment.id,
            classSubjectId: { in: classSubjectIds },
            status: 'REGISTERED',
          },
          select: { id: true },
        });
  if (!registration) {
    failedChecks.push(NOT_SUBJECT_REGISTERED);
  }

  return { eligible: failedChecks.length === 0, failedChecks };
}

/**
 * Layers the two session-specific conditions ADR-0006's predicate adds on
 * top of `evaluateExamEligibility`'s base check: the exam must be `OPEN`
 * and the specific session must be `OPEN`, and the student must hold an
 * `AUTHORIZED` participant row for it. The base predicate stays the single
 * source of truth for "is this student the kind of student who could ever
 * be authorized" — this wrapper adds only what doesn't apply until a
 * session exists.
 */
export async function canStudentAccessSession(
  tx: Prisma.TransactionClient,
  params: { schoolId: string; examSessionId: string; studentProfileId: string },
): Promise<boolean> {
  const { schoolId, examSessionId, studentProfileId } = params;
  const session = await tx.examSession.findFirst({
    where: { schoolId, id: examSessionId },
    select: { status: true, exam: { select: { status: true } } },
  });
  if (!session || session.status !== 'OPEN' || session.exam.status !== 'OPEN') return false;

  const participant = await tx.examSessionParticipant.findFirst({
    where: { schoolId, examSessionId, studentProfileId, status: 'AUTHORIZED' },
    select: { id: true },
  });
  return participant !== null;
}
