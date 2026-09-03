/**
 * B7 roadmap Testing requirements table — Failure: "Worker crash mid-
 * import; re-run resumes without duplicating" (DoD item 8).
 *
 * Rather than literally interrupting a running loop (which would need
 * fragile mid-execution mocking), this directly constructs the two
 * partial-progress states `ImportCommitService.commit()`'s own resumability
 * depends on (see that class's doc comment) and proves a single `commit()`
 * call resumes each correctly:
 *
 *  - a row whose person was already created in a hypothetical prior run
 *    (`resultMembershipId` set, `status` still `VALID`) — commit() must
 *    skip straight to the invitation step, never re-create the person;
 *  - a row untouched by any prior run — processed fresh, same as always;
 *  - a row already fully `COMMITTED` from a hypothetical prior run — must
 *    never be touched again (the `WHERE status = 'VALID'` query excludes
 *    it structurally).
 */
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import { AppModule } from '../../app.module.js';
import { createPersonMembership } from '../users/person.util.js';
import { ImportCommitService } from './import-commit.service.js';

let app: NestFastifyApplication;
let commit: ImportCommitService;

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    logger: false,
  });
  await app.init();
  commit = app.get(ImportCommitService);
});

afterAll(async () => {
  await app.close();
});

async function createSchool() {
  return prisma.school.create({
    data: {
      name: `Import Resume School ${randomUUID()}`,
      subdomain: `impr-${randomUUID().slice(0, 8)}`,
    },
  });
}

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) => tx.importRow.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.importJob.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.roleAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.deleteMany({ where: { schoolId } }),
    );
  }
  await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  await safeDeleteSchools(prisma, createdSchoolIds);
});

describe('B7 — ImportCommitService.commit() resumability (DoD item 8)', () => {
  it('resumes a partially-created row without duplicating, skips a completed row, and processes a fresh row', async () => {
    const school = await createSchool();
    createdSchoolIds.push(school.id);
    const uploader = await prisma.user.create({
      data: {
        firstName: 'Resume',
        lastName: 'Uploader',
        displayName: 'Resume Uploader',
        status: 'ACTIVE',
      },
    });
    createdUserIds.push(uploader.id);

    const partialStaffId = `RESUME-PARTIAL-${randomUUID().slice(0, 8)}`;
    const freshStaffId = `RESUME-FRESH-${randomUUID().slice(0, 8)}`;
    const alreadyDoneStaffId = `RESUME-DONE-${randomUUID().slice(0, 8)}`;

    const job = await withTenant(prisma, school.id, (tx) =>
      tx.importJob.create({
        data: {
          schoolId: school.id,
          type: 'TEACHERS',
          status: 'IMPORTING',
          sourceMediaAssetId: randomUUID(),
          uploaderUserId: uploader.id,
          uploaderRole: 'SCHOOL_ADMIN',
          templateVersion: 1,
          totalRows: 3,
          validRows: 3,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        },
      }),
    );

    // Row 1: "crashed after person creation, before invitation" — the
    // exact partial state commit() must resume from, not duplicate.
    const partialMembershipId = await withTenant(prisma, school.id, async (tx) => {
      const person = await createPersonMembership(tx, {
        schoolId: school.id,
        firstName: 'Partial',
        lastName: 'Person',
        email: `${partialStaffId}@example.com`,
        loginIdentifier: partialStaffId,
        role: 'TEACHER',
      });
      await tx.teacherProfile.create({
        data: { schoolId: school.id, membershipId: person.membershipId, staffId: partialStaffId },
      });
      return person.membershipId;
    });
    await withTenant(prisma, school.id, (tx) =>
      tx.importRow.create({
        data: {
          schoolId: school.id,
          importJobId: job.id,
          rowNumber: 1,
          rawData: {
            'Staff ID': partialStaffId,
            'First Name': 'Partial',
            'Last Name': 'Person',
            Email: `${partialStaffId}@example.com`,
          },
          status: 'VALID',
          resultMembershipId: partialMembershipId,
        },
      }),
    );

    // Row 2: never touched by any prior run.
    await withTenant(prisma, school.id, (tx) =>
      tx.importRow.create({
        data: {
          schoolId: school.id,
          importJobId: job.id,
          rowNumber: 2,
          rawData: {
            'Staff ID': freshStaffId,
            'First Name': 'Fresh',
            'Last Name': 'Person',
            Email: `${freshStaffId}@example.com`,
          },
          status: 'VALID',
        },
      }),
    );

    // Row 3: already fully COMMITTED in a hypothetical prior run — must
    // never be touched again.
    const alreadyDoneMembershipId = await withTenant(prisma, school.id, async (tx) => {
      const person = await createPersonMembership(tx, {
        schoolId: school.id,
        firstName: 'Already',
        lastName: 'Done',
        email: `${alreadyDoneStaffId}@example.com`,
        loginIdentifier: alreadyDoneStaffId,
        role: 'TEACHER',
      });
      await tx.teacherProfile.create({
        data: {
          schoolId: school.id,
          membershipId: person.membershipId,
          staffId: alreadyDoneStaffId,
        },
      });
      return person.membershipId;
    });
    await withTenant(prisma, school.id, (tx) =>
      tx.importRow.create({
        data: {
          schoolId: school.id,
          importJobId: job.id,
          rowNumber: 3,
          rawData: {
            'Staff ID': alreadyDoneStaffId,
            'First Name': 'Already',
            'Last Name': 'Done',
            Email: `${alreadyDoneStaffId}@example.com`,
          },
          status: 'COMMITTED',
          resultMembershipId: alreadyDoneMembershipId,
        },
      }),
    );

    // Simulates the "re-run after crash" — one call, resuming from
    // whatever state the rows are actually in.
    await commit.commit(school.id, job.id);

    const rows = await withTenant(prisma, school.id, (tx) =>
      tx.importRow.findMany({
        where: { schoolId: school.id, importJobId: job.id },
        orderBy: { rowNumber: 'asc' },
      }),
    );
    expect(rows.map((r) => r.status)).toEqual(['COMMITTED', 'COMMITTED', 'COMMITTED']);

    // No duplicate person for the partially-committed row.
    const partialMemberships = await withTenant(prisma, school.id, (tx) =>
      tx.schoolMembership.findMany({
        where: { schoolId: school.id, loginIdentifier: partialStaffId },
      }),
    );
    expect(partialMemberships).toHaveLength(1);
    expect(partialMemberships[0]?.id).toBe(partialMembershipId);

    // The fresh row genuinely got a new person.
    const freshMemberships = await withTenant(prisma, school.id, (tx) =>
      tx.schoolMembership.findMany({
        where: { schoolId: school.id, loginIdentifier: freshStaffId },
      }),
    );
    expect(freshMemberships).toHaveLength(1);

    const finalJob = await withTenant(prisma, school.id, (tx) =>
      tx.importJob.findUniqueOrThrow({ where: { id: job.id } }),
    );
    expect(finalJob.status).toBe('COMPLETED');
    // Only rows 1 and 2 were actually processed by this commit() call (row
    // 3 was already COMMITTED and excluded by the WHERE clause) — so the
    // running counter only increments by 2, not 3.
    expect(finalJob.committedRows).toBe(2);
  });
});
