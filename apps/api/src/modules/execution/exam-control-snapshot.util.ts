import { prisma, withTenant } from '@atlas/db';
import { rollUpParticipation } from '@atlas/domain';
import type { ExamControlCenterSnapshot } from '@atlas/domain';
import { resolveMembershipDisplayNames, toExamSessionResponseDto } from './exam-control-mappers.js';

/**
 * The one place `GET /v1/exams/:id/control` (`ExamControlCenterService`'s
 * live-compute fallback) and every mutation's post-commit SSE publish
 * (`ExamControlStreamService.publishUpdate`) both source the current
 * aggregate from — so a client watching the stream and a client polling
 * `GET .../control` can never see two different pictures of the same
 * moment. `apps/worker`'s own periodic sweep (`exam-control-refresh
 * .queue.ts`) computes an equivalent snapshot independently — it cannot
 * import from `apps/api` (only `packages/*` are shared across apps, the
 * same constraint B7's own import-worker-bootstrap.ts doc comment already
 * records) — kept structurally identical by both reading from
 * `packages/domain`'s shared `ExamControlCenterSnapshot` shape.
 */
export async function computeExamControlSnapshot(
  schoolId: string,
  examId: string,
  examStatus: string,
  staleThresholdMs: number,
): Promise<ExamControlCenterSnapshot> {
  return withTenant(prisma, schoolId, async (tx) => {
    const sessions = await tx.examSession.findMany({
      where: { schoolId, examId },
      orderBy: { openedAt: 'asc' },
    });
    const sessionIds = sessions.map((s) => s.id);

    const participants =
      sessionIds.length === 0
        ? []
        : await tx.examSessionParticipant.findMany({
            where: { schoolId, examSessionId: { in: sessionIds }, status: 'AUTHORIZED' },
            select: { studentProfileId: true, examSessionId: true },
          });
    const authorizedCount = new Set(participants.map((participant) => participant.studentProfileId))
      .size;

    // B13: real ExamAttempt data — independent counts, never derived by
    // subtraction from authorizedCount (a derived `notStartedCount` could
    // go negative under a real edge case, e.g. a makeup/retry attempt from
    // a future phase; independent counts stay correct regardless).
    const activeAttemptRows = await tx.examAttempt.findMany({
      where: { schoolId, examId, state: { in: ['IN_PROGRESS', 'SUBMITTED', 'AUTO_SUBMITTED'] } },
      select: { studentProfileId: true, state: true },
    });
    const inProgressCount = new Set(
      activeAttemptRows
        .filter((attempt) => attempt.state === 'IN_PROGRESS')
        .map((attempt) => attempt.studentProfileId),
    ).size;
    const submittedCount = new Set(
      activeAttemptRows
        .filter((attempt) => attempt.state === 'SUBMITTED' || attempt.state === 'AUTO_SUBMITTED')
        .map((attempt) => attempt.studentProfileId),
    ).size;
    const liveAttempts = await tx.examAttempt.findMany({
      where: { schoolId, examId, state: 'IN_PROGRESS' },
      select: { studentProfileId: true, state: true, expiresAt: true },
    });
    const allAttempts = await tx.examAttempt.findMany({
      where: { schoolId, examId },
      select: { studentProfileId: true, examSessionId: true, state: true },
    });
    const participations = await tx.examParticipation.findMany({
      where: { schoolId, examId },
      select: { studentProfileId: true, examSessionId: true, status: true },
    });
    const studentIds = new Set(participants.map((participant) => participant.studentProfileId));
    const rollups = [...studentIds].map((studentProfileId) =>
      rollUpParticipation(
        participants
          .filter((participant) => participant.studentProfileId === studentProfileId)
          .map((participant) => {
            const participation = participations.find(
              (entry) =>
                entry.studentProfileId === studentProfileId &&
                entry.examSessionId === participant.examSessionId,
            );
            return {
              status: participation?.status ?? null,
              hasNonInvalidatedAttempt: allAttempts.some(
                (attempt) =>
                  attempt.studentProfileId === studentProfileId &&
                  attempt.examSessionId === participant.examSessionId &&
                  attempt.state !== 'INVALIDATED' &&
                  attempt.state !== 'CANCELLED',
              ),
            };
          }),
      ),
    );
    const absentCount = rollups.filter((status) => status === 'ABSENT').length;
    const nowMs = Date.now();
    const names = await resolveMembershipDisplayNames(
      schoolId,
      sessions.flatMap((s) => [s.openedByMembershipId, s.closedByMembershipId]),
    );

    let openSince: Date | null = null;
    for (const session of sessions) {
      if (session.status !== 'OPEN') continue;
      const openedFrom = session.reopenedAt ?? session.openedAt;
      if (openSince === null || openedFrom < openSince) openSince = openedFrom;
    }
    const isStale = openSince !== null && Date.now() - openSince.getTime() > staleThresholdMs;

    return {
      examId,
      examStatus: examStatus as ExamControlCenterSnapshot['examStatus'],
      sessions: sessions.map((s) => toExamSessionResponseDto(s, names)),
      aggregate: {
        authorizedCount,
        notStartedCount: rollups.filter((status) => status === 'PENDING').length,
        inProgressCount,
        submittedCount,
        absentCount,
        attemptDataAvailable: true,
      },
      liveAttempts: liveAttempts.map((a) => ({
        studentProfileId: a.studentProfileId,
        status: a.state,
        timeRemainingSeconds: Math.max(0, Math.floor((a.expiresAt.getTime() - nowMs) / 1000)),
      })),
      staleness: {
        isStale,
        openSince: openSince?.toISOString() ?? null,
        thresholdMs: staleThresholdMs,
      },
      computedAt: new Date().toISOString(),
    };
  });
}
