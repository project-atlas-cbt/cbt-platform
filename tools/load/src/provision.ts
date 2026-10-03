import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { hash } from '@node-rs/argon2';
import { prisma, withTenant } from '@atlas/db';
import { Client, type Target } from './http.js';
import { Recorder } from './metrics.js';
import { makePng } from './png.js';

/**
 * Builds exam-ready schools at load-test scale.
 *
 * Staff, academic structure, questions and exams go through the real HTTP
 * API — the same calls `attempt.integration.test.ts` makes — so every
 * invariant (approval workflow, ADR-0001 scope, ADR-0013 multi-class exams)
 * is exercised exactly as in production. Students are bulk-inserted: the
 * rows are identical to what `POST /students` + `POST /students/:id/
 * enrollments` write (membership, STUDENT role, profile, ACTIVE enrollment,
 * ADR-0011 registrations for every class offering), but 1,000 HTTP creates
 * would measure the admin path, not the exam path.
 */

export const STATE_DIR = path.resolve(import.meta.dirname, '..', '.state');
// Argon2id parameters identical to PasswordService / prisma/seed.ts, so a
// load-test sign-in costs exactly what a real one does.
const ARGON2 = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export interface ProvisionedSchool {
  index: number;
  schoolId: string;
  subdomain: string;
  host: string;
  academicSessionId: string;
  academicTermId: string;
  subjectId: string;
  classIds: string[];
  questionRevisionIds: string[];
  admin: { identifier: string };
  teacher: { identifier: string };
  hod: { identifier: string };
  students: { identifier: string; studentProfileId: string }[];
}

export interface Manifest {
  name: string;
  createdAt: string;
  /** Load-test-only credential shared by every provisioned account (never a real secret; stored only in the git-ignored .state/). */
  password: string;
  questionCount: number;
  mediaKb: number;
  schools: ProvisionedSchool[];
}

export interface ProvisionOptions {
  name: string;
  schools: number;
  studentsPerSchool: number;
  studentsPerArm: number;
  questions: number;
  /** Size of one image attached to each question (0 = text-only paper). ADR-0021's media-heavy variant. */
  mediaKb: number;
  target: Target;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function putObject(url: string, body: Buffer, contentType: string): Promise<number> {
  const parsed = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: parsed.hostname === 'localhost' ? '127.0.0.1' : parsed.hostname,
        port: Number(parsed.port || 80),
        path: `${parsed.pathname}${parsed.search}`,
        method: 'PUT',
        headers: { host: parsed.host, 'content-type': contentType, 'content-length': body.length },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

async function expectOk<T>(
  promise: Promise<{ status: number; body: unknown; raw: string }>,
  what: string,
): Promise<T> {
  const res = await promise;
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`${what} failed: ${res.status} ${res.raw.slice(0, 500)}`);
  }
  return res.body as T;
}

async function seedStaffUser(
  schoolId: string,
  identifier: string,
  passwordHash: string,
  role: 'SCHOOL_ADMIN',
): Promise<void> {
  const user = await prisma.user.create({
    data: {
      firstName: 'Load',
      lastName: 'Admin',
      displayName: `Load Admin ${identifier}`,
      passwordHash,
      status: 'ACTIVE',
      credentialState: 'OK',
    },
  });
  await withTenant(prisma, schoolId, async (tx) => {
    const membership = await tx.schoolMembership.create({
      data: { schoolId, userId: user.id, loginIdentifier: identifier, status: 'ACTIVE' },
    });
    await tx.roleAssignment.create({ data: { schoolId, membershipId: membership.id, role } });
  });
}

async function activateStaffCredential(
  schoolId: string,
  membershipId: string,
  passwordHash: string,
) {
  const membership = await withTenant(prisma, schoolId, (tx) =>
    tx.schoolMembership.findUniqueOrThrow({ where: { id: membershipId } }),
  );
  await prisma.user.update({
    where: { id: membership.userId },
    data: { passwordHash, credentialState: 'OK', status: 'ACTIVE' },
  });
}

