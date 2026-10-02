/**
 * B14 — the ADR-0004 sweeper, the "authority" half of "a background
 * sweeper as the authority, plus opportunistic finalisation, sharing one
 * idempotent routine" (apps/api's `AttemptFinalizationService` is the
 * opportunistic half, proven separately in `attempt.integration.test.ts`
 * there). Runs against real Postgres (RLS included, via the shared
 * `prisma` singleton), matching every sweep test in this directory.
 *
 * `ExamAttempt.examQuestionId`-shaped values used here are NOT live FKs —
 * `AttemptQuestionSnapshot.document` is a JSONB document (ADR-0008), and
 * `AttemptAnswer`/`AttemptQuestionResult` validate against it at the
 * service layer, never a database foreign key (schema.prisma's own doc
 * comment on `AttemptAnswer` says so explicitly) — so this fixture needs
 * no real `Question`/`QuestionRevision`/`ExamQuestion` rows at all, only a
 * real `Exam`/`ExamSession`/`StudentProfile` (genuine FK targets of
 * `ExamAttempt` itself).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import type { AttemptMarkingJobPayload } from '@atlas/domain';
import {
  runAttemptAutoSubmitSweep,
  type AttemptAutoSubmitSweepDeps,
} from './attempt-auto-submit.queue.js';
import { ownerPrisma } from '../test-support/owner-prisma.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

function fakeMarkingProducer(): {
  enqueueMarking: AttemptAutoSubmitSweepDeps['enqueueMarking'];
  calls: { payload: AttemptMarkingJobPayload; jobId?: string }[];
} {
  const calls: { payload: AttemptMarkingJobPayload; jobId?: string }[] = [];
  return {
    calls,
    enqueueMarking: (payload, jobId) => {
      // exactOptionalPropertyTypes: an explicit `undefined` is not the same
      // as an absent key — only spread `jobId` in when actually provided.
      calls.push({ payload, ...(jobId !== undefined && { jobId }) });
      return Promise.resolve();
    },
  };
}

/** Every test creates its own school and runs the sweep against the WHOLE
 * test database — other suites/tests (and, since this sweep has no
 * per-school scoping of its own, other schools entirely) may have their
 * own abandoned IN_PROGRESS attempts present at the same time. Filtering
 * down to this test's own attemptId is more robust than a raw global call
 * count — matches `exam-control-refresh.integration.test.ts`'s own
 * established "filter to this test's own channel" precedent for the
 * identical class of shared-database interference. */
function callsForAttempt(
  producer: ReturnType<typeof fakeMarkingProducer>,
  attemptId: string,
): { payload: AttemptMarkingJobPayload; jobId?: string }[] {
  return producer.calls.filter((c) => c.payload.attemptId === attemptId);
}

interface FixtureSchool {
  schoolId: string;
  examId: string;
  examSessionId: string;
  teacherMembershipId: string;
  studentProfileId: string;
  studentUserId: string;
}

async function createFixtureSchool(): Promise<FixtureSchool> {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `Attempt Auto-Submit Test School ${suffix}`, subdomain: `aas-${suffix}` },
  });

  return withTenant(prisma, school.id, async (tx) => {
    const teacherUser = await tx.user.create({
      data: { firstName: 'Sweep', lastName: 'Teacher', displayName: 'Sweep Teacher' },
    });
    const teacherMembership = await tx.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: teacherUser.id,
        loginIdentifier: `aas-teacher-${suffix}`,
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: teacherMembership.id, role: 'TEACHER' },
    });

    const studentUser = await tx.user.create({
      data: { firstName: 'Sweep', lastName: 'Student', displayName: 'Sweep Student' },
    });
    const studentMembership = await tx.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: studentUser.id,
        loginIdentifier: `aas-student-${suffix}`,
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: studentMembership.id, role: 'STUDENT' },
    });
    const studentProfile = await tx.studentProfile.create({
      data: {
        schoolId: school.id,
        membershipId: studentMembership.id,
        studentId: `AAS-${suffix.slice(0, 8)}`,
      },
    });

    const session = await tx.academicSession.create({
      data: {
        schoolId: school.id,
        name: `AAS ${suffix.slice(0, 8)}`,
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
        title: `AAS Exam ${suffix.slice(0, 8)}`,
        examType: 'Test',
        durationSeconds: 3600,
        resultPolicy: 'TEACHER',
        resultDetailVisibility: 'SCORE_ONLY',
        createdByMembershipId: teacherMembership.id,
      },
    });
    const examSession = await tx.examSession.create({
      data: { schoolId: school.id, examId: exam.id, openedByMembershipId: teacherMembership.id },
    });

    return {
      schoolId: school.id,
      examId: exam.id,
      examSessionId: examSession.id,
      teacherMembershipId: teacherMembership.id,
      studentProfileId: studentProfile.id,
      studentUserId: studentUser.id,
    };
  });
}

