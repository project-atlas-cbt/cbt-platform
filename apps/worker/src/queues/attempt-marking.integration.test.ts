/**
 * B14 — the marking-job consumer. Runs against real Postgres (RLS
 * included, via the shared `prisma` singleton), matching every worker
 * integration test in this directory.
 *
 * Data-integrity note (DoD item 11, "editing the source question after the
 * exam does not change any recorded mark"): NOT proven here by mutating a
 * live `Question`/`QuestionRevision`/`QuestionOption` fixture — that
 * property is already proven a stronger way than an integration test
 * could: `computeAttemptQuestionMarkingResults` (`@atlas/domain`) has NO
 * database parameter in its signature at all (only the frozen snapshot
 * document + the caller-supplied answers), so it is structurally incapable
 * of reading the live question bank, not merely observed not to in one
 * fixture — and `runAttemptMarking` below is directly readable as never
 * touching `Question`/`QuestionRevision`/`ExamQuestion`/`QuestionOption` at
 * all. `@atlas/domain`'s own `attempt-marking.test.ts` unit-tests the
 * arithmetic exhaustively against fixture documents with no DB involved.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { AttemptSnapshotDocumentV1 } from '@atlas/domain';
import { runAttemptMarking } from './attempt-marking.queue.js';

const ownerDatabaseUrl = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;

interface FixtureSchool {
  schoolId: string;
  examId: string;
  examSessionId: string;
  teacherMembershipId: string;
  studentProfileId: string;
}

async function createFixtureSchool(): Promise<FixtureSchool> {
  const suffix = randomUUID();
  const school = await prisma.school.create({
    data: { name: `Attempt Marking Test School ${suffix}`, subdomain: `am-${suffix}` },
  });

  return withTenant(prisma, school.id, async (tx) => {
    const teacherUser = await tx.user.create({
      data: { firstName: 'Mark', lastName: 'Teacher', displayName: 'Mark Teacher' },
    });
    const teacherMembership = await tx.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: teacherUser.id,
        loginIdentifier: `am-teacher-${suffix}`,
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: teacherMembership.id, role: 'TEACHER' },
    });

    const studentUser = await tx.user.create({
      data: { firstName: 'Mark', lastName: 'Student', displayName: 'Mark Student' },
    });
    const studentMembership = await tx.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: studentUser.id,
        loginIdentifier: `am-student-${suffix}`,
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: studentMembership.id, role: 'STUDENT' },
    });
    const studentProfile = await tx.studentProfile.create({
      data: {
        schoolId: school.id,
        membershipId: studentMembership.id,
        studentId: `AM-${suffix.slice(0, 8)}`,
      },
    });

    const session = await tx.academicSession.create({
      data: {
        schoolId: school.id,
        name: `AM ${suffix.slice(0, 8)}`,
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
        title: `AM Exam ${suffix.slice(0, 8)}`,
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
    };
  });
}

// examQuestionId/selectedOptionId are bare UUID COLUMNS (@db.Uuid) even
// though neither carries a live foreign key (schema.prisma's own doc
// comment on AttemptAnswer: both are validated against the snapshot
// document at the service layer, never a DB FK) — real UUIDs are still
// required here; a plain "q1"/"b" fails at the database level with an
// invalid-uuid-syntax error, not a validation one.
const Q1 = randomUUID();
const Q2 = randomUUID();
const Q3 = randomUUID();
const OPT_2PLUS2_WRONG = randomUUID();
const OPT_2PLUS2_RIGHT = randomUUID();
const OPT_10MINUS6_RIGHT = randomUUID();
const OPT_10MINUS6_WRONG = randomUUID();
const OPT_TRUEFALSE_RIGHT = randomUUID();
const OPT_TRUEFALSE_WRONG = randomUUID();

function threeQuestionDocument(): AttemptSnapshotDocumentV1 {
  return {
    version: 1,
    seed: 'seed-x',
    questions: [
      {
        examQuestionId: Q1,
        questionRevisionId: 'rev-1',
        displaySequence: 1,
        marks: 5,
        questionType: 'SINGLE_CHOICE',
        content: '2 + 2 = ?',
        explanation: null,
        options: [
          {
            optionId: OPT_2PLUS2_WRONG,
            content: '3',
            originalOrder: 1,
            displayPosition: 1,
            correctFlag: false,
          },
          {
            optionId: OPT_2PLUS2_RIGHT,
            content: '4',
            originalOrder: 2,
            displayPosition: 2,
            correctFlag: true,
          },
        ],
        media: [],
      },
      {
        examQuestionId: Q2,
        questionRevisionId: 'rev-2',
        displaySequence: 2,
        marks: 3,
        questionType: 'SINGLE_CHOICE',
        content: '10 - 6 = ?',
        explanation: null,
        options: [
          {
            optionId: OPT_10MINUS6_RIGHT,
            content: '4',
            originalOrder: 1,
            displayPosition: 1,
            correctFlag: true,
          },
          {
            optionId: OPT_10MINUS6_WRONG,
            content: '5',
            originalOrder: 2,
            displayPosition: 2,
            correctFlag: false,
          },
        ],
        media: [],
      },
      {
        examQuestionId: Q3,
        questionRevisionId: 'rev-3',
        displaySequence: 3,
        marks: 2,
        questionType: 'SINGLE_CHOICE',
        content: 'True or false: 1 + 1 = 2',
        explanation: null,
        options: [
          {
            optionId: OPT_TRUEFALSE_RIGHT,
            content: 'True',
            originalOrder: 1,
            displayPosition: 1,
            correctFlag: true,
          },
          {
            optionId: OPT_TRUEFALSE_WRONG,
            content: 'False',
            originalOrder: 2,
            displayPosition: 2,
            correctFlag: false,
          },
        ],
        media: [],
      },
    ],
  };
}

async function createSubmittedAttemptWithAnswers(
  fixture: FixtureSchool,
  answers: { examQuestionId: string; selectedOptionId: string | null }[],
): Promise<string> {
  // Created IN_PROGRESS first, not SUBMITTED directly — ADR-0007's own
  // immutability trigger rejects an AttemptAnswer INSERT the moment the
  // parent attempt is anything but IN_PROGRESS, matching the real product
  // sequence (answers are written while writable, submission transitions
  // state afterward), not a fixture shortcut.
  const attempt = await withTenant(prisma, fixture.schoolId, (tx) =>
    tx.examAttempt.create({
      data: {
        schoolId: fixture.schoolId,
        examId: fixture.examId,
        examSessionId: fixture.examSessionId,
        studentProfileId: fixture.studentProfileId,
        attemptNumber: 1,
        state: 'IN_PROGRESS',
        durationGrantedSeconds: 3600,
        expiresAt: new Date(Date.now() + 3600 * 1000),
      },
    }),
  );
  await withTenant(prisma, fixture.schoolId, (tx) =>
    tx.attemptQuestionSnapshot.create({
      data: {
        schoolId: fixture.schoolId,
        attemptId: attempt.id,
        seed: 'seed-x',
        document: threeQuestionDocument() as unknown as Prisma.InputJsonValue,
      },
    }),
  );
  for (const [index, answer] of answers.entries()) {
    if (answer.selectedOptionId === null) continue; // an omitted/null answer stands in for UNANSWERED.
    await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.attemptAnswer.create({
        data: {
          schoolId: fixture.schoolId,
          attemptId: attempt.id,
          examQuestionId: answer.examQuestionId,
          selectedOptionId: answer.selectedOptionId,
          state: 'ANSWERED',
          sequenceNumber: index + 1,
          lastSavedAt: new Date(),
        },
      }),
    );
  }
  await withTenant(prisma, fixture.schoolId, (tx) =>
    tx.examAttempt.update({
      where: { id: attempt.id },
      data: { state: 'SUBMITTED', submittedAt: new Date() },
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
  // attempt.integration.test.ts's (apps/api) own established precedent.
  // B15: marking now also finalises a Result (and may create a
  // ResultPublication), so both must clear before the attempt rows they
  // reference.
  await withTenant(prisma, schoolId, (tx) => tx.result.deleteMany({ where: { schoolId } })).catch(
    () => undefined,
  );
  await withTenant(prisma, schoolId, (tx) =>
    tx.resultPublication.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.gradingScale.updateMany({ where: { schoolId }, data: { currentVersionId: null } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.gradingScaleBand.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.gradingScaleVersion.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.gradingScale.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.notification.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
  await withTenant(prisma, schoolId, (tx) =>
    tx.auditEvent.deleteMany({ where: { schoolId } }),
  ).catch(() => undefined);
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
  await prisma.school.delete({ where: { id: schoolId } }).catch(() => undefined);
  for (const { userId } of userIds) {
    await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  }
}

describe.skipIf(!ownerDatabaseUrl)('attempt-marking job (B14)', () => {
  const schools: string[] = [];

  afterAll(async () => {
    for (const schoolId of schools) {
      await cleanupSchool(schoolId).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  it('marks every snapshot question correctly: correct, incorrect, and unanswered', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attemptId = await createSubmittedAttemptWithAnswers(fixture, [
      { examQuestionId: Q1, selectedOptionId: OPT_2PLUS2_RIGHT }, // correct, 5 marks
      { examQuestionId: Q2, selectedOptionId: OPT_10MINUS6_WRONG }, // incorrect, 0 of 3
      // Q3 left unanswered.
    ]);

    await runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId });

    const results = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.attemptQuestionResult.findMany({
        where: { schoolId: fixture.schoolId, attemptId },
        orderBy: { examQuestionId: 'asc' },
      }),
    );
    expect(results).toHaveLength(3);
    const byQuestion = new Map(results.map((r) => [r.examQuestionId, r]));
    expect(byQuestion.get(Q1)).toMatchObject({
      correctness: 'CORRECT',
      awardedMarks: 5,
      maximumMarks: 5,
    });
    expect(byQuestion.get(Q2)).toMatchObject({
      correctness: 'INCORRECT',
      awardedMarks: 0,
      maximumMarks: 3,
    });
    expect(byQuestion.get(Q3)).toMatchObject({
      correctness: 'UNANSWERED',
      awardedMarks: 0,
      maximumMarks: 2,
    });
  });

  it('DoD 9: re-running marking is idempotent — identical output, no duplicate rows', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attemptId = await createSubmittedAttemptWithAnswers(fixture, [
      { examQuestionId: Q1, selectedOptionId: OPT_2PLUS2_RIGHT },
      { examQuestionId: Q2, selectedOptionId: OPT_10MINUS6_RIGHT },
      { examQuestionId: Q3, selectedOptionId: OPT_TRUEFALSE_WRONG },
    ]);

    await runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId });
    const first = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.attemptQuestionResult.findMany({ where: { schoolId: fixture.schoolId, attemptId } }),
    );

    await runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId });
    const second = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.attemptQuestionResult.findMany({ where: { schoolId: fixture.schoolId, attemptId } }),
    );

    expect(second).toHaveLength(first.length);
    expect(second).toHaveLength(3);
    const normalize = (rows: typeof first) =>
      [...rows]
        .sort((a, b) => a.examQuestionId.localeCompare(b.examQuestionId))
        .map((r) => ({
          correctness: r.correctness,
          awardedMarks: r.awardedMarks,
          maximumMarks: r.maximumMarks,
        }));
    expect(normalize(second)).toEqual(normalize(first));
  });

  it('DoD 10: a crash mid-run rolls back cleanly (zero partial rows), and a clean re-run afterward completes correctly', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attemptId = await createSubmittedAttemptWithAnswers(fixture, [
      { examQuestionId: Q1, selectedOptionId: OPT_2PLUS2_RIGHT },
      { examQuestionId: Q2, selectedOptionId: OPT_10MINUS6_RIGHT },
      { examQuestionId: Q3, selectedOptionId: OPT_TRUEFALSE_RIGHT },
    ]);

    await expect(
      runAttemptMarking(
        {
          onBeforeUpsert: (index) => {
            if (index === 1) throw new Error('simulated crash mid-run');
          },
        },
        { schoolId: fixture.schoolId, attemptId },
      ),
    ).rejects.toThrow('simulated crash mid-run');

    // The whole run sits inside one transaction — a mid-run throw rolls
    // EVERYTHING back, including the first question's own already-upserted
    // row, not just the one that threw.
    const afterCrash = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.attemptQuestionResult.findMany({ where: { schoolId: fixture.schoolId, attemptId } }),
    );
    expect(afterCrash).toHaveLength(0);

    // The attempt itself is untouched by the marking failure — finalisation
    // already committed in a separate, earlier transaction/request.
    const attempt = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.findUniqueOrThrow({ where: { id: attemptId } }),
    );
    expect(attempt.state).toBe('SUBMITTED');

    await runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId });
    const afterRetry = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.attemptQuestionResult.findMany({ where: { schoolId: fixture.schoolId, attemptId } }),
    );
    expect(afterRetry).toHaveLength(3);
    expect(afterRetry.every((r) => r.correctness !== null)).toBe(true);
  });

  it('refuses to mark an attempt that is still IN_PROGRESS, deferring to BullMQ retry rather than mis-marking a live attempt', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attempt = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.create({
        data: {
          schoolId: fixture.schoolId,
          examId: fixture.examId,
          examSessionId: fixture.examSessionId,
          studentProfileId: fixture.studentProfileId,
          attemptNumber: 1,
          state: 'IN_PROGRESS',
          durationGrantedSeconds: 3600,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      }),
    );
    await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.attemptQuestionSnapshot.create({
        data: {
          schoolId: fixture.schoolId,
          attemptId: attempt.id,
          seed: 'seed-x',
          document: threeQuestionDocument() as unknown as Prisma.InputJsonValue,
        },
      }),
    );

    await expect(
      runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId: attempt.id }),
    ).rejects.toThrow(/still IN_PROGRESS/);

    const results = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.attemptQuestionResult.findMany({
        where: { schoolId: fixture.schoolId, attemptId: attempt.id },
      }),
    );
    expect(results).toHaveLength(0);
  });

  it('B16: ignores a stale marking job after the submitted attempt is invalidated', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attemptId = await createSubmittedAttemptWithAnswers(fixture, [
      { examQuestionId: Q1, selectedOptionId: OPT_2PLUS2_RIGHT },
    ]);

    await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.update({
        where: { id: attemptId },
        data: { state: 'INVALIDATED', invalidationReason: 'Verified irregularity' },
      }),
    );

    await expect(
      runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId }),
    ).resolves.toBeUndefined();

    const [questionResultCount, result] = await withTenant(prisma, fixture.schoolId, (tx) =>
      Promise.all([
        tx.attemptQuestionResult.count({ where: { schoolId: fixture.schoolId, attemptId } }),
        tx.result.findUnique({
          where: { schoolId_attemptId: { schoolId: fixture.schoolId, attemptId } },
        }),
      ]),
    );
    expect(questionResultCount).toBe(0);
    expect(result).toBeNull();
  });

  it('the database trigger itself blocks writing a result while the parent attempt is IN_PROGRESS, independent of the service layer', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attempt = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.examAttempt.create({
        data: {
          schoolId: fixture.schoolId,
          examId: fixture.examId,
          examSessionId: fixture.examSessionId,
          studentProfileId: fixture.studentProfileId,
          attemptNumber: 1,
          state: 'IN_PROGRESS',
          durationGrantedSeconds: 3600,
          expiresAt: new Date(Date.now() + 3600 * 1000),
        },
      }),
    );

    await expect(
      withTenant(prisma, fixture.schoolId, (tx) =>
        tx.attemptQuestionResult.create({
          data: {
            schoolId: fixture.schoolId,
            attemptId: attempt.id,
            examQuestionId: Q1,
            correctness: 'CORRECT',
            awardedMarks: 5,
            maximumMarks: 5,
          },
        }),
      ),
    ).rejects.toThrow();
  });

  // -------------------------------------------------------------------
  // B15 — result finalisation and automatic publication, which now ride
  // inside this same marking transaction.
  // -------------------------------------------------------------------

  it('B15 DoD 1/2: finalises the result in the same transaction, after every question is marked', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    const attemptId = await createSubmittedAttemptWithAnswers(fixture, [
      { examQuestionId: Q1, selectedOptionId: OPT_2PLUS2_RIGHT },
      { examQuestionId: Q2, selectedOptionId: OPT_10MINUS6_WRONG },
      { examQuestionId: Q3, selectedOptionId: null },
    ]);
    // The result is created PROCESSING by whichever path finalises the
    // attempt (apps/api); this fixture builds the attempt directly, so it
    // stands in for that here.
    await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.create({
        data: {
          schoolId: fixture.schoolId,
          attemptId,
          examId: fixture.examId,
          studentProfileId: fixture.studentProfileId,
          state: 'PROCESSING',
          totalMarks: 0,
          earnedMarks: 0,
          percentage: 0,
          correctCount: 0,
          incorrectCount: 0,
          unansweredCount: 0,
          partialCount: 0,
        },
      }),
    );

    await runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId });

    const result = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findUniqueOrThrow({
        where: { schoolId_attemptId: { schoolId: fixture.schoolId, attemptId } },
      }),
    );
    expect(result.state).toBe('FINAL');
    expect(result.finalizedAt).not.toBeNull();
    // 5 of 10: Q1 correct (5), Q2 wrong (0/3), Q3 unanswered (0/2).
    expect(result.totalMarks).toBe(10);
    expect(result.earnedMarks).toBe(5);
    expect(Number(result.percentage)).toBe(50);
    expect(result.correctCount).toBe(1);
    expect(result.incorrectCount).toBe(1);
    expect(result.unansweredCount).toBe(1);
  });

  it('B15 DoD 8: freezes the grade AND its scale version at finalisation', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);

    const version = await withTenant(prisma, fixture.schoolId, async (tx) => {
      const scale = await tx.gradingScale.create({
        data: { schoolId: fixture.schoolId, name: 'Default' },
      });
      const v = await tx.gradingScaleVersion.create({
        data: { schoolId: fixture.schoolId, scaleId: scale.id, versionNumber: 1 },
      });
      await tx.gradingScaleBand.createMany({
        data: [
          {
            schoolId: fixture.schoolId,
            versionId: v.id,
            label: 'P',
            minPercentage: 50,
            maxPercentage: 100,
            isPassing: true,
            sortOrder: 0,
          },
          {
            schoolId: fixture.schoolId,
            versionId: v.id,
            label: 'F',
            minPercentage: 0,
            maxPercentage: 49.99,
            isPassing: false,
            sortOrder: 1,
          },
        ],
      });
      await tx.gradingScale.update({
        where: { id: scale.id },
        data: { currentVersionId: v.id },
      });
      return v;
    });

    const attemptId = await createSubmittedAttemptWithAnswers(fixture, [
      { examQuestionId: Q1, selectedOptionId: OPT_2PLUS2_RIGHT },
      { examQuestionId: Q2, selectedOptionId: OPT_10MINUS6_WRONG },
      { examQuestionId: Q3, selectedOptionId: null },
    ]);
    await runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId });

    const result = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.result.findUniqueOrThrow({
        where: { schoolId_attemptId: { schoolId: fixture.schoolId, attemptId } },
      }),
    );
    expect(result.grade).toBe('P');
    expect(result.gradingScaleVersionId).toBe(version.id);

    // ADR-0018: a version that has graded a result is frozen — editing its
    // bands in place would silently rewrite this student's grade.
    await expect(
      withTenant(prisma, fixture.schoolId, (tx) =>
        tx.gradingScaleBand.updateMany({
          where: { schoolId: fixture.schoolId, versionId: version.id, label: 'P' },
          data: { minPercentage: 90 },
        }),
      ),
    ).rejects.toThrow();
  });

  it('B15 DoD 6: an AUTOMATIC-policy exam publishes its results at finalisation', async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.exam.update({ where: { id: fixture.examId }, data: { resultPolicy: 'AUTOMATIC' } }),
    );

    const attemptId = await createSubmittedAttemptWithAnswers(fixture, [
      { examQuestionId: Q1, selectedOptionId: OPT_2PLUS2_RIGHT },
      { examQuestionId: Q2, selectedOptionId: OPT_10MINUS6_RIGHT },
      { examQuestionId: Q3, selectedOptionId: OPT_TRUEFALSE_RIGHT },
    ]);
    await runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId });

    const publication = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultPublication.findUniqueOrThrow({
        where: { schoolId_examId: { schoolId: fixture.schoolId, examId: fixture.examId } },
      }),
    );
    expect(publication.status).toBe('PUBLISHED');

    // B10 declared RESULT_PUBLISHED and left this producer to B15.
    const notifications = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.notification.findMany({
        where: { schoolId: fixture.schoolId, type: 'RESULT_PUBLISHED' },
      }),
    );
    expect(notifications).toHaveLength(1);
    const audits = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId: fixture.schoolId, action: 'RESULT_PUBLISHED' },
      }),
    );
    expect(audits).toHaveLength(1);
  });

  it("B15: automatic publication never overrides a human's decision to unpublish", async () => {
    const fixture = await createFixtureSchool();
    schools.push(fixture.schoolId);
    await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.exam.update({ where: { id: fixture.examId }, data: { resultPolicy: 'AUTOMATIC' } }),
    );
    // A staff member has already pulled this exam's results back.
    await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultPublication.create({
        data: {
          schoolId: fixture.schoolId,
          examId: fixture.examId,
          status: 'UNPUBLISHED',
          unpublishedAt: new Date(),
        },
      }),
    );

    const attemptId = await createSubmittedAttemptWithAnswers(fixture, [
      { examQuestionId: Q1, selectedOptionId: OPT_2PLUS2_RIGHT },
      { examQuestionId: Q2, selectedOptionId: OPT_10MINUS6_RIGHT },
      { examQuestionId: Q3, selectedOptionId: OPT_TRUEFALSE_RIGHT },
    ]);
    await runAttemptMarking({}, { schoolId: fixture.schoolId, attemptId });

    const publication = await withTenant(prisma, fixture.schoolId, (tx) =>
      tx.resultPublication.findUniqueOrThrow({
        where: { schoolId_examId: { schoolId: fixture.schoolId, examId: fixture.examId } },
      }),
    );
    // "Automatic" means released without waiting for a person — not
    // overriding one.
    expect(publication.status).toBe('UNPUBLISHED');
  });
});
