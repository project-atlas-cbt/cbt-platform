import { Injectable } from '@nestjs/common';
import { prisma, withTenant, type Prisma } from '@atlas/db';
import { compareText, comparePersonNames, formalName, type Role } from '@atlas/domain';
import { runUniqueGuarded } from '../academics/prisma-error.util.js';
import { AuditService } from '../operations/audit-event.service.js';
import { IdentityService } from '../identity/identity.service.js';
import { StatusResponseDto } from '../identity/dto/status-response.dto.js';
import type {
  CreateTeacherDto,
  ListTeachersQueryDto,
  TeacherListResponseDto,
  TeacherResponseDto,
  UpdateTeacherDto,
} from './dto/teacher.dto.js';
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

type TeacherRow = {
  id: string;
  staffId: string;
  employmentStatus: string;
  membership: {
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
    roleAssignments: { role: string; status: string }[];
  };
};

function toResponseDto(row: TeacherRow): TeacherResponseDto {
  return {
    membershipId: row.membership.id,
    userId: row.membership.userId,
    teacherProfileId: row.id,
    firstName: row.membership.user.firstName,
    middleName: row.membership.user.middleName,
    lastName: row.membership.user.lastName,
    displayName: row.membership.user.displayName,
    formalName: formalName(row.membership.user),
    email: row.membership.user.email,
    staffId: row.staffId,
    loginIdentifier: row.membership.loginIdentifier,
    userStatus: row.membership.user.status as TeacherResponseDto['userStatus'],
    employmentStatus: row.employmentStatus as TeacherResponseDto['employmentStatus'],
    isHod: row.membership.roleAssignments.some((r) => r.role === 'HOD' && r.status === 'ACTIVE'),
  };
}

const INCLUDE = {
  membership: { include: { user: true, roleAssignments: true } },
} as const;

/** `people.v1` — Teacher directory & lifecycle (05 §11). Deactivate/
 * reactivate toggle `User.status` only — `TeacherProfile`/
 * `TeacherAssignment` and anything the teacher ever authored (questions,
 * exams) stay untouched, still attributed to them (DoD item 6). */
@Injectable()
export class TeacherService {
  constructor(
    private readonly audit: AuditService,
    private readonly identity: IdentityService,
  ) {}

  /** F7 gap-closure: server-side search/sort/paginate (DoD item 1's own
   * "1,500 students" scale applies equally to a large school's teacher
   * count — confirmed with the project owner to extend to all four
   * directories, not just Students). See `StudentService.list()`'s sibling
   * doc comment for why `Promise.all` on the same `tx`, not nested
   * `tx.$transaction([...])`. */
  async list(schoolId: string, query: ListTeachersQueryDto = {}): Promise<TeacherListResponseDto> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDir = query.sortDir ?? 'asc';
    // Owner decision 2026-10-09: staff lists also run A to Z by surname.
    const sortBy = query.sortBy ?? 'lastName';
    const words = searchWords(query.q);

