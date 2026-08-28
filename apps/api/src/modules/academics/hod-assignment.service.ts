import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { AuditService } from '../operations/audit-event.service.js';
import type { CreateHodAssignmentDto, HodAssignmentResponseDto } from './dto/hod-assignment.dto.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

function toResponseDto(assignment: {
  id: string;
  membershipId: string;
  departmentId: string;
  academicSessionId: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
}): HodAssignmentResponseDto {
  return {
    id: assignment.id,
    membershipId: assignment.membershipId,
    departmentId: assignment.departmentId,
    academicSessionId: assignment.academicSessionId,
    startDate: assignment.startDate.toISOString().slice(0, 10),
    endDate: assignment.endDate ? assignment.endDate.toISOString().slice(0, 10) : null,
    status: assignment.status as HodAssignmentResponseDto['status'],
  };
}

/** `academics.v1` — HODAssignment. References `membershipId`, not
 * `userId` (resolves audit finding D-11). DoD item 8: rejects a membership
 * lacking an active HOD RoleAssignment — enforced here at the service
 * layer, inside the same transaction as the insert, rather than a DB
 * trigger (this codebase avoids cross-table triggers — see B2's
 * PlatformRoleAssignment CHECK constraint, which is single-table only). */
@Injectable()
export class HodAssignmentService {
  constructor(private readonly audit: AuditService) {}

  async listForDepartment(
    schoolId: string,
    departmentId: string,
  ): Promise<HodAssignmentResponseDto[]> {
    const assignments = await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.findMany({
        where: { schoolId, departmentId },
        orderBy: { startDate: 'desc' },
      }),
    );
    return assignments.map(toResponseDto);
  }

  async create(
    schoolId: string,
    dto: CreateHodAssignmentDto,
    actor: ActorContext,
  ): Promise<HodAssignmentResponseDto> {
    const created = await withTenant(prisma, schoolId, async (tx) => {
      const [department, session, activeHodRole] = await Promise.all([
        tx.department.findUnique({ where: { id: dto.departmentId } }),
        tx.academicSession.findUnique({ where: { id: dto.academicSessionId } }),
        tx.roleAssignment.findFirst({
          where: { schoolId, membershipId: dto.membershipId, role: 'HOD', status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);
      if (!department) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
      }
      if (!session) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
      }
      if (!activeHodRole) {
        throw new AppHttpException({
          code: 'HOD_ASSIGNMENT_REQUIRES_ACTIVE_ROLE',
          message: 'The referenced membership does not hold an active HOD role assignment.',
        });
      }

      return tx.hODAssignment.create({
        data: {
          schoolId,
          membershipId: dto.membershipId,
          departmentId: dto.departmentId,
          academicSessionId: dto.academicSessionId,
          startDate: new Date(dto.startDate),
          endDate: dto.endDate ? new Date(dto.endDate) : null,
        },
      });
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'HOD_ASSIGNMENT_CREATED',
      entityType: 'HODAssignment',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  /**
   * `PUT /v1/hods/:id/department` (B6) — one transaction that ends the
   * membership's current ACTIVE HODAssignment (if any) and creates the new
   * one, mirroring `session.service.ts`'s own close-then-activate
   * transaction shape. DoD item 7 ("prior approvals stay attributed to the
   * previous HOD") falls out for free: nothing about a past HOD's authored
   * approvals references HODAssignment by anything other than its own
   * immutable id.
   */
  async reassign(
    schoolId: string,
    membershipId: string,
    departmentId: string,
    academicSessionId: string,
    actor: ActorContext,
  ): Promise<HodAssignmentResponseDto> {
    const created = await withTenant(prisma, schoolId, async (tx) => {
      const [department, session, activeHodRole] = await Promise.all([
        tx.department.findUnique({ where: { id: departmentId } }),
        tx.academicSession.findUnique({ where: { id: academicSessionId } }),
        tx.roleAssignment.findFirst({
          where: { schoolId, membershipId, role: 'HOD', status: 'ACTIVE' },
          select: { id: true },
        }),
      ]);
      if (!department) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Department not found.' });
      }
      if (!session) {
        throw new AppHttpException({ code: 'NOT_FOUND', message: 'Academic session not found.' });
      }
      if (!activeHodRole) {
        throw new AppHttpException({
          code: 'HOD_ASSIGNMENT_REQUIRES_ACTIVE_ROLE',
          message: 'The referenced membership does not hold an active HOD role assignment.',
        });
      }

      const current = await tx.hODAssignment.findFirst({
        where: { schoolId, membershipId, status: 'ACTIVE' },
      });
      if (current) {
        await tx.hODAssignment.update({
          where: { id: current.id },
          data: { status: 'ENDED', endDate: current.endDate ?? new Date() },
        });
      }

      return tx.hODAssignment.create({
        data: {
          schoolId,
          membershipId,
          departmentId,
          academicSessionId,
          startDate: new Date(),
        },
      });
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'HOD_ASSIGNMENT_REASSIGNED',
      entityType: 'HODAssignment',
      entityId: created.id,
    });
    return toResponseDto(created);
  }

  async end(schoolId: string, id: string, actor: ActorContext): Promise<HodAssignmentResponseDto> {
    const existing = await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.findUnique({ where: { id } }),
    );
    if (!existing) {
      throw new AppHttpException({ code: 'NOT_FOUND', message: 'HOD assignment not found.' });
    }
    const updated = await withTenant(prisma, schoolId, (tx) =>
      tx.hODAssignment.update({
        where: { id },
        data: { status: 'ENDED', endDate: existing.endDate ?? new Date() },
      }),
    );
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'HOD_ASSIGNMENT_ENDED',
      entityType: 'HODAssignment',
      entityId: id,
    });
    return toResponseDto(updated);
  }
}