/** A second student under the same school — needed whenever one test wants
 * two simultaneously-IN_PROGRESS attempts, since `exam_attempts_active_
 * unique` (the real partial unique index backing DoD item 2) allows only
 * one IN_PROGRESS attempt per (school, exam, student); two attempts for
 * the SAME student would collide on it, which is the constraint working
 * correctly, not a fixture bug to route around by relaxing state. */
async function createSecondStudent(fixture: FixtureSchool): Promise<string> {
  const suffix = randomUUID();
  return withTenant(prisma, fixture.schoolId, async (tx) => {
    const user = await tx.user.create({
      data: { firstName: 'Sweep', lastName: 'Student Two', displayName: 'Sweep Student Two' },
    });
    const membership = await tx.schoolMembership.create({
      data: {
        schoolId: fixture.schoolId,
        userId: user.id,
        loginIdentifier: `aas-student2-${suffix}`,
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: fixture.schoolId, membershipId: membership.id, role: 'STUDENT' },
    });
    const profile = await tx.studentProfile.create({
      data: {
        schoolId: fixture.schoolId,
        membershipId: membership.id,
        studentId: `AAS2-${suffix.slice(0, 8)}`,
      },
    });
    return profile.id;
  });
}

let nextAttemptNumber = 1;

async function createAttempt(
  fixture: FixtureSchool,
  opts: {
    state?: 'IN_PROGRESS' | 'SUBMITTED';
    expiresAt: Date;
    studentProfileId?: string;
  },
): Promise<string> {
  const attempt = await withTenant(prisma, fixture.schoolId, (tx) =>
    tx.examAttempt.create({
      data: {
        schoolId: fixture.schoolId,
        examId: fixture.examId,
        examSessionId: fixture.examSessionId,
        studentProfileId: opts.studentProfileId ?? fixture.studentProfileId,
        // A fresh number per call, not hardcoded to 1 — a single test may
        // create more than one attempt for the same (exam, student), which
        // the real @@unique([schoolId, examId, studentProfileId,
        // attemptNumber]) constraint would otherwise reject.
        attemptNumber: nextAttemptNumber++,
        state: opts.state ?? 'IN_PROGRESS',
        durationGrantedSeconds: 3600,
        expiresAt: opts.expiresAt,
        ...(opts.state === 'SUBMITTED' && { submittedAt: new Date() }),
      },
    }),
  );
  await withTenant(prisma, fixture.schoolId, (tx) =>
    tx.attemptQuestionSnapshot.create({
      data: {
        schoolId: fixture.schoolId,
        attemptId: attempt.id,
        seed: 'seed-x',
        document: { version: 1, seed: 'seed-x', questions: [] },
      },
    }),
  );
  return attempt.id;
}

