import type { Prisma } from '@atlas/db';

/**
 * Creates the `Result` row in `PROCESSING` for a just-finalised attempt.
 *
 * A plain exported function taking a transaction client, NOT a Nest service:
 * every caller already sits inside a `withTenant` transaction that is
 * transitioning the attempt, and this must commit or roll back with it.
 * `ExecutionModule` imports it directly, without a DI edge — the same
 * "importable without a DI edge" precedent `exam-scope.util.ts` established
 * and `ExecutionModule`'s own doc comment already relies on.
 *
 * Why the result is created HERE, at attempt finalisation, rather than by the
 * marking worker that fills it in (a decision recorded in B15's roadmap
 * notes):
 *
 *   - 07 §29 describes exactly this: the result is created `PROCESSING`, and
 *     only once ALL marking completes does it become `FINAL`.
 *   - It makes DoD item 2's `PROCESSING → FINAL` transition genuinely
 *     observable, rather than a state that exists only inside one
 *     transaction and can never be seen or tested.
 *   - It gives B19 a real "pending results" signal for its session-close
 *     readiness check: a result still in `PROCESSING` is precisely a result
 *     that has not been resolved.
 *   - It partly mitigates the residual risk B14 documented against itself —
 *     a Redis outage at finalisation loses the marking enqueue, and with no
 *     row written at that moment nothing downstream could ever discover the
 *     gap. Now such an attempt leaves a visible `PROCESSING` result.
 *
 * Idempotent by construction: the unique `(school_id, attempt_id)` index is
 * the 1:1 constraint, and this upserts against it. `apps/worker`'s marking
 * consumer calls its own copy of the same upsert before finalising, so an
 * attempt whose finalisation path somehow missed this still gets a result.
 */
export async function ensureProcessingResult(
  tx: Prisma.TransactionClient,
  input: {
    schoolId: string;
    attemptId: string;
    examId: string;
    studentProfileId: string;
  },
): Promise<void> {
  await tx.result.upsert({
    where: {
      schoolId_attemptId: { schoolId: input.schoolId, attemptId: input.attemptId },
    },
    // A result that already exists is never reset by a repeated finalisation
    // — it may already be FINAL, ADJUSTED, or VOIDED, and rewinding it would
    // be exactly the silent score change this phase exists to prevent.
    update: {},
    create: {
      schoolId: input.schoolId,
      attemptId: input.attemptId,
      examId: input.examId,
      studentProfileId: input.studentProfileId,
      state: 'PROCESSING',
      totalMarks: 0,
      earnedMarks: 0,
      percentage: 0,
      correctCount: 0,
      incorrectCount: 0,
      unansweredCount: 0,
      partialCount: 0,
    },
  });
}
