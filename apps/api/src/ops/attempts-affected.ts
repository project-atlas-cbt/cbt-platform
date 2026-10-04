import { withTenant, type PrismaClient } from '@atlas/db';

/**
 * B22 (project-owner decision 2c, 2026-10-04): after a point-in-time
 * restore, which attempts did the rollback touch? RDS restores into a NEW
 * instance, so the old one — with everything up to the incident — is still
 * there to compare against (read-only). The report lists, per school, by
 * id only:
 *
 * - MISSING: the attempt was started after the restore point and no longer
 *   exists. A student still sitting sees "could not be found" and keeps
 *   their answers on the computer. The server has no attempt, so the
 *   attempt limit is unused: the student starts again while the session is
 *   open, or the school authorises a makeup once it has closed (ADR-0014).
 * - STATE_ROLLED_BACK: it was submitted (or ended) after the restore point
 *   and is open again. The auto-submit sweeper finalises it when its time
 *   runs out; answers the client re-sends before then count, later ones
 *   are kept as evidence only (ADR-0003) and never scored.
 * - ANSWERS_ROLLED_BACK: answers saved after the restore point are gone
 *   from the server. A client still open re-sends them on reconnect (2c);
 *   what is still missing when the attempt closes is for the school to
 *   judge (RETRY, or accept).
 * - RESULT_ROLLED_BACK: a result that was FINAL/ADJUSTED is PROCESSING or
 *   absent again. Marking re-runs by itself (the worker's reconciliation);
 *   a publication made after the restore point must be made again.
 */
export type AffectedKind =
  'MISSING' | 'STATE_ROLLED_BACK' | 'ANSWERS_ROLLED_BACK' | 'RESULT_ROLLED_BACK';

export interface AttemptFingerprint {
  attemptId: string;
  schoolId: string;
  examId: string;
  studentProfileId: string;
  state: string;
  answers: number;
  /** Sum of every answer row's sequence number — grows with every save. */
  sequenceSum: number;
  resultState: string | null;
}

export interface AffectedAttempt {
  kind: AffectedKind;
  attemptId: string;
  schoolId: string;
  examId: string;
  studentProfileId: string;
  before: string;
  after: string;
}

const FINALISED = new Set(['SUBMITTED', 'AUTO_SUBMITTED', 'INVALIDATED', 'CANCELLED']);
const MARKED = new Set(['FINAL', 'ADJUSTED']);

/** Pure comparison — `old` is the pre-restore instance, `restored` the copy. */
export function diffAttempts(
  old: AttemptFingerprint[],
  restored: AttemptFingerprint[],
): AffectedAttempt[] {
  const now = new Map(restored.map((a) => [a.attemptId, a]));
  const out: AffectedAttempt[] = [];
  for (const a of old) {
    const base = {
      attemptId: a.attemptId,
      schoolId: a.schoolId,
      examId: a.examId,
      studentProfileId: a.studentProfileId,
    };
    const r = now.get(a.attemptId);
    if (!r) {
      out.push({ ...base, kind: 'MISSING', before: a.state, after: 'absent' });
      continue;
    }
    if (FINALISED.has(a.state) && !FINALISED.has(r.state)) {
      out.push({ ...base, kind: 'STATE_ROLLED_BACK', before: a.state, after: r.state });
    }
    if (r.answers < a.answers || r.sequenceSum < a.sequenceSum) {
      out.push({
        ...base,
        kind: 'ANSWERS_ROLLED_BACK',
        before: `${a.answers} answers, sequence ${a.sequenceSum}`,
        after: `${r.answers} answers, sequence ${r.sequenceSum}`,
      });
    }
    if (a.resultState && MARKED.has(a.resultState) && !MARKED.has(r.resultState ?? '')) {
      out.push({
        ...base,
        kind: 'RESULT_ROLLED_BACK',
        before: a.resultState,
        after: r.resultState ?? 'absent',
      });
    }
  }
  return out;
}

/** Fingerprints every attempt of every school, each under its own tenant. */
export async function fingerprintAttempts(
  db: PrismaClient,
  schoolIds?: string[],
): Promise<AttemptFingerprint[]> {
  const ids =
    schoolIds ??
    (await db.$queryRaw<{ id: string }[]>`SELECT id::text FROM schools`).map((s) => s.id);
  const out: AttemptFingerprint[] = [];
  for (const schoolId of ids) {
    const rows = await withTenant(
      db,
      schoolId,
      (tx) => tx.$queryRaw<
        {
          attempt_id: string;
          exam_id: string;
          student_profile_id: string;
          state: string;
          answers: bigint;
          sequence_sum: bigint | null;
          result_state: string | null;
        }[]
      >`
        SELECT a.id::text AS attempt_id, a.exam_id::text, a.student_profile_id::text,
               a.state::text AS state,
               (SELECT count(*) FROM attempt_answers aa WHERE aa.attempt_id = a.id) AS answers,
               (SELECT sum(sequence_number) FROM attempt_answers aa WHERE aa.attempt_id = a.id) AS sequence_sum,
               (SELECT r.state::text FROM results r WHERE r.attempt_id = a.id) AS result_state
          FROM exam_attempts a WHERE a.school_id = ${schoolId}::uuid`,
    );
    for (const r of rows) {
      out.push({
        attemptId: r.attempt_id,
        schoolId,
        examId: r.exam_id,
        studentProfileId: r.student_profile_id,
        state: r.state,
        answers: Number(r.answers),
        sequenceSum: Number(r.sequence_sum ?? 0),
        resultState: r.result_state,
      });
    }
  }
  return out;
}
