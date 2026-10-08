import { forbiddenOtherRecord } from './actor.util.js';
import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import { choiceGroupWarnings, type ChoiceGroupRule, type Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import type {
  ClassRegistrationGridResponseDto,
  RegistrationChangeDto,
  StudentSubjectRegistrationListResponseDto,
  StudentSubjectRegistrationResponseDto,
} from './dto/student-subject-registration.dto.js';

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
  classSubject: { kind: string; subject: { name: string; code: string } };
}): StudentSubjectRegistrationResponseDto {
  return {
    id: registration.id,
    studentEnrollmentId: registration.studentEnrollmentId,
    classSubjectId: registration.classSubjectId,
    subjectName: registration.classSubject.subject.name,
    subjectCode: registration.classSubject.subject.code,
    kind: registration.classSubject.kind as StudentSubjectRegistrationResponseDto['kind'],
    status: registration.status as StudentSubjectRegistrationResponseDto['status'],
    registeredAt: registration.registeredAt.toISOString(),
    deregisteredAt: registration.deregisteredAt ? registration.deregisteredAt.toISOString() : null,
  };
}

const withSubject = {
  classSubject: { include: { subject: { select: { name: true, code: true } } } },
} as const;

/** ADR-0038: every choice group, with its member subjects, in the shape
 * `choiceGroupWarnings` reads. */
async function loadChoiceRules(
  tx: Prisma.TransactionClient,
  schoolId: string,
): Promise<ChoiceGroupRule[]> {
  const groups = await tx.subjectChoiceGroup.findMany({
    where: { schoolId },
    include: { subjects: { select: { id: true } } },
    orderBy: { name: 'asc' },
  });
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    minChoices: g.minChoices,
    maxChoices: g.maxChoices,
    subjectIds: g.subjects.map((x) => x.id),
  }));
}

/** ADR-0011 — StudentSubjectRegistration. Rows are created in bulk when a
 * student is enrolled (`registerNewEnrollment`: compulsory subjects plus
 * any carried over) and when a compulsory offering is added. This service
 * owns the staff-facing side: one student's subjects, and the class subject
 * grid where a whole arm's combinations are set (ADR-0038). Every change is
 * effective for future exams only; no attempt or result references a
 * registration row, so nothing historical moves. */
@Injectable()
export class StudentSubjectRegistrationService {
  constructor(private readonly audit: AuditService) {}

  /** `ownMembershipId`: as `TeacherAssignmentService.listForTeacher`'s
   * (bug audit P2-9). */
  async listForStudent(
    schoolId: string,
    studentProfileId: string,
    ownMembershipId?: string,
  ): Promise<StudentSubjectRegistrationListResponseDto> {
    if (ownMembershipId !== undefined) {
      const profile = await withTenant(prisma, schoolId, (tx) =>
        tx.studentProfile.findUnique({
          where: { id: studentProfileId },
          select: { membershipId: true },
        }),
      );
      if (profile?.membershipId !== ownMembershipId) throw forbiddenOtherRecord();
    }
    return withTenant(prisma, schoolId, async (tx) => {
      const registrations = await tx.studentSubjectRegistration.findMany({
        where: {
          schoolId,
          enrollment: { schoolId, studentProfileId, status: 'ACTIVE' },
        },
        include: withSubject,
        orderBy: { classSubject: { subject: { name: 'asc' } } },
      });
      const enrollment = await tx.studentEnrollment.findFirst({
        where: { schoolId, studentProfileId, status: 'ACTIVE' },
        orderBy: { startDate: 'desc' },
        select: { classId: true },
      });
      const offerings = enrollment
        ? await tx.classSubject.findMany({
            where: { schoolId, classId: enrollment.classId, status: 'ACTIVE' },
            include: { subject: { select: { name: true, code: true } } },
            orderBy: { subject: { name: 'asc' } },
          })
        : [];
      const withRow = new Set(registrations.map((r) => r.classSubjectId));
      const rules = await loadChoiceRules(tx, schoolId);
      return {
        registrations: registrations.map(toResponseDto),
        availableOfferings: offerings
          .filter((o) => !withRow.has(o.id))
          .map((o) => ({
            classSubjectId: o.id,
            subjectName: o.subject.name,
            subjectCode: o.subject.code,
            kind: o.kind,
          })),
        warnings: choiceGroupWarnings(
          rules,
          new Set(offerings.map((o) => o.subjectId)),
          new Set(
            registrations
              .filter((r) => r.status === 'REGISTERED')
              .map((r) => offerings.find((o) => o.id === r.classSubjectId)?.subjectId)
              .filter((id): id is string => id !== undefined),
          ),
        ),
      };
    });
  }

