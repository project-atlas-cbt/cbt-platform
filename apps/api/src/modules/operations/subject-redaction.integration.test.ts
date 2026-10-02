/**
 * B20 data-subject redaction (ADR-0028; project-owner decision 2026-10-02):
 * personal identifiers go, academic evidence stays byte-for-byte, the
 * person can't sign in any more, the action is audited without PII, and a
 * person shared with another school keeps their name (that school is a
 * separate controller).
 */
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
} from './subject-redaction.js';
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
      requestRef: 'DSR-T-1',
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

    await applyRedaction(audit, {
      schoolId: school.schoolId,
      membershipId: school.users.STUDENT.membershipId,
      actorUserId: actorId,
      reason: "Parent's written request",
      requestRef: 'DSR-T-2',
    });

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
    const again = await applyRedaction(audit, {
      schoolId: school.schoolId,
      membershipId: school.users.STUDENT.membershipId,
      actorUserId: actorId,
      reason: 'repeat',
      requestRef: 'DSR-T-2',
    });
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
    const plan = await applyRedaction(audit, {
      schoolId: school.schoolId,
      membershipId: school.users.TEACHER.membershipId,
      actorUserId: actorId,
      reason: 'request',
      requestRef: 'DSR-T-3',
    });
    expect(plan.userFields).toEqual([]);
    expect(plan.userSkippedReason).toMatch(/other school/u);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: teacherUserId } });
    expect(user.firstName).toBe('TEACHER');
  });
});
