import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type { CreateStreamDto, StreamResponseDto, UpdateStreamDto } from './dto/stream.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

const OPEN_SESSION: Prisma.AcademicSessionWhereInput = {
  status: { notIn: ['CLOSED', 'ARCHIVED'] },
};

/** ADR-0038 — student streams, separate from the teaching departments HODs
 * head. A stream in use is retired (INACTIVE), never deleted. */
@Injectable()
export class StreamService {
  constructor(private readonly audit: AuditService) {}

  async list(schoolId: string): Promise<StreamResponseDto[]> {
    return withTenant(prisma, schoolId, async (tx) => {
      const streams = await tx.stream.findMany({ where: { schoolId }, orderBy: { name: 'asc' } });
      return Promise.all(streams.map((s) => this.withCounts(tx, schoolId, s)));
    });
  }

  async create(
    schoolId: string,
    dto: CreateStreamDto,
    actor: ActorContext,
  ): Promise<StreamResponseDto> {
    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.stream.create({
            data: { schoolId, name: dto.name.trim(), code: dto.code.trim().toUpperCase() },
          }),
        ),
      'A stream with this name or code already exists.',
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STREAM_CREATED',
      entityType: 'Stream',
      entityId: created.id,
      metadata: { name: created.name },
    });
    return { ...this.toDto(created), classCount: 0, studentCount: 0 };
  }

  async update(
    schoolId: string,
    id: string,
    dto: UpdateStreamDto,
    actor: ActorContext,
  ): Promise<StreamResponseDto> {
    const updated = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, async (tx) => {
          const existing = await tx.stream.findUnique({ where: { id } });
          if (!existing)
            throw new AppHttpException({ code: 'NOT_FOUND', message: 'Stream not found.' });
          const row = await tx.stream.update({
            where: { id },
            data: {
              ...(dto.name !== undefined && { name: dto.name.trim() }),
              ...(dto.code !== undefined && { code: dto.code.trim().toUpperCase() }),
              ...(dto.status !== undefined && { status: dto.status }),
            },
          });
          return this.withCounts(tx, schoolId, row);
        }),
      'A stream with this name or code already exists.',
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STREAM_UPDATED',
      entityType: 'Stream',
      entityId: id,
      metadata: { ...dto },
    });
    return updated;
  }

  async remove(schoolId: string, id: string, actor: ActorContext): Promise<void> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.stream.findUnique({ where: { id } });
      if (!existing)
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Stream not found.' });
      const [classes, enrollments, offerings] = await Promise.all([
        tx.classGroup.count({ where: { schoolId, defaultStreamId: id } }),
        tx.studentEnrollment.count({ where: { schoolId, streamId: id } }),
        tx.classSubjectStream.count({ where: { schoolId, streamId: id } }),
      ]);
      assertNoDependents('stream', {
        class: classes,
        'student enrollment': enrollments,
        'subject offering': offerings,
      });
      await tx.stream.delete({ where: { id } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'STREAM_DELETED',
      entityType: 'Stream',
      entityId: id,
    });
  }

  private toDto(s: { id: string; name: string; code: string; status: string }) {
    return {
      id: s.id,
      name: s.name,
      code: s.code,
      status: s.status as StreamResponseDto['status'],
    };
  }

  private async withCounts(
    tx: Prisma.TransactionClient,
    schoolId: string,
    s: { id: string; name: string; code: string; status: string },
  ): Promise<StreamResponseDto> {
    const [classCount, studentCount] = await Promise.all([
      tx.classGroup.count({
        where: { schoolId, defaultStreamId: s.id, status: 'ACTIVE', session: OPEN_SESSION },
      }),
      tx.studentEnrollment.count({
        where: { schoolId, streamId: s.id, status: 'ACTIVE', session: OPEN_SESSION },
      }),
    ]);
    return { ...this.toDto(s), classCount, studentCount };
  }
}
