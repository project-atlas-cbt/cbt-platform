import { prisma, withTenant, type Prisma } from '@atlas/db';
import {
  applyResultAdjustment,
  computePercentage,
  computeResultTotals,
  effectiveResultSettings,
  resolveGradeBand,
  toAdjustableValues,
  type GradingBand,
  type ResultQuestionMarking,
  type ResultTotals,
} from '@atlas/domain';

/**
 * B15's result finalisation, run inside `apps/worker`'s marking transaction.
 *
 * This is a deliberate, documented duplicate of a small amount of logic that
 * also exists in `apps/api` (`ensureProcessingResult`): the two apps cannot
 * import each other — only `packages/*` is shared — which is the same
 * constraint `exam-control-refresh.queue.ts` already records for the Control
 * Center snapshot. What is NOT duplicated is the part that matters: the
 * arithmetic (`computeResultTotals`) and the grade resolution
 * (`resolveGradeBand`) both come from `@atlas/domain`, so the numbers this
 * writes and the numbers the API reports are the same computation.
 *
 * DoD item 2 — "`PROCESSING → FINAL` occurs only after all question marking
 * completes" — is structural here rather than checked: this runs inside the
 * marking transaction, after every `AttemptQuestionResult` upsert, so a
 * partial run rolls back the transition along with the marks.
 */

/**
 * The worker's copy of `apps/api`'s `ensureProcessingResult` (same reason
 * as above: the apps cannot import each other). B22: the ADR-0004 sweeper
 * now writes the PROCESSING result in its own transition transaction, as
 * every `apps/api` path already did — that row is the durable record that
 * marking is owed, which the sweeper's reconciliation pass relies on.
 * Never resets an existing result (it may be FINAL, ADJUSTED or VOIDED).
 */
export async function ensureProcessingResult(
  tx: Prisma.TransactionClient,
  input: { schoolId: string; attemptId: string; examId: string; studentProfileId: string },
): Promise<void> {
  await tx.result.upsert({
    where: { schoolId_attemptId: { schoolId: input.schoolId, attemptId: input.attemptId } },
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

export interface FinalizedResultOutcome {
  resultId: string;
  examId: string;
  studentUserId: string;
  /** Whether the exam's own policy releases results automatically. */
  autoPublish: boolean;
}

export async function finalizeResultAfterMarking(
  tx: Prisma.TransactionClient,
  schoolId: string,
  attemptId: string,
  questionResults: readonly ResultQuestionMarking[],
): Promise<FinalizedResultOutcome> {
  const attempt = await tx.examAttempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      examId: true,
      studentProfileId: true,
      state: true,
      studentProfile: {
        select: {
          membership: { select: { userId: true } },
          enrollments: {
            where: { status: 'ACTIVE' },
            select: { classGroupSession: { select: { level: true } } },
            take: 1,
          },
        },
      },
      exam: { select: { resultPolicy: true, resultDetailVisibility: true } },
    },
  });

  if (attempt.state !== 'SUBMITTED' && attempt.state !== 'AUTO_SUBMITTED') {
    throw new Error(`attempt ${attemptId} is not eligible for result finalization`);
  }

  const totals = computeResultTotals(questionResults);

  // ADR-0018: the grade is resolved ONCE, here, against a specific version,
  // and both the label and that version's id are stored. A later edit to the
  // school's scale creates a new version and leaves this result untouched.
  const level = attempt.studentProfile.enrollments[0]?.classGroupSession.level ?? null;
  const scale = await resolveGradingScaleVersion(tx, schoolId, level);
  const grade = scale ? resolveGradeBand(scale.bands, totals.percentage) : null;

  const result = await tx.result.upsert({
    where: { schoolId_attemptId: { schoolId, attemptId } },
    create: {
      schoolId,
      attemptId,
      examId: attempt.examId,
      studentProfileId: attempt.studentProfileId,
      state: 'FINAL',
      finalizedAt: new Date(),
      ...totals,
      ...(grade !== null && { grade: grade.label }),
      ...(scale !== null && { gradingScaleVersionId: scale.versionId }),
    },
    update: {
      // Re-marking is idempotent and expected (B14 DoD item 9), so this
      // recomputes freely — but it must never rewind a result that has moved
      // on. ADJUSTED means a human correction has been applied on top of the
      // marking output, and VOIDED means the attempt was invalidated;
      // overwriting either from a re-queued marking job would be exactly the
      // silent score change this phase exists to prevent. The database's own
      // state-transition trigger refuses those directions independently.
      ...totals,
      grade: grade?.label ?? null,
      gradingScaleVersionId: scale?.versionId ?? null,
      state: 'FINAL',
      finalizedAt: new Date(),
    },
  });

  await applyCompletedVoids(
    tx,
    schoolId,
    attempt.examId,
    result.id,
    totals,
    questionResults,
    scale,
  );

  // ADR-0010 (2026-10-06 amendment): while the school's policy is locked,
  // its own "who releases" wins over the exam's stored copy — otherwise a
  // teacher could set their exam to AUTOMATIC and release results the
  // school locked to administrative release.
  const school = await tx.school.findUniqueOrThrow({
    where: { id: schoolId },
    select: { resultPolicy: true, resultDetailVisibility: true, resultPolicyLocked: true },
  });
  const { resultPolicy } = effectiveResultSettings(school, attempt.exam);

  return {
    resultId: result.id,
    examId: attempt.examId,
    studentUserId: attempt.studentProfile.membership.userId,
    autoPublish: resultPolicy === 'AUTOMATIC',
  };
}

