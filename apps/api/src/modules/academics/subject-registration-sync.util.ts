import type { Prisma } from '@atlas/db';

/**
 * ADR-0011 auto-registration for students who are already enrolled: every
 * ACTIVE enrollment is registered for every ACTIVE `ClassSubject` of its
 * class. Enrollment itself registers against the offerings that exist at
 * that moment (`StudentEnrollmentService.enroll()`); this covers the other
 * order, a subject offered to a class *after* its students were enrolled or
 * imported, which otherwise left those students unregistered and so
 * ineligible for the subject's exams.
 *
 * A pair that already has a row is skipped whatever its status, so a
 * Moderator's deregistration from an elective stands. Must run inside a
 * `withTenant` transaction. Returns the number of registrations created.
 */
export async function registerEnrolledStudentsForOfferings(
  tx: Prisma.TransactionClient,
  schoolId: string,
  scope: { classSubjectId?: string } = {},
): Promise<number> {
  const offerings = await tx.classSubject.findMany({
    where: {
      schoolId,
      status: 'ACTIVE',
      ...(scope.classSubjectId ? { id: scope.classSubjectId } : {}),
    },
    select: { id: true, classId: true },
  });
  if (offerings.length === 0) return 0;

  const enrollments = await tx.studentEnrollment.findMany({
    where: {
      schoolId,
      status: 'ACTIVE',
      classId: { in: [...new Set(offerings.map((o) => o.classId))] },
    },
    select: { id: true, classId: true },
  });
  const enrollmentsByClass = new Map<string, string[]>();
  for (const e of enrollments) {
    const list = enrollmentsByClass.get(e.classId) ?? [];
    list.push(e.id);
    enrollmentsByClass.set(e.classId, list);
  }

  const data = offerings.flatMap((offering) =>
    (enrollmentsByClass.get(offering.classId) ?? []).map((studentEnrollmentId) => ({
      schoolId,
      studentEnrollmentId,
      classSubjectId: offering.id,
    })),
  );
  if (data.length === 0) return 0;
  const { count } = await tx.studentSubjectRegistration.createMany({
    data,
    skipDuplicates: true,
  });
  return count;
}
