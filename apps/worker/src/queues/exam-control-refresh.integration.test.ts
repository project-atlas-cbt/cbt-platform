/**
 * B12's own, buildable-now background job — Exam Control Center aggregate
 * refresh + stale-exam detection, merged into one per-tenant pass. Runs
 * against real Postgres (RLS included, via the shared `prisma` singleton —
 * same convention as `unassigned-students-digest.integration.test.ts`).
 * `deps.redis` is a small in-memory fake (get/set/publish/xadd/expire) —
 * no real Redis needed to prove the sweep's own logic (whether it
 * publishes/appends only on a material change is exactly what a fake
 * lets this test assert directly, without racing a real pub/sub
 * subscriber).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { EXAM_CONTROL_CACHE_TTL_SECONDS } from '@atlas/domain';
import {
  runExamControlRefreshSweep,
  type ExamControlRefreshSweepDeps,
} from './exam-control-refresh.queue.js';
import { ownerPrisma } from '../test-support/owner-prisma.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

function fakeRedis(): ExamControlRefreshSweepDeps['redis'] & {
  store: Map<string, string>;
  published: { channel: string; message: string }[];
  xaddCalls: unknown[][];
  setCalls: unknown[][];
} {
  const store = new Map<string, string>();
  const published: { channel: string; message: string }[] = [];
  const xaddCalls: unknown[][] = [];
  const setCalls: unknown[][] = [];
  return {
    store,
    published,
    xaddCalls,
    setCalls,
    get: (key: string) => Promise.resolve(store.get(key) ?? null),
    set: (...args: unknown[]) => {
      const [key, value] = args as [string, string];
      setCalls.push(args);
      store.set(key, value);
      return Promise.resolve('OK');
    },
    publish: (channel: string, message: string) => {
      published.push({ channel, message });
      return Promise.resolve(1);
    },
    xadd: (...args: unknown[]) => {
      xaddCalls.push(args);
      return Promise.resolve('0-1');
    },
    expire: () => Promise.resolve(1),
  } as unknown as ExamControlRefreshSweepDeps['redis'] & {
    store: Map<string, string>;
    published: { channel: string; message: string }[];
    xaddCalls: unknown[][];
    setCalls: unknown[][];
  };
}

interface FixtureSchool {
  schoolId: string;
  examId: string;
  membershipId: string;
}

/** One school with one exam directly created OPEN (the exam-builder
 * migration's immutability trigger only fires `BEFORE UPDATE`, never on
 * INSERT — a direct create with `status: 'OPEN'` is a real, legitimate
 * fixture shortcut, not a bypass of anything this sweep itself checks). */
