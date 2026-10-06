import { forbiddenOtherRecord } from './actor.util.js';
import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import type { StudentSubjectRegistrationResponseDto } from './dto/student-subject-registration.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(registration: {
  id: string;
  studentEnrollmentId: string;
  classSubjectId: string;
  status: string;
  registeredAt: Date;
  deregisteredAt: Date | null;
  classSubject: { subject: { name: string; code: string } };
}): StudentSubjectRegistrationResponseDto {
  return {
    id: registration.id,
    studentEnrollmentId: registration.studentEnrollmentId,
    classSubjectId: registration.classSubjectId,
    subjectName: registration.classSubject.subject.name,
    subjectCode: registration.classSubject.subject.code,
    status: registration.status as StudentSubjectRegistrationResponseDto['status'],
    registeredAt: registration.registeredAt.toISOString(),
    deregisteredAt: registration.deregisteredAt ? registration.deregisteredAt.toISOString() : null,
  };
}

/** ADR-0011 — StudentSubjectRegistration. Rows themselves are created in
 * bulk by StudentEnrollmentService.enroll() (auto-registration on
 * enroll/move); this service owns the Moderator-facing deregister/
 * re-register capability and listing, per the ADR's own "a Moderator can
 * deregister a student from an elective, and re-register them." */
@Injectable()
export class StudentSubjectRegistrationService {
  constructor(private readonly audit: AuditService) {}

  /** `ownMembershipId`: as `TeacherAssignmentService.listForTeacher`'s
   * (bug audit P2-9). */
  async listForStudent(
    schoolId: string,
    studentProfileId: string,
    ownMembershipId?: string,
  ): Promise<StudentSubjectRegistrationResponseDto[]> {
    if (ownMembershipId !== undefined) {
      const profile = await withTenant(prisma, schoolId, (tx) =>
        tx.studentProfile.findUnique({
          where: { id: studentProfileId },
          select: { membershipId: true },
        }),
      );
      if (profile?.membershipId !== ownMembershipId) throw forbiddenOtherRecord();
    }
    const registrations = await withTenant(prisma, schoolId, (tx) =>
      tx.studentSubjectRegistration.findMany({
        where: {
          schoolId,
          enrollment: { schoolId, studentProfileId, status: 'ACTIVE' },
        },
        include: { classSubject: { include: { subject: { select: { name: true, code: true } } } } },
        orderBy: { classSubject: { subject: { name: 'asc' } } },
      }),
    );
    return registrations.map(toResponseDto);
  }

  private async setStatus(
    schoolId: string,
    studentProfileId: string,
    classSubjectId: string,
    status: 'REGISTERED' | 'DEREGISTERED',
    action: string,
    actor: ActorContext,
  ): Promise<StudentSubjectRegistrationResponseDto> {
    const updated = await withTenant(prisma, schoolId, async (tx) => {
      const registration = await tx.studentSubjectRegistration.findFirst({
        where: {
          schoolId,
          classSubjectId,
          enrollment: { schoolId, studentProfileId, status: 'ACTIVE' },
        },
        include: { classSubject: { include: { subject: { select: { name: true, code: true } } } } },
      });
      if (!registration) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'No registration found for this student and class-subject.',
        });
      }
      return tx.studentSubjectRegistration.update({
        where: { id: registration.id },
        data: {
          status,
          deregisteredAt: status === 'DEREGISTERED' ? new Date() : null,
        },
        include: { classSubject: { include: { subject: { select: { name: true, code: true } } } } },
      });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action,
      entityType: 'StudentSubjectRegistration',
      entityId: updated.id,
    });
    return toResponseDto(updated);
  }

  /** Effective for future exams only — no historical attempt/result ever
   * references a registration row directly (ADR-0011), so nothing
   * retroactive needs reconciling. */
  async deregister(
    schoolId: string,
    studentProfileId: string,
    classSubjectId: string,
    actor: ActorContext,
  ): Promise<StudentSubjectRegistrationResponseDto> {
    return this.setStatus(
      schoolId,
      studentProfileId,
      classSubjectId,
      'DEREGISTERED',
      'STUDENT_SUBJECT_DEREGISTERED',
      actor,
    );
  }

  async reRegister(
    schoolId: string,
    studentProfileId: string,
    classSubjectId: string,
    actor: ActorContext,
  ): Promise<StudentSubjectRegistrationResponseDto> {
    return this.setStatus(
      schoolId,
      studentProfileId,
      classSubjectId,
      'REGISTERED',
      'STUDENT_SUBJECT_RE_REGISTERED',
      actor,
    );
  }
}
