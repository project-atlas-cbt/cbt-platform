import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
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

const withDisplay = {
  subject: { select: { name: true, code: true } },
  streams: { select: { streamId: true, stream: { select: { name: true } } } },
} as const;

type OfferingRow = Prisma.ClassSubjectGetPayload<{ include: typeof withDisplay }>;

function toResponseDto(o: OfferingRow): ClassSubjectResponseDto {
  const streams = [...o.streams].sort((a, b) => a.stream.name.localeCompare(b.stream.name));
  return {
    id: o.id,
    classId: o.classId,
    subjectId: o.subjectId,
    subjectName: o.subject.name,
    subjectCode: o.subject.code,
    academicSessionId: o.academicSessionId,
    status: o.status,
    kind: o.kind,
    streamIds: streams.map((s) => s.streamId),
    streamNames: streams.map((s) => s.stream.name),
  };
}

/** ADR-0038: an offering's automatic streams apply to ELECTIVE offerings
 * only, and must be ACTIVE streams of the school. Returns the de-duplicated
 * list. Must run in `withTenant`. */
async function checkStreams(
  tx: Prisma.TransactionClient,
  schoolId: string,
  kind: string,
  streamIds: string[],
): Promise<string[]> {
  const ids = [...new Set(streamIds)];
  if (ids.length === 0) return ids;
  if (kind !== 'ELECTIVE')
    throw new AppHttpException({
      code: 'VALIDATION_ERROR',
      message: 'Only an elective subject can be given streams; a compulsory one is for everyone.',
    });
  const streams = await tx.stream.findMany({ where: { schoolId, id: { in: ids } } });
  if (streams.length !== ids.length)
    throw new AppHttpException({ code: 'NOT_FOUND', message: 'Stream not found.' });
  const retired = streams.find((s) => s.status !== 'ACTIVE');
  if (retired)
    throw new AppHttpException({
      code: 'VALIDATION_ERROR',
      message: `The ${retired.name} stream is retired; choose an active stream.`,
    });
  return ids;
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
        include: withDisplay,
        orderBy: { subject: { name: 'asc' } },
      }),
    );
    return offerings.map(toResponseDto);
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
    // (ADR-0011). An elective registers the students in its streams, and
    // nobody else until staff choose (ADR-0038).
    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, async (tx) => {
          const kind = dto.kind ?? 'COMPULSORY';
          const streamIds = await checkStreams(tx, schoolId, kind, dto.streamIds ?? []);
          const offering = await tx.classSubject.create({
            data: {
              schoolId,
              classId,
              subjectId: dto.subjectId,
              academicSessionId: classGroup.academicSessionId,
              kind,
            },
          });
          if (streamIds.length > 0)
            await tx.classSubjectStream.createMany({
              data: streamIds.map((streamId) => ({
                schoolId,
                classSubjectId: offering.id,
                streamId,
              })),
            });
          await registerEnrolledStudentsForOfferings(tx, schoolId, {
            classSubjectId: offering.id,
          });
          return tx.classSubject.findUniqueOrThrow({
            where: { id: offering.id },
            include: withDisplay,
          });
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
    return toResponseDto(created);
  }

  /**
   * ADR-0038: change who takes an offering. Making it compulsory, or giving
   * an elective a stream, registers every enrolled student it now covers who
   * has no registration for it yet; a student staff deregistered stays
   * deregistered. Making it elective, or removing a stream, changes no
   * registration: staff then untick the students who don't take it.
   * Nothing here ever removes a registration.
   */
  async update(
    schoolId: string,
    id: string,
    dto: UpdateClassSubjectDto,
    actor: ActorContext,
  ): Promise<ClassSubjectResponseDto> {
    const updated = await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.classSubject.findUnique({
        where: { id },
        include: { streams: { select: { streamId: true } } },
      });
      if (!existing) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'Class-subject offering not found.',
        });
      }
      const kind = dto.kind ?? existing.kind;
      const before = existing.streams.map((s) => s.streamId).sort();
      const requested =
        kind === 'COMPULSORY' && dto.streamIds === undefined ? [] : (dto.streamIds ?? before);
      const streamIds = (await checkStreams(tx, schoolId, kind, requested)).sort();
      const streamsChanged = before.join() !== streamIds.join();
      if (streamsChanged) {
        await tx.classSubjectStream.deleteMany({
          where: { schoolId, classSubjectId: id, streamId: { notIn: streamIds } },
        });
        await tx.classSubjectStream.createMany({
          data: streamIds.map((streamId) => ({ schoolId, classSubjectId: id, streamId })),
          skipDuplicates: true,
        });
      }
      const row = await tx.classSubject.update({
        where: { id },
        data: { kind },
        include: withDisplay,
      });
      await registerEnrolledStudentsForOfferings(tx, schoolId, { classSubjectId: id });
      return { row, kindChanged: existing.kind !== kind, streamsChanged, streamIds };
    });
    if (updated.kindChanged) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: 'CLASS_SUBJECT_KIND_CHANGED',
        entityType: 'ClassSubject',
        entityId: id,
        metadata: { kind: updated.row.kind },
      });
    }
    if (updated.streamsChanged) {
      await this.audit.record({
        schoolId,
        actorUserId: actor.actorUserId,
        actorRole: actor.actorRole,
        action: 'CLASS_SUBJECT_STREAMS_CHANGED',
        entityType: 'ClassSubject',
        entityId: id,
        metadata: { streamIds: updated.streamIds },
      });
    }
    return toResponseDto(updated.row);
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
