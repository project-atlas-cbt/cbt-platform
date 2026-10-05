import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { hash } from '@node-rs/argon2';
import { loadRootEnv } from '@atlas/config';
import { prisma, withTenant } from '@atlas/db';
import { Client, parseTargets, type Target } from './http.js';
import { Recorder } from './metrics.js';
import { closeObservers, ownerDb } from './observe.js';
import { activateStaffCredential, STATE_DIR } from './provision.js';

/**
 * A fictional demo school for the marketing site's screenshots and teaser
 * (ADR-0034: site claims must stay true of the product). Everything a
 * screenshot shows comes from the real app working on this data: staff,
 * classes, questions, reviews and exams go through the API exactly as in
 * `provision.ts`; only the School Admin's first account and each user's
 * password are written directly, as provisioning does.
 *
 *   PLATFORM_ROOT_DOMAIN=localhost pnpm --filter @atlas/load demo-school seed --live
 *   PLATFORM_ROOT_DOMAIN=localhost pnpm --filter @atlas/load demo-school live
 *
 * `seed` builds Oakridge College (a marked Continuous Assessment, a live
 * First Term Test with students in every state, four questions waiting for
 * the HOD) and Riverside Grammar School (half-way through onboarding).
 * With `--live` it then keeps the in-progress students heartbeating and
 * answering, so the Exam Control Center shows a sitting in progress, until
 * it is stopped. `live` does the same later from a new process; each
 * student then signs in again, which the Control Center shows as a device
 * change.
 *
 * Never run against production: it writes demo data. The shared password
 * comes from DEMO_PASSWORD or is random, and is stored only in the
 * git-ignored `.state/demo-school.json`.
 */

loadRootEnv();

const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;
const STATE_FILE = path.join(STATE_DIR, 'demo-school.json');
const DAY = 86_400_000;

interface DemoState {
  createdAt: string;
  password: string;
  rootDomain: string;
  oakridge: {
    host: string;
    schoolId: string;
    admin: string;
    moderator: string;
    hod: string;
    teacher: string;
    liveExamId: string;
    liveSessionId: string;
    caExamId: string;
    pendingQuestionIds: string[];
    students: {
      identifier: string;
      name: string;
      studentProfileId: string;
      state: string;
      attemptId?: string;
    }[];
  };
  riverside: { host: string; admin: string };
}

type Question = {
  content: string;
  options: string[];
  correct: number;
  topic: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  type?: 'SINGLE_CHOICE' | 'TRUE_FALSE';
};

