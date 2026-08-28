import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type {
  CreateDepartmentDto,
  DepartmentResponseDto,
  UpdateDepartmentDto,
} from './dto/department.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(department: {
  id: string;
  name: string;
  code: string;
  status: string;
}): DepartmentResponseDto {
  return {
    id: department.id,
    name: department.name,
    code: department.code,
    status: department.status as DepartmentResponseDto['status'],
  };
}

/** `academics.v1` — Department CRUD-with-archival. NOT session-scoped
 * (`07 §6.3`, `03 §7`). */
@Injectable()
export class DepartmentService {
  constructor(private readonly audit: AuditService) {}

  async list(schoolId: string): Promise<DepartmentResponseDto[]> {
    const departments = await withTenant(prisma, schoolId, (tx) =>
      tx.department.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
    );
    return departments.map(toResponseDto);
  }

  async get(schoolId: string, id: string): Promise<DepartmentResponseDto> {
    const department = await withTenant(prisma, schoolId, (tx) =>
      tx.department.findUnique({ where: { id } }),
    );
    if (!department) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
    }
    return toResponseDto(department);
  }

  async create(
    schoolId: string,
    dto: CreateDepartmentDto,
    actor: ActorContext,
  ): Promise<DepartmentResponseDto> {
    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.department.create({ data: { schoolId, name: dto.name, code: dto.code } }),
        ),
      `A department with code "${dto.code}" already exists.`,
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'DEPARTMENT_CREATED',
      entityType: 'Department',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  async update(
    schoolId: string,
    id: string,
    dto: UpdateDepartmentDto,
    actor: ActorContext,
  ): Promise<DepartmentResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.department.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
    }
    const updated = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.department.update({
            where: { id },
            data: {
              ...(dto.name !== undefined && { name: dto.name }),
              ...(dto.code !== undefined && { code: dto.code }),
            },
          }),
        ),
      'A department with this code already exists.',
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'DEPARTMENT_UPDATED',
      entityType: 'Department',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  /** FR AC-03 / `07 §40`: deactivate, never delete, while history exists —
   * always allowed regardless of dependents. */
  async deactivate(
    schoolId: string,
    id: string,
    actor: ActorContext,
  ): Promise<DepartmentResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.department.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
    }
    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.department.update({ where: { id }, data: { status: 'INACTIVE' } }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'DEPARTMENT_DEACTIVATED',
      entityType: 'Department',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  async delete(schoolId: string, id: string, actor: ActorContext): Promise<void> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.department.findUnique({ where: { id } });
      if (!existing) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
      }
      const [subjects, classGroups, hodAssignments] = await Promise.all([
        tx.subject.count({ where: { schoolId, departmentId: id } }),
        tx.classGroup.count({ where: { schoolId, departmentId: id } }),
        tx.hODAssignment.count({ where: { schoolId, departmentId: id } }),
      ]);
      assertNoDependents('department', {
        subject: subjects,
        class: classGroups,
        'HOD assignment': hodAssignments,
      });
      await tx.department.delete({ where: { id } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'DEPARTMENT_DELETED',
      entityType: 'Department',
      entityId: id,
    });
  }
}
