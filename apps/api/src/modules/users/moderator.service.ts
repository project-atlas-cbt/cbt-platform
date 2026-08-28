import { Injectable } from '@nestjs/common';
import { prisma, withTenant } from '@atlas/db';
import type { Role } from '@atlas/domain';
import { AuditService } from '../operations/audit-event.service.js';
import { IdentityService } from '../identity/identity.service.js';
import type {
  CreateModeratorDto,
  ModeratorResponseDto,
  UpdateModeratorDto,
} from './dto/moderator.dto.js';
import { createPersonMembership, notFound } from './person.util.js';

interface ActorContext {
  actorUserId: string;
  actorRole: Role;
}

type ModeratorRow = {
  id: string;
  userId: string;
  loginIdentifier: string;
  user: {
    firstName: string;
    lastName: string;
    displayName: string;
    email: string | null;
    status: string;
  };
};

function toResponseDto(row: ModeratorRow): ModeratorResponseDto {
  return {
    membershipId: row.id,
    userId: row.userId,
    firstName: row.user.firstName,
    lastName: row.user.lastName,
    displayName: row.user.displayName,
    email: row.user.email,
    loginIdentifier: row.loginIdentifier,
    userStatus: row.user.status as ModeratorResponseDto['userStatus'],
  };
}

/** `people.v1` — Moderator directory & lifecycle (05 §14). School-Admin-
 * only per that section's own text: "should not automatically inherit
 * academic approval privileges" — Moderator itself has no grant on any of
 * these permission ids. No profile table backs Moderator (unlike Student/
 * Teacher) — just User + SchoolMembership + RoleAssignment('MODERATOR'). */
@Injectable()
export class ModeratorService {
  constructor(
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
  ) {}

  async list(schoolId: string): Promise<ModeratorResponseDto[]> {
    const rows = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findMany({
        where: {
          schoolId,
          roleAssignments: { some: { schoolId, role: 'MODERATOR', status: 'ACTIVE' } },
        },
        include: { user: true },
        orderBy: { loginIdentifier: 'asc' },
      }),
    );
    return rows.map(toResponseDto);
  }

  async get(schoolId: string, membershipId: string): Promise<ModeratorResponseDto> {
    const row = await withTenant(prisma, schoolId, (tx) =>
      tx.schoolMembership.findUnique({ where: { id: membershipId }, include: { user: true } }),
    );
    if (!row) return notFound('Moderator');
    return toResponseDto(row);
  }

  async create(
    schoolId: string,
    dto: CreateModeratorDto,
    actor: ActorContext,
  ): Promise<ModeratorResponseDto> {
    const created = await withTenant(prisma, schoolId, (tx) =>
      createPersonMembership(tx, {
        schoolId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        loginIdentifier: dto.loginIdentifier,
        role: 'MODERATOR',
      }),
    );

    await this.identity.issueStaffInvitation(schoolId, created.userId);

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'MODERATOR_CREATED',
      entityType: 'SchoolMembership',
      entityId: created.membershipId,
    });
    return this.get(schoolId, created.membershipId);
  }

  async update(
    schoolId: string,
    membershipId: string,
    dto: UpdateModeratorDto,
    actor: ActorContext,
  ): Promise<ModeratorResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.schoolMembership.findUnique({
        where: { id: membershipId },
        include: { user: true },
      });
      if (!existing) return notFound('Moderator');

      if (dto.firstName !== undefined || dto.lastName !== undefined || dto.email !== undefined) {
        const firstName = dto.firstName ?? existing.user.firstName;
        const lastName = dto.lastName ?? existing.user.lastName;
        await tx.user.update({
          where: { id: existing.userId },
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
      action: 'MODERATOR_UPDATED',
      entityType: 'SchoolMembership',
      entityId: membershipId,
    });
    return this.get(schoolId, membershipId);
  }

  /** "Remove Moderator" (05 §14): ends the MODERATOR RoleAssignment and
   * deactivates the account — a moderator has no other role and no profile
   * to preserve, unlike Teacher/Student's own "remove" semantics (which
   * only ever end a role, never the whole account). */
  async remove(
    schoolId: string,
    membershipId: string,
    actor: ActorContext,
  ): Promise<ModeratorResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.schoolMembership.findUnique({ where: { id: membershipId } });
      if (!existing) return notFound('Moderator');
      const moderatorRole = await tx.roleAssignment.findFirst({
        where: { schoolId, membershipId, role: 'MODERATOR', status: 'ACTIVE' },
      });
      if (moderatorRole) {
        await tx.roleAssignment.update({
          where: { id: moderatorRole.id },
          data: { status: 'ENDED', effectiveTo: new Date() },
        });
      }
      await tx.user.update({ where: { id: existing.userId }, data: { status: 'INACTIVE' } });
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'MODERATOR_REMOVED',
      entityType: 'SchoolMembership',
      entityId: membershipId,
    });
    return this.get(schoolId, membershipId);
  }
}
