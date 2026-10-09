import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import {
  changeEnrollmentStream,
  registerNewEnrollment,
  registeredSubjectIds,
} from './subject-registration-sync.util.js';
import type {
  ClassRosterEntryDto,
  EnrollStudentDto,
  SetStudentStreamDto,
  StudentEnrollmentResponseDto,
} from './dto/student-enrollment.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(enrollment: {
  id: string;
  studentProfileId: string;
  academicSessionId: string;
  classId: string;
  streamId: string | null;
  startDate: Date;
  endDate: Date | null;
  status: string;
}): StudentEnrollmentResponseDto {
  return {
    id: enrollment.id,
    studentProfileId: enrollment.studentProfileId,
    academicSessionId: enrollment.academicSessionId,
    classId: enrollment.classId,
    streamId: enrollment.streamId,
    startDate: enrollment.startDate.toISOString().slice(0, 10),
    endDate: enrollment.endDate ? enrollment.endDate.toISOString().slice(0, 10) : null,
    status: enrollment.status as StudentEnrollmentResponseDto['status'],
  };
}

/** ADR-0038: a stream a student is put in must be an ACTIVE stream of the
 * school. Must run in `withTenant`. */
export async function assertUsableStreamInTx(
  tx: Prisma.TransactionClient,
  streamId: string | null,
): Promise<void> {
  if (!streamId) return;
  const stream = await tx.stream.findUnique({ where: { id: streamId } });
  if (!stream) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Stream not found.' });
  if (stream.status !== 'ACTIVE')
    throw new AppHttpException({
      code: 'VALIDATION_ERROR',
      message: `The ${stream.name} stream is retired; choose an active stream.`,
    });
}

/** `people.v1` — StudentEnrollment (07 §6.7). Session-scoped student
 * placement — never a mutable current_class (07 §35). `enroll()` serves
 * both "enroll" and "move" behind one endpoint, per the roadmap's own
 * wording, and carries the ADR-0011 registration-reconciliation logic. */
@Injectable()
export class StudentEnrollmentService {
  constructor(private readonly audit: AuditService) {}

