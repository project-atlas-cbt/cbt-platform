import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import { changeEnrollmentStream } from './subject-registration-sync.util.js';
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
  defaultStreamId: string | null;
  defaultStream?: { name: string } | null;
  name: string;
  level: string;
  arm: string;
  status: string;
}): ClassGroupResponseDto {
  return {
    id: classGroup.id,
    academicSessionId: classGroup.academicSessionId,
    defaultStreamId: classGroup.defaultStreamId,
    defaultStreamName: classGroup.defaultStream?.name ?? null,
    name: classGroup.name,
    level: classGroup.level as ClassGroupResponseDto['level'],
    arm: classGroup.arm,
    status: classGroup.status as ClassGroupResponseDto['status'],
  };
}

const withStream = { defaultStream: { select: { name: true } } } as const;

/** ADR-0038: a class's default stream must be an ACTIVE stream of the
 * school. Null clears it. */
async function assertUsableStream(schoolId: string, streamId: string | null | undefined) {
  if (!streamId) return;
  const stream = await withTenant(prisma, schoolId, (tx) =>
    tx.stream.findUnique({ where: { id: streamId } }),
  );
  if (!stream) throw new AppHttpException({ code: 'NOT_FOUND', message: 'Stream not found.' });
  if (stream.status !== 'ACTIVE')
    throw new AppHttpException({
      code: 'VALIDATION_ERROR',
      message: `The ${stream.name} stream is retired; choose an active stream.`,
    });
}

/** `academics.v1` — ClassGroup CRUD-with-archival. Session-scoped
 * (`07 §6.4`): "SS2A 2026/27" and "SS2A 2027/28" are distinct rows. */
@Injectable()
export class ClassGroupService {
  constructor(private readonly audit: AuditService) {}

  async list(
    schoolId: string,
    academicSessionId?: string,
    departmentId?: string,
  ): Promise<ClassGroupResponseDto[]> {
    const classGroups = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findMany({
        where: {
          schoolId,
          ...(academicSessionId !== undefined && { academicSessionId }),
          // ADR-0038: a class belongs to a department only through the
          // subjects it offers.
          ...(departmentId !== undefined && {
            classSubjects: { some: { subject: { departmentId } } },
          }),
        },
        orderBy: [{ level: 'asc' }, { arm: 'asc' }],
        include: withStream,
      }),
    );
    return classGroups.map(toResponseDto);
  }

  async get(schoolId: string, id: string): Promise<ClassGroupResponseDto> {
    const classGroup = await withTenant(prisma, schoolId, (tx) =>
      tx.classGroup.findUnique({ where: { id }, include: withStream }),
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
    await assertUsableStream(schoolId, dto.defaultStreamId);

    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.classGroup.create({
            data: {
              schoolId,
              academicSessionId: dto.academicSessionId,
              defaultStreamId: dto.defaultStreamId ?? null,
              name: dto.name,
              level: dto.level,
              arm: dto.arm,
            },
            include: withStream,
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
    await assertUsableStream(schoolId, dto.defaultStreamId);
    const placeInStream = dto.placeStudentsWithoutStream ? dto.defaultStreamId : null;
    const updated = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, async (tx) => {
          const row = await tx.classGroup.update({
            where: { id },
            include: withStream,
            data: {
              ...(dto.defaultStreamId !== undefined && { defaultStreamId: dto.defaultStreamId }),
              ...(dto.name !== undefined && { name: dto.name }),
              ...(dto.level !== undefined && { level: dto.level }),
              ...(dto.arm !== undefined && { arm: dto.arm }),
            },
          });
          if (placeInStream) await this.placeUnstreamed(tx, schoolId, id, placeInStream, actor);
          return row;
        }),
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

  /**
   * ADR-0038: when a class gets a stream, its current students who are in
   * no stream join it, each audited as a stream change like one made on the
   * student's page. Students already in a stream are left alone.
   */
  private async placeUnstreamed(
    tx: Prisma.TransactionClient,
    schoolId: string,
    classId: string,
    streamId: string,
    actor: ActorContext,
  ): Promise<void> {
    const enrollments = await tx.studentEnrollment.findMany({
      where: {
        schoolId,
        classId,
        status: 'ACTIVE',
        streamId: null,
        session: { status: { notIn: ['CLOSED', 'ARCHIVED'] } },
      },
    });
    for (const enrollment of enrollments) {
      const changes = await changeEnrollmentStream(tx, schoolId, enrollment, streamId);
      const base = { schoolId, actorUserId: actor.actorUserId, actorRole: actor.actorRole };
      await this.audit.recordInTx(tx, {
        ...base,
        action: 'STUDENT_STREAM_CHANGED',
        entityType: 'StudentEnrollment',
        entityId: enrollment.id,
        metadata: { fromStreamId: null, toStreamId: streamId, viaClass: true },
      });
      for (const change of changes) {
        await this.audit.recordInTx(tx, {
          ...base,
          action: change.action,
          entityType: 'StudentSubjectRegistration',
          entityId: change.id,
          metadata: { reason: 'STREAM_CHANGED' },
        });
      }
    }
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
      // B6: count ALL StudentEnrollment rows referencing the class, not
      // only ACTIVE ones — the DB-level onDelete: Restrict on
      // StudentEnrollment.classGroupSession blocks deletion regardless of
      // status, so this friendly pre-check matches that condition exactly
      // (the same reasoning Department's own check already applies: all
      // classGroups/subjects are counted, not just active ones).
      const [classSubjects, studentEnrollments] = await Promise.all([
        tx.classSubject.count({ where: { schoolId, classId: id } }),
        tx.studentEnrollment.count({ where: { schoolId, classId: id } }),
      ]);
      assertNoDependents('class', {
        'class-subject offering': classSubjects,
        'student enrollment': studentEnrollments,
      });
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
