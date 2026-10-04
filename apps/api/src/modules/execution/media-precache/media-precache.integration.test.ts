/**
 * F20 — encrypted media pre-cache (owner decision 2026-10-03; ADR-0021
 * amendment). Proves the contract end to end against real Postgres + object
 * storage:
 *
 * - the manifest is gated to an AUTHORIZED participant of an OPEN session;
 * - encryption runs lazily, is idempotent, and the stored object is
 *   ciphertext (the plaintext never appears in it);
 * - the manifest and preview NEVER carry the key (release-blocking, X-05
 *   style); the owner's attempt package carries it while IN_PROGRESS, and it
 *   decrypts exactly the bytes the teacher uploaded.
 */
import { createHash, createDecipheriv, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import { ObjectStorageService } from '../../../storage/object-storage.service.js';
import {
  SecurityFixture,
  bootSecurityApp,
  call,
  type Ctx,
  type FixtureSchool,
} from '../../../test-support/security-fixture.js';
import { ExamMediaPrecacheQueueService } from './exam-media-precache-queue.service.js';
import { ExamMediaPrecacheService } from './exam-media-precache.service.js';

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let school: FixtureSchool;
let student: Ctx;
let teacher: Ctx;
let examId: string;
let attemptId: string;
let enqueueSpy: ReturnType<typeof vi.spyOn>;
const IMAGE = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.from('F20 question 1 diagram — the triangle has sides 3, 4 and 5. '.repeat(40)),
]);

function decrypt(keyBase64: string, blob: Buffer): Buffer {
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(keyBase64, 'base64'),
    blob.subarray(0, 12),
  );
  decipher.setAuthTag(blob.subarray(blob.length - 16));
  return Buffer.concat([decipher.update(blob.subarray(12, blob.length - 16)), decipher.final()]);
}

