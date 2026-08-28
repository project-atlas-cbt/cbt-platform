import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { HodAssignmentService } from '../academics/hod-assignment.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import { HodResponseDto, PromoteHodDto } from './dto/hod.dto.js';
import { notFound } from './person.util.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

const INCLUDE = {
  membership: { include: { user: true } },
} as const;

async function toResponseDto(
  schoolId: string,
  row: {
    id: string;
    staffId: string;
    membership: {
      id: string;
      userId: string;
      user: { firstName: string; lastName: string; displayName: string };
    };
  },
): Promise<HodResponseDto> {
  const currentAssignment = await withTenant(prisma, schoolId, (tx) =>
    tx.hODAssignment.findFirst({
      where: { schoolId, membershipId: row.membership.id, status: 'ACTIVE' },
      include: { department: { select: { id: true, name: true } } },
    }),
  );
  return {
    membershipId: row.membership.id,
    userId: row.membership.userId,
    teacherProfileId: row.id,
    firstName: row.membership.user.firstName,
    lastName: row.membership.user.lastName,
    displayName: row.membership.user.displayName,
    staffId: row.staffId,
    departmentId: currentAssignment?.department.id ?? null,
    departmentName: currentAssignment?.department.name ?? null,
  };
}

/** `people.v1` — HOD directory (05 §13). Confirmed with the project owner:
 * an HOD is promoted from an existing teacher's membership (adds a HOD
 * `RoleAssignment`), not created as a second, disconnected person record —
 * matching the schema's own "a membership may hold TEACHER + HOD"
 * convention. Department (re)assignment delegates to the existing
 * `HodAssignmentService` (B5), never duplicating its create/end/reassign
 * logic here. */
@Injectable()
export class HodService {
  constructor(
    private readonly audit: AuditService,
    private readonly hodAssignments: HodAssignmentService,
  ) {}

  async list(schoolId: string): Promise<HodResponseDto[]> {
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findMany({
        where: {
          schoolId,
          membership: {
            roleAssignments: { some: { schoolId, role: 'HOD', status: 'ACTIVE' } },
          },
        },
        include: INCLUDE,
        orderBy: { staffId: 'asc' },
      }),
    );
    return Promise.all(rows.map((row) => toResponseDto(schoolId, row)));
  }

  async get(schoolId: string, membershipId: string): Promise<HodResponseDto> {
    const row = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId } },
        include: INCLUDE,
      }),
    );
    if (!row) return notFound('HOD');
    return toResponseDto(schoolId, row);
  }

  async promote(
    schoolId: string,
    dto: PromoteHodDto,
    actor: ActorContext,
  ): Promise<HodResponseDto> {
    const profile = await withTenant(prisma, schoolId, async (tx) => {
      const teacherProfile = await tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId: dto.membershipId } },
        include: INCLUDE,
      });
      if (!teacherProfile) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message:
            'No teacher profile exists for this membership — HODs are promoted from an existing teacher.',
        });
      }
      const activeTeacherRole = await tx.roleAssignment.findFirst({
        where: { schoolId, membershipId: dto.membershipId, role: 'TEACHER', status: 'ACTIVE' },
        select: { id: true },
      });
      if (!activeTeacherRole) {
        throw new AppHttpException({
          code: 'HOD_PROMOTION_REQUIRES_ACTIVE_TEACHER_ROLE',
          message: 'The referenced membership does not hold an active TEACHER role assignment.',
        });
      }
      const existingHodRole = await tx.roleAssignment.findFirst({
        where: { schoolId, membershipId: dto.membershipId, role: 'HOD', status: 'ACTIVE' },
        select: { id: true },
      });
      if (!existingHodRole) {
        await tx.roleAssignment.create({
          data: { schoolId, membershipId: dto.membershipId, role: 'HOD' },
        });
      }
      return teacherProfile;
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'HOD_PROMOTED',
      entityType: 'SchoolMembership',
      entityId: dto.membershipId,
    });
    return toResponseDto(schoolId, profile);
  }

  /** `PUT /v1/hods/:id/department` — `:id` is the membershipId; delegates
   * to `HodAssignmentService.reassign`. */
  async setDepartment(
    schoolId: string,
    membershipId: string,
    departmentId: string,
    academicSessionId: string,
    actor: ActorContext,
  ): Promise<HodResponseDto> {
    await this.hodAssignments.reassign(
      schoolId,
      membershipId,
      departmentId,
      academicSessionId,
      actor,
    );
    return this.get(schoolId, membershipId);
  }

  /** "Remove HOD" (05 §13): ends the HOD RoleAssignment — the person
   * reverts to a plain teacher. Their TeacherProfile/TeacherAssignments and
   * any prior HODAssignment (and everything it authorized/approved) are
   * left exactly as they are (DoD item 7). */
  async remove(
    schoolId: string,
    membershipId: string,
    actor: ActorContext,
  ): Promise<HodResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const hodRole = await tx.roleAssignment.findFirst({
        where: { schoolId, membershipId, role: 'HOD', status: 'ACTIVE' },
      });
      if (!hodRole) {
        throw new AppHttpException({
          code: 'NOT_FOUND',
          message: 'No active HOD role for this membership.',
        });
      }
      await tx.roleAssignment.update({
        where: { id: hodRole.id },
        data: { status: 'ENDED', effectiveTo: new Date() },
      });
      const currentAssignment = await tx.hODAssignment.findFirst({
        where: { schoolId, membershipId, status: 'ACTIVE' },
      });
      if (currentAssignment) {
        await tx.hODAssignment.update({
          where: { id: currentAssignment.id },
          data: { status: 'ENDED', endDate: currentAssignment.endDate ?? new Date() },
        });
      }
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'HOD_REMOVED',
      entityType: 'SchoolMembership',
      entityId: membershipId,
    });

    const row = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId } },
        include: INCLUDE,
      }),
    );
    if (!row) return notFound('Teacher');
    return toResponseDto(schoolId, row);
  }
}
