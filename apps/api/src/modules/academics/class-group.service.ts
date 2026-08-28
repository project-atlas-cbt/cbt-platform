import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type {
  ClassGroupResponseDto,
  CreateClassGroupDto,
  UpdateClassGroupDto,
} from './dto/class-group.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(classGroup: {
  id: string;
  academicSessionId: string;
  departmentId: string | null;
  name: string;
  level: string;
  arm: string;
  status: string;
}): ClassGroupResponseDto {
  return {
    id: classGroup.id,
    academicSessionId: classGroup.academicSessionId,
    departmentId: classGroup.departmentId,
    name: classGroup.name,
    level: classGroup.level as ClassGroupResponseDto['level'],
    arm: classGroup.arm,
    status: classGroup.status as ClassGroupResponseDto['status'],
  };
}

/** `academics.v1` — ClassGroup CRUD-with-archival. Session-scoped
 * (`07 §6.4`): "SS2A 2026/27" and "SS2A 2027/28" are distinct rows. */
@Injectable()
export class ClassGroupService {
  constructor(private readonly audit: AuditService) {}

  async list(schoolId: string, academicSessionId?: string): Promise<ClassGroupResponseDto[]> {
    const classGroups = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findMany({
        where: { schoolId, ...(academicSessionId !== undefined && { academicSessionId }) },
        orderBy: [{ level: 'asc' }, { arm: 'asc' }],
      }),
    );
    return classGroups.map(toResponseDto);
  }

  async get(schoolId: string, id: string): Promise<ClassGroupResponseDto> {
    const classGroup = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findUnique({ where: { id } }),
    );
    if (!classGroup) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
    }
    return toResponseDto(classGroup);
  }

  async create(
    schoolId: string,
    dto: CreateClassGroupDto,
    actor: ActorContext,
  ): Promise<ClassGroupResponseDto> {
    const session = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.findUnique({ where: { id: dto.academicSessionId } }),
    );
    if (!session) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
    }
    if (dto.departmentId) {
      const department = await withTenant(prisma, schoolId, (tx) =>
        tx.department.findUnique({ where: { id: dto.departmentId as string } }),
      );
      if (!department) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
      }
    }

    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.classGroup.create({
            data: {
              schoolId,
              academicSessionId: dto.academicSessionId,
              departmentId: dto.departmentId ?? null,
              name: dto.name,
              level: dto.level,
              arm: dto.arm,
            },
          }),
        ),
      `A class with level ${dto.level} and arm "${dto.arm}" already exists in this session.`,
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'CLASS_GROUP_CREATED',
      entityType: 'ClassGroup',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  async update(
    schoolId: string,
    id: string,
    dto: UpdateClassGroupDto,
    actor: ActorContext,
  ): Promise<ClassGroupResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
    }
    const updated = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.classGroup.update({
            where: { id },
            data: {
              ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
              ...(dto.name !== undefined && { name: dto.name }),
              ...(dto.level !== undefined && { level: dto.level }),
              ...(dto.arm !== undefined && { arm: dto.arm }),
            },
          }),
        ),
      'A class with this level and arm already exists in this session.',
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'CLASS_GROUP_UPDATED',
      entityType: 'ClassGroup',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  async archive(schoolId: string, id: string, actor: ActorContext): Promise<ClassGroupResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
    }
    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.update({ where: { id }, data: { status: 'ARCHIVED' } }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'CLASS_GROUP_ARCHIVED',
      entityType: 'ClassGroup',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  async delete(schoolId: string, id: string, actor: ActorContext): Promise<void> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.classGroup.findUnique({ where: { id } });
      if (!existing) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Class not found.' });
      }
      // StudentEnrollment doesn't exist until B6 — not checked here. B6
      // must extend this check once it lands (see CLAUDE.md's B5 entry).
      const classSubjects = await tx.classSubject.count({ where: { schoolId, classId: id } });
      assertNoDependents('class', { 'class-subject offering': classSubjects });
      await tx.classGroup.delete({ where: { id } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'CLASS_GROUP_DELETED',
      entityType: 'ClassGroup',
      entityId: id,
    });
  }
}
