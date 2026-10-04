import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { hash } from '@node-rs/argon2';
import { loadRootEnv } from '@atlas/config';
import { prisma, withTenant } from '@atlas/db';
import { Client, parseTargets, type Response, type Target } from './http.js';
import { Recorder } from './metrics.js';
import { closeObservers, ownerDb } from './observe.js';
import { activateStaffCredential } from './provision.js';
import { totp } from './totp.js';

/**
 * B23 DoD 5 — the golden-path journey of `09 §39`, end to end over HTTP:
 *
 *   create school → session → class → subject → teacher → assign → student
 *   → question → HOD approves → exam → ready → open session → student
 *   starts → snapshot → answer → disconnect → reconnect → submit → mark
 *   → finalize result → publish → student views result
 *
 * Every step goes through the public API exactly as the web app would, as
 * the role that does it in a school. Only two things are not: messages
 * the platform emails to a person (the school admin's activation key and a
 * staff member's first password, ADR-0019) cannot be read back from a
 * mailbox, so this run writes a known activation key's hash and staff
 * passwords through the schema owner's connection instead. It therefore
 * needs `DATABASE_URL` — locally and in CI, and on staging as the
 * one-off ops task inside the VPC. Never run it against production.
 *
 *   GOLDEN_API=http://127.0.0.1:3001/v1 pnpm --filter @atlas/load golden-path
 *   GOLDEN_API=https://{host}/v1 ...   # connect to each host itself (staging)
 *
 * GOLDEN_SCHOOL_HOST: the tenant host shape, `{school}.{root}` by default.
 * GOLDEN_PLATFORM_HOST: the Software Admin host, `admin.{root}` by default.
 */

loadRootEnv();

const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

if (process.env.ATLAS_ENVIRONMENT === 'production') {
  throw new Error('The golden path writes test data; it never runs against production.');
}

const root = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
const apiSpec = process.env.GOLDEN_API ?? 'http://127.0.0.1:3001/v1';
const schoolHostShape = process.env.GOLDEN_SCHOOL_HOST ?? '{school}.{root}';
const platformHost = (process.env.GOLDEN_PLATFORM_HOST ?? 'admin.{root}').replace('{root}', root);
const recorder = new Recorder();
const clients: Client[] = [];

function targetFor(host: string): Target {
  return parseTargets(apiSpec.replace('{host}', host))[0]!;
}
function client(host: string, ip: string): Client {
  const c = new Client(targetFor(host), host, ip, recorder, randomUUID());
  clients.push(c);
  return c;
}

let stepNumber = 0;
async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
  stepNumber += 1;
  const started = performance.now();
  try {
    const value = await run();
    const ms = Math.round(performance.now() - started);
    console.log(`[golden-path] ✓ ${String(stepNumber).padStart(2)} ${name} (${ms} ms)`);
    return value;
  } catch (err) {
    console.error(`[golden-path] ✗ ${String(stepNumber).padStart(2)} ${name}`);
    throw err;
  }
}