async function cleanupSchool(schoolId: string): Promise<void> {
  const userIds = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.findMany({ where: { schoolId }, select: { userId: true } }),
  );
  // Each statement its own separately-caught call, NOT one shared
  // transaction — attempt_question_snapshots carries an unconditional
  // immutability trigger (BEFORE UPDATE OR DELETE, ADR-0008), so its own
  // deleteMany always fails; inside one shared transaction that failure
  // would abort every other delete alongside it. Matches
  // attempt.integration.test.ts's (apps/api) own established precedent for
  // this exact class of gap.
  await withTenant(prisma, schoolId, (tx) =>
    tx.attemptQuestionResult.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.attemptAnswer.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.attemptQuestionSnapshot.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.auditEvent.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.examAttempt.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.examSession.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) => tx.exam.deleteMany({ where: { schoolId } })).catch(
    () => undefined,
  );
  await withTenant(prisma, schoolId, (tx) => tx.subject.deleteMany({ where: { schoolId } })).catch(
    () => undefined,
  );
  await withTenant(prisma, schoolId, (tx) =>
    tx.academicTerm.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.academicSession.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.studentProfile.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.roleAssignment.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await ownerPrisma()
    .school.delete({ where: { id: schoolId } })
    .catch(() => undefined);
  for (const { userId } of userIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

describe.skipIf(!ownerDatabaseUrl)('attempt-auto-submit sweep (B14, ADR-0004)', () => {
  const schools: string[] = [];

  afterAll(async () => {
    for (const schoolId of schools) {
      await cleanupSchool(schoolId).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('finalizes a fully abandoned attempt (past expiry + grace) to AUTO_SUBMITTED, audits it, and enqueues marking', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attemptId = await createAttempt(fixture, {
      expiresAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago — well past the 60s default grace.
    });

    const producer = fakeMarkingProducer();
    await runAttemptAutoSubmitSweep({ enqueueMarking: producer.enqueueMarking });

    const attempt = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
    );
    expect(attempt.state).toBe('AUTO_SUBMITTED');
    expect(attempt.submittedAt).not.toBeNull();

    const auditEvents = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: {
          schoolId: fixture.schoolId,
          action: 'ATTEMPT_AUTO_SUBMITTED',
          entityId: attemptId,
        },
      }),
    );
    expect(auditEvents).toHaveLength(1);
    expect(auditEvents[0]?.actorUserId).toBe(fixture.studentUserId);
    expect(auditEvents[0]?.actorRole).toBe('STUDENT');

    const myCalls = callsForAttempt(producer, attemptId);
    expect(myCalls).toHaveLength(1);
    expect(myCalls[0]).toEqual({
      payload: { schoolId: fixture.schoolId, attemptId },
      jobId: `mark-${attemptId}`,
    });
  });

  it('never finalizes an attempt still within the grace window', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attemptId = await createAttempt(fixture, {
      expiresAt: new Date(Date.now() - 10 * 1000), // 10s ago — inside the 60s default grace.
    });

    const producer = fakeMarkingProducer();
    await runAttemptAutoSubmitSweep({ enqueueMarking: producer.enqueueMarking });

    const attempt = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
    );
    expect(attempt.state).toBe('IN_PROGRESS');
    expect(callsForAttempt(producer, attemptId)).toHaveLength(0);
  });

  it('a second sweep tick over an already-finalized attempt is a silent, safe no-op', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attemptId = await createAttempt(fixture, {
      expiresAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const producer = fakeMarkingProducer();
    await runAttemptAutoSubmitSweep({ enqueueMarking: producer.enqueueMarking });
    await runAttemptAutoSubmitSweep({ enqueueMarking: producer.enqueueMarking });

    const auditEvents = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: {
          schoolId: fixture.schoolId,
          action: 'ATTEMPT_AUTO_SUBMITTED',
          entityId: attemptId,
        },
      }),
    );
    expect(auditEvents).toHaveLength(1);
    expect(callsForAttempt(producer, attemptId)).toHaveLength(1);
  });

  it('concurrency stand-in: an attempt already finalized by another path (apps/api) before the sweep runs is left untouched, with zero audit rows and zero enqueue calls', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    // Simulates "apps/api's own opportunistic finalisation (or a manual
    // submit) already won this exact attempt" — the sweep's own findMany
    // only ever selects state: 'IN_PROGRESS', so an attempt already
    // SUBMITTED before the sweep even looks is the real-world analog of
    // the race ADR-0004/X-07 name explicitly.
    const attemptId = await createAttempt(fixture, {
      state: 'SUBMITTED',
      expiresAt: new Date(Date.now() - 5 * 60 * 1000),
    });

    const producer = fakeMarkingProducer();
    await runAttemptAutoSubmitSweep({ enqueueMarking: producer.enqueueMarking });

    const attempt = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
    );
    expect(attempt.state).toBe('SUBMITTED');
    const auditEvents = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: {
          schoolId: fixture.schoolId,
          action: 'ATTEMPT_AUTO_SUBMITTED',
          entityId: attemptId,
        },
      }),
    );
    expect(auditEvents).toHaveLength(0);
    expect(callsForAttempt(producer, attemptId)).toHaveLength(0);
  });

  it("one attempt's failure does not abort the sweep for the rest of that same school's abandoned attempts", async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const secondStudentProfileId = await createSecondStudent(fixture);
    const failingAttemptId = await createAttempt(fixture, {
      expiresAt: new Date(Date.now() - 5 * 60 * 1000),
    });
    const okAttemptId = await createAttempt(fixture, {
      expiresAt: new Date(Date.now() - 5 * 60 * 1000),
      studentProfileId: secondStudentProfileId,
    });

    const allCalls: AttemptMarkingJobPayload[] = [];
    await runAttemptAutoSubmitSweep({
      enqueueMarking: (payload) => {
        if (payload.attemptId === failingAttemptId) {
          return Promise.reject(new Error('simulated transient enqueue failure'));
        }
        allCalls.push(payload);
        return Promise.resolve();
      },
    });
    // Filtered to this test's own two attempts — see this file's own
    // `callsForAttempt` doc comment for why a raw global count is unsafe
    // against the shared test database.
    const myCalls = allCalls.filter(
      (c) => c.attemptId === failingAttemptId || c.attemptId === okAttemptId,
    );

    const failing = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: failingAttemptId } }),
    );
    const ok = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: okAttemptId } }),
    );
    // Both attempts still finalize — the DB transition and audit write both
    // commit before the enqueue call that fails (this file's own doc
    // comment records this as a known, narrow, documented residual risk:
    // the failing attempt's own marking is never enqueued by this tick).
    expect(failing.state).toBe('AUTO_SUBMITTED');
    expect(ok.state).toBe('AUTO_SUBMITTED');
    expect(myCalls).toEqual([{ schoolId: fixture.schoolId, attemptId: okAttemptId }]);
  });
});
