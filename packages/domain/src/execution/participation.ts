import type { ExamParticipationStatus } from '../exams/constants.js';

export interface ParticipationRollupInput {
  status: ExamParticipationStatus | null;
  hasNonInvalidatedAttempt: boolean;
}

/** ADR-0024's only exam-level participation rule. Callers keep the
 * per-session facts; this function deliberately returns only the roll-up. */
export function rollUpParticipation(
  entries: readonly ParticipationRollupInput[],
): 'ATTENDED' | 'ABSENT' | 'PENDING' {
  // Participation is a session fact, not the source of truth for whether a
  // student ultimately attended the exam. An invalidated attempt retains its
  // ATTENDED session record as evidence, but must not win the exam roll-up.
  if (entries.some((entry) => entry.hasNonInvalidatedAttempt)) {
    return 'ATTENDED';
  }
  if (entries.some((entry) => entry.status === 'ABSENT')) return 'ABSENT';
  return 'PENDING';
}
