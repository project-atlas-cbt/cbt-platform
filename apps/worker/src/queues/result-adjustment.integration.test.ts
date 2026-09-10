/**
 * B15 — the bulk-adjustment consumer (ADR-0025, resolving audit X-14).
 *
 * The roadmap's own Adjustment and Failure testing rows are what this file
 * exists for: "void a question across N results — atomic or resumable, no
 * partial visible state; re-run is idempotent" and "adjustment worker crash
 * mid-run resumes correctly."
 *
 * Runs against real Postgres (RLS included, via the shared `prisma`
 * singleton), matching every worker integration test in this directory.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import type { AdjustableResultValues } from '@atlas/domain';
import { runResultAdjustment } from './result-adjustment.queue.js';

interface Fixture {
  schoolId: string;
  examId: string;
  examSessionId: string;
  teacherMembershipId: string;
  studentProfileIds: string[];
}

const Q1 = randomUUID();
const Q2 = randomUUID();

async function createFixture(studentCount: number): Promise<Fixture> {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `Adjustment Test School ${suffix}`, subdomain: `adj-${suffix}` },
  });

  return withTenant(prisma, school.id, async (tx) => {
    const teacherUser = await tx.user.create({
      data: { firstName: 'Adj', lastName: 'Teacher', displayName: 'Adj Teacher' },
    });
    const teacherMembership = await tx.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: teacherUser.id,
        loginIdentifier: `adj-teacher-${suffix}`,
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: teacherMembership.id, role: 'SCHOOL_ADMIN' },
    });

    const session = await tx.academicSession.create({
      data: {
        schoolId: school.id,
        name: `ADJ ${suffix.slice(0, 8)}`,
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
        title: `ADJ Exam ${suffix.slice(0, 8)}`,
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

    const studentProfileIds: string[] = [];
    for (let i = 0; i < studentCount; i += 1) {
      const studentUser = await tx.user.create({
        data: { firstName: 'Adj', lastName: `Student${i}`, displayName: `Adj Student ${i}` },
      });
      const membership = await tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: studentUser.id,
          loginIdentifier: `adj-student-${i}-${suffix}`,
        },
      });
      await tx.roleAssignment.create({
        data: { schoolId: school.id, membershipId: membership.id, role: 'STUDENT' },
      });
      const profile = await tx.studentProfile.create({
        data: {
          schoolId: school.id,
          membershipId: membership.id,
          studentId: `ADJ-${i}-${suffix.slice(0, 6)}`,
        },
      });
      studentProfileIds.push(profile.id);
    }

    return {
      schoolId: school.id,
      examId: exam.id,
      examSessionId: examSession.id,
      teacherMembershipId: teacherMembership.id,
      studentProfileIds,
    };
  });
}

/**
 * A finalised result with real marking evidence behind it: two questions
 * worth 5 and 3, the first correct and the second wrong — 5/8, 62.5%.
 */
