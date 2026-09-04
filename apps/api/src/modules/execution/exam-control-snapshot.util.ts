import { prisma, withTenant } from '@atlas/db';
import type { ExamControlCenterSnapshot } from '@atlas/domain';
import { toExamSessionResponseDto } from './exam-control-mappers.js';

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

    const authorizedCount =
      sessionIds.length === 0
        ? 0
        : await tx.examSessionParticipant.count({
            where: { schoolId, examSessionId: { in: sessionIds }, status: 'AUTHORIZED' },
          });
    const absentCount = await tx.examParticipation.count({
      where: { schoolId, examId, status: 'ABSENT' },
    });

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
      sessions: sessions.map((s) => toExamSessionResponseDto(s)),
      aggregate: {
        authorizedCount,
        notStartedCount: authorizedCount,
        inProgressCount: 0,
        submittedCount: 0,
        absentCount,
        attemptDataAvailable: false,
      },
      liveAttempts: [],
      staleness: {
        isStale,
        openSince: openSince?.toISOString() ?? null,
        thresholdMs: staleThresholdMs,
      },
      computedAt: new Date().toISOString(),
    };
  });
}
