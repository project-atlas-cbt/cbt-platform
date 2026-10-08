import type { Prisma } from '@atlas/db';

/** Attempt states that mean the student sat this examination (the same set
 * the makeup grant refuses on, `AttemptAdministrationService`). */
export const SAT_ATTEMPT_STATES = ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] as const;

export interface PendingAbsence {
  examSessionId: string;
  studentProfileId: string;
}

/**
 * The one definition of "who End Examination records as absent", shared by
 * `ExamCompletionService.complete()` (which must match the operator's
 * confirmed list exactly) and `GET /exams/:id/eligible-students` (which the
 * End Examination dialog lists from), so the two can never drift.
 *
 * A pending absence is an AUTHORIZED (session, student) pair with no
 * participation row and no attempt in that session, for a student who has
 * not sat the examination in any other batch either (bug audit P2-2: a
 * student who sat batch 1 and was also authorized for batch 2 did not miss
 * the exam).
 */
export async function computePendingAbsences(
  tx: Prisma.TransactionClient,
  schoolId: string,
  examId: string,
): Promise<PendingAbsence[]> {
  const authorizedParticipants = await tx.examSessionParticipant.findMany({
    where: { schoolId, session: { examId }, status: 'AUTHORIZED' },
    orderBy: { authorizedAt: 'desc' },
    select: { studentProfileId: true, examSessionId: true },
  });
  if (authorizedParticipants.length === 0) return [];
  const [existingParticipation, attempts] = await Promise.all([
    tx.examParticipation.findMany({
      where: { schoolId, examId },
      select: { studentProfileId: true, examSessionId: true },
    }),
    tx.examAttempt.findMany({
      where: { schoolId, examId },
      select: { studentProfileId: true, examSessionId: true, state: true },
    }),
  ]);
  const alreadyMarked = new Set(
    existingParticipation.map((p) => `${p.examSessionId}:${p.studentProfileId}`),
  );
  const started = new Set(attempts.map((a) => `${a.examSessionId}:${a.studentProfileId}`));
  const satStates: readonly string[] = SAT_ATTEMPT_STATES;
  const satExam = new Set(
    attempts.filter((a) => satStates.includes(a.state)).map((a) => a.studentProfileId),
  );
  return authorizedParticipants.filter(
    (p) =>
      !satExam.has(p.studentProfileId) &&
      !alreadyMarked.has(`${p.examSessionId}:${p.studentProfileId}`) &&
      !started.has(`${p.examSessionId}:${p.studentProfileId}`),
  );
}
