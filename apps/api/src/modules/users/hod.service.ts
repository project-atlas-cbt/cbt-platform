import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AppHttpException } from '../../common/app-http-exception.js';
import { HodAssignmentService } from '../academics/hod-assignment.service.js';
import { AuditService } from '../operations/audit-event.service.js';
import { IdentityService } from '../identity/identity.service.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import {
  HodListResponseDto,
  HodResponseDto,
  ListHodsQueryDto,
  PromoteHodDto,
  UpdateHodDto,
} from './dto/hod.dto.js';
import { notFound, searchWords } from './person.util.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

const INCLUDE = {
  membership: { include: { user: true } },
} as const;

type CurrentDepartmentAssignment = {
  departmentId: string;
  departmentName: string;
};

/** Batched — one query for every membership on the current page, mirroring
 * `StudentService`'s own `resolveCurrentEnrollments` precedent (a single
 * `findMany` keyed off the page's own ids, not a per-row query). Previously
 * this was a separate `withTenant(...)` transaction *per HOD row*, a real
 * N+1 found during review: 25 HODs on one page meant 25 extra sequential
 * round-trips beyond the paginated `findMany`/`count` — never caught by a
 * test since correctness was unaffected, only cost. */
async function resolveCurrentDepartmentAssignments(
  tx: Prisma.TransactionClient,
  schoolId: string,
  membershipIds: string[],
): Promise<Map<string, CurrentDepartmentAssignment>> {
  if (membershipIds.length === 0) return new Map();
  const assignments = await tx.hODAssignment.findMany({
    where: { schoolId, membershipId: { in: membershipIds }, status: 'ACTIVE' },
    include: { department: { select: { id: true, name: true } } },
  });
  const map = new Map<string, CurrentDepartmentAssignment>();
  for (const assignment of assignments) {
    map.set(assignment.membershipId, {
      departmentId: assignment.department.id,
      departmentName: assignment.department.name,
    });
  }
  return map;
}