/**
 * P1-7: a question voided by a completed VOID_QUESTION operation is off the
 * paper for the whole exam. That operation only rewrote the results that
 * were final while it ran, so a result finalised later (a makeup, a retry, a
 * late auto-submit) has each such void applied here, in the marking
 * transaction: the result becomes ADJUSTED with one child adjustment row
 * per operation, exactly as if the operation had reached it — so it stays
 * traceable to the raw marking evidence. A void still running picks this
 * result up itself (FINAL with no child row for it yet).
 */
async function applyCompletedVoids(
  tx: Prisma.TransactionClient,
  schoolId: string,
  examId: string,
  resultId: string,
  totals: ResultTotals,
  questionResults: readonly ResultQuestionMarking[],
  scale: { versionId: string; bands: GradingBand[] } | null,
): Promise<void> {
  const operations = await tx.resultAdjustmentOperation.findMany({
    where: {
      schoolId,
      examId,
      type: 'VOID_QUESTION',
      status: 'COMPLETED',
      targetExamQuestionId: { not: null },
    },
    orderBy: [{ completedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, targetExamQuestionId: true, reason: true, createdByMembershipId: true },
  });
  if (operations.length === 0) return;

  let current = toAdjustableValues(totals);
  const voided: string[] = [];
  for (const operation of operations) {
    const next = applyResultAdjustment(
      current,
      { type: 'VOID_QUESTION', targetExamQuestionId: operation.targetExamQuestionId },
      questionResults,
      voided,
    );
    await tx.resultAdjustment.create({
      data: {
        schoolId,
        operationId: operation.id,
        resultId,
        adjustmentType: 'VOID_QUESTION',
        oldValue: current as unknown as Prisma.InputJsonValue,
        newValue: next as unknown as Prisma.InputJsonValue,
        reason: operation.reason,
        authorizedByMembershipId: operation.createdByMembershipId,
      },
    });
    voided.push(operation.targetExamQuestionId!);
    current = next;
  }

  const percentage = computePercentage(current.earnedMarks, current.totalMarks);
  const grade = scale ? resolveGradeBand(scale.bands, percentage) : null;
  await tx.result.update({
    where: { id: resultId },
    data: {
      totalMarks: current.totalMarks,
      earnedMarks: current.earnedMarks,
      percentage,
      correctCount: current.correctCount,
      incorrectCount: current.incorrectCount,
      unansweredCount: current.unansweredCount,
      partialCount: current.partialCount,
      grade: grade?.label ?? null,
      state: 'ADJUSTED',
    },
  });
}

/**
 * ADR-0018's optional level scoping: the scale for the student's own class
 * level if the school configured one, else its school-wide default, else
 * nothing at all — which is a supported state, not an error (05 §46 keeps
 * raw marks and percentage authoritative regardless of grading config).
 *
 * Structurally the same resolution `GradingScaleService.resolveScaleForLevel`
 * performs on the API side; duplicated for the same cross-app-import reason
 * as the rest of this file.
 */
async function resolveGradingScaleVersion(
  tx: Prisma.TransactionClient,
  schoolId: string,
  level: string | null,
): Promise<{ versionId: string; bands: GradingBand[] } | null> {
  const scales = await tx.gradingScale.findMany({
    where: { schoolId, archivedAt: null, currentVersionId: { not: null } },
    include: { currentVersion: { include: { bands: true } } },
  });

  const chosen =
    scales.find((s) => s.level !== null && s.level === level) ??
    scales.find((s) => s.level === null);
  if (!chosen?.currentVersion) return null;

  return {
    versionId: chosen.currentVersion.id,
    bands: chosen.currentVersion.bands.map((b) => ({
      label: b.label,
      minPercentage: Number(b.minPercentage),
      maxPercentage: Number(b.maxPercentage),
      isPassing: b.isPassing,
    })),
  };
}

/**
 * 05 §47's automatic publication policy / 07 §30: "the result becomes
 * PUBLISHED immediately after successful finalization."
 *
 * Runs in the same transaction as finalisation, so an exam configured for
 * automatic release can never end up with a finalised-but-unreleased result
 * because a second step failed. Idempotent: the publication row is per exam
 * (ADR-0010), so the first finalised attempt creates it and every subsequent
 * one is a harmless no-op update.
 *
 * Deliberately does NOT clear `adjustmentInProgress`: if a bulk adjustment is
 * running over this exam, the hold must survive — a late-finalising attempt
 * must not release a cohort mid-regrade.
 */
export async function autoPublishIfPolicyRequires(
  tx: Prisma.TransactionClient,
  schoolId: string,
  examId: string,
): Promise<boolean> {
  const existing = await tx.resultPublication.findUnique({
    where: { schoolId_examId: { schoolId, examId } },
  });

  if (existing?.status === 'PUBLISHED') return false;

  // An exam a human explicitly unpublished is not re-published by the next
  // attempt to finish marking. Automatic release means "released without
  // waiting for a person", not "overrides a person's decision".
  if (existing && existing.unpublishedAt !== null) return false;

  await tx.resultPublication.upsert({
    where: { schoolId_examId: { schoolId, examId } },
    create: { schoolId, examId, status: 'PUBLISHED', publishedAt: new Date() },
    update: { status: 'PUBLISHED', publishedAt: new Date() },
  });
  return true;
}

/**
 * The audit event and in-app notification for an automatic release. Written
 * AFTER the transaction commits, matching `attempt-auto-submit.queue.ts`'s
 * own established shape — a notification failure must never roll back a
 * finalisation that has already happened.
 *
 * `RESULT_PUBLISHED` is one of the two canonical actions B15 flipped from
 * DEFERRED to LIVE; this process has no Nest DI and so no registration
 * provider, but it must emit exactly the string
 * `ResultAuditActionRegistrationProvider` registers.
 */
export async function recordAutoPublication(
  schoolId: string,
  outcome: FinalizedResultOutcome,
  examTitle: string,
  studentUserId: string,
): Promise<void> {
  // Both tables are school-owned and RLS-protected (FORCE ROW LEVEL
  // SECURITY), so these writes MUST go through `withTenant` — an unscoped
  // `prisma` write is silently refused by the isolation policy. The caller
  // swallows failures here by design, so getting this wrong loses the
  // notification quietly rather than loudly; caught by this phase's own
  // marking-worker test asserting the notification actually lands. Matches
  // `attempt-auto-submit.queue.ts`'s own audit-write convention exactly.
  await withTenant(prisma, schoolId, async (tx) => {
    await tx.auditEvent.create({
      data: {
        schoolId,
        // Attributed to the attempt's own student, matching every other
        // system-initiated action in this schema: AuditEvent.actorUserId /
        // actorRole are non-nullable and Role has no SYSTEM value, so a
        // system action is filed against the person it happened for.
        actorUserId: studentUserId,
        actorRole: 'STUDENT',
        action: 'RESULT_PUBLISHED',
        entityType: 'Exam',
        entityId: outcome.examId,
        reason: 'Automatic publication policy (05 §47).',
        metadata: { resultId: outcome.resultId, automatic: true },
      },
    });

    await tx.notification.create({
      data: {
        schoolId,
        recipientUserId: outcome.studentUserId,
        type: 'RESULT_PUBLISHED',
        title: 'Your result is available',
        content: `Your result for ${examTitle} has been published.`,
        relatedEntityType: 'Result',
        relatedEntityId: outcome.resultId,
      },
    });
  });
}
