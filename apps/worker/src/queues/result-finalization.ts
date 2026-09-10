import { prisma, withTenant, type Prisma } from '@atlas/db';
import {
  computeResultTotals,
  resolveGradeBand,
  type GradingBand,
  type ResultQuestionMarking,
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
      exam: { select: { resultPolicy: true } },
    },
  });

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

  return {
    resultId: result.id,
    examId: attempt.examId,
    studentUserId: attempt.studentProfile.membership.userId,
    autoPublish: attempt.exam.resultPolicy === 'AUTOMATIC',
  };
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
