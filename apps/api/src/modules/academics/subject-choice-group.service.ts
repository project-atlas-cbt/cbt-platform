import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type {
  CreateSubjectChoiceGroupDto,
  SubjectChoiceGroupResponseDto,
  UpdateSubjectChoiceGroupDto,
} from './dto/subject-choice-group.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(group: {
  id: string;
  name: string;
  minChoices: number;
  maxChoices: number;
  subjects: { id: string }[];
}): SubjectChoiceGroupResponseDto {
  return {
    id: group.id,
    name: group.name,
    minChoices: group.minChoices,
    maxChoices: group.maxChoices,
    subjectIds: group.subjects.map((s) => s.id),
  };
}

function assertRange(minChoices: number, maxChoices: number): void {
  if (minChoices > maxChoices) {
    throw new AppHttpException({
      code: 'VALIDATION_ERROR',
      message: 'The minimum number of choices cannot be more than the maximum.',
    });
  }
}

const withSubjects = { subjects: { select: { id: true }, orderBy: { name: 'asc' } } } as const;

/** ADR-0038 — subject choice groups. A rule that is not met is only ever
 * a warning (class subject grid, student panel); nothing here blocks a
 * registration. */
@Injectable()
export class SubjectChoiceGroupService {
  constructor(private readonly audit: AuditService) {}

  async list(schoolId: string): Promise<SubjectChoiceGroupResponseDto[]> {
    const groups = await withTenant(prisma, schoolId, (tx) =>
      tx.subjectChoiceGroup.findMany({
        where: { schoolId },
        include: withSubjects,
        orderBy: { name: 'asc' },
      }),
    );
    return groups.map(toResponseDto);
  }

  async create(
    schoolId: string,
    dto: CreateSubjectChoiceGroupDto,
    actor: ActorContext,
  ): Promise<SubjectChoiceGroupResponseDto> {
    assertRange(dto.minChoices, dto.maxChoices);
    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.subjectChoiceGroup.create({
            data: {
              schoolId,
              name: dto.name.trim(),
              minChoices: dto.minChoices,
              maxChoices: dto.maxChoices,
            },
            include: withSubjects,
          }),
        ),
      `A choice group named "${dto.name.trim()}" already exists.`,
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'SUBJECT_CHOICE_GROUP_CREATED',
      entityType: 'SubjectChoiceGroup',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  async update(
    schoolId: string,
    id: string,
    dto: UpdateSubjectChoiceGroupDto,
    actor: ActorContext,
  ): Promise<SubjectChoiceGroupResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.subjectChoiceGroup.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Choice group not found.' });
    }
    assertRange(dto.minChoices ?? existing.minChoices, dto.maxChoices ?? existing.maxChoices);
    const updated = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.subjectChoiceGroup.update({
            where: { id },
            data: {
              ...(dto.name !== undefined && { name: dto.name.trim() }),
              ...(dto.minChoices !== undefined && { minChoices: dto.minChoices }),
              ...(dto.maxChoices !== undefined && { maxChoices: dto.maxChoices }),
            },
            include: withSubjects,
          }),
        ),
      'A choice group with this name already exists.',
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'SUBJECT_CHOICE_GROUP_UPDATED',
      entityType: 'SubjectChoiceGroup',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  async remove(schoolId: string, id: string, actor: ActorContext): Promise<void> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.subjectChoiceGroup.findUnique({ where: { id } });
      if (!existing) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Choice group not found.' });
      }
      const subjects = await tx.subject.count({ where: { schoolId, choiceGroupId: id } });
      assertNoDependents('choice group', { subject: subjects });
      await tx.subjectChoiceGroup.delete({ where: { id } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'SUBJECT_CHOICE_GROUP_DELETED',
      entityType: 'SubjectChoiceGroup',
      entityId: id,
    });
  }
}