async function createFinalisedResult(
  fixture: Fixture,
  studentProfileId: string,
  attemptNumber: number,
): Promise<string> {
  return withTenant(prisma, fixture.schoolId, async (tx) => {
    const attempt = await tx.examAttempt.create({
      data: {
        schoolId: fixture.schoolId,
        examId: fixture.examId,
        examSessionId: fixture.examSessionId,
        studentProfileId,
        attemptNumber,
        state: 'IN_PROGRESS',
        durationGrantedSeconds: 3600,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    });
    await tx.examAttempt.update({
      where: { id: attempt.id },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
    });

    await tx.attemptQuestionResult.createMany({
      data: [
        {
          schoolId: fixture.schoolId,
          attemptId: attempt.id,
          examQuestionId: Q1,
          correctness: 'CORRECT',
          awardedMarks: 5,
          maximumMarks: 5,
        },
        {
          schoolId: fixture.schoolId,
          attemptId: attempt.id,
          examQuestionId: Q2,
          correctness: 'INCORRECT',
          awardedMarks: 0,
          maximumMarks: 3,
        },
      ],
    });

    const result = await tx.result.create({
      data: {
        schoolId: fixture.schoolId,
        attemptId: attempt.id,
        examId: fixture.examId,
        studentProfileId,
        state: 'FINAL',
        finalizedAt: new Date(),
        totalMarks: 8,
        earnedMarks: 5,
        percentage: 62.5,
        correctCount: 1,
        incorrectCount: 1,
        unansweredCount: 0,
        partialCount: 0,
      },
    });
    return result.id;
  });
}

async function createOperation(
  fixture: Fixture,
  data: {
    type: 'VOID_QUESTION' | 'AWARD_MARK' | 'DEDUCT_MARK' | 'RECALCULATE' | 'MANUAL_OVERRIDE';
    reason: string;
    targetExamQuestionId?: string;
    markDelta?: number;
    targetResultId?: string;
    overrideEarnedMarks?: number;
    totalCount: number;
  },
): Promise<string> {
  return withTenant(prisma, fixture.schoolId, async (tx) => {
    await tx.resultPublication.upsert({
      where: { schoolId_examId: { schoolId: fixture.schoolId, examId: fixture.examId } },
      create: {
        schoolId: fixture.schoolId,
        examId: fixture.examId,
        status: 'PUBLISHED',
        publishedAt: new Date(),
        adjustmentInProgress: true,
      },
      update: { adjustmentInProgress: true },
    });
    const operation = await tx.resultAdjustmentOperation.create({
      data: {
        schoolId: fixture.schoolId,
        examId: fixture.examId,
        type: data.type,
        reason: data.reason,
        status: 'PENDING',
        totalCount: data.totalCount,
        createdByMembershipId: fixture.teacherMembershipId,
        ...(data.targetExamQuestionId !== undefined && {
          targetExamQuestionId: data.targetExamQuestionId,
        }),
        ...(data.markDelta !== undefined && { markDelta: data.markDelta }),
        ...(data.targetResultId !== undefined && { targetResultId: data.targetResultId }),
        ...(data.overrideEarnedMarks !== undefined && {
          overrideEarnedMarks: data.overrideEarnedMarks,
        }),
      },
    });
    return operation.id;
  });
}

async function cleanupSchool(schoolId: string): Promise<void> {
  const userIds = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.findMany({ where: { schoolId }, select: { userId: true } }),
  ).catch(() => [] as { userId: string }[]);

  // `result_adjustments` carries an unconditional immutability trigger, so
  // its own deleteMany always fails — each statement is separately caught so
  // one failure cannot abort the rest. Matches attempt-marking's precedent.
  const tables = [
    'resultAdjustment',
    'resultAdjustmentOperation',
    'result',
    'resultPublication',
    'attemptQuestionResult',
    'examAttempt',
    'examSession',
    'exam',
    'subject',
    'academicTerm',
    'academicSession',
    'studentProfile',
    'auditEvent',
    'roleAssignment',
    'schoolMembership',
  ] as const;
  for (const table of tables) {
    await withTenant(prisma, schoolId, (tx) =>
      (tx[table] as { deleteMany: (a: unknown) => Promise<unknown> }).deleteMany({
        where: { schoolId },
      }),
    ).catch(() => undefined);
  }
  await prisma.user
    .deleteMany({ where: { id: { in: userIds.map((u) => u.userId) } } })
    .catch(() => undefined);
  await prisma.school.deleteMany({ where: { id: schoolId } }).catch(() => undefined);
}