export async function provision(opts: ProvisionOptions): Promise<Manifest> {
  const password = `load-${randomUUID()}`;
  const passwordHash = await hash(password, ARGON2);
  const rootDomain = process.env.PLATFORM_ROOT_DOMAIN ?? 'localtest.me';
  const recorder = new Recorder();
  const now = new Date();
  const sessionStart = new Date(now.getTime() - 60 * 86_400_000);
  const sessionEnd = new Date(now.getTime() + 240 * 86_400_000);
  const termStart = new Date(now.getTime() - 30 * 86_400_000);
  const termEnd = new Date(now.getTime() + 60 * 86_400_000);
  const schools: ProvisionedSchool[] = [];

  for (let index = 0; index < opts.schools; index++) {
    const t0 = Date.now();
    const tag = randomUUID().slice(0, 6);
    const subdomain = `load-${opts.name}-${index}-${tag}`.toLowerCase().slice(0, 40);
    const school = await prisma.school.create({
      data: { name: `Load School ${opts.name} #${index}`, subdomain, status: 'ACTIVE' },
    });
    await ensureSchoolActive(school.id);
    const host = `${subdomain}.${rootDomain}`;
    const adminIdentifier = `ladmin${index}${tag}`;
    await seedStaffUser(school.id, adminIdentifier, passwordHash, 'SCHOOL_ADMIN');

    const ip = `10.200.${index % 250}.1`;
    const admin = new Client(opts.target, host, ip, recorder, randomUUID());
    await expectOk(admin.login(adminIdentifier, password), 'admin login');

    const academicSessionId = (
      await expectOk<{ id: string }>(
        admin.request('POST', '/academics/sessions', {
          label: 'p',
          body: {
            name: `Load ${tag}`,
            startDate: isoDate(sessionStart),
            endDate: isoDate(sessionEnd),
          },
        }),
        'create session',
      )
    ).id;
    const academicTermId = (
      await expectOk<{ id: string }>(
        admin.request('POST', `/academics/sessions/${academicSessionId}/terms`, {
          label: 'p',
          body: {
            name: 'First Term',
            sequence: 1,
            startDate: isoDate(termStart),
            endDate: isoDate(termEnd),
          },
        }),
        'create term',
      )
    ).id;
    await expectOk(
      admin.request('POST', `/academics/sessions/${academicSessionId}/activate`, { label: 'p' }),
      'activate session',
    );
    await expectOk(
      admin.request('POST', `/academics/terms/${academicTermId}/activate`, { label: 'p' }),
      'activate term',
    );

    const subjectId = (
      await expectOk<{ id: string }>(
        admin.request('POST', '/academics/subjects', {
          label: 'p',
          body: { name: 'Mathematics', code: `MTH-${tag}` },
        }),
        'create subject',
      )
    ).id;
    const deptId = (
      await expectOk<{ id: string }>(
        admin.request('POST', '/academics/departments', {
          label: 'p',
          body: { name: `Sciences ${tag}`, code: `SCI-${tag}` },
        }),
        'create department',
      )
    ).id;
    await expectOk(
      admin.request('PATCH', `/academics/subjects/${subjectId}`, {
        label: 'p',
        body: { departmentId: deptId },
      }),
      'attach department',
    );

    const arms = Math.max(1, Math.ceil(opts.studentsPerSchool / opts.studentsPerArm));
    const classIds: string[] = [];
    const offeringIds: string[] = [];
    for (let a = 0; a < arms; a++) {
      const arm = a < 26 ? String.fromCharCode(65 + a) : `A${a}`;
      const classId = (
        await expectOk<{ id: string }>(
          admin.request('POST', '/academics/classes', {
            label: 'p',
            body: { academicSessionId, name: `SS2${arm}`, level: 'SS2', arm },
          }),
          'create class',
        )
      ).id;
      await expectOk(
        admin.request('POST', `/academics/classes/${classId}/subjects`, {
          label: 'p',
          body: { subjectId },
        }),
        'add offering',
      );
      const offerings = await expectOk<{ offerings: { id: string; subjectId: string }[] }>(
        admin.request('GET', `/academics/classes/${classId}/subjects`, { label: 'p' }),
        'list offerings',
      );
      classIds.push(classId);
      offeringIds.push(offerings.offerings.find((o) => o.subjectId === subjectId)!.id);
    }

    const teacherBody = await expectOk<{
      teacherProfileId: string;
      membershipId: string;
      loginIdentifier: string;
    }>(
      admin.request('POST', '/teachers', {
        label: 'p',
        body: {
          firstName: 'Ade',
          lastName: 'Load',
          email: `t-${tag}-${index}@load.invalid`,
          staffId: `STF-${tag}-T`,
        },
      }),
      'create teacher',
    );
    await activateStaffCredential(school.id, teacherBody.membershipId, passwordHash);
    await expectOk(
      admin.request('PUT', `/teachers/${teacherBody.teacherProfileId}/assignments`, {
        label: 'p',
        body: { academicSessionId, classSubjectIds: offeringIds },
      }),
      'teacher assignments',
    );
    const hodBody = await expectOk<{ membershipId: string; loginIdentifier: string }>(
      admin.request('POST', '/teachers', {
        label: 'p',
        body: {
          firstName: 'Bola',
          lastName: 'Load',
          email: `h-${tag}-${index}@load.invalid`,
          staffId: `STF-${tag}-H`,
        },
      }),
      'create hod teacher',
    );
    await activateStaffCredential(school.id, hodBody.membershipId, passwordHash);
    await expectOk(
      admin.request('POST', '/hods', { label: 'p', body: { membershipId: hodBody.membershipId } }),
      'promote hod',
    );
    await expectOk(
      admin.request('PUT', `/hods/${hodBody.membershipId}/department`, {
        label: 'p',
        body: { departmentId: deptId, academicSessionId },
      }),
      'hod department',
    );

    const teacher = new Client(
      opts.target,
      host,
      `10.200.${index % 250}.2`,
      recorder,
      randomUUID(),
    );
    await expectOk(teacher.login(teacherBody.loginIdentifier, password), 'teacher login');
    const hod = new Client(opts.target, host, `10.200.${index % 250}.3`, recorder, randomUUID());
    await expectOk(hod.login(hodBody.loginIdentifier, password), 'hod login');

    const png = opts.mediaKb > 0 ? makePng(opts.mediaKb) : undefined;
    const questionRevisionIds: string[] = [];
    for (let q = 0; q < opts.questions; q++) {
      const correct = q % 4;
      const created = await expectOk<{ id: string; revisions: { id: string }[] }>(
        teacher.request('POST', '/questions', {
          label: 'p',
          body: {
            subjectId,
            level: 'SS2',
            questionType: 'SINGLE_CHOICE',
            content: `Load question ${q + 1}: what is ${q} + ${correct}? A deliberately realistic stem length — a short paragraph of context the student must read before choosing among four options.`,
            difficulty: 'MEDIUM',
            marks: 1,
            options: [0, 1, 2, 3].map((i) => ({ content: `${q + i}`, correctFlag: i === correct })),
          },
        }),
        'create question',
      );
      const revisionId = created.revisions[0]!.id;
      if (png) {
        const target = await expectOk<{ mediaAssetId: string; uploadUrl: string }>(
          teacher.request('POST', '/questions/media/upload-target', {
            label: 'p',
            body: {
              type: 'QUESTION_DIAGRAM',
              filename: `diagram-${q}.png`,
              declaredMimeType: 'image/png',
              declaredSizeBytes: png.length,
              subjectId,
              level: 'SS2',
            },
          }),
          'media upload target',
        );
        const put = await putObject(target.uploadUrl, png, 'image/png');
        if (put !== 200) throw new Error(`media PUT failed: ${put}`);
        await expectOk(
          teacher.request(
            'POST',
            `/questions/media/upload-target/${target.mediaAssetId}/complete`,
            { label: 'p' },
          ),
          'media complete',
        );
        await expectOk(
          teacher.request('POST', `/questions/${created.id}/revisions/${revisionId}/media`, {
            label: 'p',
            body: { mediaAssetId: target.mediaAssetId, displayOrder: 0 },
          }),
          'media attach',
        );
      }
      await expectOk(
        teacher.request('POST', `/questions/${created.id}/revisions/${revisionId}/submit`, {
          label: 'p',
        }),
        'submit question',
      );
      await expectOk(
        hod.request('POST', `/reviews/questions/${created.id}/approve`, { label: 'p', body: {} }),
        'approve question',
      );
      questionRevisionIds.push(revisionId);
    }

    const students = await bulkInsertStudents({
      schoolId: school.id,
      index,
      tag,
      count: opts.studentsPerSchool,
      perArm: opts.studentsPerArm,
      classIds,
      offeringIds,
      academicSessionId,
      passwordHash,
      startDate: termStart,
    });

    for (const c of [admin, teacher, hod]) c.close();
    schools.push({
      index,
      schoolId: school.id,
      subdomain,
      host,
      academicSessionId,
      academicTermId,
      subjectId,
      classIds,
      questionRevisionIds,
      admin: { identifier: adminIdentifier },
      teacher: { identifier: teacherBody.loginIdentifier },
      hod: { identifier: hodBody.loginIdentifier },
      students,
    });
    console.log(
      `[provision] school ${index + 1}/${opts.schools} ${subdomain}: ${students.length} students, ${arms} arms, ${opts.questions} questions${png ? ` (+${png.length} B image each)` : ''} in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  }

  const manifest: Manifest = {
    name: opts.name,
    createdAt: new Date().toISOString(),
    password,
    questionCount: opts.questions,
    mediaKb: opts.mediaKb,
    schools,
  };
  await saveManifest(manifest);
  return manifest;
}

async function bulkInsertStudents(o: {
  schoolId: string;
  index: number;
  tag: string;
  count: number;
  perArm: number;
  classIds: string[];
  offeringIds: string[];
  academicSessionId: string;
  passwordHash: string;
  startDate: Date;
}): Promise<{ identifier: string; studentProfileId: string }[]> {
  const out: { identifier: string; studentProfileId: string }[] = [];
  const CHUNK = 500;
  for (let start = 0; start < o.count; start += CHUNK) {
    const n = Math.min(CHUNK, o.count - start);
    const rows = Array.from({ length: n }, (_, k) => {
      const i = start + k;
      const arm = Math.min(o.classIds.length - 1, Math.floor(i / o.perArm));
      return {
        userId: randomUUID(),
        membershipId: randomUUID(),
        studentProfileId: randomUUID(),
        enrollmentId: randomUUID(),
        identifier: `ls${o.index}${o.tag}${String(i).padStart(5, '0')}`,
        classId: o.classIds[arm]!,
        offeringId: o.offeringIds[arm]!,
        i,
      };
    });
    await prisma.user.createMany({
      data: rows.map((r) => ({
        id: r.userId,
        firstName: 'Student',
        lastName: `L${r.i}`,
        displayName: `Student L${o.index}-${r.i}`,
        passwordHash: o.passwordHash,
        status: 'ACTIVE' as const,
        credentialState: 'OK' as const,
      })),
    });
    await withTenant(prisma, o.schoolId, async (tx) => {
      await tx.schoolMembership.createMany({
        data: rows.map((r) => ({
          id: r.membershipId,
          schoolId: o.schoolId,
          userId: r.userId,
          loginIdentifier: r.identifier,
          status: 'ACTIVE' as const,
        })),
      });
      await tx.roleAssignment.createMany({
        data: rows.map((r) => ({
          schoolId: o.schoolId,
          membershipId: r.membershipId,
          role: 'STUDENT' as const,
        })),
      });
      await tx.studentProfile.createMany({
        data: rows.map((r) => ({
          id: r.studentProfileId,
          schoolId: o.schoolId,
          membershipId: r.membershipId,
          studentId: r.identifier,
        })),
      });
      await tx.studentEnrollment.createMany({
        data: rows.map((r) => ({
          id: r.enrollmentId,
          schoolId: o.schoolId,
          studentProfileId: r.studentProfileId,
          academicSessionId: o.academicSessionId,
          classId: r.classId,
          startDate: o.startDate,
        })),
      });
      await tx.studentSubjectRegistration.createMany({
        data: rows.map((r) => ({
          schoolId: o.schoolId,
          studentEnrollmentId: r.enrollmentId,
          classSubjectId: r.offeringId,
        })),
      });
    });
    for (const r of rows)
      out.push({ identifier: r.identifier, studentProfileId: r.studentProfileId });
  }
  return out;
}

/**
 * A live school has a live subscription; without one the worker's
 * subscription sweep (ADR-0015) recomputes the school out of ACTIVE and
 * every exam fails its readiness check. Idempotent — also run before each
 * scenario, so a manifest provisioned earlier stays usable.
 */
export async function ensureSchoolActive(schoolId: string): Promise<void> {
  const now = Date.now();
  await withTenant(prisma, schoolId, async (tx) => {
    const live = await tx.subscription.findFirst({
      where: { schoolId, status: 'ACTIVE', expiresAt: { gt: new Date(now + 7 * 86_400_000) } },
    });
    if (!live) {
      await tx.subscription.create({
        data: {
          schoolId,
          plan: 'LOAD-TEST',
          startAt: new Date(now - 30 * 86_400_000),
          expiresAt: new Date(now + 365 * 86_400_000),
          status: 'ACTIVE',
        },
      });
    }
  });
  await prisma.school.update({ where: { id: schoolId }, data: { status: 'ACTIVE' } });
}

export async function saveManifest(manifest: Manifest): Promise<string> {
  await mkdir(STATE_DIR, { recursive: true });
  const file = path.join(STATE_DIR, `${manifest.name}.json`);
  await writeFile(file, JSON.stringify(manifest, null, 2));
  return file;
}

export async function loadManifest(name: string): Promise<Manifest> {
  const file = path.join(STATE_DIR, `${name}.json`);
  return JSON.parse(await readFile(file, 'utf8')) as Manifest;
}
