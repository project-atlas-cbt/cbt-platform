import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hash } from '@node-rs/argon2';
import { loadRootEnv } from '@atlas/config';
import { prisma } from '@atlas/db';
import { Client, parseTargets } from './http.js';
import { Recorder } from './metrics.js';
import { closeObservers, ownerDb } from './observe.js';
import { activateStaffCredential, provision } from './provision.js';
import { prepareExam } from './exam.js';

/**
 * F20 — test data for the web app's browser suites (`apps/web/e2e`), built
 * with B21's provisioning (`provision.ts`) so every row goes through the
 * real API's invariants. Writes `apps/web/e2e/.fixture.json` (git-ignored).
 *
 *   PLATFORM_ROOT_DOMAIN=localhost pnpm --filter @atlas/load e2e-fixture
 *
 * `localhost` is the root on purpose: `<school>.localhost` is a secure
 * context in Chromium and Firefox, so the service worker, Cache Storage and
 * Web Crypto (the media pre-cache) all run as they do over https.
 */

loadRootEnv();

const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const OUT = path.resolve(import.meta.dirname, '../../../apps/web/e2e/.fixture.json');

async function main() {
  const target = parseTargets(process.env.E2E_API_TARGET ?? 'http://127.0.0.1:3001/v1')[0]!;
  const manifest = await provision({
    name: `e2e-${randomUUID().slice(0, 4)}`,
    // The second school is F19's: a session with no exams, ready to close
    // and roll over without touching the first school's open exams.
    schools: 2,
    studentsPerSchool: 16,
    studentsPerArm: 40,
    questions: 4,
    mediaKb: 24,
    target,
  });
  const school = manifest.schools[0]!;
  const recorder = new Recorder();

  // Moderator — the one school role provision() does not create.
  const admin = new Client(target, school.host, '10.230.0.1', recorder, randomUUID());
  const login = await admin.login(school.admin.identifier, manifest.password);
  if (login.status !== 200) throw new Error(`admin login ${login.status}`);
  const moderator = await admin.request<{ membershipId: string; loginIdentifier: string }>(
    'POST',
    '/moderators',
    {
      label: 'e2e',
      body: {
        firstName: 'Mo',
        lastName: 'Derator',
        email: `mod-${randomUUID().slice(0, 6)}@e2e.invalid`,
        loginIdentifier: `mod${randomUUID().slice(0, 8)}`,
      },
    },
  );
  if (moderator.status !== 201 && moderator.status !== 200) {
    throw new Error(`create moderator ${moderator.status}: ${moderator.raw.slice(0, 300)}`);
  }
  await activateStaffCredential(
    school.schoolId,
    moderator.body.membershipId,
    await hash(manifest.password, ARGON2),
  );
  admin.close();

  // One open exam (40-minute attempts) for the student-facing suites.
  const exam = await prepareExam(manifest, school, target, recorder, {
    durationSeconds: 2400,
    randomize: false,
  });

  // Accommodations for one student (DoD 3): extra time + larger text,
  // granted by the teacher exactly as the Control Center does.
  const accommodated = school.students[school.students.length - 1]!;
  for (const [suffix, body] of [
    ['extra-time', { extraTimeSeconds: 600 }],
    ['larger-text', { largerText: true }],
  ] as const) {
    const res = await exam.teacher.request(
      'POST',
      `/exam-sessions/${exam.examSessionId}/participants/${accommodated.studentProfileId}/${suffix}`,
      { label: 'e2e', body },
    );
    if (res.status !== 200) throw new Error(`grant ${suffix} ${res.status}: ${res.raw}`);
  }
  exam.teacher.close();

  // F16: a second exam whose session the teacher closes and ends in the
  // browser; one student's absence then gets makeup access.
  const makeupExam = await prepareExam(manifest, school, target, recorder, {
    durationSeconds: 2400,
    randomize: false,
  });
  makeupExam.teacher.close();

  // F19: the next academic session, empty and with a term, for the rollover.
  const rollover = manifest.schools[1]!;
  const rolloverAdmin = new Client(target, rollover.host, '10.230.0.2', recorder, randomUUID());
  const rolloverLogin = await rolloverAdmin.login(rollover.admin.identifier, manifest.password);
  if (rolloverLogin.status !== 200) throw new Error(`rollover admin login ${rolloverLogin.status}`);
  const current = await rolloverAdmin.request<{ endDate: string }>(
    'GET',
    `/academics/sessions/${rollover.academicSessionId}`,
    { label: 'e2e' },
  );
  if (current.status !== 200) throw new Error(`read session ${current.status}: ${current.raw}`);
  const day = 86_400_000;
  const nextStart = new Date(Date.parse(current.body.endDate) + day);
  const isoDay = (d: Date) => d.toISOString().slice(0, 10);
  const nextSessionName = `Next ${randomUUID().slice(0, 4)}`;
  const next = await rolloverAdmin.request<{ id: string }>('POST', '/academics/sessions', {
    label: 'e2e',
    body: {
      name: nextSessionName,
      startDate: isoDay(nextStart),
      endDate: isoDay(new Date(nextStart.getTime() + 300 * day)),
    },
  });
  if (next.status !== 201) throw new Error(`create next session ${next.status}: ${next.raw}`);
  const term = await rolloverAdmin.request('POST', `/academics/sessions/${next.body.id}/terms`, {
    label: 'e2e',
    body: {
      name: 'First Term',
      sequence: 1,
      startDate: isoDay(nextStart),
      endDate: isoDay(new Date(nextStart.getTime() + 90 * day)),
    },
  });
  if (term.status !== 201) throw new Error(`create next term ${term.status}: ${term.raw}`);
  rolloverAdmin.close();

  // A Software Admin (operator-provisioned, so through the owner connection).
  const adminEmail = `e2e-admin-${randomUUID().slice(0, 6)}@e2e.invalid`;
  const owner = ownerDb();
  const user = await owner.user.create({
    data: {
      firstName: 'Eve',
      lastName: 'Operator',
      displayName: 'Eve Operator',
      email: adminEmail,
      passwordHash: await hash(manifest.password, ARGON2),
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  await owner.platformRoleAssignment.create({ data: { userId: user.id, role: 'SOFTWARE_ADMIN' } });

  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
  const fixture = {
    createdAt: new Date().toISOString(),
    rootDomain,
    schoolHost: school.host,
    adminHost: `admin.${rootDomain}`,
    password: manifest.password,
    users: {
      schoolAdmin: school.admin.identifier,
      moderator: moderator.body.loginIdentifier,
      hod: school.hod.identifier,
      teacher: school.teacher.identifier,
      softwareAdminEmail: adminEmail,
    },
    // Each spec claims its own students: attemptLimit is 1.
    students: school.students.slice(0, -1).map((s) => s.identifier),
    accommodatedStudent: accommodated.identifier,
    examId: exam.examId,
    examSessionId: exam.examSessionId,
    examTitle: exam.examTitle,
    makeupExamId: makeupExam.examId,
    rollover: {
      schoolHost: rollover.host,
      schoolAdmin: rollover.admin.identifier,
      sessionId: rollover.academicSessionId,
      nextSessionName,
    },
    questionCount: manifest.questionCount,
  };
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(fixture, null, 2));
  console.log(`[e2e-fixture] ${school.host}: exam ${exam.examId}, wrote ${OUT}`);
}

main()
  .then(async () => {
    await closeObservers();
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await closeObservers();
    await prisma.$disconnect();
    process.exit(1);
  });
