import { Worker, type ConnectionOptions, type Job, type Queue } from 'bullmq';
import { prisma, withTenant } from '@atlas/db';

export const UNASSIGNED_STUDENTS_DIGEST_QUEUE_NAME = 'atlas-unassigned-students-digest';
// A stable jobId so re-scheduling on every process restart doesn't pile up
// duplicate repeatable jobs — same convention as every other sweep's own
// SWEEP_JOB_ID.
const SWEEP_JOB_ID = 'sweep';

export interface UnassignedStudentsDigestDeps {
  now?: () => Date;
}

/**
 * B10's own, buildable-now notification type (05 §57/04 §64: Moderator —
 * "7 students are unassigned") — unlike exam-opened/makeup-granted/result-
 * published, this needs no unbuilt phase's data: `StudentEnrollment`/
 * `ClassGroup`/`AcademicSession` all already exist (B5/B6). A plain async
 * function, not a class (this process has no Nest DI) — same shape as
 * every other sweep in this file.
 *
 * "Unassigned" = an ACTIVE student (an active STUDENT `RoleAssignment`,
 * `StudentProfile.status === 'ACTIVE'`) with no `ACTIVE` `StudentEnrollment`
 * row for the school's current `AcademicSession`. Schools with no CURRENT
 * session are skipped entirely — there's no session to be unassigned
 * *from* yet (e.g. before B5's onboarding step activates one).
 *
 * Iterates schools one at a time via `withTenant`, never a single global
 * query — same RLS/`FORCE ROW LEVEL SECURITY` constraint every other sweep
 * in this file already documents.
 *
 * Anti-spam ("digest, not spam", per this phase's own design): before
 * creating a new `STUDENTS_UNASSIGNED` notification for a given Moderator,
 * looks up their most recent one and only creates a new one if the count
 * has genuinely changed (0→N, or N→a different N) — reusing the existing
 * `[schoolId, recipientUserId, status, createdAt]` index, no new schema
 * needed. The count is embedded in `content` as `"N student(s)..."` and
 * parsed back out for the comparison — a small, deliberately simple
 * string-embed rather than a dedicated structured field, since this is the
 * only consumer and the format is entirely internal.
 */
export async function runUnassignedStudentsDigest(
  _deps: UnassignedStudentsDigestDeps = {},
): Promise<void> {
  // _deps.now exists purely for interface consistency with every sibling
  // sweep's Deps shape (test-clock injection) — no date-based filtering
  // happens in this particular sweep's query today.
  const schools = await prisma.school.findMany({ select: { id: true, name: true } });

  for (const school of schools) {
    try {
      await withTenant(prisma, school.id, async (tx) => {
        const currentSession = await tx.academicSession.findFirst({
          where: { schoolId: school.id, status: 'CURRENT' },
          select: { id: true },
        });
        if (!currentSession) return;

        const unassignedCount = await tx.studentProfile.count({
          where: {
            schoolId: school.id,
            status: 'ACTIVE',
            membership: {
              roleAssignments: { some: { schoolId: school.id, role: 'STUDENT', status: 'ACTIVE' } },
            },
            enrollments: {
              none: {
                schoolId: school.id,
                academicSessionId: currentSession.id,
                status: 'ACTIVE',
              },
            },
          },
        });

        const moderators = await tx.roleAssignment.findMany({
          where: { schoolId: school.id, role: 'MODERATOR', status: 'ACTIVE' },
          select: { membership: { select: { userId: true } } },
        });

        for (const moderator of moderators) {
          const recipientUserId = moderator.membership.userId;
          const mostRecent = await tx.notification.findFirst({
            where: { schoolId: school.id, recipientUserId, type: 'STUDENTS_UNASSIGNED' },
            orderBy: { createdAt: 'desc' },
            select: { content: true },
          });
          const previousCount = mostRecent ? parseCountFromContent(mostRecent.content) : null;

          if (unassignedCount === 0) continue; // nothing to report; a prior notification stays as history
          if (previousCount === unassignedCount) continue; // no genuine change since last digest

          await tx.notification.create({
            data: {
              schoolId: school.id,
              recipientUserId,
              type: 'STUDENTS_UNASSIGNED',
              title: 'Students missing class assignments',
              content: `${unassignedCount} student(s) are missing a class assignment for ${school.name}'s current session.`,
              relatedEntityType: 'AcademicSession',
              relatedEntityId: currentSession.id,
            },
          });
        }
      });
    } catch (err) {
      console.error(`[worker] unassigned-students digest failed for school ${school.id}:`, err);
    }
  }
}

function parseCountFromContent(content: string): number | null {
  const match = /^(\d+) student/.exec(content);
  return match ? Number(match[1]) : null;
}

export function createUnassignedStudentsDigestWorker(
  connection: ConnectionOptions,
  deps: UnassignedStudentsDigestDeps,
): Worker {
  return new Worker(
    UNASSIGNED_STUDENTS_DIGEST_QUEUE_NAME,
    async (_job: Job) => {
      await runUnassignedStudentsDigest(deps);
    },
    { connection },
  );
}

/** Same `upsertJobScheduler` convention as every other sweep in this file
 * — idempotent by its stable `jobSchedulerId`, safe to call on every
 * process restart. */
export async function scheduleUnassignedStudentsDigest(
  queue: Queue,
  everyMs: number,
): Promise<void> {
  await queue.upsertJobScheduler(
    SWEEP_JOB_ID,
    { every: everyMs },
    { opts: { removeOnComplete: true, removeOnFail: 10 } },
  );
}
