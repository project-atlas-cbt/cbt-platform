import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import { compareText, comparePersonNames, formalName, type Role } from '@atlas/domain';
import { AuditService } from '../operations/audit-event.service.js';
import { IdentityService } from '../identity/identity.service.js';
import type {
  CreateModeratorDto,
  ListModeratorsQueryDto,
  ModeratorListResponseDto,
  ModeratorResponseDto,
  UpdateModeratorDto,
} from './dto/moderator.dto.js';
import {
  NAME_SORT_SELECT,
  createPersonMembership,
  inIdOrder,
  mergeNameEdit,
  notFound,
  pageIdsInOrder,
  searchWords,
} from './person.util.js';

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
    middleName: string | null;
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
    middleName: row.user.middleName,
    lastName: row.user.lastName,
    displayName: row.user.displayName,
    formalName: formalName(row.user),
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

  /** F7 gap-closure: server-side search/sort/paginate (DoD item 1, extended
   * to all four directories). See `StudentService.list()`'s sibling doc
   * comment for the `Promise.all`-on-one-`tx` reasoning. */
  async list(
    schoolId: string,
    query: ListModeratorsQueryDto = {},
  ): Promise<ModeratorListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDir = query.sortDir ?? 'asc';
    const sortBy = query.sortBy ?? 'lastName';
    const words = searchWords(query.q);

    const where: Prisma.SchoolMembershipWhereInput = {
      schoolId,
      roleAssignments: { some: { schoolId, role: 'MODERATOR', status: 'ACTIVE' } },
      ...(words.length > 0 && {
        AND: words.map((word) => ({
          OR: [
            { loginIdentifier: { contains: word, mode: 'insensitive' } },
            { user: { firstName: { contains: word, mode: 'insensitive' } } },
            { user: { middleName: { contains: word, mode: 'insensitive' } } },
            { user: { lastName: { contains: word, mode: 'insensitive' } } },
          ],
        })),
      }),
    };
    const { rows, total } = await withTenant(prisma, schoolId, async (tx) => {
      const keys = (
        await tx.schoolMembership.findMany({
          where,
          select: { id: true, loginIdentifier: true, user: { select: NAME_SORT_SELECT } },
        })
      ).map((key) => ({ id: key.id, identifier: key.loginIdentifier, ...key.user }));
      const ids = pageIdsInOrder(
        keys,
        sortBy === 'lastName'
          ? comparePersonNames
          : (a, b) => compareText(a.identifier, b.identifier),
        sortDir,
        page,
        pageSize,
      );
      const rows = inIdOrder(
        ids,
        await tx.schoolMembership.findMany({
          where: { id: { in: ids } },
          include: { user: true },
        }),
      );
      return { rows, total: keys.length };
    });
    return { moderators: rows.map(toResponseDto), total, page, pageSize };
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
        middleName: dto.middleName,
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

      const name = mergeNameEdit(existing.user, dto);
      if (name || dto.email !== undefined) {
        await tx.user.update({
          where: { id: existing.userId },
          data: { ...name, ...(dto.email !== undefined && { email: dto.email }) },
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