// SS2 Mathematics, written to the WAEC/NECO syllabus a Nigerian SS2 class follows.
const APPROVED: Question[] = [
  {
    content: 'Solve for x: 3x − 7 = 11.',
    options: ['x = 4', 'x = 6', 'x = 18', 'x = 1⅓'],
    correct: 1,
    topic: 'Linear equations',
    difficulty: 'EASY',
  },
  {
    content: 'Simplify (2³ × 2⁴) ÷ 2⁵.',
    options: ['2', '4', '8', '16'],
    correct: 1,
    topic: 'Indices',
    difficulty: 'EASY',
  },
  {
    content: 'What is the sum of the interior angles of a regular hexagon?',
    options: ['360°', '540°', '720°', '1080°'],
    correct: 2,
    topic: 'Polygons',
    difficulty: 'MEDIUM',
  },
  {
    content: 'Given that log₁₀ 2 = 0.3010, find log₁₀ 8.',
    options: ['0.6020', '0.9030', '2.4080', '0.0753'],
    correct: 1,
    topic: 'Logarithms',
    difficulty: 'MEDIUM',
  },
  {
    content:
      'A trader buys a radio for ₦12,000 and sells it at a profit of 25%. What is the selling price?',
    options: ['₦12,250', '₦14,400', '₦15,000', '₦16,000'],
    correct: 2,
    topic: 'Commercial arithmetic',
    difficulty: 'EASY',
  },
  {
    content: 'Find the gradient of the line passing through the points (1, 3) and (4, 9).',
    options: ['½', '2', '3', '6'],
    correct: 1,
    topic: 'Coordinate geometry',
    difficulty: 'MEDIUM',
  },
  {
    content: 'Factorise completely: x² − 5x + 6.',
    options: ['(x − 1)(x − 6)', '(x + 2)(x + 3)', '(x − 2)(x − 3)', '(x − 5)(x + 1)'],
    correct: 2,
    topic: 'Quadratic expressions',
    difficulty: 'EASY',
  },
  {
    content: 'Find the mean of 4, 7, 9, 12 and 13.',
    options: ['8', '9', '9.5', '10'],
    correct: 1,
    topic: 'Statistics',
    difficulty: 'EASY',
  },
  {
    content: 'Every rhombus is a square.',
    options: ['True', 'False'],
    correct: 1,
    topic: 'Plane shapes',
    difficulty: 'EASY',
    type: 'TRUE_FALSE',
  },
  {
    content: 'Evaluate 0.25 × 0.4, leaving your answer as a decimal.',
    options: ['0.01', '0.1', '1.0', '0.001'],
    correct: 1,
    topic: 'Number and numeration',
    difficulty: 'EASY',
  },
  {
    content: 'Convert 1011₂ to a number in base ten.',
    options: ['9', '10', '11', '13'],
    correct: 2,
    topic: 'Number bases',
    difficulty: 'MEDIUM',
  },
  {
    content: 'A fair coin is tossed twice. What is the probability of obtaining exactly one head?',
    options: ['¼', '½', '¾', '1'],
    correct: 1,
    topic: 'Probability',
    difficulty: 'MEDIUM',
  },
];

const PENDING: Question[] = [
  {
    content: 'Find the area of a circle of radius 7 cm. (Take π = 22⁄7.)',
    options: ['44 cm²', '88 cm²', '154 cm²', '616 cm²'],
    correct: 2,
    topic: 'Mensuration',
    difficulty: 'EASY',
  },
  {
    content: 'Solve the simultaneous equations x + y = 10 and x − y = 4. Find x.',
    options: ['x = 3', 'x = 6', 'x = 7', 'x = 14'],
    correct: 2,
    topic: 'Simultaneous equations',
    difficulty: 'MEDIUM',
  },
  {
    content: 'Expand (x + 3)².',
    options: ['x² + 9', 'x² + 6x + 9', 'x² + 3x + 9', '2x + 6'],
    correct: 1,
    topic: 'Quadratic expressions',
    difficulty: 'EASY',
  },
  {
    content: 'What is the next term of the sequence 2, 6, 18, 54, …?',
    options: ['72', '108', '162', '216'],
    correct: 2,
    topic: 'Sequences and series',
    difficulty: 'MEDIUM',
  },
];

// Fictional SS2 students, 12 per arm, drawn from names common across Nigeria.
const STUDENT_NAMES: [string, string][] = [
  ['Adaeze', 'Okonkwo'],
  ['Ibrahim', 'Musa'],
  ['Oluwaseun', 'Adebayo'],
  ['Chidinma', 'Nwosu'],
  ['Fatima', 'Abubakar'],
  ['Emeka', 'Obi'],
  ['Temitope', 'Ogunleye'],
  ['Halima', 'Yusuf'],
  ['Kelechi', 'Eze'],
  ['Damilola', 'Ajayi'],
  ['Zainab', 'Lawal'],
  ['Tobenna', 'Okeke'],
  ['Aisha', 'Bello'],
  ['Gbenga', 'Afolabi'],
  ['Ngozi', 'Ibe'],
  ['Yakubu', 'Danjuma'],
  ['Funmilayo', 'Oyelaran'],
  ['Chukwuemeka', 'Anyanwu'],
  ['Hauwa', 'Sani'],
  ['Babatunde', 'Ogundipe'],
  ['Amarachi', 'Uche'],
  ['Mustapha', 'Garba'],
  ['Ifeoluwa', 'Fashola'],
  ['Ebuka', 'Nnamdi'],
  ['Rukayat', 'Olatunji'],
  ['Somtochukwu', 'Agu'],
  ['Hadiza', 'Umar'],
  ['Opeyemi', 'Salami'],
  ['Chiamaka', 'Onyekachi'],
  ['Abdullahi', 'Shehu'],
  ['Moyosore', 'Akinola'],
  ['Ikenna', 'Chukwu'],
  ['Maryam', 'Idris'],
  ['Tolulope', 'Adeniran'],
  ['Uchenna', 'Okafor'],
  ['Bisola', 'Adegoke'],
];

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Deterministic per-student ability, so reruns produce the same spread of scores. */
function skill(i: number): number {
  return 0.35 + (((i * 37) % 36) / 36) * 0.6;
}

