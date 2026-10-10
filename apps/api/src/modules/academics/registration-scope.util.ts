import type { Prisma } from '@atlas/db';
import { AppHttpException } from '../../common/app-http-exception.js';
import type { AuthenticatedUser } from '../identity/auth.guard.js';

/** Which of a class's offerings the caller may change registrations for. */
export type RegistrationScope = { all: true } | { all: false; classSubjectIds: Set<string> };

/**
 * ADR-0038 amendment (2026-10-09) — `registrations.manage`'s real scope.
 * School Admin and Moderator: every offering of the class. A Teacher:
 * ELECTIVE offerings only, either the ones they teach (an ACTIVE
 * TeacherAssignment) or all of them when they are the class's form teacher.
 * Compulsory offerings are never a teacher's to change: every student takes
 * them. Must run inside `withTenant`.
 */
export async function registrationScope(
  tx: Prisma.TransactionClient,
  user: AuthenticatedUser,
  classId: string,
): Promise<RegistrationScope> {
  if (user.roles.includes('SCHOOL_ADMIN') || user.roles.includes('MODERATOR')) {
    return { all: true };
  }
  const empty: RegistrationScope = { all: false, classSubjectIds: new Set() };
  if (!user.roles.includes('TEACHER')) return empty;
  const profile = await tx.teacherProfile.findUnique({
    where: {
      schoolId_membershipId: { schoolId: user.schoolId, membershipId: user.membershipId },
    },
    select: { id: true },
  });
  if (!profile) return empty;
  const isFormTeacher =
    (await tx.formTeacherAssignment.findFirst({
      where: { schoolId: user.schoolId, classId, teacherProfileId: profile.id, status: 'ACTIVE' },
      select: { id: true },
    })) !== null;
  const electives = await tx.classSubject.findMany({
    where: {
      schoolId: user.schoolId,
      classId,
      status: 'ACTIVE',
      kind: 'ELECTIVE',
      ...(isFormTeacher
        ? {}
        : {
            teacherAssignments: { some: { teacherProfileId: profile.id, status: 'ACTIVE' } },
          }),
    },
    select: { id: true },
  });
  return { all: false, classSubjectIds: new Set(electives.map((e) => e.id)) };
}

export function inScope(scope: RegistrationScope, classSubjectId: string): boolean {
  return scope.all || scope.classSubjectIds.has(classSubjectId);
}

export function outOfRegistrationScope(): AppHttpException {
  return new AppHttpException({
    code: 'FORBIDDEN',
    message:
      "You can change registrations only for electives you teach in this class, or for a class you're form teacher of.",
  });
}