  /** Sets one registration, creating the row for an elective the student
   * never had. Returns null when nothing changed. Must run in `withTenant`. */
  private async apply(
    tx: Prisma.TransactionClient,
    schoolId: string,
    studentEnrollmentId: string,
    classSubjectId: string,
    registered: boolean,
  ): Promise<{ id: string; action: string } | null> {
    const existing = await tx.studentSubjectRegistration.findUnique({
      where: {
        schoolId_studentEnrollmentId_classSubjectId: {
          schoolId,
          studentEnrollmentId,
          classSubjectId,
        },
      },
    });
    if (!existing) {
      if (!registered) return null;
      const created = await tx.studentSubjectRegistration.create({
        data: { schoolId, studentEnrollmentId, classSubjectId },
      });
      return { id: created.id, action: 'STUDENT_SUBJECT_REGISTERED' };
    }
    const status = registered ? 'REGISTERED' : 'DEREGISTERED';
    if (existing.status === status) return null;
    await tx.studentSubjectRegistration.update({
      where: { id: existing.id },
      data: { status, deregisteredAt: registered ? null : new Date() },
    });
    return {
      id: existing.id,
      action: registered ? 'STUDENT_SUBJECT_RE_REGISTERED' : 'STUDENT_SUBJECT_DEREGISTERED',
    };
  }

