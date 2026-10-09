import type { Prisma } from '@atlas/db';

/**
 * ADR-0011 auto-registration for students who are already enrolled: every
 * ACTIVE enrollment is registered for every ACTIVE COMPULSORY `ClassSubject`
 * of its class (ADR-0038: an ELECTIVE offering registers nobody). Enrollment itself registers against the offerings that exist at
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
      kind: 'COMPULSORY',
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

/**
 * ADR-0038: the registrations a new enrollment starts with. It is registered
 * for every ACTIVE COMPULSORY offering of its class, plus any offering (of
 * either kind) whose subject is in `carriedSubjectIds`: the subjects the
 * student was registered for in the enrollment it replaces, on a class move
 * or at rollover. So a student keeps their electives where the new class
 * offers them, and staff only handle what actually changed.
 */
export async function registerNewEnrollment(
  tx: Prisma.TransactionClient,
  schoolId: string,
  enrollment: { id: string; classId: string },
  carriedSubjectIds: ReadonlySet<string> = new Set(),
): Promise<number> {
  const offerings = await tx.classSubject.findMany({
    where: { schoolId, classId: enrollment.classId, status: 'ACTIVE' },
    select: { id: true, kind: true, subjectId: true },
  });
  const data = offerings
    .filter((o) => o.kind === 'COMPULSORY' || carriedSubjectIds.has(o.subjectId))
    .map((o) => ({ schoolId, studentEnrollmentId: enrollment.id, classSubjectId: o.id }));
  if (data.length === 0) return 0;
  const { count } = await tx.studentSubjectRegistration.createMany({
    data,
    skipDuplicates: true,
  });
  return count;
}

/** The subjects an enrollment is currently REGISTERED for, to carry into
 * the enrollment that replaces it (`registerNewEnrollment`). */
export async function registeredSubjectIds(
  tx: Prisma.TransactionClient,
  schoolId: string,
  studentEnrollmentId: string,
): Promise<Set<string>> {
  const rows = await tx.studentSubjectRegistration.findMany({
    where: { schoolId, studentEnrollmentId, status: 'REGISTERED' },
    select: { classSubject: { select: { subjectId: true } } },
  });
  return new Set(rows.map((r) => r.classSubject.subjectId));
}
