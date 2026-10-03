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

/**
 * B21: the exam-level roll-up for every authorized student at once, in
 * linear time — indexed by (student, session) instead of the previous
 * filter/find/some-per-student scan, which was O(students × rows) and ran
 * on every Control Center publish (start, submit, sweep). Shared by the API
 * snapshot and the worker refresh sweep so the two cannot drift.
 * Semantics are identical to applying `rollUpParticipation` per student:
 * students are returned in first-participant order; the first matching
 * participation row wins, as `Array.find` did.
 */
export function rollUpExamParticipation(input: {
  participants: readonly { studentProfileId: string; examSessionId: string }[];
  participations: readonly {
    studentProfileId: string;
    examSessionId: string;
    status: ExamParticipationStatus;
  }[];
  attempts: readonly { studentProfileId: string; examSessionId: string; state: string }[];
}): ('ATTENDED' | 'ABSENT' | 'PENDING')[] {
  const key = (studentProfileId: string, examSessionId: string) =>
    `${studentProfileId}:${examSessionId}`;
  const participationByKey = new Map<string, ExamParticipationStatus>();
  for (const entry of input.participations) {
    const k = key(entry.studentProfileId, entry.examSessionId);
    if (!participationByKey.has(k)) participationByKey.set(k, entry.status);
  }
  const liveAttemptKeys = new Set<string>();
  for (const attempt of input.attempts) {
    if (attempt.state === 'INVALIDATED' || attempt.state === 'CANCELLED') continue;
    liveAttemptKeys.add(key(attempt.studentProfileId, attempt.examSessionId));
  }
  const sessionsByStudent = new Map<string, string[]>();
  for (const participant of input.participants) {
    const list = sessionsByStudent.get(participant.studentProfileId);
    if (list) list.push(participant.examSessionId);
    else sessionsByStudent.set(participant.studentProfileId, [participant.examSessionId]);
  }
  return [...sessionsByStudent.entries()].map(([studentProfileId, sessionIds]) =>
    rollUpParticipation(
      sessionIds.map((examSessionId) => {
        const k = key(studentProfileId, examSessionId);
        return {
          status: participationByKey.get(k) ?? null,
          hasNonInvalidatedAttempt: liveAttemptKeys.has(k),
        };
      }),
    ),
  );
}