function ok<T>(res: Response<T>, what: string, expected?: number): T {
  const good = expected ? res.status === expected : res.status >= 200 && res.status < 300;
  if (!good) throw new Error(`${what}: HTTP ${res.status} ${res.raw.slice(0, 400)}`);
  return res.body;
}
function check(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`assertion failed: ${message}`);
}
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tag = randomUUID().slice(0, 6);
  const password = `golden-${randomUUID()}`;
  const passwordHash = await hash(password, ARGON2);
  const owner = ownerDb();
  const now = Date.now();
  const day = 86_400_000;

  // --- Software Admin (operators are provisioned out of band, B20) --------
  const adminEmail = `golden-admin-${tag}@golden.invalid`;
  await step('provision a Software Admin (operator step)', async () => {
    const user = await owner.user.create({
      data: {
        firstName: 'Golden',
        lastName: 'Operator',
        displayName: 'Golden Operator',
        email: adminEmail,
        passwordHash,
        status: 'ACTIVE',
        credentialState: 'OK',
      },
    });
    await owner.platformRoleAssignment.create({
      data: { userId: user.id, role: 'SOFTWARE_ADMIN' },
    });
  });

  const platform = client(platformHost, '10.250.0.1');
  await step('Software Admin signs in with a second factor', async () => {
    await platform.resolveTenant();
    const first = ok(
      await platform.request<{ status: string }>('POST', '/platform/auth/login', {
        label: 'platform.login',
        body: { email: adminEmail, password },
      }),
      'platform login',
    );
    check(first.status === 'ok', 'a new admin has no factor yet');
    const enrol = ok(
      await platform.request<{ secret: string }>('POST', '/platform/auth/mfa/enrol', {
        label: 'platform.mfa',
      }),
      'start MFA enrolment',
    );
    const step0 = Math.floor(Date.now() / 30_000);
    ok(
      await platform.request('POST', '/platform/auth/mfa/enrol/confirm', {
        label: 'platform.mfa',
        body: { otp: totp(enrol.secret, step0) },
      }),
      'confirm MFA enrolment',
    );
    // Sign in again the way every later sign-in works: password, then code.
    await platform.request('POST', '/platform/auth/logout', { label: 'platform.logout' });
    const second = ok(
      await platform.request<{ status: string; challengeToken?: string }>(
        'POST',
        '/platform/auth/login',
        { label: 'platform.login', body: { email: adminEmail, password } },
      ),
      'platform login (enrolled)',
    );
    check(second.status === 'mfa_required' && second.challengeToken, 'second factor challenged');
    // A code is single-use: wait for the next 30 s window after enrolment.
    while (Math.floor(Date.now() / 30_000) <= step0) await sleep(1000);
    ok(
      await platform.request('POST', '/platform/auth/mfa/verify', {
        label: 'platform.mfa',
        body: {
          challengeToken: second.challengeToken,
          otp: totp(enrol.secret, Math.floor(Date.now() / 30_000)),
        },
      }),
      'verify second factor',
    );
  });

  // --- 1. Create school ---------------------------------------------------------
  const adminIdentifier = `gadmin${tag}`;
  const school = await step('create school', async () =>
    ok(
      await platform.request<{ id: string; subdomain: string }>('POST', '/platform/schools', {
        label: 'platform.school',
        body: {
          name: `Golden Path School ${tag}`,
          adminFirstName: 'Gold',
          adminLastName: 'Admin',
          adminEmail: `gadmin-${tag}@golden.invalid`,
          adminLoginIdentifier: adminIdentifier,
          plan: 'STANDARD',
          initialPeriodDays: 30,
        },
      }),
      'create school',
    ),
  );
  const host = schoolHostShape.replace('{school}', school.subdomain).replace('{root}', root);

  const admin = client(host, '10.250.1.1');
  await step('school admin redeems the activation key and signs in', async () => {
    // The key went by email; replace its hash with one this run knows.
    const key = `GOLDEN-${randomUUID()}`;
    const keyHash = createHash('sha256').update(key).digest('hex');
    const updated = await withTenant(owner, school.id, (tx) =>
      tx.activationGrant.updateMany({
        where: { schoolId: school.id, status: 'ISSUED' },
        data: { keyHash },
      }),
    );
    check(updated.count === 1, 'one pending activation grant');
    await admin.resolveTenant();
    ok(
      await admin.request('POST', '/activation/redeem', {
        label: 'activation',
        body: { key, newPassword: password },
      }),
      'redeem activation key',
    );
    ok(await admin.login(adminIdentifier, password), 'school admin login');
  });

  // --- 2–6. Session, class, subject ---------------------------------------------
  const sessionId = await step('create and activate the academic session and term', async () => {
    const session = ok(
      await admin.request<{ id: string }>('POST', '/academics/sessions', {
        label: 'academics',
        body: {
          name: `Golden ${tag}`,
          startDate: isoDate(new Date(now - 60 * day)),
          endDate: isoDate(new Date(now + 240 * day)),
        },
      }),
      'create session',
    );
    const term = ok(
      await admin.request<{ id: string }>('POST', `/academics/sessions/${session.id}/terms`, {
        label: 'academics',
        body: {
          name: 'First Term',
          sequence: 1,
          startDate: isoDate(new Date(now - 30 * day)),
          endDate: isoDate(new Date(now + 60 * day)),
        },
      }),
      'create term',
    );
    ok(
      await admin.request('POST', `/academics/sessions/${session.id}/activate`, { label: 'a' }),
      'activate session',
    );
    ok(
      await admin.request('POST', `/academics/terms/${term.id}/activate`, { label: 'a' }),
      'activate term',
    );
    return { session: session.id, term: term.id };
  });

  const structure = await step('create class, subject (with department) and offering', async () => {
    const department = ok(
      await admin.request<{ id: string }>('POST', '/academics/departments', {
        label: 'academics',
        body: { name: `Sciences ${tag}`, code: `SCI${tag}` },
      }),
      'create department',
    );
    const subject = ok(
      await admin.request<{ id: string }>('POST', '/academics/subjects', {
        label: 'academics',
        body: { name: 'Mathematics', code: `MTH${tag}`, departmentId: department.id },
      }),
      'create subject',
    );
    const klass = ok(
      await admin.request<{ id: string }>('POST', '/academics/classes', {
        label: 'academics',
        body: { academicSessionId: sessionId.session, name: 'SS2A', level: 'SS2', arm: 'A' },
      }),
      'create class',
    );
    const offering = ok(
      await admin.request<{ id: string }>('POST', `/academics/classes/${klass.id}/subjects`, {
        label: 'academics',
        body: { subjectId: subject.id },
      }),
      'add subject offering to class',
    );
    return {
      departmentId: department.id,
      subjectId: subject.id,
      classId: klass.id,
      offeringId: offering.id,
    };
  });

  // --- 7–8. Teacher, assignment, HOD --------------------------------------------
  const staff = await step('create teacher and assign them to the class subject', async () => {
    const teacher = ok(
      await admin.request<{
        membershipId: string;
        teacherProfileId: string;
        loginIdentifier: string;
      }>('POST', '/teachers', {
        label: 'people',
        body: {
          firstName: 'Tolu',
          lastName: 'Teacher',
          email: `t-${tag}@golden.invalid`,
          staffId: `T${tag}`,
        },
      }),
      'create teacher',
    );
    ok(
      await admin.request('PUT', `/teachers/${teacher.teacherProfileId}/assignments`, {
        label: 'people',
        body: { academicSessionId: sessionId.session, classSubjectIds: [structure.offeringId] },
      }),
      'assign teacher',
    );
    const hod = ok(
      await admin.request<{ membershipId: string; loginIdentifier: string }>('POST', '/teachers', {
        label: 'people',
        body: {
          firstName: 'Bisi',
          lastName: 'Head',
          email: `h-${tag}@golden.invalid`,
          staffId: `H${tag}`,
        },
      }),
      'create HOD teacher',
    );
    ok(
      await admin.request('POST', '/hods', {
        label: 'people',
        body: { membershipId: hod.membershipId },
      }),
      'promote HOD',
    );
    ok(
      await admin.request('PUT', `/hods/${hod.membershipId}/department`, {
        label: 'people',
        body: { departmentId: structure.departmentId, academicSessionId: sessionId.session },
      }),
      'HOD department',
    );
    // First passwords go by email (ADR-0019): set them for this run.
    await activateStaffCredential(school.id, teacher.membershipId, passwordHash);
    await activateStaffCredential(school.id, hod.membershipId, passwordHash);
    return { teacher: teacher.loginIdentifier, hod: hod.loginIdentifier };
  });

  // --- 9. Student --------------------------------------------------------------
  const student = await step(
    'create student, enrol them and issue their sign-in sheet',
    async () => {
      const created = ok(
        await admin.request<{ studentProfileId: string; membershipId: string }>(
          'POST',
          '/students',
          {
            label: 'people',
            body: { firstName: 'Ada', lastName: 'Student', studentId: `S${tag}` },
          },
        ),
        'create student',
      );
      ok(
        await admin.request('POST', `/students/${created.studentProfileId}/enrollments`, {
          label: 'people',
          body: { academicSessionId: sessionId.session, classId: structure.classId },
        }),
        'enrol student',
      );
      const credentials = ok(
        await admin.request<{ loginIdentifier: string; initialPassword: string }>(
          'POST',
          `/students/${created.studentProfileId}/reset-credentials`,
          { label: 'people' },
        ),
        'issue student credentials',
      );
      return { profileId: created.studentProfileId, ...credentials };
    },
  );

  const teacher = client(host, '10.250.1.2');
  const hod = client(host, '10.250.1.3');
  await step('teacher and HOD sign in', async () => {
    ok(await teacher.login(staff.teacher, password), 'teacher login');
    ok(await hod.login(staff.hod, password), 'HOD login');
  });

  // --- 10–11. Question, approval ------------------------------------------------
  const CORRECT = '12';
  const question = await step('teacher writes a question; HOD approves it', async () => {
    const q = ok(
      await teacher.request<{ id: string; revisions: { id: string }[] }>('POST', '/questions', {
        label: 'question',
        body: {
          subjectId: structure.subjectId,
          level: 'SS2',
          questionType: 'SINGLE_CHOICE',
          content: 'What is 7 + 5?',
          difficulty: 'EASY',
          marks: 2,
          options: ['10', '11', CORRECT, '13'].map((content) => ({
            content,
            correctFlag: content === CORRECT,
          })),
        },
      }),
      'create question',
    );
    const revisionId = q.revisions[0]!.id;
    ok(
      await teacher.request('POST', `/questions/${q.id}/revisions/${revisionId}/submit`, {
        label: 'question',
      }),
      'submit for review',
    );
    ok(
      await hod.request('POST', `/reviews/questions/${q.id}/approve`, {
        label: 'review',
        body: {},
      }),
      'HOD approves',
    );
    return { revisionId };
  });

  // --- 12–14. Exam, ready, open session ------------------------------------------
  const exam = await step(
    'teacher builds the exam, marks it ready and opens a session',
    async () => {
      const created = ok(
        await teacher.request<{ id: string }>('POST', '/exams', {
          label: 'exam',
          body: {
            academicSessionId: sessionId.session,
            academicTermId: sessionId.term,
            subjectId: structure.subjectId,
            title: `Golden path ${tag}`,
            examType: 'Test',
            classIds: [structure.classId],
          },
        }),
        'create exam',
      );
      ok(
        await teacher.request('PUT', `/exams/${created.id}/questions`, {
          label: 'exam',
          body: { questions: [{ questionRevisionId: question.revisionId }] },
        }),
        'set exam questions',
      );
      ok(
        await teacher.request('PUT', `/exams/${created.id}/configuration`, {
          label: 'exam',
          body: {
            durationSeconds: 900,
            attemptLimit: 1,
            randomizeQuestions: false,
            randomizeOptions: true,
            resultPolicy: 'TEACHER',
            resultDetailVisibility: 'SCORE_AND_COUNTS',
            generalInstructions: 'Answer the question.',
            navigationInstructions: 'Free navigation.',
            submissionInstructions: 'Submit when done.',
            accessMode: 'OPEN_TO_ELIGIBLE',
          },
        }),
        'configure exam',
      );
      ok(
        await teacher.request('POST', `/exams/${created.id}/ready`, { label: 'exam', body: {} }),
        'ready',
      );
      const session = ok(
        await teacher.request<{ id: string }>('POST', `/exams/${created.id}/sessions`, {
          label: 'exam',
          body: {},
        }),
        'open session',
      );
      return { id: created.id, sessionId: session.id };
    },
  );

  // --- 15–17. Student starts, snapshot, answers ----------------------------------
  let pupil = client(host, '10.250.2.1');
  const studentPassword = `pupil-${randomUUID()}`;
  type Pkg = {
    attemptId: string;
    questions: {
      examQuestionId: string;
      selectedOptionId: string | null;
      options: { optionId: string; content: string }[];
    }[];
  };
  const attempt = await step(
    'student signs in and starts; the snapshot carries no answer key',
    async () => {
      ok(await pupil.login(student.loginIdentifier, student.initialPassword), 'student login');
      // The sign-in sheet's password is single-use: a new one is set first.
      ok(
        await pupil.request('POST', '/auth/password/change', {
          label: 'auth.password',
          body: { currentPassword: student.initialPassword, newPassword: studentPassword },
        }),
        'student sets their own password',
      );
      ok(
        await pupil.request('GET', `/student/assessment/${exam.id}/preview`, { label: 'student' }),
        'assessment preview',
      );
      const res = await pupil.request<Pkg>('POST', `/exams/${exam.id}/attempts`, {
        label: 'attempt.start',
        body: {},
      });
      const pkg = ok(res, 'start attempt');
      check(pkg.questions.length === 1, 'one question in the snapshot');
      // Audit X-05: the student-facing payload never contains correct answers.
      check(!/correct/i.test(res.raw), 'no correct-answer field in the attempt package');
      return pkg;
    },
  );
  const q0 = attempt.questions[0]!;
  const right = q0.options.find((o) => o.content.includes(CORRECT))!;
  const wrong = q0.options.find((o) => !o.content.includes(CORRECT))!;

  await step('student answers (first a wrong option, sequence 1)', async () => {
    const saved = ok(
      await pupil.request<{ accepted: boolean }>(
        'PUT',
        `/attempts/${attempt.attemptId}/answers/${q0.examQuestionId}`,
        {
          label: 'answer',
          body: { selectedOptionId: wrong.optionId, sequenceNumber: 1, source: 'online' },
        },
      ),
      'save answer',
    );
    check(saved.accepted, 'answer accepted');
  });

  await step('disconnect: the browser goes away mid-attempt', () => {
    pupil.close();
    return Promise.resolve();
  });

  await step(
    'reconnect: sign in again, resume, change the answer; a stale replay is refused',
    async () => {
      pupil = client(host, '10.250.2.1');
      ok(await pupil.login(student.loginIdentifier, studentPassword), 'student login again');
      const resumed = ok(
        await pupil.request<Pkg>('GET', `/attempts/${attempt.attemptId}`, {
          label: 'attempt.resume',
        }),
        'resume attempt',
      );
      check(
        resumed.questions[0]!.selectedOptionId === wrong.optionId,
        'the answer saved before the disconnect survived it',
      );
      const batch = ok(
        await pupil.request<{ results: { accepted: boolean; rejectionCode?: string }[] }>(
          'POST',
          `/attempts/${attempt.attemptId}/answers/batch`,
          {
            label: 'answer.batch',
            body: {
              answers: [
                {
                  examQuestionId: q0.examQuestionId,
                  selectedOptionId: right.optionId,
                  sequenceNumber: 2,
                  source: 'offline-replay',
                },
              ],
            },
          },
        ),
        'replay queued answer',
      );
      check(batch.results[0]?.accepted, 'newer answer accepted');
      const stale = await pupil.request<{ error?: { code: string } }>(
        'PUT',
        `/attempts/${attempt.attemptId}/answers/${q0.examQuestionId}`,
        {
          label: 'answer',
          body: { selectedOptionId: wrong.optionId, sequenceNumber: 1, source: 'offline-replay' },
        },
      );
      // ADR-0007: an out-of-order older answer never overwrites a newer one.
      check(
        stale.status === 409 && stale.body.error?.code === 'ATTEMPT_ANSWER_SEQUENCE_STALE',
        `stale replay refused (got ${stale.status})`,
      );
    },
  );

  // --- 18–19. Submit, mark ---------------------------------------------------------
  await step('student submits', async () => {
    const submitted = ok(
      await pupil.request<{ state: string }>('POST', `/attempts/${attempt.attemptId}/submit`, {
        label: 'attempt.submit',
      }),
      'submit',
    );
    check(submitted.state === 'SUBMITTED', `attempt submitted (got ${submitted.state})`);
  });

  await step('worker marks the attempt', async () => {
    const deadline = Date.now() + 120_000;
    for (;;) {
      const status = ok(
        await pupil.request<{ marking: { status: string; correctCount: number } }>(
          'GET',
          `/attempts/${attempt.attemptId}/status`,
          { label: 'attempt.status' },
        ),
        'attempt status',
      );
      if (status.marking.status === 'COMPLETE') {
        check(status.marking.correctCount === 1, 'the final answer was marked correct');
        return;
      }
      if (Date.now() > deadline) throw new Error('marking did not complete within 120 s');
      await sleep(2000);
    }
  });

  // --- 20–22. Finalize, publish, student views ----------------------------------------
  await step('result is final and traceable for the teacher', async () => {
    const results = ok(
      await teacher.request<{
        items: { state: string; earnedMarks?: number; percentage?: number }[];
      }>('GET', `/exams/${exam.id}/results`, { label: 'results' }),
      'exam results',
    );
    check(results.items.length === 1, 'one result');
    check(results.items[0]!.state === 'FINAL', `result FINAL (got ${results.items[0]!.state})`);
  });

  await step('teacher publishes results', async () => {
    ok(
      await teacher.request('POST', `/exams/${exam.id}/results/publish`, {
        label: 'publish',
        body: {},
      }),
      'publish',
    );
  });

  await step('student views their published result', async () => {
    const mine = ok(
      await pupil.request<{ items: { examId: string; earnedMarks: number; totalMarks: number }[] }>(
        'GET',
        '/student/results',
        { label: 'student.results' },
      ),
      'student results',
    );
    const row = mine.items.find((r) => r.examId === exam.id);
    check(row, 'the published result is visible to the student');
    check(
      row.earnedMarks === 2 && row.totalMarks === 2,
      `full marks (got ${row.earnedMarks}/${row.totalMarks})`,
    );
  });

  console.log(`[golden-path] passed: ${stepNumber} steps, school ${school.subdomain}`);
}

main()
  .then(async () => {
    for (const c of clients) c.close();
    await closeObservers();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    for (const c of clients) c.close();
    await closeObservers();
    await prisma.$disconnect();
    process.exit(1);
  });