function toResponseDto(
  row: {
    id: string;
    staffId: string;
    membership: {
      id: string;
      userId: string;
      user: { firstName: string; lastName: string; displayName: string };
    };
  },
  currentAssignment?: CurrentDepartmentAssignment,
): HodResponseDto {
  return {
    membershipId: row.membership.id,
    userId: row.membership.userId,
    teacherProfileId: row.id,
    firstName: row.membership.user.firstName,
    lastName: row.membership.user.lastName,
    displayName: row.membership.user.displayName,
    staffId: row.staffId,
    departmentId: currentAssignment?.departmentId ?? null,
    departmentName: currentAssignment?.departmentName ?? null,
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
    private readonly identity: IdentityService,
  ) {}

  /** F7 gap-closure: server-side search/sort/paginate (DoD item 1, extended
   * to all four directories — confirmed with the project owner). See
   * `StudentService.list()`'s sibling doc comment for the `Promise.all`-on-
   * one-`tx` reasoning. */
  async list(schoolId: string, query: ListHodsQueryDto = {}): Promise<HodListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDir = query.sortDir ?? 'asc';
    const sortBy = query.sortBy ?? 'staffId';
    const words = searchWords(query.q);

    const where: Prisma.TeacherProfileWhereInput = {
      schoolId,
      membership: {
        roleAssignments: { some: { schoolId, role: 'HOD', status: 'ACTIVE' } },
      },
      ...(words.length > 0 && {
        AND: words.map((word) => ({
          OR: [
            { staffId: { contains: word, mode: 'insensitive' } },
            { membership: { user: { firstName: { contains: word, mode: 'insensitive' } } } },
            { membership: { user: { lastName: { contains: word, mode: 'insensitive' } } } },
          ],
        })),
      }),
    };
    const orderBy: Prisma.TeacherProfileOrderByWithRelationInput =
      sortBy === 'lastName'
        ? { membership: { user: { lastName: sortDir } } }
        : { staffId: sortDir };

    const { hods, total } = await withTenant(prisma, schoolId, async (tx) => {
      const [rows, total] = await Promise.all([
        tx.teacherProfile.findMany({
          where,
          include: INCLUDE,
          orderBy,
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        tx.teacherProfile.count({ where }),
      ]);
      const assignmentMap = await resolveCurrentDepartmentAssignments(
        tx,
        schoolId,
        rows.map((row) => row.membership.id),
      );
      return {
        hods: rows.map((row) => toResponseDto(row, assignmentMap.get(row.membership.id))),
        total,
      };
    });
    return { hods, total, page, pageSize };
  }

  async get(schoolId: string, membershipId: string): Promise<HodResponseDto> {
    const result = await withTenant(prisma, schoolId, async (tx) => {
      const row = await tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId } },
        include: INCLUDE,
      });
      if (!row) return null;
      const assignmentMap = await resolveCurrentDepartmentAssignments(tx, schoolId, [
        row.membership.id,
      ]);
      return toResponseDto(row, assignmentMap.get(row.membership.id));
    });
    if (!result) return notFound('HOD');
    return result;
  }

  async promote(
    schoolId: string,
    dto: PromoteHodDto,
    actor: ActorContext,
  ): Promise<HodResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const teacherProfile = await tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId: dto.membershipId } },
        select: { id: true },
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
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'HOD_PROMOTED',
      entityType: 'SchoolMembership',
      entityId: dto.membershipId,
    });
    // Re-fetched (rather than reusing the profile fetched inside the
    // transaction above) so the response goes through the same batched
    // department-assignment resolution `get()` already does — one shared
    // code path instead of a second, response-shaping copy here.
    return this.get(schoolId, dto.membershipId);
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

  /** F7 decision C — HOD gets its own dedicated `PATCH /hods/:id` route
   * rather than the frontend calling the underlying Teacher endpoint
   * directly. Edits the same underlying `User` row `TeacherService.update`
   * would (an HOD *is* a TeacherProfile with an extra role — `hod.service.ts`'s
   * own header comment), but audited as `HOD_UPDATED` so the trail reads as
   * an HOD action, not a Teacher one. */
  async update(
    schoolId: string,
    membershipId: string,
    dto: UpdateHodDto,
    actor: ActorContext,
  ): Promise<HodResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId } },
        include: INCLUDE,
      });
      if (!existing) return notFound('HOD');

      if (dto.firstName !== undefined || dto.lastName !== undefined || dto.email !== undefined) {
        const firstName = dto.firstName ?? existing.membership.user.firstName;
        const lastName = dto.lastName ?? existing.membership.user.lastName;
        await tx.user.update({
          where: { id: existing.membership.userId },
          data: {
            firstName,
            lastName,
            displayName: `${firstName} ${lastName}`,
            ...(dto.email !== undefined && { email: dto.email }),
          },
        });
      }
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'HOD_UPDATED',
      entityType: 'SchoolMembership',
      entityId: membershipId,
    });
    return this.get(schoolId, membershipId);
  }

  /** F7 decision C — `POST /hods/:id/reset-credentials`. Sends a fresh
   * invitation link the same way `TeacherService.resetCredentials` does
   * (an HOD is staff, not a student — never a shown-once password), gated
   * on the new `users.hod.resetCredentials` permission row rather than
   * reusing `users.teacher.resetCredentials`. */
  async resetCredentials(
    schoolId: string,
    membershipId: string,
    actor: ActorContext,
  ): Promise<StatusResponseDto> {
    const profile = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({
        where: { schoolId_membershipId: { schoolId, membershipId } },
        include: INCLUDE,
      }),
    );
    if (!profile) return notFound('HOD');

    await this.identity.issueStaffInvitation(schoolId, profile.membership.userId);

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'HOD_CREDENTIALS_RESET',
      entityType: 'SchoolMembership',
      entityId: membershipId,
    });
    return { status: 'ok' };
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

    // `get()` still resolves correctly here: the HODAssignment ended just
    // above is no longer `status: 'ACTIVE'`, so the batched resolver
    // naturally reports no current department for this membership.
    return this.get(schoolId, membershipId);
  }
}