async function createFixtureSchool(): Promise<FixtureSchool> {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `Exam Control Refresh Test School ${suffix}`, subdomain: `ecr-${suffix}` },
  });

  return withTenant(prisma, school.id, async (tx) => {
    const user = await tx.user.create({
      data: { firstName: 'Refresh', lastName: 'Teacher', displayName: 'Refresh Teacher' },
    });
    const membership = await tx.schoolMembership.create({
      data: { schoolId: school.id, userId: user.id, loginIdentifier: `ecr-teacher-${suffix}` },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: membership.id, role: 'TEACHER' },
    });
    const session = await tx.academicSession.create({
      data: {
        schoolId: school.id,
        name: `ECR ${suffix.slice(0, 8)}`,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    const term = await tx.academicTerm.create({
      data: {
        schoolId: school.id,
        academicSessionId: session.id,
        name: 'First Term',
        sequence: 1,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-04-30'),
      },
    });
    const subject = await tx.subject.create({
      data: { schoolId: school.id, name: 'Mathematics', code: `MTH-${suffix.slice(0, 6)}` },
    });
    const exam = await tx.exam.create({
      data: {
        schoolId: school.id,
        academicSessionId: session.id,
        academicTermId: term.id,
        subjectId: subject.id,
        title: `ECR Exam ${suffix.slice(0, 8)}`,
        examType: 'Test',
        durationSeconds: 3600,
        resultPolicy: 'TEACHER',
        resultDetailVisibility: 'SCORE_ONLY',
        createdByMembershipId: membership.id,
        status: 'OPEN',
      },
    });
    return { schoolId: school.id, examId: exam.id, membershipId: membership.id };
  });
}

async function cleanupSchool(schoolId: string): Promise<void> {
  const userIds = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.findMany({ where: { schoolId }, select: { userId: true } }),
  );
  await withTenant(prisma, schoolId, async (tx) => {
    await tx.examSessionParticipant.deleteMany({ where: { schoolId } });
    await tx.examSession.deleteMany({ where: { schoolId } });
    await tx.exam.deleteMany({ where: { schoolId } });
    await tx.subject.deleteMany({ where: { schoolId } });
    await tx.academicTerm.deleteMany({ where: { schoolId } });
    await tx.academicSession.deleteMany({ where: { schoolId } });
    await tx.roleAssignment.deleteMany({ where: { schoolId } });
    await tx.schoolMembership.deleteMany({ where: { schoolId } });
  });
  await ownerPrisma().school.delete({ where: { id: schoolId } });
  for (const { userId } of userIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

/** Every test creates its own school and runs the sweep against the WHOLE
 * test database — other suites/tests may have their own OPEN exams present
 * at the same time. Filtering `redis.published`/`xaddCalls` down to this
 * test's own channel is more robust than trying to achieve perfect
 * isolation via cleanup timing alone. */
function publishesFor(
  redis: ReturnType<typeof fakeRedis>,
  schoolId: string,
  examId: string,
): number {
  const channel = `atlas:exam-control:${schoolId}:${examId}`;
  return redis.published.filter((p) => p.channel === channel).length;
}

function xaddsFor(redis: ReturnType<typeof fakeRedis>, schoolId: string, examId: string): number {
  const streamKey = `atlas:exam-control-stream:${schoolId}:${examId}`;
  return redis.xaddCalls.filter((call) => call[0] === streamKey).length;
}

describe.skipIf(!ownerDatabaseUrl)('exam-control-refresh sweep (B12)', () => {
  const schools: string[] = [];

  afterAll(async () => {
    for (const schoolId of schools) {
      await cleanupSchool(schoolId).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('computes real aggregate counts and caches them, publishing once to establish the baseline', async () => {
    const school = await createFixtureSchool();
    schools.push(school.schoolId);
    await withTenant(prisma, school.schoolId, (tx) =>
      tx.examSession.create({
        data: {
          schoolId: school.schoolId,
          examId: school.examId,
          openedByMembershipId: school.membershipId,
        },
      }),
    );

    const redis = fakeRedis();
    await runExamControlRefreshSweep({ redis, staleThresholdMs: 4 * 60 * 60 * 1000 });

    const cached = redis.store.get(`atlas:exam-control:${school.schoolId}:${school.examId}`);
    expect(cached).toBeDefined();
    const snapshot = JSON.parse(cached!) as { aggregate: { authorizedCount: number } };
    expect(snapshot.aggregate.authorizedCount).toBe(0);
    // A brand-new cache entry (no prior value) always counts as a material
    // change — the very first tick for a given exam always publishes once,
    // establishing the baseline for every subsequent tick's comparison.
    expect(publishesFor(redis, school.schoolId, school.examId)).toBe(1);
    expect(xaddsFor(redis, school.schoolId, school.examId)).toBe(1);
    // Found in review: a plain SET with no TTL left a completed/cancelled/
    // archived exam's last snapshot in Redis forever, since this sweep only
    // ever touches exams currently OPEN/CLOSED. Every write now carries a
    // bounded TTL instead.
    const key = `atlas:exam-control:${school.schoolId}:${school.examId}`;
    const relevantSetCall = redis.setCalls.find((call) => call[0] === key);
    expect(relevantSetCall).toEqual([key, cached, 'EX', EXAM_CONTROL_CACHE_TTL_SECONDS]);
  });

  it('does not re-publish on a second tick when nothing materially changed', async () => {
    const school = await createFixtureSchool();
    schools.push(school.schoolId);

    const redis = fakeRedis();
    await runExamControlRefreshSweep({ redis, staleThresholdMs: 4 * 60 * 60 * 1000 });
    await runExamControlRefreshSweep({ redis, staleThresholdMs: 4 * 60 * 60 * 1000 });

    expect(publishesFor(redis, school.schoolId, school.examId)).toBe(1);
    expect(xaddsFor(redis, school.schoolId, school.examId)).toBe(1);
  });

  it('publishes again once a real change occurs (a session opens)', async () => {
    const school = await createFixtureSchool();
    schools.push(school.schoolId);

    const redis = fakeRedis();
    await runExamControlRefreshSweep({ redis, staleThresholdMs: 4 * 60 * 60 * 1000 });

    await withTenant(prisma, school.schoolId, (tx) =>
      tx.examSession.create({
        data: {
          schoolId: school.schoolId,
          examId: school.examId,
          openedByMembershipId: school.membershipId,
        },
      }),
    );
    await runExamControlRefreshSweep({ redis, staleThresholdMs: 4 * 60 * 60 * 1000 });

    expect(publishesFor(redis, school.schoolId, school.examId)).toBe(2);
  });

  it('flags an exam with a session open beyond the staleness threshold, never auto-closing it', async () => {
    const school = await createFixtureSchool();
    schools.push(school.schoolId);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await withTenant(prisma, school.schoolId, (tx) =>
      tx.examSession.create({
        data: {
          schoolId: school.schoolId,
          examId: school.examId,
          openedByMembershipId: school.membershipId,
          openedAt: twoHoursAgo,
        },
      }),
    );

    const redis = fakeRedis();
    // A 1-hour threshold — the 2-hour-old session is stale.
    await runExamControlRefreshSweep({ redis, staleThresholdMs: 60 * 60 * 1000 });

    const cached = redis.store.get(`atlas:exam-control:${school.schoolId}:${school.examId}`);
    const snapshot = JSON.parse(cached!) as { staleness: { isStale: boolean } };
    expect(snapshot.staleness.isStale).toBe(true);

    const exam = await withTenant(prisma, school.schoolId, (tx) =>
      tx.exam.findUniqueOrThrow({ where: { id: school.examId } }),
    );
    expect(exam.status).toBe('OPEN');
  });
});
