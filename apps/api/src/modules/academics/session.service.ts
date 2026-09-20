import { Injectable } from '@nestjs/common';
import { prisma, withTenant, Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { assertNoDependents } from './archival.util.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type {
  AcademicSessionResponseDto,
  CreateAcademicSessionDto,
  UpdateAcademicSessionDto,
} from './dto/session.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(session: {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
}): AcademicSessionResponseDto {
  return {
    id: session.id,
    name: session.name,
    startDate: session.startDate.toISOString().slice(0, 10),
    endDate: session.endDate.toISOString().slice(0, 10),
    status: session.status as AcademicSessionResponseDto['status'],
  };
}

/**
 * `academics.v1` — AcademicSession CRUD-with-archival plus
 * `POST /v1/academics/sessions/:id/activate` (roadmap-named endpoint,
 * DoD item 2). `07 §6.1`, `05 §7.1`.
 */
@Injectable()
export class SessionService {
  constructor(private readonly audit: AuditService) {}

  async list(schoolId: string): Promise<AcademicSessionResponseDto[]> {
    const sessions = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.findMany({ where: { schoolId }, orderBy: { startDate: 'desc' } }),
    );
    return sessions.map(toResponseDto);
  }

  async get(schoolId: string, id: string): Promise<AcademicSessionResponseDto> {
    const session = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.findUnique({ where: { id } }),
    );
    if (!session) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
    }
    return toResponseDto(session);
  }

  async create(
    schoolId: string,
    dto: CreateAcademicSessionDto,
    actor: ActorContext,
  ): Promise<AcademicSessionResponseDto> {
    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.academicSession.create({
            data: {
              schoolId,
              name: dto.name,
              startDate: new Date(dto.startDate),
              endDate: new Date(dto.endDate),
            },
          }),
        ),
      `A session named "${dto.name}" already exists.`,
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_SESSION_CREATED',
      entityType: 'AcademicSession',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  /** FR `05 §7.1`: "Edit upcoming session" — a CURRENT or CLOSED/ARCHIVED
   * session's dates/name are historical facts, not editable in place. */
  async update(
    schoolId: string,
    id: string,
    dto: UpdateAcademicSessionDto,
    actor: ActorContext,
  ): Promise<AcademicSessionResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
    }
    if (existing.status !== 'DRAFT' && existing.status !== 'UPCOMING') {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Only a DRAFT or UPCOMING session may be edited.',
      });
    }

    const updated = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.academicSession.update({
            where: { id },
            data: {
              ...(dto.name !== undefined && { name: dto.name }),
              ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
              ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
            },
          }),
        ),
      'A session with this name already exists.',
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_SESSION_UPDATED',
      entityType: 'AcademicSession',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  /**
   * DoD item 2: exactly one CURRENT session per school, enforced at the
   * database via `academic_sessions_one_current_per_school` (partial
   * unique index) — not merely by this method's own ordering. Closing the
   * previous CURRENT session and activating the target run in one
   * transaction; two genuinely concurrent activate() calls are made safe
   * by ordinary Postgres row-locking and unique-index conflict detection
   * under the default READ COMMITTED isolation (no explicit SERIALIZABLE
   * needed — see this method's own reasoning below), not by any
   * application-level mutex.
   *
   * Also bulk-closes any still-CURRENT terms of the session being closed,
   * so `academic_terms_one_current_per_session` never has to reconcile a
   * non-current session with a dangling CURRENT term (see TermService).
   */
  async activate(
    schoolId: string,
    id: string,
    actor: ActorContext,
  ): Promise<AcademicSessionResponseDto> {
    let activated: Awaited<ReturnType<typeof this.runActivateTransaction>>;
    try {
      activated = await this.runActivateTransaction(schoolId, id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppHttpException({
          code: 'ACADEMIC_ACTIVATION_CONFLICT',
          message: 'Another activation is in progress for this school — please retry.',
        });
      }
      throw error;
    }

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_SESSION_ACTIVATED',
      entityType: 'AcademicSession',
      entityId: id,
    });
    return toResponseDto(activated);
  }

  private async runActivateTransaction(schoolId: string, id: string) {
    return withTenant(prisma, schoolId, async (tx) => {
      const target = await tx.academicSession.findUnique({ where: { id } });
      if (!target) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
      }

      // Once B19 reserves a destination, its transition is exclusively the
      // rollover commit. The legacy activation route must not make a READY
      // plan's target CURRENT between commit preflight and materialisation.
      const reservedForRollover = await tx.rolloverPlan.findFirst({
        where: { schoolId, targetAcademicSessionId: id, status: { in: ['DRAFT', 'READY'] } },
        select: { id: true },
      });
      if (reservedForRollover) {
        throw new AppHttpException({
          code: 'VALIDATION_ERROR',
          message:
            'This session is reserved for an academic rollover and must be activated by its commit.',
        });
      }

      const previousCurrent = await tx.academicSession.findFirst({
        where: { schoolId, status: 'CURRENT' },
      });
      if (previousCurrent && previousCurrent.id !== id) {
        const historicalWork = await Promise.all([
          tx.studentEnrollment.count({
            where: { schoolId, academicSessionId: previousCurrent.id },
          }),
          tx.exam.count({ where: { schoolId, academicSessionId: previousCurrent.id } }),
        ]);
        if (historicalWork.some((count) => count > 0)) {
          throw new AppHttpException({
            code: 'VALIDATION_ERROR',
            message:
              'A populated current session must be closed and transitioned through the rollover workflow.',
          });
        }
        await tx.academicSession.update({
          where: { id: previousCurrent.id },
          data: { status: 'CLOSED' },
        });
        await tx.academicTerm.updateMany({
          where: { schoolId, academicSessionId: previousCurrent.id, status: 'CURRENT' },
          data: { status: 'CLOSED' },
        });
      }

      return tx.academicSession.update({ where: { id }, data: { status: 'CURRENT' } });
    });
  }

  async archive(
    schoolId: string,
    id: string,
    actor: ActorContext,
  ): Promise<AcademicSessionResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
    }
    const archived = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.update({ where: { id }, data: { status: 'ARCHIVED' } }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_SESSION_ARCHIVED',
      entityType: 'AcademicSession',
      entityId: id,
    });
    return toResponseDto(archived);
  }

  async delete(schoolId: string, id: string, actor: ActorContext): Promise<void> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.academicSession.findUnique({ where: { id } });
      if (!existing) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
      }
      const [terms, classGroups, classSubjects, hodAssignments] = await Promise.all([
        tx.academicTerm.count({ where: { schoolId, academicSessionId: id } }),
        tx.classGroup.count({ where: { schoolId, academicSessionId: id } }),
        tx.classSubject.count({ where: { schoolId, academicSessionId: id } }),
        tx.hODAssignment.count({ where: { schoolId, academicSessionId: id } }),
      ]);
      assertNoDependents('academic session', {
        term: terms,
        class: classGroups,
        'class-subject offering': classSubjects,
        'HOD assignment': hodAssignments,
      });
      await tx.academicSession.delete({ where: { id } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_SESSION_DELETED',
      entityType: 'AcademicSession',
      entityId: id,
    });
  }
}