class Api {
  constructor(readonly client: Client) {}

  static async signIn(
    target: Target,
    host: string,
    ip: string,
    identifier: string,
    password: string,
  ) {
    const client = new Client(target, host, ip, new Recorder(), randomUUID());
    const res = await client.login(identifier, password);
    if (res.status !== 200) throw new Error(`login ${identifier}: ${res.status} ${res.raw}`);
    return new Api(client);
  }

  async call<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
    const res = await this.client.request<T>(method, url, { label: 'demo', body });
    if (res.status < 200 || res.status >= 300) {
      throw new Error(`${method} ${url}: ${res.status} ${res.raw.slice(0, 400)}`);
    }
    return res.body;
  }

  close() {
    this.client.close();
  }
}

async function createSchoolWithAdmin(o: {
  name: string;
  shortName: string;
  subdomain: string;
  admin: { first: string; last: string; identifier: string; email: string };
  passwordHash: string;
  onboarded: boolean;
}): Promise<string> {
  const now = Date.now();
  const school = await prisma.school.create({
    data: {
      name: o.name,
      shortName: o.shortName,
      subdomain: o.subdomain,
      status: 'ACTIVE',
      ...(o.onboarded ? { onboardingCompletedAt: new Date(now - 40 * DAY) } : {}),
    },
  });
  const user = await prisma.user.create({
    data: {
      firstName: o.admin.first,
      lastName: o.admin.last,
      displayName: `${o.admin.first} ${o.admin.last}`,
      email: o.admin.email,
      passwordHash: o.passwordHash,
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  await withTenant(prisma, school.id, async (tx) => {
    const membership = await tx.schoolMembership.create({
      data: {
        schoolId: school.id,
        userId: user.id,
        loginIdentifier: o.admin.identifier,
        status: 'ACTIVE',
      },
    });
    await tx.roleAssignment.create({
      data: { schoolId: school.id, membershipId: membership.id, role: 'SCHOOL_ADMIN' },
    });
    await tx.subscription.create({
      data: {
        schoolId: school.id,
        plan: 'Annual',
        startAt: new Date(now - 45 * DAY),
        expiresAt: new Date(now + 320 * DAY),
        status: 'ACTIVE',
      },
    });
  });
  return school.id;
}

async function createSessionAndTerm(admin: Api, activate: boolean) {
  const now = Date.now();
  const session = await admin.call<{ id: string }>('POST', '/academics/sessions', {
    name: '2026/2027',
    startDate: isoDate(new Date(now - 40 * DAY)),
    endDate: isoDate(new Date(now + 300 * DAY)),
  });
  const term = await admin.call<{ id: string }>('POST', `/academics/sessions/${session.id}/terms`, {
    name: 'First Term',
    sequence: 1,
    startDate: isoDate(new Date(now - 30 * DAY)),
    endDate: isoDate(new Date(now + 60 * DAY)),
  });
  if (activate) {
    await admin.call('POST', `/academics/sessions/${session.id}/activate`);
    await admin.call('POST', `/academics/terms/${term.id}/activate`);
  }
  return { sessionId: session.id, termId: term.id };
}

async function createStaff(
  admin: Api,
  schoolId: string,
  passwordHash: string,
  p: { first: string; last: string; staffId: string },
) {
  const t = await admin.call<{
    teacherProfileId: string;
    membershipId: string;
    loginIdentifier: string;
  }>('POST', '/teachers', {
    firstName: p.first,
    lastName: p.last,
    email: `${p.first}.${p.last}@oakridge.example`.toLowerCase(),
    staffId: p.staffId,
  });
  await activateStaffCredential(schoolId, t.membershipId, passwordHash);
  return t;
}

async function writeQuestion(teacher: Api, subjectId: string, q: Question, submit: boolean) {
  const created = await teacher.call<{ id: string; revisions: { id: string }[] }>(
    'POST',
    '/questions',
    {
      subjectId,
      level: 'SS2',
      questionType: q.type ?? 'SINGLE_CHOICE',
      content: q.content,
      topicName: q.topic,
      difficulty: q.difficulty,
      marks: 1,
      options: q.options.map((content, i) => ({ content, correctFlag: i === q.correct })),
    },
  );
  const revisionId = created.revisions[0]!.id;
  if (submit) {
    await teacher.call('POST', `/questions/${created.id}/revisions/${revisionId}/submit`);
  }
  return { questionId: created.id, revisionId };
}

async function createExam(
  teacher: Api,
  o: {
    sessionId: string;
    termId: string;
    subjectId: string;
    classIds: string[];
    title: string;
    examType: string;
    revisionIds: string[];
    durationSeconds: number;
  },
) {
  const exam = await teacher.call<{ id: string }>('POST', '/exams', {
    academicSessionId: o.sessionId,
    academicTermId: o.termId,
    subjectId: o.subjectId,
    title: o.title,
    examType: o.examType,
    classIds: o.classIds,
  });
  await teacher.call('PUT', `/exams/${exam.id}/questions`, {
    questions: o.revisionIds.map((questionRevisionId) => ({ questionRevisionId })),
  });
  await teacher.call('PUT', `/exams/${exam.id}/configuration`, {
    durationSeconds: o.durationSeconds,
    attemptLimit: 1,
    randomizeQuestions: true,
    randomizeOptions: true,
    resultPolicy: 'TEACHER',
    resultDetailVisibility: 'SCORE_AND_COUNTS',
    generalInstructions:
      'Answer all questions. Each question carries one mark. Calculators are not allowed.',
    navigationInstructions:
      'You may move between questions freely and change an answer before you submit.',
    submissionInstructions:
      'Submit when you have finished. Your work is submitted for you when the time runs out.',
    accessMode: 'OPEN_TO_ELIGIBLE',
  });
  await teacher.call('POST', `/exams/${exam.id}/ready`, {});
  const session = await teacher.call<{ id: string }>('POST', `/exams/${exam.id}/sessions`, {});
  return { examId: exam.id, sessionId: session.id };
}

interface Sitting {
  api: Api;
  attemptId: string;
  /** examQuestionId → { correct optionId, every optionId } */
  key: { examQuestionId: string; correct: string; options: string[] }[];
}

/** Start an attempt; the answer key comes from the stored snapshot (owner connection), never the client package (X-05). */
async function startAttempt(
  target: Target,
  host: string,
  ip: string,
  identifier: string,
  password: string,
  examId: string,
): Promise<Sitting> {
  const api = await Api.signIn(target, host, ip, identifier, password);
  await api.call('GET', '/student/assessment');
  await api.call('GET', `/student/assessment/${examId}/preview`);
  const pkg = await api.call<{ attemptId: string }>('POST', `/exams/${examId}/attempts`, {});
  const snapshot = await ownerDb().attemptQuestionSnapshot.findFirstOrThrow({
    where: { attemptId: pkg.attemptId },
  });
  const doc = snapshot.document as {
    questions: { examQuestionId: string; options: { optionId: string; correctFlag: boolean }[] }[];
  };
  return {
    api,
    attemptId: pkg.attemptId,
    key: doc.questions.map((q) => ({
      examQuestionId: q.examQuestionId,
      correct: q.options.find((o) => o.correctFlag)!.optionId,
      options: q.options.map((o) => o.optionId),
    })),
  };
}

const sequence = new Map<string, number>();

async function answer(s: Sitting, count: number, ability: number, from = 0) {
  const answers = s.key.slice(from, from + count).map((q) => {
    const right = Math.random() < ability;
    const wrong = q.options.filter((o) => o !== q.correct);
    const seqKey = `${s.attemptId}:${q.examQuestionId}`;
    const seq = (sequence.get(seqKey) ?? 0) + 1;
    sequence.set(seqKey, seq);
    return {
      examQuestionId: q.examQuestionId,
      selectedOptionId: right ? q.correct : wrong[Math.floor(Math.random() * wrong.length)]!,
      sequenceNumber: seq,
      source: 'online',
    };
  });
  if (answers.length === 0) return;
  await s.api.call('POST', `/attempts/${s.attemptId}/answers/batch`, { answers });
}

async function seed() {
  const target = parseTargets(process.env.DEMO_API_TARGET ?? 'http://127.0.0.1:3001/v1')[0]!;
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
  const subdomain = process.env.DEMO_SUBDOMAIN ?? 'oakridge';
  const password = process.env.DEMO_PASSWORD ?? `demo-${randomUUID().slice(0, 8)}`;
  const passwordHash = await hash(password, ARGON2);
  const host = `${subdomain}.${rootDomain}`;

  if (await prisma.school.findUnique({ where: { subdomain } })) {
    throw new Error(
      `a school at "${subdomain}" exists already: set DEMO_SUBDOMAIN or reset the database`,
    );
  }

  // --- Oakridge College ----------------------------------------------------
  const schoolId = await createSchoolWithAdmin({
    name: 'Oakridge College',
    shortName: 'Oakridge',
    subdomain,
    admin: {
      first: 'Folasade',
      last: 'Adeyemi',
      identifier: 'fadeyemi',
      email: 'f.adeyemi@oakridge.example',
    },
    passwordHash,
    onboarded: true,
  });
  const admin = await Api.signIn(target, host, '10.240.0.1', 'fadeyemi', password);
  const { sessionId, termId } = await createSessionAndTerm(admin, true);

  const departments = {
    sciences: await admin.call<{ id: string }>('POST', '/academics/departments', {
      name: 'Sciences',
      code: 'SCI',
    }),
    languages: await admin.call<{ id: string }>('POST', '/academics/departments', {
      name: 'Languages',
      code: 'LANG',
    }),
  };
  const maths = await admin.call<{ id: string }>('POST', '/academics/subjects', {
    name: 'Mathematics',
    code: 'MTH',
  });
  const english = await admin.call<{ id: string }>('POST', '/academics/subjects', {
    name: 'English Language',
    code: 'ENG',
  });
  await admin.call('PATCH', `/academics/subjects/${maths.id}`, {
    departmentId: departments.sciences.id,
  });
  await admin.call('PATCH', `/academics/subjects/${english.id}`, {
    departmentId: departments.languages.id,
  });

  const classIds: string[] = [];
  const mathOfferings: string[] = [];
  const englishOfferings: string[] = [];
  for (const arm of ['A', 'B', 'C']) {
    const cls = await admin.call<{ id: string }>('POST', '/academics/classes', {
      academicSessionId: sessionId,
      name: `SS2${arm}`,
      level: 'SS2',
      arm,
    });
    classIds.push(cls.id);
    for (const subjectId of [maths.id, english.id]) {
      await admin.call('POST', `/academics/classes/${cls.id}/subjects`, { subjectId });
    }
    const { offerings } = await admin.call<{ offerings: { id: string; subjectId: string }[] }>(
      'GET',
      `/academics/classes/${cls.id}/subjects`,
    );
    mathOfferings.push(offerings.find((o) => o.subjectId === maths.id)!.id);
    englishOfferings.push(offerings.find((o) => o.subjectId === english.id)!.id);
  }

  const teacher = await createStaff(admin, schoolId, passwordHash, {
    first: 'Tunde',
    last: 'Balogun',
    staffId: 'OKC-T014',
  });
  await admin.call('PUT', `/teachers/${teacher.teacherProfileId}/assignments`, {
    academicSessionId: sessionId,
    classSubjectIds: mathOfferings,
  });
  const englishTeacher = await createStaff(admin, schoolId, passwordHash, {
    first: 'Ngozi',
    last: 'Eze',
    staffId: 'OKC-T021',
  });
  await admin.call('PUT', `/teachers/${englishTeacher.teacherProfileId}/assignments`, {
    academicSessionId: sessionId,
    classSubjectIds: englishOfferings,
  });
  const hod = await createStaff(admin, schoolId, passwordHash, {
    first: 'Amina',
    last: 'Bello',
    staffId: 'OKC-T003',
  });
  await admin.call('POST', '/hods', { membershipId: hod.membershipId });
  await admin.call('PUT', `/hods/${hod.membershipId}/department`, {
    departmentId: departments.sciences.id,
    academicSessionId: sessionId,
  });
  const moderator = await admin.call<{ membershipId: string; loginIdentifier: string }>(
    'POST',
    '/moderators',
    {
      firstName: 'Chinedu',
      lastName: 'Okafor',
      email: 'c.okafor@oakridge.example',
      loginIdentifier: 'cokafor',
    },
  );
  await activateStaffCredential(schoolId, moderator.membershipId, passwordHash);

  // Students through the API, as a Moderator's import would create them.
  const students: DemoState['oakridge']['students'] = [];
  for (const [i, [first, last]] of STUDENT_NAMES.entries()) {
    const identifier = `OKC24${String(101 + i).padStart(3, '0')}`;
    const created = await admin.call<{ studentProfileId: string; membershipId: string }>(
      'POST',
      '/students',
      { firstName: first, lastName: last, studentId: identifier },
    );
    await admin.call('POST', `/students/${created.studentProfileId}/enrollments`, {
      academicSessionId: sessionId,
      classId: classIds[Math.floor(i / 12)]!,
    });
    await activateStaffCredential(schoolId, created.membershipId, passwordHash);
    students.push({
      identifier,
      name: `${first} ${last}`,
      studentProfileId: created.studentProfileId,
      state: 'not started',
    });
  }
  console.log(`[demo] Oakridge: staff, 3 classes, ${students.length} students`);

  // Questions: twelve approved, four waiting for the HOD.
  const teacherApi = await Api.signIn(
    target,
    host,
    '10.240.0.2',
    teacher.loginIdentifier,
    password,
  );
  const hodApi = await Api.signIn(target, host, '10.240.0.3', hod.loginIdentifier, password);
  const approved: string[] = [];
  for (const q of APPROVED) {
    const { questionId, revisionId } = await writeQuestion(teacherApi, maths.id, q, true);
    await hodApi.call('POST', `/reviews/questions/${questionId}/approve`, {});
    approved.push(revisionId);
  }
  const pendingQuestionIds: string[] = [];
  for (const q of PENDING) {
    pendingQuestionIds.push((await writeQuestion(teacherApi, maths.id, q, true)).questionId);
  }
  console.log(`[demo] questions: ${approved.length} approved, ${PENDING.length} in review`);

  // The school's grading scale: the API's default template (A1–F9).
  const scales = await admin.call<{ defaultTemplate: unknown[] }>('GET', '/school/grading-scales');
  await admin.call('PUT', '/school/grading-scales', {
    name: 'WAEC grading',
    bands: scales.defaultTemplate,
  });

  // Continuous Assessment 1: sat by 33 of 36, marked, ended, not yet published.
  const ca = await createExam(teacherApi, {
    sessionId,
    termId,
    subjectId: maths.id,
    classIds,
    title: 'SS2 Mathematics: Continuous Assessment 1',
    examType: 'Continuous Assessment',
    revisionIds: approved.slice(0, 10),
    durationSeconds: 1800,
  });
  const absentFromCa = new Set([7, 19, 30]);
  for (const [i, s] of students.entries()) {
    if (absentFromCa.has(i)) continue;
    const sitting = await startAttempt(
      target,
      host,
      `10.241.${i}.1`,
      s.identifier,
      password,
      ca.examId,
    );
    await answer(sitting, sitting.key.length - (i % 5 === 0 ? 1 : 0), skill(i));
    await sitting.api.call('POST', `/attempts/${sitting.attemptId}/submit`);
    sitting.api.close();
  }
  await teacherApi.call('POST', `/exam-sessions/${ca.sessionId}/close`, {});
  await teacherApi.call('POST', `/exams/${ca.examId}/complete`, {
    confirmedAbsentStudentProfileIds: [...absentFromCa].map((i) => students[i]!.studentProfileId),
  });
  console.log('[demo] Continuous Assessment 1 sat and closed');

  // First Term Test, live: submitted, writing, disconnected and not started.
  const live = await createExam(teacherApi, {
    sessionId,
    termId,
    subjectId: maths.id,
    classIds,
    title: 'SS2 Mathematics: First Term Test',
    examType: 'Test',
    revisionIds: approved,
    durationSeconds: 3600,
  });
  const plan = (i: number) =>
    i % 9 === 4
      ? 'not started'
      : i % 11 === 6
        ? 'disconnected'
        : i % 3 === 0
          ? 'submitted'
          : 'writing';
  const writing: LiveSitting[] = [];
  for (const [i, s] of students.entries()) {
    s.state = plan(i);
    if (s.state === 'not started') continue;
    const sitting = await startAttempt(
      target,
      host,
      `10.242.${i}.1`,
      s.identifier,
      password,
      live.examId,
    );
    s.attemptId = sitting.attemptId;
    const n = sitting.key.length;
    if (s.state === 'submitted') {
      await answer(sitting, n, skill(i));
      await sitting.api.call('POST', `/attempts/${sitting.attemptId}/submit`);
    } else {
      await answer(sitting, s.state === 'disconnected' ? 3 : 2 + (i % 7), skill(i));
      await sitting.api.call('POST', `/attempts/${sitting.attemptId}/heartbeat`, {});
    }
    if (s.state === 'writing') {
      // Kept signed in: `--live` carries on with this same browser (a fresh
      // sign-in would show as a device change in the Control Center).
      writing.push({ s: sitting, next: 2 + (i % 7), ability: skill(i) });
    } else {
      sitting.api.close();
    }
  }
  console.log('[demo] First Term Test: live session open');

  for (const c of [admin, teacherApi, hodApi]) c.close();
  const riversideSub = process.env.DEMO_SECOND_SUBDOMAIN ?? 'riverside';
  const state: DemoState = {
    createdAt: new Date().toISOString(),
    password,
    rootDomain,
    oakridge: {
      host,
      schoolId,
      admin: 'fadeyemi',
      moderator: moderator.loginIdentifier,
      hod: hod.loginIdentifier,
      teacher: teacher.loginIdentifier,
      liveExamId: live.examId,
      liveSessionId: live.sessionId,
      caExamId: ca.examId,
      pendingQuestionIds,
      students,
    },
    riverside: { host: `${riversideSub}.${rootDomain}`, admin: 'oogunbiyi' },
  };
  await mkdir(STATE_DIR, { recursive: true });
  // Saved before Riverside, so a failure there never strands Oakridge's password.
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2));

  // --- Riverside Grammar School: half-way through onboarding ----------------
  await createSchoolWithAdmin({
    name: 'Riverside Grammar School',
    shortName: 'Riverside',
    subdomain: riversideSub,
    admin: {
      first: 'Olumide',
      last: 'Ogunbiyi',
      identifier: 'oogunbiyi',
      email: 'o.ogunbiyi@riverside.example',
    },
    passwordHash,
    onboarded: false,
  });
  const riversideHost = state.riverside.host;
  const rAdmin = await Api.signIn(target, riversideHost, '10.240.1.1', 'oogunbiyi', password);
  const riversideYear = await createSessionAndTerm(rAdmin, true);
  for (const [name, arm] of [
    ['JSS1A', 'A'],
    ['JSS1B', 'B'],
  ] as const) {
    await rAdmin.call('POST', '/academics/classes', {
      academicSessionId: riversideYear.sessionId,
      name,
      level: 'JSS1',
      arm,
    });
  }
  for (const [name, code] of [
    ['Sciences', 'SCI'],
    ['Languages', 'LANG'],
    ['Humanities', 'HUM'],
  ] as const) {
    await rAdmin.call('POST', '/academics/departments', { name, code });
  }
  await rAdmin.call('PUT', '/school/onboarding/progress', { currentStep: 6, skippedSteps: [2] });
  rAdmin.close();

  console.log(`[demo] done: http://${host}:3000 (state in ${STATE_FILE})`);
  if (process.argv.includes('--live')) await liveLoop(writing);
  for (const x of writing) x.s.api.close();
}

interface LiveSitting {
  s: Sitting;
  next: number;
  ability: number;
}

async function liveLoop(sittings: LiveSitting[]): Promise<never> {
  console.log(`[demo] keeping ${sittings.length} students writing; Ctrl-C to stop`);
  for (;;) {
    for (const x of sittings) {
      await x.s.api.call('POST', `/attempts/${x.s.attemptId}/heartbeat`, {}).catch(() => undefined);
      if (x.next < x.s.key.length - 1 && Math.random() < 0.35) {
        await answer(x.s, 1, x.ability, x.next).catch(() => undefined);
        x.next += 1;
      }
    }
    await sleep(20_000);
  }
}

/** Keep the writing students alive: heartbeat every 20 s and answer the next question now and then. */
async function keepLive() {
  const target = parseTargets(process.env.DEMO_API_TARGET ?? 'http://127.0.0.1:3001/v1')[0]!;
  const state = JSON.parse(await readFile(STATE_FILE, 'utf8')) as DemoState;
  const writing = state.oakridge.students.filter((s) => s.state === 'writing' && s.attemptId);
  const sittings: LiveSitting[] = [];
  for (const [i, s] of writing.entries()) {
    const api = await Api.signIn(
      target,
      state.oakridge.host,
      `10.243.${i}.1`,
      s.identifier,
      state.password,
    );
    const snapshot = await ownerDb().attemptQuestionSnapshot.findFirstOrThrow({
      where: { attemptId: s.attemptId! },
    });
    const doc = snapshot.document as {
      questions: {
        examQuestionId: string;
        options: { optionId: string; correctFlag: boolean }[];
      }[];
    };
    const answered = await ownerDb().attemptAnswer.count({ where: { attemptId: s.attemptId! } });
    sittings.push({
      s: {
        api,
        attemptId: s.attemptId!,
        key: doc.questions.map((q) => ({
          examQuestionId: q.examQuestionId,
          correct: q.options.find((o) => o.correctFlag)!.optionId,
          options: q.options.map((o) => o.optionId),
        })),
      },
      next: answered,
      ability: skill(i),
    });
  }
  await liveLoop(sittings);
}

const command = process.argv[2] ?? 'seed';
(command === 'live' ? keepLive() : seed())
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
