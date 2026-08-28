import { Injectable } from '@nestjs/common';
import { prisma, withTenant, Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import { runUniqueGuarded } from './prisma-error.util.js';
import type {
  AcademicTermResponseDto,
  CreateAcademicTermDto,
  UpdateAcademicTermDto,
} from './dto/term.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(term: {
  id: string;
  academicSessionId: string;
  name: string;
  sequence: number;
  startDate: Date;
  endDate: Date;
  status: string;
}): AcademicTermResponseDto {
  return {
    id: term.id,
    academicSessionId: term.academicSessionId,
    name: term.name,
    sequence: term.sequence,
    startDate: term.startDate.toISOString().slice(0, 10),
    endDate: term.endDate.toISOString().slice(0, 10),
    status: term.status as AcademicTermResponseDto['status'],
  };
}

/** `academics.v1` — AcademicTerm CRUD-with-archival, nested under a
 * session, plus `POST /v1/academics/terms/:id/activate` — a roadmap-
 * unnamed addition needed for `GET /v1/academics/context`'s "current term"
 * to ever become non-null (DoD item 10 otherwise unsatisfiable). `07 §6.2`,
 * `05 §7.2`. */
@Injectable()
export class TermService {
  constructor(private readonly audit: AuditService) {}

  async list(schoolId: string, academicSessionId: string): Promise<AcademicTermResponseDto[]> {
    const terms = await withTenant(prisma, schoolId, (tx) =>
      tx.academicTerm.findMany({
        where: { schoolId, academicSessionId },
        orderBy: { sequence: 'asc' },
      }),
    );
    return terms.map(toResponseDto);
  }

  async create(
    schoolId: string,
    academicSessionId: string,
    dto: CreateAcademicTermDto,
    actor: ActorContext,
  ): Promise<AcademicTermResponseDto> {
    const session = await withTenant(prisma, schoolId, (tx) =>
      tx.academicSession.findUnique({ where: { id: academicSessionId } }),
    );
    if (!session) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
    }

    const created = await runUniqueGuarded(
      () =>
        withTenant(prisma, schoolId, (tx) =>
          tx.academicTerm.create({
            data: {
              schoolId,
              academicSessionId,
              name: dto.name,
              sequence: dto.sequence,
              startDate: new Date(dto.startDate),
              endDate: new Date(dto.endDate),
            },
          }),
        ),
      `A term with sequence ${dto.sequence} already exists in this session.`,
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_TERM_CREATED',
      entityType: 'AcademicTerm',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  async update(
    schoolId: string,
    id: string,
    dto: UpdateAcademicTermDto,
    actor: ActorContext,
  ): Promise<AcademicTermResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.academicTerm.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic term not found.' });
    }
    if (existing.status !== 'DRAFT' && existing.status !== 'UPCOMING') {
      throw new AppHttpException({
        code: 'VALIDATION_ERROR',
        message: 'Only a DRAFT or UPCOMING term may be edited.',
      });
    }

    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.academicTerm.update({
        where: { id },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.startDate !== undefined && { startDate: new Date(dto.startDate) }),
          ...(dto.endDate !== undefined && { endDate: new Date(dto.endDate) }),
        },
      }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_TERM_UPDATED',
      entityType: 'AcademicTerm',
      entityId: id,
    });
    return toResponseDto(updated);
  }

  /** Mirrors SessionService.activate's exact reasoning: closing the
   * previous CURRENT term (if any, within the same session) and activating
   * the target run in one transaction; concurrent races are made safe by
   * ordinary Postgres row-locking/unique-index conflict detection under
   * READ COMMITTED against `academic_terms_one_current_per_session`. */
  async activate(
    schoolId: string,
    id: string,
    actor: ActorContext,
  ): Promise<AcademicTermResponseDto> {
    let activated: Awaited<ReturnType<typeof this.runActivateTransaction>>;
    try {
      activated = await this.runActivateTransaction(schoolId, id);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppHttpException({
          code: 'ACADEMIC_ACTIVATION_CONFLICT',
          message: 'Another activation is in progress for this session — please retry.',
        });
      }
      throw error;
    }

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_TERM_ACTIVATED',
      entityType: 'AcademicTerm',
      entityId: id,
    });
    return toResponseDto(activated);
  }

  private async runActivateTransaction(schoolId: string, id: string) {
    return withTenant(prisma, schoolId, async (tx) => {
      const target = await tx.academicTerm.findUnique({ where: { id } });
      if (!target) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic term not found.' });
      }

      const previousCurrent = await tx.academicTerm.findFirst({
        where: { schoolId, academicSessionId: target.academicSessionId, status: 'CURRENT' },
      });
      if (previousCurrent && previousCurrent.id !== id) {
        await tx.academicTerm.update({
          where: { id: previousCurrent.id },
          data: { status: 'CLOSED' },
        });
      }

      return tx.academicTerm.update({ where: { id }, data: { status: 'CURRENT' } });
    });
  }

  async delete(schoolId: string, id: string, actor: ActorContext): Promise<void> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.academicTerm.findUnique({ where: { id } });
      if (!existing) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic term not found.' });
      }
      // No B5 table yet references a term (exams/attempts don't exist
      // until B11+) — nothing to check today; a later phase that adds such
      // a reference must extend this check, not silently rely on nothing.
      await tx.academicTerm.delete({ where: { id } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'ACADEMIC_TERM_DELETED',
      entityType: 'AcademicTerm',
      entityId: id,
    });
  }
}
