import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import { registerEnrolledStudentsForOfferings } from './subject-registration-sync.util.js';
import type {
  ClassSubjectResponseDto,
  CreateClassSubjectDto,
  UpdateClassSubjectDto,
} from './dto/class-subject.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

/** `academics.v1` — ClassSubject ("offerings"): `07 §6.6`, the future
 * registration target for B6's StudentSubjectRegistration (ADR-0011). */
@Injectable()
export class ClassSubjectService {
  constructor(private readonly audit: AuditService) {}

  async listForClass(schoolId: string, classId: string): Promise<ClassSubjectResponseDto[]> {
    const offerings = await withTenant(prisma, schoolId, (tx) =>
      tx.classSubject.findMany({
        where: { schoolId, classId },
        include: { subject: { select: { name: true, code: true } } },
        orderBy: { subject: { name: 'asc' } },
      }),
    );
    return offerings.map((o) => ({
      id: o.id,
      classId: o.classId,
      subjectId: o.subjectId,
      subjectName: o.subject.name,
      subjectCode: o.subject.code,
      academicSessionId: o.academicSessionId,
      status: o.status,
      kind: o.kind,
    }));
  }

  /** `academicSessionId` is not accepted from the client — derived from the
   * class's own session, which is exactly what the composite FK to
   * `ClassGroup(schoolId, id, academicSessionId)` requires to agree
   * (D-10, roadmap DoD item 7). */
  async create(
    schoolId: string,
    classId: string,
    dto: CreateClassSubjectDto,
    actor: ActorContext,
  ): Promise<ClassSubjectResponseDto> {
    const classGroup = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findUnique({ where: { id: classId } }),
    );
    if (!classGroup) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
    }
    const subject = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findUnique({ where: { id: dto.subjectId } }),
    );
    if (!subject) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Subject not found.' });
    }

    // The offering and its registrations commit together: students already
    // enrolled in the class (by hand or by bulk import) are registered for
    // a new compulsory subject at once, so they are eligible for its exams
    // (ADR-0011). An elective registers nobody until staff choose (ADR-0038).
    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, async (tx) => {
          const offering = await tx.classSubject.create({
            data: {
              schoolId,
              classId,
              subjectId: dto.subjectId,
              academicSessionId: classGroup.academicSessionId,
              kind: dto.kind ?? 'COMPULSORY',
            },
          });
          await registerEnrolledStudentsForOfferings(tx, schoolId, {
            classSubjectId: offering.id,
          });
          return offering;
        }),
      'This subject is already offered to this class.',
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'CLASS_SUBJECT_CREATED',
      entityType: 'ClassSubject',
      entityId: created.id,
    });
    return {
      id: created.id,
      classId: created.classId,
      subjectId: created.subjectId,
      subjectName: subject.name,
      subjectCode: subject.code,
      academicSessionId: created.academicSessionId,
      status: created.status,
      kind: created.kind,
    };
  }

  /**
   * ADR-0038: change an offering between compulsory and elective. Making it
   * compulsory registers every enrolled student who has no registration for
   * it yet; a student staff deregistered stays deregistered. Making it
   * elective changes no registration: staff then untick the students who
   * don't take it. Nothing here ever removes a registration.
   */
  async update(
    schoolId: string,
    id: string,
    dto: UpdateClassSubjectDto,
    actor: ActorContext,
  ): Promise<ClassSubjectResponseDto> {
    const updated = await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.classSubject.findUnique({ where: { id } });
      if (!existing) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'Class-subject offering not found.',
        });
      }
      const row = await tx.classSubject.update({
        where: { id },
        data: { kind: dto.kind },
        include: { subject: { select: { name: true, code: true } } },
      });
      if (dto.kind === 'COMPULSORY') {
        await registerEnrolledStudentsForOfferings(tx, schoolId, { classSubjectId: id });
      }
      return { row, changed: existing.kind !== dto.kind };
    });
    if (updated.changed) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: 'CLASS_SUBJECT_KIND_CHANGED',
        entityType: 'ClassSubject',
        entityId: id,
        metadata: { kind: dto.kind },
      });
    }
    const o = updated.row;
    return {
      id: o.id,
      classId: o.classId,
      subjectId: o.subjectId,
      subjectName: o.subject.name,
      subjectCode: o.subject.code,
      academicSessionId: o.academicSessionId,
      status: o.status,
      kind: o.kind,
    };
  }

  async remove(schoolId: string, id: string, actor: ActorContext): Promise<void> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.classSubject.findUnique({ where: { id } });
      if (!existing) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'Class-subject offering not found.',
        });
      }
      // B6: TeacherAssignment and StudentSubjectRegistration both FK against
      // ClassSubject with onDelete: Restrict — this friendly pre-check
      // matches that DB-level condition exactly, the same reasoning as
      // ClassGroupService.delete()'s own B6 extension.
      const [teacherAssignments, registrations] = await Promise.all([
        tx.teacherAssignment.count({ where: { schoolId, classSubjectId: id } }),
        tx.studentSubjectRegistration.count({ where: { schoolId, classSubjectId: id } }),
      ]);
      assertNoDependents('class-subject offering', {
        'teacher assignment': teacherAssignments,
        'student subject registration': registrations,
      });
      await tx.classSubject.delete({ where: { id } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'CLASS_SUBJECT_DELETED',
      entityType: 'ClassSubject',
      entityId: id,
    });
  }
}
