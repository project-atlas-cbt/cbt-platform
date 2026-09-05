import { prisma, withTenant, type Prisma } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AttemptStateResponseDto } from './dto/attempt.dto.js';

export const ATTEMPT_WITH_SNAPSHOT_INCLUDE = {
  snapshot: true,
} satisfies Prisma.ExamAttemptInclude;

export type AttemptWithSnapshot = Prisma.ExamAttemptGetPayload<{
  include: typeof ATTEMPT_WITH_SNAPSHOT_INCLUDE;
}>;

/** `SELF` ownership resolution needs the attempt's own student's `User.id`
 * — every attempt-facing controller/service loads through this shape so
 * `ResourceContext.ownerUserId` is always resolved from the loaded row,
 * never trusted from the URL/caller. */
export const ATTEMPT_WITH_OWNER_INCLUDE = {
  ...ATTEMPT_WITH_SNAPSHOT_INCLUDE,
  studentProfile: { select: { membership: { select: { userId: true } } } },
} satisfies Prisma.ExamAttemptInclude;

export type AttemptWithOwner = Prisma.ExamAttemptGetPayload<{
  include: typeof ATTEMPT_WITH_OWNER_INCLUDE;
}>;

export async function loadAttemptWithOwnerOrThrow(
  schoolId: string,
  attemptId: string,
): Promise<AttemptWithOwner> {
  const attempt = await withTenant(prisma, schoolId, (tx) =>
    tx.examAttempt.findUnique({
      where: { id: attemptId },
      include: ATTEMPT_WITH_OWNER_INCLUDE,
    }),
  );
  if (!attempt || attempt.schoolId !== schoolId) {
    throw new AppHttpException({ code: 'NOT_FOUND', message: 'Attempt not found.' });
  }
  return attempt;
}

/** State/timing only — used by responses that don't need to re-send the
 * (potentially large) question package, e.g. `submit`/`end`, where the
 * client already has the full package from its own initial `start`/
 * `resume` call. */
export function toAttemptStateResponseDto(attempt: {
  id: string;
  examId: string;
  examSessionId: string;
  state: string;
  startedAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  invalidationReason: string | null;
}): AttemptStateResponseDto {
  return {
    attemptId: attempt.id,
    examId: attempt.examId,
    examSessionId: attempt.examSessionId,
    state: attempt.state as AttemptStateResponseDto['state'],
    startedAt: attempt.startedAt.toISOString(),
    expiresAt: attempt.expiresAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    invalidationReason: attempt.invalidationReason,
  };
}