beforeAll(async () => {
  app = await bootSecurityApp();
  enqueueSpy = vi
    .spyOn(app.get(ExamMediaPrecacheQueueService), 'enqueue')
    .mockResolvedValue(undefined);
  school = await fixture.createSchool('precache');
  const sid = school.schoolId;
  const suffix = randomUUID().slice(0, 6);

  const mediaAssetId = randomUUID();
  const storageKey = `schools/${sid}/questions/${mediaAssetId}/diagram.png`;
  await app.get(ObjectStorageService).putObject({
    storageKey,
    contentType: 'image/png',
    body: IMAGE,
    contentLength: IMAGE.length,
  });

  await withTenant(prisma, sid, async (tx) => {
    const session = await tx.academicSession.create({
      data: {
        schoolId: sid,
        name: `Pre ${suffix}`,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    const term = await tx.academicTerm.create({
      data: {
        schoolId: sid,
        academicSessionId: session.id,
        name: 'First Term',
        sequence: 1,
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
      },
    });
    const subject = await tx.subject.create({
      data: { schoolId: sid, name: 'Mathematics', code: `M-${suffix}` },
    });
    const teacherProfile = await tx.teacherProfile.findFirstOrThrow({
      where: { schoolId: sid, membershipId: school.users.TEACHER.membershipId },
    });
    const question = await tx.question.create({
      data: {
        schoolId: sid,
        subjectId: subject.id,
        level: 'SS2',
        authorTeacherProfileId: teacherProfile.id,
      },
    });
    const revision = await tx.questionRevision.create({
      data: {
        schoolId: sid,
        questionId: question.id,
        revisionNumber: 1,
        questionType: 'SINGLE_CHOICE',
        content: '<p>Study the diagram.</p>',
        difficulty: 'EASY',
        marks: 1,
        createdByMembershipId: school.users.TEACHER.membershipId,
      },
    });
    await tx.mediaAsset.create({
      data: {
        id: mediaAssetId,
        schoolId: sid,
        type: 'QUESTION_IMAGE',
        status: 'READY',
        storageKey,
        originalFilename: 'diagram.png',
        declaredMimeType: 'image/png',
        sniffedMimeType: 'image/png',
        declaredSizeBytes: IMAGE.length,
        uploaderUserId: school.users.TEACHER.userId,
        uploadUrlExpiresAt: new Date(Date.now() + 900_000),
      },
    });
    await tx.questionMedia.create({
      data: { schoolId: sid, questionRevisionId: revision.id, mediaAssetId, displayOrder: 1 },
    });
    await tx.questionRevision.update({ where: { id: revision.id }, data: { status: 'APPROVED' } });

    const exam = await tx.exam.create({
      data: {
        schoolId: sid,
        academicSessionId: session.id,
        academicTermId: term.id,
        subjectId: subject.id,
        title: `Pre-cache ${suffix}`,
        examType: 'Test',
        durationSeconds: 1800,
        resultPolicy: 'TEACHER',
        resultDetailVisibility: 'SCORE_ONLY',
        createdByMembershipId: school.users.TEACHER.membershipId,
      },
    });
    examId = exam.id;
    const section = await tx.examSection.create({ data: { schoolId: sid, examId } });
    await tx.examQuestion.create({
      data: {
        schoolId: sid,
        examId,
        examSectionId: section.id,
        questionRevisionId: revision.id,
        sequence: 1,
        marks: 1,
      },
    });
    await tx.exam.update({ where: { id: examId }, data: { status: 'OPEN' } });
    const examSession = await tx.examSession.create({
      data: { schoolId: sid, examId, openedByMembershipId: school.users.TEACHER.membershipId },
    });
    const studentProfile = await tx.studentProfile.findFirstOrThrow({
      where: { schoolId: sid, membershipId: school.users.STUDENT.membershipId },
    });
    await tx.examSessionParticipant.create({
      data: {
        schoolId: sid,
        examSessionId: examSession.id,
        studentProfileId: studentProfile.id,
        extraTimeSeconds: 600,
        largerText: true,
      },
    });
    const attempt = await tx.examAttempt.create({
      data: {
        schoolId: sid,
        examId,
        examSessionId: examSession.id,
        studentProfileId: studentProfile.id,
        attemptNumber: 1,
        state: 'IN_PROGRESS',
        durationGrantedSeconds: 2400,
        expiresAt: new Date(Date.now() + 2400 * 1000),
      },
    });
    attemptId = attempt.id;
    await tx.attemptQuestionSnapshot.create({
      data: {
        schoolId: sid,
        attemptId,
        seed: 'pre',
        document: {
          version: 1,
          seed: 'pre',
          questions: [
            {
              examQuestionId: randomUUID(),
              questionRevisionId: revision.id,
              displaySequence: 1,
              marks: 1,
              questionType: 'SINGLE_CHOICE',
              content: '<p>Study the diagram.</p>',
              explanation: null,
              options: [],
              media: [{ mediaAssetId, displayOrder: 1 }],
            },
          ],
        },
      },
    });
  });

  student = await fixture.loginAs(app, school, 'STUDENT');
  teacher = await fixture.loginAs(app, school, 'TEACHER');
});

afterAll(async () => {
  await fixture.cleanup();
  await app.close();
});

const manifestUrl = () => `/student/assessment/${examId}/media-manifest`;

describe('F20 encrypted media pre-cache', () => {
  it('is not ready until encrypted, and asks for encryption lazily', async () => {
    const res = await call(app, student, 'GET', manifestUrl());
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ready: false, assets: [], retryAfterSeconds: 5 });
    expect(enqueueSpy).toHaveBeenCalledWith({ schoolId: school.schoolId, examId });
  });

  it('encrypts idempotently', async () => {
    const service = app.get(ExamMediaPrecacheService);
    expect(await service.encryptExam(school.schoolId, examId)).toEqual({ encrypted: 1 });
    expect(await service.encryptExam(school.schoolId, examId)).toEqual({ encrypted: 0 });
  });

  let ciphertext: Buffer;

  it('serves signed CIPHERTEXT the client can verify — the plaintext never appears', async () => {
    const res = await call(app, student, 'GET', manifestUrl());
    const body = res.json<{
      ready: boolean;
      totalBytes: number;
      assets: { url: string; byteSize: number; sha256: string }[];
    }>();
    expect(body.ready).toBe(true);
    expect(body.assets).toHaveLength(1);
    const [asset] = body.assets;
    expect(asset!.byteSize).toBe(IMAGE.length + 28);
    expect(body.totalBytes).toBe(asset!.byteSize);

    const download = await fetch(asset!.url);
    expect(download.status).toBe(200);
    ciphertext = Buffer.from(await download.arrayBuffer());
    expect(createHash('sha256').update(ciphertext).digest('hex')).toBe(asset!.sha256);
    expect(ciphertext.includes(Buffer.from('triangle has sides'))).toBe(false);
  });

  it('RELEASE-BLOCKING: neither the manifest nor the preview carries the key', async () => {
    const manifest = await call(app, student, 'GET', manifestUrl());
    const preview = await call(app, student, 'GET', `/student/assessment/${examId}/preview`);
    const key = app.get(ExamMediaPrecacheService).mediaKeyFor(school.schoolId, examId);
    for (const res of [manifest, preview]) {
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toContain('mediaKey');
      expect(res.body).not.toContain(key);
    }
  });

  it("the owner's attempt package carries the key, which decrypts exactly the uploaded bytes", async () => {
    const res = await call(app, student, 'GET', `/attempts/${attemptId}`);
    expect(res.statusCode).toBe(200);
    const pkg = res.json<{
      mediaKey: string | null;
      extraTimeSeconds: number;
      largerText: boolean;
    }>();
    expect(pkg.mediaKey).toEqual(expect.any(String));
    expect(decrypt(pkg.mediaKey!, ciphertext).equals(IMAGE)).toBe(true);
    // DoD 3 accommodations travel with the package.
    expect(pkg.extraTimeSeconds).toBe(600);
    expect(pkg.largerText).toBe(true);
  });

  it('the preview shows the caller their own accommodations (DoD 3)', async () => {
    const res = await call(app, student, 'GET', `/student/assessment/${examId}/preview`);
    expect(res.json()).toMatchObject({ extraTimeSeconds: 600, largerText: true });
  });

  it('staff cannot fetch the manifest, and a non-participant gets a 404', async () => {
    const asTeacher = await call(app, teacher, 'GET', manifestUrl());
    expect(asTeacher.statusCode).toBe(403);

    await withTenant(prisma, school.schoolId, (tx) =>
      tx.examSessionParticipant.updateMany({
        where: { schoolId: school.schoolId },
        data: { status: 'REVOKED', revokedAt: new Date() },
      }),
    );
    const revoked = await call(app, student, 'GET', manifestUrl());
    expect(revoked.statusCode).toBe(404);
  });

  it('purges ciphertext (object and row) once the exam can no longer admit an attempt', async () => {
    const service = app.get(ExamMediaPrecacheService);
    const row = await withTenant(prisma, school.schoolId, (tx) =>
      tx.examMediaCiphertext.findFirstOrThrow({ where: { schoolId: school.schoolId, examId } }),
    );
    // OPEN: kept.
    await service.purgeFinishedExams();
    expect(await app.get(ObjectStorageService).headObject(row.storageKey)).not.toBeNull();

    await withTenant(prisma, school.schoolId, (tx) =>
      tx.exam.update({ where: { id: examId }, data: { status: 'CANCELLED' } }),
    );
    await service.purgeFinishedExams();
    expect(await app.get(ObjectStorageService).headObject(row.storageKey)).toBeNull();
    const left = await withTenant(prisma, school.schoolId, (tx) =>
      tx.examMediaCiphertext.count({ where: { schoolId: school.schoolId, examId } }),
    );
    expect(left).toBe(0);
  });
});
