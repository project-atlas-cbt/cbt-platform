import type { Prisma } from '@atlas/db';

/** ADR-0038: does this offering register this enrollment automatically?
 * A COMPULSORY offering registers everyone; an ELECTIVE one registers the
 * students in its streams, and nobody else. */
export function registersAutomatically(
  offering: { kind: string; streams: { streamId: string }[] },
  streamId: string | null,
): boolean {
  if (offering.kind === 'COMPULSORY') return true;
  return streamId !== null && offering.streams.some((s) => s.streamId === streamId);
}

const withStreams = { streams: { select: { streamId: true } } } as const;

/**
 * ADR-0011 auto-registration for students who are already enrolled: every
 * ACTIVE enrollment is registered for every ACTIVE offering of its class
 * that registers it automatically (ADR-0038: COMPULSORY, or ELECTIVE in the
 * student's stream). Enrollment itself registers against the offerings that
 * exist at that moment (`StudentEnrollmentService.enroll()`); this covers
 * the other order, a subject offered (or made compulsory, or given a
 * stream) *after* its students were enrolled or imported, which otherwise
 * left those students unregistered and so ineligible for its exams.
 *
 * A pair that already has a row is skipped whatever its status, so a
 * Moderator's deregistration stands. Must run inside a `withTenant`
 * transaction. Returns the number of registrations created.
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
      OR: [{ kind: 'COMPULSORY' }, { streams: { some: {} } }],
      ...(scope.classSubjectId ? { id: scope.classSubjectId } : {}),
    },
    select: { id: true, classId: true, kind: true, ...withStreams },
  });
  if (offerings.length === 0) return 0;

  const enrollments = await tx.studentEnrollment.findMany({
    where: {
      schoolId,
      status: 'ACTIVE',
      classId: { in: [...new Set(offerings.map((o) => o.classId))] },
    },
    select: { id: true, classId: true, streamId: true },
  });
  const enrollmentsByClass = new Map<string, { id: string; streamId: string | null }[]>();
  for (const e of enrollments) {
    const list = enrollmentsByClass.get(e.classId) ?? [];
    list.push(e);
    enrollmentsByClass.set(e.classId, list);
  }

  const data = offerings.flatMap((offering) =>
    (enrollmentsByClass.get(offering.classId) ?? [])
      .filter((e) => registersAutomatically(offering, e.streamId))
      .map((e) => ({ schoolId, studentEnrollmentId: e.id, classSubjectId: offering.id })),
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
 * for every ACTIVE offering of its class that registers it automatically
 * (compulsory, or in its stream), plus any offering whose subject is in
 * `carriedSubjectIds`: the subjects the student was registered for in the
 * enrollment it replaces, on a class move or at rollover. So a student keeps
 * their electives where the new class offers them, and staff only handle
 * what actually changed.
 */
export async function registerNewEnrollment(
  tx: Prisma.TransactionClient,
  schoolId: string,
  enrollment: { id: string; classId: string; streamId: string | null },
  carriedSubjectIds: ReadonlySet<string> = new Set(),
): Promise<number> {
  const offerings = await tx.classSubject.findMany({
    where: { schoolId, classId: enrollment.classId, status: 'ACTIVE' },
    select: { id: true, kind: true, subjectId: true, ...withStreams },
  });
  const data = offerings
    .filter(
      (o) => registersAutomatically(o, enrollment.streamId) || carriedSubjectIds.has(o.subjectId),
    )
    .map((o) => ({ schoolId, studentEnrollmentId: enrollment.id, classSubjectId: o.id }));
  if (data.length === 0) return 0;
  const { count } = await tx.studentSubjectRegistration.createMany({
    data,
    skipDuplicates: true,
  });
  return count;
}

/**
 * ADR-0038: move an ACTIVE enrollment to another stream (or none). The
 * student is registered for the class's offerings in the new stream, and
 * deregistered from those that were theirs only through the old stream.
 * Compulsory subjects and hand-picked electives are untouched, and past
 * attempts and results never change: registrations decide future exams
 * only. Returns the registration rows it changed, for the caller's audit.
 */
export async function changeEnrollmentStream(
  tx: Prisma.TransactionClient,
  schoolId: string,
  enrollment: { id: string; classId: string; streamId: string | null },
  newStreamId: string | null,
): Promise<{ id: string; action: string }[]> {
  if (enrollment.streamId === newStreamId) return [];
  await tx.studentEnrollment.update({
    where: { id: enrollment.id },
    data: { streamId: newStreamId },
  });
  const offerings = await tx.classSubject.findMany({
    where: { schoolId, classId: enrollment.classId, status: 'ACTIVE', kind: 'ELECTIVE' },
    select: { id: true, kind: true, ...withStreams },
  });
  const existing = new Map(
    (
      await tx.studentSubjectRegistration.findMany({
        where: { schoolId, studentEnrollmentId: enrollment.id },
        select: { id: true, classSubjectId: true, status: true },
      })
    ).map((r) => [r.classSubjectId, r]),
  );
  const changed: { id: string; action: string }[] = [];
  for (const o of offerings) {
    const before = registersAutomatically(o, enrollment.streamId);
    const after = registersAutomatically(o, newStreamId);
    const row = existing.get(o.id);
    if (after && !before) {
      if (!row) {
        const created = await tx.studentSubjectRegistration.create({
          data: { schoolId, studentEnrollmentId: enrollment.id, classSubjectId: o.id },
        });
        changed.push({ id: created.id, action: 'STUDENT_SUBJECT_REGISTERED' });
      } else if (row.status !== 'REGISTERED') {
        await tx.studentSubjectRegistration.update({
          where: { id: row.id },
          data: { status: 'REGISTERED', deregisteredAt: null },
        });
        changed.push({ id: row.id, action: 'STUDENT_SUBJECT_RE_REGISTERED' });
      }
    } else if (before && !after && row?.status === 'REGISTERED') {
      await tx.studentSubjectRegistration.update({
        where: { id: row.id },
        data: { status: 'DEREGISTERED', deregisteredAt: new Date() },
      });
      changed.push({ id: row.id, action: 'STUDENT_SUBJECT_DEREGISTERED' });
    }
  }
  return changed;
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
