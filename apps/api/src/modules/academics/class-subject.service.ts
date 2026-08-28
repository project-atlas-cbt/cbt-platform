import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type { ClassSubjectResponseDto, CreateClassSubjectDto } from './dto/class-subject.dto.js';

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

    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.classSubject.create({
            data: {
              schoolId,
              classId,
              subjectId: dto.subjectId,
              academicSessionId: classGroup.academicSessionId,
            },
          }),
        ),
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
