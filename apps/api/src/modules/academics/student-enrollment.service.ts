import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type {
  ClassRosterEntryDto,
  EnrollStudentDto,
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
  startDate: Date;
  endDate: Date | null;
  status: string;
}): StudentEnrollmentResponseDto {
  return {
    id: enrollment.id,
    studentProfileId: enrollment.studentProfileId,
    academicSessionId: enrollment.academicSessionId,
    classId: enrollment.classId,
    startDate: enrollment.startDate.toISOString().slice(0, 10),
    endDate: enrollment.endDate ? enrollment.endDate.toISOString().slice(0, 10) : null,
    status: enrollment.status as StudentEnrollmentResponseDto['status'],
  };
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
        return { enrollment: existing, isNew: false };
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

      const created = await runUniqueGuarded(
        () =>
          tx.studentEnrollment.create({
            data: {
              schoolId,
              studentProfileId,
              academicSessionId: dto.academicSessionId,
              classId: dto.classId,
              startDate: new Date(),
            },
          }),
        'This student already has an active enrollment for this session.',
      );

      // ADR-0011 reconciliation: auto-register the new enrollment for every
      // ACTIVE ClassSubject of the new class. The old enrollment's own
      // registrations are left exactly as they are — they're already
      // historically frozen the moment their enrollment stops being
      // ACTIVE, satisfying "close registrations for subjects the new class
      // doesn't offer" by construction, with no explicit close-loop needed.
      const offerings = await tx.classSubject.findMany({
        where: { schoolId, classId: dto.classId, status: 'ACTIVE' },
        select: { id: true },
      });
      if (offerings.length > 0) {
        await tx.studentSubjectRegistration.createMany({
          data: offerings.map((offering) => ({
            schoolId,
            studentEnrollmentId: created.id,
            classSubjectId: offering.id,
          })),
        });
      }

      return { enrollment: created, isNew: true };
    });

    if (result.isNew) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: 'STUDENT_ENROLLED',
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
    }));
  }
}