  /**
   * Enroll a student into a class for a session, or move them to a
   * different class within a session they're already enrolled in — one
   * transaction, matching `SessionService`'s own close-then-activate shape
   * (B5 precedent: plain READ COMMITTED + a partial unique index + row
   * locking is sufficient for "exactly one winner," no SERIALIZABLE
   * needed). DoD item 9's concurrency guarantee is the partial unique index
   * `student_enrollments_one_active_per_session` — a genuine race on a
   * brand-new enrollment (no prior ACTIVE row) is caught here as a P2002
   * via `runUniqueGuarded`.
   */
  async enroll(
    schoolId: string,
    studentProfileId: string,
    dto: EnrollStudentDto,
    actor: ActorContext,
  ): Promise<StudentEnrollmentResponseDto> {
    const result = await withTenant(prisma, schoolId, async (tx) => {
      const classGroup = await tx.classGroup.findUnique({ where: { id: dto.classId } });
      if (!classGroup) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
      }
      if (classGroup.academicSessionId !== dto.academicSessionId) {
        throw new AppHttpException({
          code: 'ACADEMIC_STRUCTURE_SESSION_MISMATCH',
          message: 'The class does not belong to the given academic session.',
        });
      }
      const studentProfile = await tx.studentProfile.findUnique({
        where: { id: studentProfileId },
      });
      if (!studentProfile) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Student not found.' });
      }

      const existing = await tx.studentEnrollment.findFirst({
        where: {
          schoolId,
          studentProfileId,
          academicSessionId: dto.academicSessionId,
          status: 'ACTIVE',
        },
      });

      // Idempotent no-op re-submit — avoid manufacturing a needless
      // CONFLICT when the caller re-sends the same enrollment.
      if (existing && existing.classId === dto.classId) {
        return { enrollment: existing, isNew: false, isMove: false };
      }

      if (!existing) {
        const activeStudentRole = await tx.roleAssignment.findFirst({
          where: {
            schoolId,
            membershipId: studentProfile.membershipId,
            role: 'STUDENT',
            status: 'ACTIVE',
          },
          select: { id: true },
        });
        if (!activeStudentRole) {
          throw new AppHttpException({
            code: 'STUDENT_ENROLLMENT_REQUIRES_ACTIVE_ROLE',
            message: 'The referenced membership does not hold an active STUDENT role assignment.',
          });
        }
      } else {
        // A move: close the old row *before* inserting the new one, in the
        // same transaction — the partial unique index never sees two
        // ACTIVE rows for this (student, session) pair at once.
        await tx.studentEnrollment.update({
          where: { id: existing.id },
          data: { status: 'TRANSFERRED', endDate: new Date() },
        });
      }

      // ADR-0038: the stream given, else the new class's default stream,
      // else (on a move into a mixed arm) the stream the student had.
      const streamId =
        dto.streamId !== undefined
          ? dto.streamId
          : (classGroup.defaultStreamId ?? existing?.streamId ?? null);
      await assertUsableStreamInTx(tx, dto.streamId ?? null);

      const created = await runUniqueGuarded(
        () =>
          tx.studentEnrollment.create({
            data: {
              schoolId,
              studentProfileId,
              academicSessionId: dto.academicSessionId,
              classId: dto.classId,
              streamId,
              startDate: new Date(),
            },
          }),
        'This student already has an active enrollment for this session.',
      );

      // ADR-0011 reconciliation, ADR-0038 rules: the new enrollment is
      // registered for the new class's compulsory subjects, and on a move it
      // keeps the subjects the student was registered for where the new
      // class offers them. The old enrollment's own registrations are left
      // exactly as they are: they're historically frozen the moment their
      // enrollment stops being ACTIVE.
      const carried = existing
        ? await registeredSubjectIds(tx, schoolId, existing.id)
        : new Set<string>();
      await registerNewEnrollment(tx, schoolId, created, carried);

      // isMove: true when this call closed a prior ACTIVE enrollment for a
      // *different* class (07 §35's class-movement case) — distinct from a
      // first-ever enrollment. Both are real, audit-worthy state changes,
      // but conflating them (both previously always emitted
      // STUDENT_ENROLLED) made a class move indistinguishable from an
      // initial enrollment in the audit trail. B10 fix — see
      // packages/domain/src/audit/vocabulary.ts's CLASS_CHANGED entry.
      return { enrollment: created, isNew: true, isMove: existing !== null };
    });

    if (result.isNew) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: result.isMove ? 'CLASS_CHANGED' : 'STUDENT_ENROLLED',
        entityType: 'StudentEnrollment',
        entityId: result.enrollment.id,
      });
    }
    return toResponseDto(result.enrollment);
  }

  async listForStudent(
    schoolId: string,
    studentProfileId: string,
  ): Promise<StudentEnrollmentResponseDto[]> {
    const enrollments = await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.findMany({
        where: { schoolId, studentProfileId },
        orderBy: { startDate: 'desc' },
      }),
    );
    return enrollments.map(toResponseDto);
  }

  /** `GET /v1/classes/:id/students` — the class roster: currently ACTIVE
   * enrollments, enriched with student display fields. */
  async rosterForClass(schoolId: string, classId: string): Promise<ClassRosterEntryDto[]> {
    const enrollments = await withTenant(prisma, schoolId, (tx) =>
      tx.studentEnrollment.findMany({
        where: { schoolId, classId, status: 'ACTIVE' },
        include: {
          studentProfile: { include: { membership: { include: { user: true } } } },
          stream: { select: { name: true } },
        },
        orderBy: { studentProfile: { studentId: 'asc' } },
      }),
    );
    return enrollments.map((enrollment) => ({
      enrollmentId: enrollment.id,
      studentProfileId: enrollment.studentProfileId,
      studentId: enrollment.studentProfile.studentId,
      displayName: enrollment.studentProfile.membership.user.displayName,
      startDate: enrollment.startDate.toISOString().slice(0, 10),
      streamId: enrollment.streamId,
      streamName: enrollment.stream?.name ?? null,
    }));
  }

  /**
   * ADR-0038: put a student's current enrollment in another stream, or
   * none. Registers them for the class's subjects in the new stream and
   * deregisters those they had only through the old one, all in one
   * transaction; compulsory and hand-picked subjects are untouched. Takes
   * effect for future exams only.
   */
  async setStream(
    schoolId: string,
    studentProfileId: string,
    dto: SetStudentStreamDto,
    actor: ActorContext,
  ): Promise<StudentEnrollmentResponseDto> {
    const result = await withTenant(prisma, schoolId, async (tx) => {
      const enrollment = await tx.studentEnrollment.findFirst({
        where: {
          schoolId,
          studentProfileId,
          status: 'ACTIVE',
          session: { status: { notIn: ['CLOSED', 'ARCHIVED'] } },
        },
        orderBy: { startDate: 'desc' },
      });
      if (!enrollment)
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'This student is not in a class this session.',
        });
      await assertUsableStreamInTx(tx, dto.streamId);
      const changes = await changeEnrollmentStream(tx, schoolId, enrollment, dto.streamId);
      const updated = await tx.studentEnrollment.findUniqueOrThrow({
        where: { id: enrollment.id },
      });
      return { from: enrollment.streamId, updated, changes };
    });
    if (result.from !== dto.streamId) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: 'STUDENT_STREAM_CHANGED',
        entityType: 'StudentEnrollment',
        entityId: result.updated.id,
        metadata: { fromStreamId: result.from, toStreamId: dto.streamId },
      });
      for (const change of result.changes) {
        await this.audit.record({
          schoolId,
          actorUserId: actor.actorUserId,
          actorRole: actor.actorRole,
          action: change.action,
          entityType: 'StudentSubjectRegistration',
          entityId: change.id,
          metadata: { reason: 'STREAM_CHANGED' },
        });
      }
    }
    return toResponseDto(result.updated);
  }
}