    const where: Prisma.TeacherProfileWhereInput = {
      schoolId,
      ...(words.length > 0 && {
        AND: words.map((word) => ({
          OR: [
            { staffId: { contains: word, mode: 'insensitive' } },
            { membership: { user: { firstName: { contains: word, mode: 'insensitive' } } } },
            { membership: { user: { middleName: { contains: word, mode: 'insensitive' } } } },
            { membership: { user: { lastName: { contains: word, mode: 'insensitive' } } } },
          ],
        })),
      }),
    };
    const { rows, total } = await withTenant(prisma, schoolId, async (tx) => {
      const keys = (
        await tx.teacherProfile.findMany({
          where,
          select: {
            id: true,
            staffId: true,
            membership: { select: { user: { select: NAME_SORT_SELECT } } },
          },
        })
      ).map((key) => ({ id: key.id, identifier: key.staffId, ...key.membership.user }));
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
        await tx.teacherProfile.findMany({ where: { id: { in: ids } }, include: INCLUDE }),
      );
      return { rows, total: keys.length };
    });
    return { teachers: rows.map(toResponseDto), total, page, pageSize };
  }

  async get(schoolId: string, teacherProfileId: string): Promise<TeacherResponseDto> {
    const row = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({ where: { id: teacherProfileId }, include: INCLUDE }),
    );
    if (!row) return notFound('Teacher');
    return toResponseDto(row);
  }

  async create(
    schoolId: string,
    dto: CreateTeacherDto,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    const created = await withTenant(prisma, schoolId, async (tx) => {
      const person = await createPersonMembership(tx, {
        schoolId,
        firstName: dto.firstName,
        middleName: dto.middleName,
        lastName: dto.lastName,
        email: dto.email,
        loginIdentifier: dto.staffId,
        role: 'TEACHER',
      });
      const profile = await runUniqueGuarded(
        () =>
          tx.teacherProfile.create({
            data: { schoolId, membershipId: person.membershipId, staffId: dto.staffId },
          }),
        `A teacher with staff ID "${dto.staffId}" already exists at this school.`,
      );
      return { profileId: profile.id, userId: person.userId };
    });

    // Staff invitation dispatch — synchronous, at creation time (not a
    // batch/queued job; per-person, per templates.ts's own doc comment
    // anticipating exactly this reuse). A dispatch failure here must not
    // silently orphan an un-invitable teacher record — surfaced as a real
    // error, not swallowed.
    await this.identity.issueStaffInvitation(schoolId, created.userId);

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'TEACHER_CREATED',
      entityType: 'TeacherProfile',
      entityId: created.profileId,
    });
    return this.get(schoolId, created.profileId);
  }

  async update(
    schoolId: string,
    teacherProfileId: string,
    dto: UpdateTeacherDto,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.teacherProfile.findUnique({
        where: { id: teacherProfileId },
        include: INCLUDE,
      });
      if (!existing) return notFound('Teacher');

      const name = mergeNameEdit(existing.membership.user, dto);
      if (name || dto.email !== undefined) {
        await tx.user.update({
          where: { id: existing.membership.userId },
          data: { ...name, ...(dto.email !== undefined && { email: dto.email }) },
        });
      }
    });

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'TEACHER_UPDATED',
      entityType: 'TeacherProfile',
      entityId: teacherProfileId,
    });
    return this.get(schoolId, teacherProfileId);
  }

  private async setUserStatus(
    schoolId: string,
    teacherProfileId: string,
    status: 'ACTIVE' | 'INACTIVE',
    action: string,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    await withTenant(prisma, schoolId, async (tx) => {
      const existing = await tx.teacherProfile.findUnique({
        where: { id: teacherProfileId },
        include: INCLUDE,
      });
      if (!existing) return notFound('Teacher');
      await tx.user.update({ where: { id: existing.membership.userId }, data: { status } });
    });
    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action,
      entityType: 'TeacherProfile',
      entityId: teacherProfileId,
    });
    return this.get(schoolId, teacherProfileId);
  }

  async deactivate(
    schoolId: string,
    teacherProfileId: string,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    return this.setUserStatus(schoolId, teacherProfileId, 'INACTIVE', 'TEACHER_DEACTIVATED', actor);
  }

  async reactivate(
    schoolId: string,
    teacherProfileId: string,
    actor: ActorContext,
  ): Promise<TeacherResponseDto> {
    return this.setUserStatus(schoolId, teacherProfileId, 'ACTIVE', 'TEACHER_REACTIVATED', actor);
  }

  /** Staff reset via a fresh invitation link (CredentialState's own doc
   * comment: "staff: invitation link; student: system-generated password")
   * — reuses `IdentityService.issueStaffInvitation`'s identical token/
   * notification mechanism, not `CredentialSheetService` (the student-only,
   * shown-once-password primitive). The resetter never sees a password at
   * all here, by design — the link goes straight to the teacher's own
   * inbox. */
  async resetCredentials(
    schoolId: string,
    teacherProfileId: string,
    actor: ActorContext,
  ): Promise<StatusResponseDto> {
    const profile = await withTenant(prisma, schoolId, (tx) =>
      tx.teacherProfile.findUnique({ where: { id: teacherProfileId }, include: INCLUDE }),
    );
    if (!profile) return notFound('Teacher');

    await this.identity.issueStaffInvitation(schoolId, profile.membership.userId);

    await this.audit.record({
      schoolId,
      actorUserId: actor.actorUserId,
      actorRole: actor.actorRole,
      action: 'TEACHER_CREDENTIALS_RESET',
      entityType: 'TeacherProfile',
      entityId: teacherProfileId,
    });
    return { status: 'ok' };
  }
}
