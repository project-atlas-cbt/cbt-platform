import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type { CreateSubjectDto, SubjectResponseDto, UpdateSubjectDto } from './dto/subject.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(subject: {
  id: string;
  name: string;
  code: string;
  departmentId: string | null;
  status: string;
}): SubjectResponseDto {
  return {
    id: subject.id,
    name: subject.name,
    code: subject.code,
    departmentId: subject.departmentId,
    status: subject.status as SubjectResponseDto['status'],
  };
}

/** `academics.v1` — Subject CRUD-with-archival. NOT session-scoped
 * (`07 §6.5`). `departmentId` nullable per ADR-0001 — DoD item 6 (HOD
 * subject scope) depends on this field's correctness. */
@Injectable()
export class SubjectService {
  constructor(private readonly audit: AuditService) {}

  async list(schoolId: string): Promise<SubjectResponseDto[]> {
    const subjects = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findMany({ where: { schoolId }, orderBy: { name: 'asc' } }),
    );
    return subjects.map(toResponseDto);
  }

  async get(schoolId: string, id: string): Promise<SubjectResponseDto> {
    const subject = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findUnique({ where: { id } }),
    );
    if (!subject) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Subject not found.' });
    }
    return toResponseDto(subject);
  }

  async create(
    schoolId: string,
    dto: CreateSubjectDto,
    actor: ActorContext,
  ): Promise<SubjectResponseDto> {
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
          tx.subject.create({
            data: {
              schoolId,
              name: dto.name,
              code: dto.code,
              departmentId: dto.departmentId ?? null,
            },
          }),
        ),
      `A subject with code "${dto.code}" already exists.`,
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'SUBJECT_CREATED',
      entityType: 'Subject',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  async update(
    schoolId: string,
    id: string,
    dto: UpdateSubjectDto,
    actor: ActorContext,
  ): Promise<SubjectResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Subject not found.' });
    }
    if (dto.departmentId) {
      const department = await withTenant(prisma, schoolId, (tx) =>
        tx.department.findUnique({ where: { id: dto.departmentId as string } }),
      );
      if (!department) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
      }
    }
    const updated = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.subject.update({
            where: { id },
            data: {
              ...(dto.name !== undefined && { name: dto.name }),
              ...(dto.code !== undefined && { code: dto.code }),
              ...(dto.departmentId !== undefined && { departmentId: dto.departmentId }),
            },
          }),
        ),
      'A subject with this code already exists.',
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'SUBJECT_UPDATED',
      entityType: 'Subject',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  /** FR AC-05: "A subject being deactivated must not break historical
   * exams" — always allowed, never dependent-checked. */
  async deactivate(schoolId: string, id: string, actor: ActorContext): Promise<SubjectResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Subject not found.' });
    }
    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.subject.update({ where: { id }, data: { status: 'INACTIVE' } }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'SUBJECT_DEACTIVATED',
      entityType: 'Subject',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  async delete(schoolId: string, id: string, actor: ActorContext): Promise<void> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.subject.findUnique({ where: { id } });
      if (!existing) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Subject not found.' });
      }
      const classSubjects = await tx.classSubject.count({ where: { schoolId, subjectId: id } });
      assertNoDependents('subject', { 'class-subject offering': classSubjects });
      await tx.subject.delete({ where: { id } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'SUBJECT_DELETED',
      entityType: 'Subject',
      entityId: id,
    });
  }
}
