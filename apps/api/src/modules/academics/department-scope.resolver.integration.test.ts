/**
 * DoD item 6: "Subject.department_id resolves an HOD's subject scope
 * (proven by the query B9 will use)." No B9 controller exists yet to
 * exercise this through HTTP (PermissionGuard never constructs a
 * ResourceContext today — see department-scope.resolver.ts's own doc
 * comment), so this proves the resolver directly: construct a
 * Subject-shaped ResourceContext (`{ schoolId, departmentId:
 * subject.departmentId }`, exactly the two-hop join ADR-0001 describes)
 * and call the real resolver against a real HODAssignment row.
 */
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma, withTenant } from '@atlas/db';
import { safeDeleteSchools } from '../../test-support/safe-delete-schools.js';
import { createDepartmentScopeResolver } from './department-scope.resolver.js';

const createdSchoolIds: string[] = [];
const createdUserIds: string[] = [];

afterAll(async () => {
  for (const schoolId of createdSchoolIds) {
    await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.deleteMany({ where: { schoolId } }),
    );
    await withTenant(prisma, schoolId, (tx) => tx.subject.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) => tx.department.deleteMany({ where: { schoolId } }));
    await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.deleteMany({ where: { schoolId } }),
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

describe('DEPARTMENT scope resolver (DoD item 6)', () => {
  it("resolves true for an HOD's own department, false for another department, false for a non-HOD", async () => {
    const school = await prisma.school.create({
      data: {
        name: `Resolver Test School ${randomUUID()}`,
        subdomain: `resolver-${randomUUID().slice(0, 8)}`,
      },
    });
    createdSchoolIds.push(school.id);

    const hodUser = await prisma.user.create({
      data: { firstName: 'Resolver', lastName: 'Hod', displayName: 'Resolver Hod' },
    });
    const teacherUser = await prisma.user.create({
      data: { firstName: 'Resolver', lastName: 'Teacher', displayName: 'Resolver Teacher' },
    });
    createdUserIds.push(hodUser.id, teacherUser.id);

    const hodMembership = await withTenant(prisma, school.id, (tx) =>
      tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: hodUser.id,
          loginIdentifier: `hod-${randomUUID().slice(0, 6)}`,
        },
      }),
    );
    const teacherMembership = await withTenant(prisma, school.id, (tx) =>
      tx.schoolMembership.create({
        data: {
          schoolId: school.id,
          userId: teacherUser.id,
          loginIdentifier: `teacher-${randomUUID().slice(0, 6)}`,
        },
      }),
    );
    await withTenant(prisma, school.id, (tx) =>
      tx.roleAssignment.create({
        data: { schoolId: school.id, membershipId: hodMembership.id, role: 'HOD' },
      }),
    );

    const session = await withTenant(prisma, school.id, (tx) =>
      tx.academicSession.create({
        data: {
          schoolId: school.id,
          name: `Resolver Session ${randomUUID().slice(0, 6)}`,
          startDate: new Date('2026-09-01'),
          endDate: new Date('2027-07-31'),
        },
      }),
    );
    const ownDept = await withTenant(prisma, school.id, (tx) =>
      tx.department.create({
        data: { schoolId: school.id, name: 'Science', code: `SCI-${randomUUID().slice(0, 6)}` },
      }),
    );
    const otherDept = await withTenant(prisma, school.id, (tx) =>
      tx.department.create({
        data: { schoolId: school.id, name: 'Arts', code: `ART-${randomUUID().slice(0, 6)}` },
      }),
    );
    await withTenant(prisma, school.id, (tx) =>
      tx.hODAssignment.create({
        data: {
          schoolId: school.id,
          membershipId: hodMembership.id,
          departmentId: ownDept.id,
          academicSessionId: session.id,
          startDate: new Date('2026-09-01'),
        },
      }),
    );

    const ownSubject = await withTenant(prisma, school.id, (tx) =>
      tx.subject.create({
        data: {
          schoolId: school.id,
          name: 'Physics',
          code: `PHY-${randomUUID().slice(0, 6)}`,
          departmentId: ownDept.id,
        },
      }),
    );
    const otherSubject = await withTenant(prisma, school.id, (tx) =>
      tx.subject.create({
        data: {
          schoolId: school.id,
          name: 'History',
          code: `HIS-${randomUUID().slice(0, 6)}`,
          departmentId: otherDept.id,
        },
      }),
    );

    const resolver = createDepartmentScopeResolver();

    const hodActor = {
      kind: 'SCHOOL' as const,
      userId: hodUser.id,
      schoolId: school.id,
      membershipId: hodMembership.id,
      roles: ['HOD' as const],
    };
    const teacherActor = {
      kind: 'SCHOOL' as const,
      userId: teacherUser.id,
      schoolId: school.id,
      membershipId: teacherMembership.id,
      roles: ['TEACHER' as const],
    };

    if (!ownSubject.departmentId || !otherSubject.departmentId) {
      throw new Error('Fixture setup error: subjects must have a departmentId.');
    }
    await expect(
      resolver(hodActor, { schoolId: school.id, departmentId: ownSubject.departmentId }),
    ).resolves.toBe(true);
    await expect(
      resolver(hodActor, { schoolId: school.id, departmentId: otherSubject.departmentId }),
    ).resolves.toBe(false);
    await expect(
      resolver(teacherActor, { schoolId: school.id, departmentId: ownSubject.departmentId }),
    ).resolves.toBe(false);
    // B8 gap-closure: undefined resource (PermissionGuard's own bare
    // @Authorized(id) check, before any handler runs) now resolves
    // optimistically true, mirroring OWNED/SELF's convention — see this
    // resolver's own updated doc comment. Real per-resource enforcement is
    // what the two assertions above already prove.
    await expect(resolver(hodActor, undefined)).resolves.toBe(true);
  });
});
