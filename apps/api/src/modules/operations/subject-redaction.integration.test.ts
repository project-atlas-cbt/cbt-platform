/**
 * B20 data-subject redaction (ADR-0028; project-owner decision 2026-10-02):
 * personal identifiers go, academic evidence stays byte-for-byte, the
 * person can't sign in any more, the action is audited without PII, and a
 * person shared with another school keeps their name (that school is a
 * separate controller).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import { AuditActionRegistry } from './audit-action.registry.js';
import { AuditService } from './audit-event.service.js';
import {
  applyRedaction,
  DATA_SUBJECT_REDACTED_ACTION,
  planRedaction,
  REDACTED_NAME,
  replayRedactions,
} from './subject-redaction.js';
import { REDACTION_REGISTER_PREFIX } from './redaction-register.js';
import { purgeExpiredImportSources } from '../imports/import-source-purge.js';
import { ObjectStorageService } from '../../storage/object-storage.service.js';
import { ownerPrisma } from '../../test-support/owner-prisma.js';
import {
  bootSecurityApp,
  SecurityFixture,
  type FixtureSchool,
} from '../../test-support/security-fixture.js';

let app: NestFastifyApplication;
const fixture = new SecurityFixture();
let school: FixtureSchool;
let actorId: string;
let storage: ObjectStorageService;
const audit = new AuditService(new AuditActionRegistry());

async function evidence(schoolId: string): Promise<string> {
  const owner = ownerPrisma();
  const parts = [];
  for (const t of ['exam_attempts', 'attempt_question_snapshots', 'attempt_answers', 'results']) {
    const rows = await owner.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM "${t}" WHERE school_id = $1::uuid ORDER BY id`,
      schoolId,
    );
    parts.push(JSON.stringify(rows, (_k, v: unknown) => (typeof v === 'bigint' ? String(v) : v)));
  }
  return parts.join('|');
}

beforeAll(async () => {
  app = await bootSecurityApp();
  school = await fixture.createSchool('redact');
  await fixture.populate(school);
  actorId = (await fixture.createPlatformAdmin()).userId;
  storage = app.get(ObjectStorageService);
});

afterAll(async () => {
  await app.close();
  await fixture.cleanup();
});

describe('ops:redact-subject', () => {
  it('dry run changes nothing and names fields, never values', async () => {
    const before = await evidence(school.schoolId);
    const plan = await planRedaction({
      schoolId: school.schoolId,
      membershipId: school.users.STUDENT.membershipId,
      actorUserId: actorId,
      reason: 'test',
      requestRef: 'DSR-2026-901',
    });
    expect(plan.membershipFields).toEqual(['loginIdentifier']);
    expect(plan.profileFields).toEqual(['studentId', 'admissionNumber']);
    expect(plan.userFields).toContain('firstName');
    expect(JSON.stringify(plan)).not.toContain(school.users.STUDENT.identifier);
    expect(await evidence(school.schoolId)).toBe(before);
  });

  it('redacts identifiers and the person, keeps every attempt/answer/result row identical, audits without PII', async () => {
    const live = await fixture.loginAs(app, school, 'STUDENT');
    const before = await evidence(school.schoolId);

    await applyRedaction(
      audit,
      {
        schoolId: school.schoolId,
        membershipId: school.users.STUDENT.membershipId,
        actorUserId: actorId,
        reason: "Parent's written request",
        requestRef: 'DSR-2026-902',
      },
      { storage },
    );

    expect(await evidence(school.schoolId)).toBe(before);
    const [membership, user] = await Promise.all([
      withTenant(prisma, school.schoolId, (tx) =>
        tx.schoolMembership.findUniqueOrThrow({
          where: { id: school.users.STUDENT.membershipId },
          include: { studentProfile: true },
        }),
      ),
      prisma.user.findUniqueOrThrow({ where: { id: school.users.STUDENT.userId } }),
    ]);
    expect(membership.loginIdentifier).not.toBe(school.users.STUDENT.identifier);
    expect(membership.studentProfile?.admissionNumber).toBeNull();
    expect(user).toMatchObject({
      ...REDACTED_NAME,
      email: null,
      passwordHash: null,
      status: 'INACTIVE',
    });

    // The old session is dead; the old identifier signs nobody in.
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { host: live.host, cookie: `atlas_session=${live.sessionCookie}` },
    });
    expect(me.statusCode).toBe(401);

    const rows = await withTenant(prisma, school.schoolId, (tx) =>
      tx.auditEvent.findMany({
        where: { schoolId: school.schoolId, action: DATA_SUBJECT_REDACTED_ACTION },
      }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: actorId, actorRole: 'SOFTWARE_ADMIN' });
    expect(JSON.stringify(rows[0])).not.toContain(school.users.STUDENT.identifier);

    // Idempotent: a second application finds nothing new to change.
    const again = await applyRedaction(
      audit,
      {
        schoolId: school.schoolId,
        membershipId: school.users.STUDENT.membershipId,
        actorUserId: actorId,
        reason: 'repeat',
        requestRef: 'DSR-2026-902',
      },
      { storage },
    );
    expect(again.alreadyRedacted).toBe(true);
    expect(again.userFields).toEqual([]);
  });

  it('a person who also belongs to another school keeps their name — only this school’s identifiers go', async () => {
    const other = await fixture.createSchool('redact-o');
    const teacherUserId = school.users.TEACHER.userId;
    await withTenant(prisma, other.schoolId, (tx) =>
      tx.schoolMembership.create({
        data: {
          schoolId: other.schoolId,
          userId: teacherUserId,
          loginIdentifier: `shared-${Date.now()}`,
        },
      }),
    );
    const plan = await applyRedaction(
      audit,
      {
        schoolId: school.schoolId,
        membershipId: school.users.TEACHER.membershipId,
        actorUserId: actorId,
        reason: 'request',
        requestRef: 'DSR-2026-903',
      },
      { storage },
    );
    expect(plan.userFields).toEqual([]);
    expect(plan.userSkippedReason).toMatch(/other school/u);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: teacherUserId } });
    expect(user.firstName).toBe('TEACHER');
  });

  it('B22: rejects a request reference that is not a DSR number (it could carry a name)', async () => {
    await expect(
      applyRedaction(
        audit,
        {
          schoolId: school.schoolId,
          membershipId: school.users.HOD.membershipId,
          actorUserId: actorId,
          reason: 'request',
          requestRef: 'Request from Ada Obi',
        },
        { storage },
      ),
    ).rejects.toThrow(/DSR-2026-014/u);
  });

  it('B22: deletes the whole import file that created the person, registers the redaction by UUID only, and replays it after a restore', async () => {
    const s = await fixture.createSchool('redact-f');
    const student = s.users.STUDENT;
    const assetId = randomUUID();
    const storageKey = `schools/${s.schoolId}/other/${assetId}/students.csv`;
    const csv = Buffer.from('first_name,last_name\nAda,Obi\nBola,Ade\n');
    await storage.putObject({ storageKey, contentType: 'text/csv', body: csv });
    const jobId = await withTenant(prisma, s.schoolId, async (tx) => {
      await tx.mediaAsset.create({
        data: {
          id: assetId,
          schoolId: s.schoolId,
          type: 'IMPORT_SOURCE',
          status: 'READY',
          storageKey,
          originalFilename: 'students.csv',
          declaredMimeType: 'text/csv',
          declaredSizeBytes: csv.length,
          uploaderUserId: s.users.SCHOOL_ADMIN.userId,
          uploadUrlExpiresAt: new Date(),
        },
      });
      const job = await tx.importJob.create({
        data: {
          schoolId: s.schoolId,
          type: 'STUDENTS',
          status: 'COMPLETED',
          sourceMediaAssetId: assetId,
          uploaderUserId: s.users.SCHOOL_ADMIN.userId,
          uploaderRole: 'SCHOOL_ADMIN',
          templateVersion: 1,
          expiresAt: new Date(),
        },
      });
      await tx.importRow.createMany({
        data: [
          {
            schoolId: s.schoolId,
            importJobId: job.id,
            rowNumber: 2,
            rawData: { first_name: 'Ada', last_name: 'Obi' },
            status: 'COMMITTED',
            resultMembershipId: student.membershipId,
          },
          {
            schoolId: s.schoolId,
            importJobId: job.id,
            rowNumber: 3,
            rawData: { first_name: 'Bola', last_name: 'Ade' },
            status: 'COMMITTED',
            resultMembershipId: s.users.TEACHER.membershipId,
          },
        ],
      });
      return job.id;
    });
    const subject = {
      schoolId: s.schoolId,
      membershipId: student.membershipId,
      actorUserId: actorId,
      reason: "Parent's written request",
      requestRef: 'DSR-2026-904',
    };

    const dry = await planRedaction(subject);
    expect(dry).toMatchObject({ importRowsToRedact: 1, importSourceFilesToDelete: 1 });
    expect(await storage.headObject(storageKey)).not.toBeNull();

    const startedAt = new Date();
    await applyRedaction(audit, subject, { storage });

    // The file is gone, whole; the job keeps its record of when.
    expect(await storage.headObject(storageKey)).toBeNull();
    const after = await withTenant(prisma, s.schoolId, async (tx) => ({
      job: await tx.importJob.findUniqueOrThrow({ where: { id: jobId } }),
      rows: await tx.importRow.findMany({
        where: { importJobId: jobId },
        orderBy: { rowNumber: 'asc' },
      }),
    }));
    expect(after.job.sourcePurgedAt).not.toBeNull();
    expect(after.rows[0]!.rawData).toEqual({ redacted: true, by: 'subject-request' });
    // Only this person's row is redacted in the database.
    expect(after.rows[1]!.rawData).toEqual({ first_name: 'Bola', last_name: 'Ade' });

    // Re-running reports nothing left (the old JSON filter counted the row again).
    const rerun = await planRedaction(subject);
    expect(rerun).toMatchObject({ importRowsToRedact: 0, importSourceFilesToDelete: 0 });

    // The register entry: UUIDs, the DSR number and a time — nothing else.
    const keys = (await storage.listKeys(REDACTION_REGISTER_PREFIX)).filter((k) =>
      k.includes(student.membershipId),
    );
    expect(keys).toHaveLength(1);
    const raw = (await storage.getObject(keys[0]!)).toString('utf8');
    const entry = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(entry).sort()).toEqual(
      [
        'actorUserId',
        'appliedAt',
        'membershipId',
        'requestRef',
        'schoolId',
        'userId',
        'version',
      ].sort(),
    );
    expect(entry).toMatchObject({
      requestRef: 'DSR-2026-904',
      schoolId: s.schoolId,
      membershipId: student.membershipId,
      userId: student.userId,
    });
    for (const pii of [student.identifier, 'Ada', 'Obi', 'STUDENT', 'Parent']) {
      expect(raw).not.toContain(pii);
    }

    // A database restore to before the redaction brings the person back.
    const owner = ownerPrisma();
    await owner.$executeRaw`UPDATE school_memberships SET login_identifier = ${student.identifier} WHERE id = ${student.membershipId}::uuid`;
    await owner.$executeRaw`UPDATE users SET first_name = 'STUDENT', last_name = 'Restored', email = 'restored@example.test', status = 'ACTIVE' WHERE id = ${student.userId}::uuid`;

    const dryReplay = await replayRedactions(
      audit,
      { since: startedAt, actorUserId: actorId, apply: false },
      { storage },
    );
    expect(dryReplay).toContainEqual(
      expect.objectContaining({ membershipId: student.membershipId, outcome: 'WOULD_REAPPLY' }),
    );
    const replay = await replayRedactions(
      audit,
      { since: startedAt, actorUserId: actorId, apply: true },
      { storage },
    );
    expect(replay).toContainEqual(
      expect.objectContaining({ membershipId: student.membershipId, outcome: 'REAPPLIED' }),
    );
    const user = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
    expect(user).toMatchObject({ ...REDACTED_NAME, email: null, status: 'INACTIVE' });
    // Replaying does not register the redaction a second time.
    expect(
      (await storage.listKeys(REDACTION_REGISTER_PREFIX)).filter((k) =>
        k.includes(student.membershipId),
      ),
    ).toHaveLength(1);
    const again = await replayRedactions(
      audit,
      { since: startedAt, actorUserId: actorId, apply: true },
      { storage },
    );
    expect(again).toContainEqual(
      expect.objectContaining({ membershipId: student.membershipId, outcome: 'ALREADY_REDACTED' }),
    );
  });

  it('B22: the hourly pass deletes import files 90 days after the job finished, and leaves unfinished jobs alone', async () => {
    const s = await fixture.createSchool('purge-90');
    const make = async (status: 'COMPLETED' | 'VALIDATED') => {
      const assetId = randomUUID();
      const storageKey = `schools/${s.schoolId}/other/${assetId}/f.csv`;
      await storage.putObject({ storageKey, contentType: 'text/csv', body: Buffer.from('a\n') });
      const job = await withTenant(prisma, s.schoolId, async (tx) => {
        await tx.mediaAsset.create({
          data: {
            id: assetId,
            schoolId: s.schoolId,
            type: 'IMPORT_SOURCE',
            status: 'READY',
            storageKey,
            originalFilename: 'f.csv',
            declaredMimeType: 'text/csv',
            declaredSizeBytes: 2,
            uploaderUserId: s.users.SCHOOL_ADMIN.userId,
            uploadUrlExpiresAt: new Date(),
          },
        });
        return tx.importJob.create({
          data: {
            schoolId: s.schoolId,
            type: 'STUDENTS',
            status,
            sourceMediaAssetId: assetId,
            uploaderUserId: s.users.SCHOOL_ADMIN.userId,
            uploaderRole: 'SCHOOL_ADMIN',
            templateVersion: 1,
            expiresAt: new Date(),
          },
        });
      });
      return { jobId: job.id, storageKey };
    };
    const done = await make('COMPLETED');
    const pending = await make('VALIDATED');

    // Day 89: nothing yet.
    const day = 24 * 60 * 60 * 1000;
    await purgeExpiredImportSources(storage, { now: new Date(Date.now() + 89 * day) });
    expect(await storage.headObject(done.storageKey)).not.toBeNull();

    // Day 91: the finished job's file goes; the job still awaiting confirm keeps its file.
    await purgeExpiredImportSources(storage, { now: new Date(Date.now() + 91 * day) });
    expect(await storage.headObject(done.storageKey)).toBeNull();
    expect(await storage.headObject(pending.storageKey)).not.toBeNull();
    const jobs = await withTenant(prisma, s.schoolId, (tx) =>
      tx.importJob.findMany({
        where: { schoolId: s.schoolId },
        select: { id: true, sourcePurgedAt: true },
      }),
    );
    expect(jobs.find((j) => j.id === done.jobId)?.sourcePurgedAt).not.toBeNull();
    expect(jobs.find((j) => j.id === pending.jobId)?.sourcePurgedAt).toBeNull();
    await storage.deleteObject(pending.storageKey);
  });
});
