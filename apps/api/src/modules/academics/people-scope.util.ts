import { prisma, withTenant } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';

/**
 * Record-level scope for the `assignments.view` lookups that take a class,
 * student or teacher id (2026-10-08). `PermissionGuard` only checks the
 * route-level grant, and the SELF resolver allows any record when it is
 * given no owner, so before this a Teacher or Student could read any
 * class's roster (names and Login IDs) by its id. The grants the permission
 * table already states are applied here:
 *
 * - School Admin / Moderator (SCHOOL): every record in the school.
 * - HOD (DEPARTMENT): classes of a department they head, either the class's
 *   own department or a subject of that department taught in the class;
 *   students enrolled in such a class; teachers teaching a subject of it.
 * - Teacher: the classes they are assigned to teach or are form teacher of
 *   (ADR-0038), and those classes' current students; their own assignment
 *   record.
 * - Student (SELF): their own records only; never a class roster.
 *
 * A user holding several roles gets the union. Refusals are FORBIDDEN, the
 * same as the export scope checks.
 */

function hasSchoolWide(user: AuthenticatedUser): boolean {
  return user.roles.includes('SCHOOL_ADMIN') || user.roles.includes('MODERATOR');
}

function outsideScope(): AppHttpException {
  return new AppHttpException({
    code: 'FORBIDDEN',
    message: 'This record is outside the classes you can view.',
  });
}

async function headedDepartmentIds(user: AuthenticatedUser): Promise<string[]> {
  if (!user.roles.includes('HOD')) return [];
  const rows = await withTenant(prisma, user.schoolId, (tx) =>
    tx.hODAssignment.findMany({
      where: { schoolId: user.schoolId, membershipId: user.membershipId, status: 'ACTIVE' },
      select: { departmentId: true },
    }),
  );
  return rows.map((r) => r.departmentId);
}

/** Of `classIds`, the ones this HOD or Teacher may view. */
async function viewableClassIds(user: AuthenticatedUser, classIds: string[]): Promise<Set<string>> {
  const allowed = new Set<string>();
  if (classIds.length === 0) return allowed;
  const departments = await headedDepartmentIds(user);
  await withTenant(prisma, user.schoolId, async (tx) => {
    if (departments.length > 0) {
      const rows = await tx.classGroup.findMany({
        where: {
          schoolId: user.schoolId,
          id: { in: classIds },
          OR: [
            { departmentId: { in: departments } },
            { classSubjects: { some: { subject: { departmentId: { in: departments } } } } },
          ],
        },
        select: { id: true },
      });
      for (const r of rows) allowed.add(r.id);
    }
    if (user.roles.includes('TEACHER')) {
      const rows = await tx.teacherAssignment.findMany({
        where: {
          schoolId: user.schoolId,
          status: 'ACTIVE',
          teacherProfile: { membershipId: user.membershipId },
          classSubject: { classId: { in: classIds } },
        },
        select: { classSubject: { select: { classId: true } } },
      });
      for (const r of rows) allowed.add(r.classSubject.classId);
      // ADR-0038 amendment: a form teacher sees their whole arm.
      const formRows = await tx.formTeacherAssignment.findMany({
        where: {
          schoolId: user.schoolId,
          status: 'ACTIVE',
          teacherProfile: { membershipId: user.membershipId },
          classId: { in: classIds },
        },
        select: { classId: true },
      });
      for (const r of formRows) allowed.add(r.classId);
    }
  });
  return allowed;
}

/** `GET /classes/:id/students` and `GET /classes/:id/teachers`. */
export async function assertCanViewClassPeople(
  user: AuthenticatedUser,
  classId: string,
): Promise<void> {
  if (hasSchoolWide(user)) return;
  const allowed = await viewableClassIds(user, [classId]);
  if (!allowed.has(classId)) throw outsideScope();
}

/** `GET /students/:id/enrollments` and `.../subject-registrations`. */
export async function assertCanViewStudent(
  user: AuthenticatedUser,
  studentProfileId: string,
): Promise<void> {
  if (hasSchoolWide(user)) return;
  const student = await withTenant(prisma, user.schoolId, (tx) =>
    tx.studentProfile.findUnique({
      where: { schoolId_id: { schoolId: user.schoolId, id: studentProfileId } },
      select: {
        membershipId: true,
        enrollments: { where: { status: 'ACTIVE' }, select: { classId: true } },
      },
    }),
  );
  if (!student) throw outsideScope();
  if (student.membershipId === user.membershipId) return;
  const classIds = student.enrollments.map((e) => e.classId);
  const allowed = await viewableClassIds(user, classIds);
  if (allowed.size === 0) throw outsideScope();
}

/** `GET /teachers/:id/assignments`. */
export async function assertCanViewTeacher(
  user: AuthenticatedUser,
  teacherProfileId: string,
): Promise<void> {
  if (hasSchoolWide(user)) return;
  const departments = await headedDepartmentIds(user);
  const teacher = await withTenant(prisma, user.schoolId, (tx) =>
    tx.teacherProfile.findUnique({
      where: { schoolId_id: { schoolId: user.schoolId, id: teacherProfileId } },
      select: {
        membershipId: true,
        assignments: {
          where: {
            status: 'ACTIVE',
            classSubject: { subject: { departmentId: { in: departments } } },
          },
          select: { id: true },
          take: 1,
        },
      },
    }),
  );
  if (!teacher) throw outsideScope();
  if (teacher.membershipId === user.membershipId) return;
  if (departments.length > 0 && teacher.assignments.length > 0) return;
  throw outsideScope();
}