  private async setStatus(
    schoolId: string,
    studentProfileId: string,
    classSubjectId: string,
    registered: boolean,
    actor: ActorContext,
  ): Promise<StudentSubjectRegistrationResponseDto> {
    const { row, change } = await withTenant(prisma, schoolId, async (tx) => {
      const enrollment = await tx.studentEnrollment.findFirst({
        where: {
          schoolId,
          studentProfileId,
          status: 'ACTIVE',
          classGroupSession: { classSubjects: { some: { id: classSubjectId, status: 'ACTIVE' } } },
        },
        select: { id: true },
      });
      if (!enrollment) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: "This subject is not offered to the student's current class.",
        });
      }
      const change = await this.apply(tx, schoolId, enrollment.id, classSubjectId, registered);
      const row = await tx.studentSubjectRegistration.findUnique({
        where: {
          schoolId_studentEnrollmentId_classSubjectId: {
            schoolId,
            studentEnrollmentId: enrollment.id,
            classSubjectId,
          },
        },
        include: withSubject,
      });
      if (!row) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'No registration found for this student and class-subject.',
        });
      }
      return { row, change };
    });
    if (change) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: change.action,
        entityType: 'StudentSubjectRegistration',
        entityId: change.id,
      });
    }
    return toResponseDto(row);
  }

  async deregister(
    schoolId: string,
    studentProfileId: string,
    classSubjectId: string,
    actor: ActorContext,
  ): Promise<StudentSubjectRegistrationResponseDto> {
    return this.setStatus(schoolId, studentProfileId, classSubjectId, false, actor);
  }

  /** Registers the student, including for an elective they never had. */
  async reRegister(
    schoolId: string,
    studentProfileId: string,
    classSubjectId: string,
    actor: ActorContext,
  ): Promise<StudentSubjectRegistrationResponseDto> {
    return this.setStatus(schoolId, studentProfileId, classSubjectId, true, actor);
  }

  /** ADR-0038 — the class subject grid. Choice-group rules come back as
   * warnings per student; they never block a save. */
  async classGrid(schoolId: string, classId: string): Promise<ClassRegistrationGridResponseDto> {
    return withTenant(prisma, schoolId, async (tx) => {
      const classGroup = await tx.classGroup.findUnique({ where: { id: classId } });
      if (!classGroup) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
      }
      const [offerings, enrollments, rules] = await Promise.all([
        tx.classSubject.findMany({
          where: { schoolId, classId, status: 'ACTIVE' },
          include: {
            subject: {
              select: {
                name: true,
                code: true,
                choiceGroupId: true,
                choiceGroup: { select: { name: true } },
              },
            },
          },
          orderBy: { subject: { name: 'asc' } },
        }),
        tx.studentEnrollment.findMany({
          where: { schoolId, classId, status: 'ACTIVE' },
          include: {
            studentProfile: { include: { membership: { include: { user: true } } } },
            registrations: {
              where: { status: 'REGISTERED' },
              select: { classSubjectId: true },
            },
          },
          orderBy: { studentProfile: { studentId: 'asc' } },
        }),
        loadChoiceRules(tx, schoolId),
      ]);
      const subjectByOffering = new Map(offerings.map((o) => [o.id, o.subjectId]));
      const offered = new Set(offerings.map((o) => o.subjectId));
      return {
        offerings: offerings.map((o) => ({
          classSubjectId: o.id,
          subjectId: o.subjectId,
          subjectName: o.subject.name,
          subjectCode: o.subject.code,
          kind: o.kind,
          choiceGroupId: o.subject.choiceGroupId,
          choiceGroupName: o.subject.choiceGroup?.name ?? null,
        })),
        students: enrollments.map((e) => {
          const registered = e.registrations
            .map((r) => r.classSubjectId)
            .filter((id) => subjectByOffering.has(id));
          return {
            enrollmentId: e.id,
            studentProfileId: e.studentProfileId,
            studentId: e.studentProfile.studentId,
            displayName: e.studentProfile.membership.user.displayName,
            registeredClassSubjectIds: registered,
            warnings: choiceGroupWarnings(
              rules,
              offered,
              new Set(registered.map((id) => subjectByOffering.get(id)!)),
            ),
          };
        }),
      };
    });
  }

  /** ADR-0038 — save ticks from the class subject grid, all in one
   * transaction. Every enrollment and offering must belong to this class
   * and be ACTIVE, or nothing is saved. One audit event per changed row. */
  async updateClassGrid(
    schoolId: string,
    classId: string,
    changes: RegistrationChangeDto[],
    actor: ActorContext,
  ): Promise<{ changed: number }> {
    const applied = await withTenant(prisma, schoolId, async (tx) => {
      const [enrollments, offerings] = await Promise.all([
        tx.studentEnrollment.findMany({
          where: { schoolId, classId, status: 'ACTIVE' },
          select: { id: true },
        }),
        tx.classSubject.findMany({
          where: { schoolId, classId, status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);
      const enrollmentIds = new Set(enrollments.map((e) => e.id));
      const offeringIds = new Set(offerings.map((o) => o.id));
      for (const c of changes) {
        if (!enrollmentIds.has(c.enrollmentId) || !offeringIds.has(c.classSubjectId)) {
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message:
              'A change names a student or subject that is not current in this class. Reload and try again.',
          });
        }
      }
      const done: { id: string; action: string }[] = [];
      for (const c of changes) {
        const change = await this.apply(
          tx,
          schoolId,
          c.enrollmentId,
          c.classSubjectId,
          c.registered,
        );
        if (change) done.push(change);
      }
      return done;
    });
    for (const change of applied) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: change.action,
        entityType: 'StudentSubjectRegistration',
        entityId: change.id,
        metadata: { classId },
      });
    }
    return { changed: applied.length };
  }
}
