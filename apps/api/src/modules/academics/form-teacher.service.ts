import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import type { FormTeacherEntryDto, MyFormClassDto } from './dto/form-teacher.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

const toDate = (d: Date) => d.toISOString().slice(0, 10);

/** ADR-0038 amendment (2026-10-09) — a class's form teachers. A form teacher
 * may set the electives of every student in that arm
 * (`registration-scope.util.ts`). Removing one ends the row rather than
 * deleting it, so who held the role stays on record. */
@Injectable()
export class FormTeacherService {
  constructor(private readonly audit: AuditService) {}

  async listForClass(schoolId: string, classId: string): Promise<FormTeacherEntryDto[]> {
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.formTeacherAssignment.findMany({
        where: { schoolId, classId, status: 'ACTIVE' },
        include: { teacherProfile: { include: { membership: { include: { user: true } } } } },
        orderBy: { createdAt: 'asc' },
      }),
    );
    return rows.map((r) => ({
      id: r.id,
      teacherProfileId: r.teacherProfileId,
      displayName: r.teacherProfile.membership.user.displayName,
      staffId: r.teacherProfile.staffId,
      startDate: toDate(r.startDate),
    }));
  }

  async replaceForClass(
    schoolId: string,
    classId: string,
    teacherProfileIds: string[],
    actor: ActorContext,
  ): Promise<FormTeacherEntryDto[]> {
    const desired = new Set(teacherProfileIds);
    const changes = await withTenant(prisma, schoolId, async (tx) => {
      const classGroup = await tx.classGroup.findUnique({ where: { id: classId } });
      if (!classGroup || classGroup.schoolId !== schoolId) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
      }
      if (desired.size > 0) {
        const teachers = await tx.teacherProfile.findMany({
          where: { schoolId, id: { in: [...desired] }, employmentStatus: 'ACTIVE' },
          select: { id: true },
        });
        if (teachers.length !== desired.size) {
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message: 'Every form teacher must be an active teacher in this school.',
          });
        }
      }
      const current = await tx.formTeacherAssignment.findMany({
        where: { schoolId, classId, status: 'ACTIVE' },
      });
      const done: { id: string; action: string; teacherProfileId: string }[] = [];
      for (const row of current) {
        if (desired.has(row.teacherProfileId)) continue;
        await tx.formTeacherAssignment.update({
          where: { id: row.id },
          data: { status: 'ENDED', endDate: new Date() },
        });
        done.push({
          id: row.id,
          action: 'FORM_TEACHER_ENDED',
          teacherProfileId: row.teacherProfileId,
        });
      }
      const kept = new Set(current.map((r) => r.teacherProfileId));
      for (const teacherProfileId of desired) {
        if (kept.has(teacherProfileId)) continue;
        const created = await tx.formTeacherAssignment.create({
          data: { schoolId, classId, teacherProfileId },
        });
        done.push({ id: created.id, action: 'FORM_TEACHER_ASSIGNED', teacherProfileId });
      }
      return done;
    });
    for (const change of changes) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: change.action,
        entityType: 'FormTeacherAssignment',
        entityId: change.id,
        metadata: { classId, teacherProfileId: change.teacherProfileId },
      });
    }
    return this.listForClass(schoolId, classId);
  }

  /** The caller's own form classes, for Teacher › My classes: not ones in a
   * closed or archived session. */
  async listForCurrentTeacher(schoolId: string, membershipId: string): Promise<MyFormClassDto[]> {
    return withTenant(prisma, schoolId, async (tx) => {
      const profile = await tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId } },
        select: { id: true },
      });
      if (!profile) return [];
      const rows = await tx.formTeacherAssignment.findMany({
        where: {
          schoolId,
          teacherProfileId: profile.id,
          status: 'ACTIVE',
          classGroup: { status: 'ACTIVE', session: { status: { notIn: ['CLOSED', 'ARCHIVED'] } } },
        },
        include: { classGroup: true },
        orderBy: { classGroup: { name: 'asc' } },
      });
      return rows.map((r) => ({
        classId: r.classId,
        className: r.classGroup.name,
        level: r.classGroup.level,
        arm: r.classGroup.arm,
        academicSessionId: r.classGroup.academicSessionId,
      }));
    });
  }
}