describe('B15 result adjustment worker (ADR-0025)', () => {
  const schools: string[] = [];

  afterAll(async () => {
    for (const schoolId of schools) {
      await cleanupSchool(schoolId).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('DoD 11: voids a question across the whole cohort, recalculating every affected result', async () => {
    const fixture = await createFixture(3);
    schools.push(fixture.schoolId);
    const resultIds = await Promise.all(
      fixture.studentProfileIds.map((id, i) => createFinalisedResult(fixture, id, i + 1)),
    );

    const operationId = await createOperation(fixture, {
      type: 'VOID_QUESTION',
      reason: 'Question 2 was ambiguous.',
      targetExamQuestionId: Q2,
      totalCount: resultIds.length,
    });

    await runResultAdjustment({}, { schoolId: fixture.schoolId, operationId });

    const results = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findMany({ where: { schoolId: fixture.schoolId } }),
    );
    expect(results).toHaveLength(3);
    for (const result of results) {
      // Q2 (3 marks, answered wrongly) is out of both numerator and
      // denominator — 5/5, not 5/8. 03 §73's "exclude question from score".
      expect(result.totalMarks).toBe(5);
      expect(result.earnedMarks).toBe(5);
      expect(Number(result.percentage)).toBe(100);
      expect(result.incorrectCount).toBe(0);
      // 07 §19: "An adjustment does not erase the original result state."
      expect(result.state).toBe('ADJUSTED');
    }

    const operation = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultAdjustmentOperation.findUniqueOrThrow({ where: { id: operationId } }),
    );
    expect(operation.status).toBe('COMPLETED');
    expect(operation.appliedCount).toBe(3);
    expect(operation.processingClaimedAt).toBeNull();

    // ADR-0025: the hold clears only on completion — and only then does the
    // cohort become visible again.
    const publication = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultPublication.findUniqueOrThrow({
        where: { schoolId_examId: { schoolId: fixture.schoolId, examId: fixture.examId } },
      }),
    );
    expect(publication.adjustmentInProgress).toBe(false);
    expect(publication.status).toBe('PUBLISHED');

    // One audit event per RESULT, not per operation (07 §34).
    const audits = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId: fixture.schoolId, action: 'RESULT_ADJUSTED' } }),
    );
    expect(audits).toHaveLength(3);
  });

  it('DoD 12: every child records the complete before/after, so the original is recoverable', async () => {
    const fixture = await createFixture(1);
    schools.push(fixture.schoolId);
    const [resultId] = await Promise.all([
      createFinalisedResult(fixture, fixture.studentProfileIds[0]!, 1),
    ]);

    const operationId = await createOperation(fixture, {
      type: 'AWARD_MARK',
      reason: 'One mark awarded to all.',
      markDelta: 2,
      totalCount: 1,
    });
    await runResultAdjustment({}, { schoolId: fixture.schoolId, operationId });

    const child = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultAdjustment.findFirstOrThrow({ where: { schoolId: fixture.schoolId, resultId } }),
    );

    const oldValue = child.oldValue as unknown as AdjustableResultValues;
    const newValue = child.newValue as unknown as AdjustableResultValues;
    expect(oldValue).toMatchObject({ earnedMarks: 5, totalMarks: 8, percentage: 62.5 });
    expect(newValue).toMatchObject({ earnedMarks: 7, totalMarks: 8, percentage: 87.5 });

    const current = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findUniqueOrThrow({ where: { id: resultId } }),
    );
    expect(current.earnedMarks).toBe(7);
    // The original finalised result (07 §38) is exactly the earliest child's
    // oldValue — recoverable without inverting any arithmetic.
    expect(oldValue.earnedMarks).toBe(5);
  });

  it('a completed adjustment is append-only — its child rows cannot be edited or deleted', async () => {
    const fixture = await createFixture(1);
    schools.push(fixture.schoolId);
    await createFinalisedResult(fixture, fixture.studentProfileIds[0]!, 1);
    const operationId = await createOperation(fixture, {
      type: 'DEDUCT_MARK',
      reason: 'Penalty applied.',
      markDelta: 1,
      totalCount: 1,
    });
    await runResultAdjustment({}, { schoolId: fixture.schoolId, operationId });

    const child = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultAdjustment.findFirstOrThrow({ where: { schoolId: fixture.schoolId } }),
    );

    // 07 §10.2: "A result adjustment is an event, not a silent overwrite" —
    // enforced by the database, not by the absence of an endpoint.
    await expect(
      withTenant(prisma, fixture.schoolId, (tx) =>
        tx.resultAdjustment.update({ where: { id: child.id }, data: { reason: 'Rewritten.' } }),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(prisma, fixture.schoolId, (tx) =>
        tx.resultAdjustment.delete({ where: { id: child.id } }),
      ),
    ).rejects.toThrow();
  });

  it('DoD 11 / Failure: a crash mid-run applies no partial chunk, and the retry resumes', async () => {
    const fixture = await createFixture(4);
    schools.push(fixture.schoolId);
    await Promise.all(
      fixture.studentProfileIds.map((id, i) => createFinalisedResult(fixture, id, i + 1)),
    );

    const operationId = await createOperation(fixture, {
      type: 'VOID_QUESTION',
      reason: 'Question 2 was ambiguous.',
      targetExamQuestionId: Q2,
      totalCount: 4,
    });

    // Crash before the FIRST chunk is applied. The chunk size is larger than
    // this cohort, so the whole run is one transaction — nothing may be left
    // half-applied.
    await expect(
      runResultAdjustment(
        {
          onBeforeChunk: (index) => {
            if (index === 0) throw new Error('simulated worker crash');
          },
        },
        { schoolId: fixture.schoolId, operationId },
      ),
    ).rejects.toThrow('simulated worker crash');

    const afterCrash = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findMany({ where: { schoolId: fixture.schoolId } }),
    );
    // No partial application: every result is still exactly as marked.
    for (const result of afterCrash) {
      expect(result.state).toBe('FINAL');
      expect(result.earnedMarks).toBe(5);
      expect(result.totalMarks).toBe(8);
    }
    expect(
      await withTenant(prisma, fixture.schoolId, (tx) =>
        tx.resultAdjustment.count({ where: { schoolId: fixture.schoolId } }),
      ),
    ).toBe(0);

    // The claim was released, so a retry can pick the operation back up.
    const midway = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultAdjustmentOperation.findUniqueOrThrow({ where: { id: operationId } }),
    );
    expect(midway.processingClaimedAt).toBeNull();
    expect(midway.status).toBe('PROCESSING');
    expect(midway.failureReason).toContain('simulated worker crash');

    // And the retry completes the whole cohort.
    await runResultAdjustment({}, { schoolId: fixture.schoolId, operationId });

    const afterRetry = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findMany({ where: { schoolId: fixture.schoolId } }),
    );
    for (const result of afterRetry) {
      expect(result.state).toBe('ADJUSTED');
      expect(result.totalMarks).toBe(5);
    }
    const completed = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultAdjustmentOperation.findUniqueOrThrow({ where: { id: operationId } }),
    );
    expect(completed.status).toBe('COMPLETED');
    expect(completed.appliedCount).toBe(4);
  });

  it('DoD 11: re-running a completed operation is idempotent — no double application', async () => {
    const fixture = await createFixture(2);
    schools.push(fixture.schoolId);
    await Promise.all(
      fixture.studentProfileIds.map((id, i) => createFinalisedResult(fixture, id, i + 1)),
    );

    const operationId = await createOperation(fixture, {
      type: 'AWARD_MARK',
      reason: 'One mark awarded to all.',
      markDelta: 2,
      totalCount: 2,
    });

    await runResultAdjustment({}, { schoolId: fixture.schoolId, operationId });
    const afterFirst = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findMany({ where: { schoolId: fixture.schoolId }, orderBy: { id: 'asc' } }),
    );
    expect(afterFirst.map((r) => r.earnedMarks)).toEqual([7, 7]);

    // A redelivered job for the same operation. Every result already has a
    // child row, so the second run finds nothing pending — the marks do not
    // move again.
    await runResultAdjustment({}, { schoolId: fixture.schoolId, operationId });
    const afterSecond = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findMany({ where: { schoolId: fixture.schoolId }, orderBy: { id: 'asc' } }),
    );
    expect(afterSecond.map((r) => r.earnedMarks)).toEqual([7, 7]);
    expect(
      await withTenant(prisma, fixture.schoolId, (tx) =>
        tx.resultAdjustment.count({ where: { schoolId: fixture.schoolId } }),
      ),
    ).toBe(2);
  });

  it('a live claim held by another worker is not taken over', async () => {
    const fixture = await createFixture(1);
    schools.push(fixture.schoolId);
    await createFinalisedResult(fixture, fixture.studentProfileIds[0]!, 1);
    const operationId = await createOperation(fixture, {
      type: 'AWARD_MARK',
      reason: 'One mark awarded to all.',
      markDelta: 1,
      totalCount: 1,
    });

    // Simulates a BullMQ stalled-lock redelivery arriving while the original
    // run is still working: the second caller declines rather than
    // double-applying alongside the first.
    await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultAdjustmentOperation.update({
        where: { id: operationId },
        data: { status: 'PROCESSING', processingClaimedAt: new Date() },
      }),
    );

    await runResultAdjustment({}, { schoolId: fixture.schoolId, operationId });

    const result = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findFirstOrThrow({ where: { schoolId: fixture.schoolId } }),
    );
    expect(result.earnedMarks).toBe(5);
    expect(
      await withTenant(prisma, fixture.schoolId, (tx) =>
        tx.resultAdjustment.count({ where: { schoolId: fixture.schoolId } }),
      ),
    ).toBe(0);
  });

  it('MANUAL_OVERRIDE touches exactly one result and is audited as its own action', async () => {
    const fixture = await createFixture(2);
    schools.push(fixture.schoolId);
    const resultIds = await Promise.all(
      fixture.studentProfileIds.map((id, i) => createFinalisedResult(fixture, id, i + 1)),
    );
    const target = resultIds[0]!;

    const operationId = await createOperation(fixture, {
      type: 'MANUAL_OVERRIDE',
      reason: 'Script re-marked by hand after a scanning fault.',
      targetResultId: target,
      overrideEarnedMarks: 8,
      totalCount: 1,
    });
    await runResultAdjustment({}, { schoolId: fixture.schoolId, operationId });

    const overridden = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findUniqueOrThrow({ where: { id: target } }),
    );
    expect(overridden.earnedMarks).toBe(8);
    expect(overridden.state).toBe('ADJUSTED');

    const untouched = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findUniqueOrThrow({ where: { id: resultIds[1]! } }),
    );
    expect(untouched.earnedMarks).toBe(5);
    expect(untouched.state).toBe('FINAL');

    // The roadmap requires MANUAL_OVERRIDE to carry an ELEVATED audit event,
    // distinguishable from derived arithmetic.
    const audits = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.auditEvent.findMany({ where: { schoolId: fixture.schoolId } }),
    );
    expect(audits.map((a) => a.action)).toEqual(['RESULT_MANUAL_OVERRIDE']);
  });
});
